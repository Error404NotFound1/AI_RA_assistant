"""需求分析 API - AI 辅助需求分析核心功能"""

import json
import uuid
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireRE
from app.models.requirement import Requirement, UserStory, QualityEvaluation, RequirementStatus
from app.models.project import Project
from app.schemas.schemas import (
    RequirementCreate, RequirementUpdate, RequirementPublic,
    RequirementAnalyzeRequest, QualityEvaluationPublic, MessageResponse,
)
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import (
    EXTRACTOR_SYSTEM_PROMPT, EXTRACTOR_USER_TEMPLATE,
    CLASSIFIER_SYSTEM_PROMPT, CLASSIFIER_USER_TEMPLATE,
    QUALITY_CHECKER_SYSTEM_PROMPT, QUALITY_CHECKER_USER_TEMPLATE,
)

router = APIRouter(prefix="/projects/{project_id}/requirements", tags=["需求"])


@router.get("", response_model=list[RequirementPublic])
async def list_requirements(project_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """获取项目需求列表"""
    result = await db.execute(
        select(Requirement)
        .where(Requirement.project_id == project_id)
        .order_by(Requirement.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=RequirementPublic, status_code=status.HTTP_201_CREATED)
async def create_requirement(
    project_id: uuid.UUID, data: RequirementCreate, current_user: CurrentUser, db: DBSession
):
    """录入需求"""
    req = Requirement(
        project_id=project_id,
        title=data.title,
        description=data.description,
        source=data.source,
        created_by=current_user.id,
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return req


@router.get("/{req_id}", response_model=RequirementPublic)
async def get_requirement(project_id: uuid.UUID, req_id: uuid.UUID, db: DBSession):
    """获取需求详情"""
    result = await db.execute(
        select(Requirement).where(Requirement.id == req_id, Requirement.project_id == project_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    return req


@router.put("/{req_id}", response_model=RequirementPublic)
async def update_requirement(
    project_id: uuid.UUID, req_id: uuid.UUID, data: RequirementUpdate,
    current_user: CurrentUser, db: DBSession,
):
    """更新需求"""
    result = await db.execute(
        select(Requirement).where(Requirement.id == req_id, Requirement.project_id == project_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(req, key, value)
    await db.flush()
    await db.refresh(req)
    return req


@router.post("/analyze", response_model=dict)
async def analyze_requirements(
    project_id: uuid.UUID, data: RequirementAnalyzeRequest, current_user: RequireRE, db: DBSession,
):
    """AI 辅助需求分析 - 提取 FR/NFR + 分类排序 + 质量评估"""
    # 获取项目信息
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取待分析需求
    query = select(Requirement).where(Requirement.project_id == project_id)
    if data.requirement_ids:
        query = query.where(Requirement.id.in_(data.requirement_ids))
    else:
        query = query.where(Requirement.status == RequirementStatus.DRAFT)

    result = await db.execute(query)
    requirements = result.scalars().all()
    if not requirements:
        raise HTTPException(status_code=400, detail="没有待分析的需求")

    # 合并需求描述
    req_text = "\n\n".join([f"[{r.id}] {r.title}: {r.description}" for r in requirements])
    provider = get_llm_provider()

    # Step 1: 提取 FR/NFR
    extractor_prompt = EXTRACTOR_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        requirement_text=req_text,
    )
    extract_result = await provider.complete(EXTRACTOR_SYSTEM_PROMPT, extractor_prompt)

    if not extract_result.parsed_json:
        raise HTTPException(status_code=500, detail="AI 分析结果解析失败，请重试")

    analysis = extract_result.parsed_json

    # Step 2: MoSCoW 分类
    req_json = json.dumps(analysis, ensure_ascii=False)
    classifier_prompt = CLASSIFIER_USER_TEMPLATE.format(
        project_name=project.name,
        requirements_json=req_json,
    )
    classify_result = await provider.complete(CLASSIFIER_SYSTEM_PROMPT, classifier_prompt)
    if classify_result.parsed_json:
        analysis["classification"] = classify_result.parsed_json

    # Step 3: 质量评估
    quality_prompt = QUALITY_CHECKER_USER_TEMPLATE.format(
        project_name=project.name,
        requirements_json=req_json,
    )
    quality_result = await provider.complete(QUALITY_CHECKER_SYSTEM_PROMPT, quality_prompt)
    if quality_result.parsed_json:
        analysis["quality_evaluation"] = quality_result.parsed_json

    # 保存分析结果到需求记录
    for req in requirements:
        req.analysis_result = analysis
        req.status = RequirementStatus.ANALYZED

    return analysis


@router.post("/analyze/stream")
async def analyze_requirements_stream(
    project_id: uuid.UUID, current_user: RequireRE, db: DBSession,
):
    """AI 需求分析 - SSE 流式响应"""
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    result = await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.status == RequirementStatus.DRAFT,
        )
    )
    requirements = result.scalars().all()

    provider = get_llm_provider()
    req_text = "\n\n".join([f"[{r.id}] {r.title}: {r.description}" for r in requirements]) if requirements else "无需求"
    prompt = EXTRACTOR_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        requirement_text=req_text,
    )

    async def event_generator():
        yield f"event: progress\ndata: {{\"stage\": \"extract\", \"message\": \"正在提取功能需求和非功能需求...\"}}\n\n"
        async for chunk in provider.stream(EXTRACTOR_SYSTEM_PROMPT, prompt):
            yield f"event: chunk\ndata: {{\"content\": {json.dumps(chunk, ensure_ascii=False)}}}\n\n"
        yield f"event: progress\ndata: {{\"stage\": \"complete\", \"message\": \"分析完成\"}}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.put("/{req_id}/confirm", response_model=MessageResponse)
async def confirm_requirement(
    project_id: uuid.UUID, req_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """确认需求（人工审核通过）"""
    result = await db.execute(
        select(Requirement).where(Requirement.id == req_id, Requirement.project_id == project_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")
    req.status = RequirementStatus.CONFIRMED
    return MessageResponse(message="需求已确认")


@router.get("/{req_id}/quality", response_model=QualityEvaluationPublic | None)
async def get_quality_evaluation(project_id: uuid.UUID, req_id: uuid.UUID, db: DBSession):
    """获取需求质量评估"""
    result = await db.execute(
        select(QualityEvaluation).where(QualityEvaluation.requirement_id == req_id)
    )
    return result.scalar_one_or_none()