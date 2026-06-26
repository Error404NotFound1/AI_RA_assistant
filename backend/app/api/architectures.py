"""架构设计 API"""

import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireSA
from app.models.requirement import Requirement, RequirementStatus
from app.models.architecture import ArchitectureSolution, ArchComponent, ArchReview, ADR, TraceabilityLink
from app.models.project import Project
from app.schemas.schemas import (
    ArchitectureRecommendRequest, ArchSolutionPublic, ArchReviewCreate,
    ADRCreate, MessageResponse,
)
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import (
    ARCH_RECOMMENDER_SYSTEM_PROMPT, ARCH_RECOMMENDER_USER_TEMPLATE,
    TRACEABILITY_MAPPER_SYSTEM_PROMPT, TRACEABILITY_MAPPER_USER_TEMPLATE,
)
import json

router = APIRouter(prefix="/projects/{project_id}/architectures", tags=["架构设计"])


@router.post("/recommend", response_model=dict)
async def recommend_architecture(
    project_id: uuid.UUID, data: ArchitectureRecommendRequest,
    current_user: RequireSA, db: DBSession,
):
    """AI 辅助架构推荐"""
    # 获取项目信息
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取已确认需求
    req_result = await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.status == RequirementStatus.CONFIRMED,
        )
    )
    requirements = req_result.scalars().all()
    if not requirements:
        raise HTTPException(status_code=400, detail="没有已确认的需求，请先完成需求分析")

    req_list = [
        {"id": str(r.id), "title": r.title, "description": r.description, "type": r.req_type, "priority": r.priority}
        for r in requirements
    ]

    provider = get_llm_provider()
    prompt = ARCH_RECOMMENDER_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        team_size=data.constraints.get("team_size", "5人") if data.constraints else "5人",
        budget=data.constraints.get("budget", "中等") if data.constraints else "中等",
        requirements_json=json.dumps(req_list, ensure_ascii=False),
        quality_attributes=", ".join(data.quality_attributes) if data.quality_attributes else "性能、安全性、可扩展性",
    )

    result = await provider.complete(ARCH_RECOMMENDER_SYSTEM_PROMPT, prompt)
    if not result.parsed_json:
        raise HTTPException(status_code=500, detail="AI 架构推荐结果解析失败")

    # 保存推荐结果
    recommendation = result.parsed_json
    for pattern in recommendation.get("recommended_patterns", []):
        solution = ArchitectureSolution(
            project_id=project_id,
            name=pattern.get("name", "未命名方案"),
            pattern=pattern.get("name"),
            description=pattern.get("reason", ""),
            recommendation=recommendation,
            quality_scores=recommendation.get("quality_verification"),
            created_by=current_user.id,
        )
        db.add(solution)

        # 保存组件
        for comp in recommendation.get("components", []):
            component = ArchComponent(
                solution_id=solution.id,
                name=comp.get("name", "未命名组件"),
                comp_type=comp.get("type", "service"),
                responsibility=comp.get("responsibility"),
                interfaces=comp.get("interfaces"),
                dependencies=comp.get("dependencies"),
            )
            db.add(component)

    return recommendation


@router.get("", response_model=list[ArchSolutionPublic])
async def list_architectures(project_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """获取项目架构方案列表"""
    result = await db.execute(
        select(ArchitectureSolution)
        .where(ArchitectureSolution.project_id == project_id)
        .order_by(ArchitectureSolution.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{solution_id}", response_model=ArchSolutionPublic)
async def get_architecture(project_id: uuid.UUID, solution_id: uuid.UUID, db: DBSession):
    """获取架构方案详情"""
    result = await db.execute(
        select(ArchitectureSolution).where(
            ArchitectureSolution.id == solution_id,
            ArchitectureSolution.project_id == project_id,
        )
    )
    solution = result.scalar_one_or_none()
    if not solution:
        raise HTTPException(status_code=404, detail="架构方案不存在")
    return solution


@router.post("/{solution_id}/reviews", response_model=MessageResponse)
async def create_review(
    project_id: uuid.UUID, solution_id: uuid.UUID, data: ArchReviewCreate,
    current_user: RequireSA, db: DBSession,
):
    """提交架构评审"""
    review = ArchReview(
        solution_id=solution_id,
        reviewer_id=current_user.id,
        comment=data.comment,
        rating=data.rating,
    )
    db.add(review)
    return MessageResponse(message="评审已提交")


@router.post("/{solution_id}/adr", response_model=MessageResponse)
async def create_adr(
    project_id: uuid.UUID, solution_id: uuid.UUID, data: ADRCreate,
    current_user: RequireSA, db: DBSession,
):
    """创建架构决策记录"""
    adr = ADR(
        solution_id=solution_id,
        project_id=project_id,
        title=data.title,
        context=data.context,
        decision=data.decision,
        consequences=data.consequences,
    )
    db.add(adr)
    return MessageResponse(message="ADR 已创建")


@router.post("/traceability/auto-map", response_model=dict)
async def auto_map_traceability(
    project_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """AI 自动建立需求-架构追踪映射"""
    # 获取已确认需求
    req_result = await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.status == RequirementStatus.CONFIRMED,
        )
    )
    requirements = req_result.scalars().all()

    # 获取最新架构方案的组件
    sol_result = await db.execute(
        select(ArchitectureSolution)
        .where(ArchitectureSolution.project_id == project_id)
        .order_by(ArchitectureSolution.created_at.desc())
        .limit(1)
    )
    solution = sol_result.scalar_one_or_none()
    if not solution:
        raise HTTPException(status_code=400, detail="尚未生成架构方案")

    comp_result = await db.execute(
        select(ArchComponent).where(ArchComponent.solution_id == solution.id)
    )
    components = comp_result.scalars().all()

    if not requirements or not components:
        raise HTTPException(status_code=400, detail="需求或组件数据不足")

    req_list = [{"id": str(r.id), "title": r.title, "type": r.req_type} for r in requirements]
    comp_list = [{"name": c.name, "type": c.comp_type, "responsibility": c.responsibility} for c in components]

    provider = get_llm_provider()
    prompt = TRACEABILITY_MAPPER_USER_TEMPLATE.format(
        requirements_json=json.dumps(req_list, ensure_ascii=False),
        components_json=json.dumps(comp_list, ensure_ascii=False),
    )

    result = await provider.complete(TRACEABILITY_MAPPER_SYSTEM_PROMPT, prompt)
    if not result.parsed_json:
        raise HTTPException(status_code=500, detail="追踪映射结果解析失败")

    mappings = result.parsed_json.get("mappings", [])
    # 保存映射到数据库
    for mapping in mappings:
        link = TraceabilityLink(
            requirement_id=uuid.UUID(mapping["requirement_id"]),
            component_id=uuid.UUID(mapping["component_id"]) if "component_id" in mapping else components[0].id,
            solution_id=solution.id,
            mapping_type=mapping.get("mapping_type", "direct"),
            confidence=mapping.get("confidence", 0.8),
            rationale=mapping.get("rationale"),
        )
        db.add(link)

    return result.parsed_json