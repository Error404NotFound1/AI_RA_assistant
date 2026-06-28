"""需求分析 API - AI 辅助需求分析核心功能"""

import asyncio
import json
import uuid
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireRE
from app.models.requirement import Requirement, UserStory, QualityEvaluation, UseCase, RequirementStatus
from app.models.project import Project
from app.models.document import OperationLog, Attachment
from app.services.document_parser import extract_text
from app.schemas.schemas import (
    RequirementCreate, RequirementUpdate, RequirementPublic,
    RequirementAnalyzeRequest, ImportFromDocumentRequest,
    QualityEvaluationPublic, MessageResponse,
    UseCasePublic,
)
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import (
    EXTRACTOR_SYSTEM_PROMPT, EXTRACTOR_USER_TEMPLATE,
    CLASSIFIER_SYSTEM_PROMPT, CLASSIFIER_USER_TEMPLATE,
    USE_CASE_GENERATOR_SYSTEM_PROMPT, USE_CASE_GENERATOR_USER_TEMPLATE,
    DIAGRAM_PLANNER_SYSTEM_PROMPT, DIAGRAM_PLANNER_USER_TEMPLATE,
    USE_CASE_DIAGRAM_SYSTEM_PROMPT, USE_CASE_DIAGRAM_USER_TEMPLATE,
    ACTIVITY_DIAGRAM_SYSTEM_PROMPT, ACTIVITY_DIAGRAM_USER_TEMPLATE,
    SEQUENCE_DIAGRAM_SYSTEM_PROMPT, SEQUENCE_DIAGRAM_USER_TEMPLATE,
    STATE_DIAGRAM_SYSTEM_PROMPT, STATE_DIAGRAM_USER_TEMPLATE,
    CLASS_DIAGRAM_SYSTEM_PROMPT, CLASS_DIAGRAM_USER_TEMPLATE,
    DFD_SYSTEM_PROMPT, DFD_USER_TEMPLATE,
    ER_DIAGRAM_SYSTEM_PROMPT, ER_USER_TEMPLATE,
)

router = APIRouter(prefix="/projects/{project_id}/requirements", tags=["需求"])


# 图表类型 → (system_prompt, user_template, result_key) 映射
_DIAGRAM_TYPE_MAP = {
    "use_case": (USE_CASE_DIAGRAM_SYSTEM_PROMPT, USE_CASE_DIAGRAM_USER_TEMPLATE, "use_case_diagram"),
    "activity": (ACTIVITY_DIAGRAM_SYSTEM_PROMPT, ACTIVITY_DIAGRAM_USER_TEMPLATE, "activity_diagram"),
    "sequence": (SEQUENCE_DIAGRAM_SYSTEM_PROMPT, SEQUENCE_DIAGRAM_USER_TEMPLATE, "sequence_diagram"),
    "state": (STATE_DIAGRAM_SYSTEM_PROMPT, STATE_DIAGRAM_USER_TEMPLATE, "state_diagram"),
    "class": (CLASS_DIAGRAM_SYSTEM_PROMPT, CLASS_DIAGRAM_USER_TEMPLATE, "class_diagram"),
    "dfd": (DFD_SYSTEM_PROMPT, DFD_USER_TEMPLATE, "dfd_diagram"),
    "er": (ER_DIAGRAM_SYSTEM_PROMPT, ER_USER_TEMPLATE, "er_diagram"),
}


def _get_diagrams_for_requirement(req_id, all_diagrams, assignment):
    """获取分配给特定需求的图表。

    分配规则：
    - 如果 assignment 为空，返回所有图表（向后兼容）
    - 对于 assignment 中明确分配的图表，只返回分配给该需求的
    - 对于不在 assignment 中的已生成图表，兜底返回给所有需求
    """
    if not assignment:
        return dict(all_diagrams)

    assigned_keys = set()
    relevant = {}

    for diagram_type, assigned_reqs in assignment.items():
        type_map = _DIAGRAM_TYPE_MAP.get(diagram_type)
        diagram_key = type_map[2] if type_map else f"{diagram_type}_diagram"
        assigned_keys.add(diagram_key)

        if diagram_key not in all_diagrams:
            continue
        if not assigned_reqs or req_id in assigned_reqs:
            relevant[diagram_key] = all_diagrams[diagram_key]

    # 兜底：不在 assignment 中的已生成图表，分配给所有需求
    for diagram_key, code in all_diagrams.items():
        if diagram_key not in assigned_keys:
            relevant[diagram_key] = code

    return relevant


async def _plan_and_generate_diagrams(provider, project, analysis, use_cases_data):
    """图表规划 + 按需并行生成 PlantUML 图表。

    返回 (diagram_plan, diagrams) 二元组。
    """
    # Step 1: 图表规划 — LLM 判断需要哪些图表
    diagram_plan_prompt = DIAGRAM_PLANNER_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "",
        functional_requirements=json.dumps(
            analysis.get("functional_requirements", []), ensure_ascii=False, indent=2
        ),
        non_functional_requirements=json.dumps(
            analysis.get("non_functional_requirements", []), ensure_ascii=False, indent=2
        ),
        use_cases=json.dumps(use_cases_data, ensure_ascii=False, indent=2),
    )
    diagram_plan_result = await provider.complete(
        DIAGRAM_PLANNER_SYSTEM_PROMPT, diagram_plan_prompt, temperature=0.3
    )
    diagram_plan = diagram_plan_result.parsed_json or {}

    # Step 2: 按需并行生成图表（纯文本模式）
    diagram_types = diagram_plan.get("diagrams", [])
    fr_json = json.dumps(
        analysis.get("functional_requirements", []), ensure_ascii=False, indent=2
    )
    nfr_json = json.dumps(
        analysis.get("non_functional_requirements", []), ensure_ascii=False, indent=2
    )
    uc_json = json.dumps(use_cases_data, ensure_ascii=False, indent=2)
    actors = ", ".join(
        set(uc.get("actor", "") for uc in use_cases_data if uc.get("actor"))
    )

    async def _gen(dt: str):
        sys_prompt, user_template, key = _DIAGRAM_TYPE_MAP[dt]
        user_prompt = user_template.format(
            functional_requirements=fr_json,
            non_functional_requirements=nfr_json,
            use_cases=uc_json,
            actors=actors,
        )
        result = await provider.complete(
            sys_prompt, user_prompt, temperature=0.4, json_mode=False
        )
        return key, result.content.strip()

    valid_types = [dt for dt in diagram_types if dt in _DIAGRAM_TYPE_MAP]
    diagrams = {}
    if valid_types:
        results = await asyncio.gather(
            *[_gen(dt) for dt in valid_types], return_exceptions=True
        )
        for r in results:
            if isinstance(r, tuple):
                key, code = r
                diagrams[key] = code

    return diagram_plan, diagrams


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
        parent_id=data.parent_id,
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


async def _analyze_single_user_requirement(provider, project, user_req, current_user, db):
    """对单条用户需求执行 AI 分析，创建子需求并设置 parent_id"""
    project_id = project.id
    req_text = f"[REQ-1] {user_req.title}: {user_req.description}"

    # Step 1: 提取 FR/NFR
    extractor_prompt = EXTRACTOR_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        requirement_text=req_text,
    )
    extract_result = await provider.complete(EXTRACTOR_SYSTEM_PROMPT, extractor_prompt)
    if not extract_result.parsed_json:
        raise ValueError("AI 分析结果解析失败")
    analysis = extract_result.parsed_json

    # 并行: 分类 + 用例生成
    req_json = json.dumps(analysis, ensure_ascii=False)
    classifier_prompt = CLASSIFIER_USER_TEMPLATE.format(project_name=project.name, requirements_json=req_json)
    user_stories_json = json.dumps(analysis.get("user_stories", []), ensure_ascii=False)
    use_case_prompt = USE_CASE_GENERATOR_USER_TEMPLATE.format(
        project_name=project.name, requirements_json=req_json, user_stories_json=user_stories_json,
    )
    results = await asyncio.gather(
        provider.complete(CLASSIFIER_SYSTEM_PROMPT, classifier_prompt),
        provider.complete(USE_CASE_GENERATOR_SYSTEM_PROMPT, use_case_prompt),
        return_exceptions=True,
    )
    classify_result, use_case_result = results
    if not isinstance(classify_result, Exception) and classify_result.parsed_json:
        analysis["classification"] = classify_result.parsed_json
    if not isinstance(use_case_result, Exception) and use_case_result.parsed_json:
        analysis["use_cases"] = use_case_result.parsed_json.get("use_cases", [])
    else:
        analysis["use_cases"] = []

    # 图表
    try:
        diagram_plan, diagrams = await _plan_and_generate_diagrams(
            provider, project, analysis, analysis["use_cases"]
        )
    except Exception:
        diagram_plan, diagrams = {}, {}
    analysis["diagram_plan"] = diagram_plan
    analysis["diagrams"] = diagrams

    # 创建子需求记录（parent_id = user_req.id）
    created_reqs: dict[str, Requirement] = {}
    for idx, fr in enumerate(analysis.get("functional_requirements", [])):
        fr_id = fr.get("id") or fr.get("requirement_id") or f"FR-{idx+1:03d}"
        req = Requirement(
            project_id=project_id, title=fr.get("title", "未命名需求"),
            description=fr.get("description", ""), source=fr.get("source", "AI提取"),
            is_ai_extracted=True, parent_id=user_req.id, created_by=current_user.id,
        )
        db.add(req)
        await db.flush()
        req.req_type = "FR"
        created_reqs[fr_id] = req

    for idx, nfr in enumerate(analysis.get("non_functional_requirements", [])):
        nfr_id = nfr.get("id") or nfr.get("requirement_id") or f"NFR-{idx+1:03d}"
        req = Requirement(
            project_id=project_id, title=nfr.get("title", "未命名需求"),
            description=nfr.get("description", ""), source=nfr.get("source", "AI提取"),
            is_ai_extracted=True, parent_id=user_req.id, created_by=current_user.id,
        )
        db.add(req)
        await db.flush()
        req.req_type = "NFR"
        created_reqs[nfr_id] = req

    # 回填 priority
    classification = analysis.get("classification", {})
    for item in classification.get("classified_requirements", []):
        item_id = item.get("id", "")
        req = created_reqs.get(item_id)
        if req:
            req.priority = item.get("priority")

    # UserStory
    child_ids = [r.id for r in created_reqs.values()]
    if child_ids:
        await db.execute(delete(UserStory).where(UserStory.requirement_id.in_(child_ids)))
        for story in analysis.get("user_stories", []):
            req = created_reqs.get(story.get("requirement_id", ""))
            if req:
                db.add(UserStory(
                    requirement_id=req.id, role=story.get("role", ""),
                    goal=story.get("goal", ""), benefit=story.get("benefit", ""),
                    acceptance_criteria=story.get("acceptance_criteria"),
                ))

    # UseCase（同时为子需求和原始用户需求创建）
    if child_ids:
        await db.execute(delete(UseCase).where(UseCase.requirement_id.in_(child_ids)))
    for uc in analysis.get("use_cases", []):
        req = created_reqs.get(uc.get("requirement_id", ""))
        if req:
            db.add(UseCase(
                requirement_id=req.id, title=uc.get("title", ""),
                actor=uc.get("actor", ""), preconditions=uc.get("preconditions"),
                main_flow=uc.get("main_flow"), alternative_flows=uc.get("alternative_flows"),
                postconditions=uc.get("postconditions"),
            ))
    # 为原始用户需求也创建用例（向后兼容）
    for uc in analysis.get("use_cases", []):
        db.add(UseCase(
            requirement_id=user_req.id, title=uc.get("title", ""),
            actor=uc.get("actor", ""), preconditions=uc.get("preconditions"),
            main_flow=uc.get("main_flow"), alternative_flows=uc.get("alternative_flows"),
            postconditions=uc.get("postconditions"),
        ))

    # 存储分析结果
    for biz_id, req in created_reqs.items():
        req_analysis = {
            "intent_analysis": analysis.get("intent_analysis", {}),
            "functional_requirements": [
                fr for fr in analysis.get("functional_requirements", [])
                if (fr.get("id") or fr.get("requirement_id")) == biz_id
            ],
            "non_functional_requirements": [
                nfr for nfr in analysis.get("non_functional_requirements", [])
                if (nfr.get("id") or nfr.get("requirement_id")) == biz_id
            ],
            "user_stories": [
                us for us in analysis.get("user_stories", [])
                if us.get("requirement_id") == biz_id
            ],
            "classification": classification,
            "diagram_plan": diagram_plan,
            "diagrams": _get_diagrams_for_requirement(
                biz_id, diagrams, diagram_plan.get("diagram_assignment", {})
            ),
            "use_cases": [
                uc for uc in analysis.get("use_cases", [])
                if uc.get("requirement_id") == biz_id
            ],
        }
        req.analysis_result = req_analysis
        req.status = RequirementStatus.ANALYZED

    # 原始用户需求标记为已分析
    user_req.analysis_result = analysis
    user_req.status = RequirementStatus.ANALYZED
    # 设置原始需求的 req_type（向后兼容）
    if analysis.get("functional_requirements"):
        user_req.req_type = "FR"
    elif analysis.get("non_functional_requirements"):
        user_req.req_type = "NFR"

    return {
        "requirement_id": str(user_req.id),
        "title": user_req.title,
        "extracted_count": len(created_reqs),
        "analysis": analysis,
        "created_reqs": created_reqs,
        "diagrams": diagrams,
    }


@router.post("/analyze", response_model=dict)
async def analyze_requirements(
    project_id: uuid.UUID, data: RequirementAnalyzeRequest, current_user: RequireRE, db: DBSession,
):
    """AI 辅助需求分析 - 逐条分析用户需求，提取 FR/NFR + 分类 + 用例 + 图表"""
    # 获取项目信息
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取待分析需求（仅用户需求：非 AI 提取）
    query = select(Requirement).where(
        Requirement.project_id == project_id,
        Requirement.is_ai_extracted == False,
    )
    if data.requirement_ids:
        query = query.where(Requirement.id.in_(data.requirement_ids))
    else:
        query = query.where(Requirement.status == RequirementStatus.DRAFT)

    result = await db.execute(query)
    requirements = list(result.scalars().all())
    if not requirements:
        raise HTTPException(status_code=400, detail="没有待分析的需求")

    provider = get_llm_provider()
    all_analyses = []
    errors = []

    # 逐条分析用户需求
    for user_req in requirements:
        try:
            analysis_result = await _analyze_single_user_requirement(
                provider, project, user_req, current_user, db
            )
            all_analyses.append(analysis_result)
        except Exception as e:
            errors.append({"requirement_id": str(user_req.id), "title": user_req.title, "error": str(e)})

    if not all_analyses:
        raise HTTPException(status_code=500, detail=f"所有需求分析失败: {errors}")

    # 聚合结果
    all_created_reqs = {}
    all_diagrams = {}
    combined_analysis = {
        "intent_analysis": {},
        "functional_requirements": [],
        "non_functional_requirements": [],
        "user_stories": [],
        "classification": {"classified_requirements": []},
        "use_cases": [],
    }
    for a in all_analyses:
        analysis = a["analysis"]
        all_created_reqs.update(a["created_reqs"])
        all_diagrams.update(a.get("diagrams", {}))
        combined_analysis["intent_analysis"] = analysis.get("intent_analysis", {})
        combined_analysis["functional_requirements"].extend(analysis.get("functional_requirements", []))
        combined_analysis["non_functional_requirements"].extend(analysis.get("non_functional_requirements", []))
        combined_analysis["user_stories"].extend(analysis.get("user_stories", []))
        combined_analysis["use_cases"].extend(analysis.get("use_cases", []))
        classification = analysis.get("classification", {})
        combined_analysis["classification"]["classified_requirements"].extend(
            classification.get("classified_requirements", [])
        )

    combined_analysis["all_diagrams"] = all_diagrams
    combined_analysis["diagrams"] = all_diagrams
    combined_analysis["diagram_plan"] = {}

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="analyze",
        target_type="requirement",
        target_id=project_id,
        detail={"requirement_count": len(requirements)},
    ))

    combined_analysis["message"] = f"成功分析 {len(all_analyses)} 条需求"
    return combined_analysis


@router.post("/import-and-analyze", response_model=dict)
async def import_and_analyze(
    project_id: uuid.UUID,
    data: ImportFromDocumentRequest,
    current_user: RequireRE,
    db: DBSession,
):
    """从文档文本中提取需求，创建 Requirement 记录，并执行 AI 分析

    根因 B 修复：提供从文档生成需求的完整流程
    根因 C 修复：为提取的每条 FR/NFR 创建独立 Requirement 记录
    """
    # 1. 查询项目
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 1.5 如果提供了 attachment_id 且 content 为空，从附件文件中提取文本
    content = data.content
    if not content.strip() and data.attachment_id:
        try:
            att_uuid = uuid.UUID(data.attachment_id)
            att_result = await db.execute(
                select(Attachment).where(
                    Attachment.id == att_uuid,
                    Attachment.project_id == project_id,
                )
            )
            attachment = att_result.scalar_one_or_none()
            if not attachment:
                raise HTTPException(status_code=404, detail="附件不存在")
            content = extract_text(attachment.file_path, attachment.filename)
            if not content.strip():
                raise HTTPException(status_code=400, detail="无法从附件中提取文本内容")
        except ValueError:
            raise HTTPException(status_code=400, detail="无效的附件 ID")
    elif not content.strip():
        raise HTTPException(status_code=400, detail="请提供文档内容或选择附件")

    # 2. 调用 EXTRACTOR 提取需求
    provider = get_llm_provider()
    extractor_prompt = EXTRACTOR_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        requirement_text=content,
    )
    try:
        extract_result = await provider.complete(EXTRACTOR_SYSTEM_PROMPT, extractor_prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 需求提取失败: {e}")
    if not extract_result.parsed_json:
        raise HTTPException(status_code=500, detail="AI 需求提取失败：返回结果无法解析")

    analysis = extract_result.parsed_json

    # 3. 为每条 FR/NFR 创建独立 Requirement 记录（根因 C 修复）
    fr_list = analysis.get("functional_requirements", [])
    nfr_list = analysis.get("non_functional_requirements", [])

    created_reqs: dict[str, Requirement] = {}  # 映射: FR-001 -> Requirement

    for idx, fr in enumerate(fr_list):
        fr_id = fr.get("id") or f"FR-{idx+1:03d}"
        req = Requirement(
            project_id=project_id,
            title=fr.get("title", "未命名需求"),
            description=fr.get("description", ""),
            source=fr.get("source", "文档提取"),
            req_type="FR",
            status=RequirementStatus.DRAFT,
            is_ai_extracted=True,
            created_by=current_user.id,
        )
        db.add(req)
        await db.flush()
        created_reqs[fr_id] = req

    for idx, nfr in enumerate(nfr_list):
        nfr_id = nfr.get("id") or f"NFR-{idx+1:03d}"
        req = Requirement(
            project_id=project_id,
            title=nfr.get("title", "未命名需求"),
            description=nfr.get("description", ""),
            source=nfr.get("source", "文档提取"),
            req_type="NFR",
            status=RequirementStatus.DRAFT,
            is_ai_extracted=True,
            created_by=current_user.id,
        )
        db.add(req)
        await db.flush()
        created_reqs[nfr_id] = req

    # 4. 准备并行步骤的 prompt
    req_json = json.dumps(analysis, ensure_ascii=False)
    classifier_prompt = CLASSIFIER_USER_TEMPLATE.format(
        project_name=project.name, requirements_json=req_json
    )
    user_stories_json = json.dumps(analysis.get("user_stories", []), ensure_ascii=False)
    use_case_prompt = USE_CASE_GENERATOR_USER_TEMPLATE.format(
        project_name=project.name,
        requirements_json=req_json,
        user_stories_json=user_stories_json,
    )

    # 5. 并行调用 CLASSIFIER + USE_CASE_GENERATOR
    results = await asyncio.gather(
        provider.complete(CLASSIFIER_SYSTEM_PROMPT, classifier_prompt),
        provider.complete(USE_CASE_GENERATOR_SYSTEM_PROMPT, use_case_prompt),
        return_exceptions=True,
    )
    classify_result, use_case_result = results

    # 6. 处理分类结果 - 回填 priority
    if not isinstance(classify_result, Exception) and classify_result.parsed_json:
        classification = classify_result.parsed_json
        for item in classification.get("classified_requirements", []):
            item_id = item.get("id", "")
            req = created_reqs.get(item_id)
            if req:
                req.priority = item.get("priority", "Should")
    else:
        classification = {}

    # 7. 处理用例
    use_cases_data = []
    if not isinstance(use_case_result, Exception) and use_case_result.parsed_json:
        use_cases_data = use_case_result.parsed_json.get("use_cases", [])
        for uc in use_cases_data:
            uc_req_id = uc.get("requirement_id", "")
            req = created_reqs.get(uc_req_id)
            if req:
                db.add(UseCase(
                    requirement_id=req.id,
                    title=uc.get("title", ""),
                    actor=uc.get("actor", ""),
                    preconditions=uc.get("preconditions"),
                    main_flow=uc.get("main_flow"),
                    alternative_flows=uc.get("alternative_flows"),
                    postconditions=uc.get("postconditions"),
                ))

    # 8. 图表规划 + 按需生成 PlantUML 图表
    diagram_plan, diagrams = await _plan_and_generate_diagrams(
        provider, project, analysis, use_cases_data
    )

    # 9. 处理用户故事
    for story in analysis.get("user_stories", []):
        story_req_id = story.get("requirement_id", "")
        req = created_reqs.get(story_req_id)
        if req:
            db.add(UserStory(
                requirement_id=req.id,
                role=story.get("role", ""),
                goal=story.get("goal", ""),
                benefit=story.get("benefit", ""),
                acceptance_criteria=story.get("acceptance_criteria"),
            ))

    # 10. 存储每条需求的独立分析结果
    for biz_id, req in created_reqs.items():
        req_analysis = {
            "intent_analysis": analysis.get("intent_analysis", {}),
            "functional_requirements": [
                fr for fr in fr_list
                if (fr.get("id") or fr.get("requirement_id")) == biz_id
            ],
            "non_functional_requirements": [
                nfr for nfr in nfr_list
                if (nfr.get("id") or nfr.get("requirement_id")) == biz_id
            ],
            "user_stories": [
                us for us in analysis.get("user_stories", [])
                if us.get("requirement_id") == biz_id
            ],
            "classification": classification,
            "diagram_plan": diagram_plan,
            "diagrams": _get_diagrams_for_requirement(
                biz_id, diagrams, diagram_plan.get("diagram_assignment", {})
            ),
            "use_cases": [
                uc for uc in use_cases_data
                if uc.get("requirement_id") == biz_id
            ],
        }
        req.analysis_result = req_analysis
        req.status = RequirementStatus.ANALYZED

    # 11. 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="import_and_analyze",
        target_type="project",
        target_id=project_id,
        detail=f"从文档导入并分析了 {len(created_reqs)} 条需求",
    ))

    await db.commit()

    # 12. 返回结果
    return {
        "message": f"成功从文档提取 {len(created_reqs)} 条需求并完成分析",
        "extracted_count": len(created_reqs),
        "intent_analysis": analysis.get("intent_analysis", {}),
        "all_diagrams": diagrams,
        "requirements": [
            {
                "id": str(req.id),
                "title": req.title,
                "description": req.description,
                "req_type": req.req_type,
                "priority": req.priority,
                "status": req.status,
                "source": req.source,
                "is_ai_extracted": req.is_ai_extracted,
                "analysis_result": req.analysis_result,
            }
            for req in created_reqs.values()
        ],
    }


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


@router.get("/{req_id}/use-cases", response_model=list[UseCasePublic])
async def get_use_cases(project_id: uuid.UUID, req_id: uuid.UUID, db: DBSession):
    """获取需求的用例描述"""
    result = await db.execute(
        select(UseCase).where(UseCase.requirement_id == req_id)
    )
    return result.scalars().all()


@router.post("/{req_id}/generate-diagrams", response_model=dict)
async def regenerate_diagrams(
    project_id: uuid.UUID, req_id: uuid.UUID, current_user: RequireRE, db: DBSession,
):
    """重新生成需求的图表"""
    # 查询需求
    result = await db.execute(
        select(Requirement).where(
            Requirement.id == req_id, Requirement.project_id == project_id
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")

    # 获取项目信息
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取 analysis_result
    analysis_result = req.analysis_result or {}

    # 收集该需求及同项目所有已分析需求的数据，供图表规划使用
    all_req_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    all_reqs = all_req_result.scalars().all()

    # 合并所有需求的功能/非功能需求
    fr_list = []
    nfr_list = []
    use_cases_data = []
    for r in all_reqs:
        ar = r.analysis_result or {}
        fr_list.extend(ar.get("functional_requirements", []))
        nfr_list.extend(ar.get("non_functional_requirements", []))
        use_cases_data.extend(ar.get("use_cases", []))

    # 如果没有合并数据，回退到当前需求的 analysis_result
    if not fr_list:
        fr_list = analysis_result.get("functional_requirements", [])
    if not nfr_list:
        nfr_list = analysis_result.get("non_functional_requirements", [])
    if not use_cases_data:
        use_cases_data = analysis_result.get("use_cases", [])

    merged_analysis = {
        "functional_requirements": fr_list,
        "non_functional_requirements": nfr_list,
    }

    # 调用图表规划 + 图表生成器
    provider = get_llm_provider()
    diagram_plan, diagrams = await _plan_and_generate_diagrams(
        provider, project, merged_analysis, use_cases_data
    )

    # 获取图表分配映射
    diagram_assignment = diagram_plan.get("diagram_assignment", {})

    # 获取当前需求的业务编号（FR-001 / NFR-001 等）
    current_biz_ids = set()
    for fr in analysis_result.get("functional_requirements", []):
        fr_id = fr.get("id") or fr.get("requirement_id")
        if fr_id:
            current_biz_ids.add(fr_id)
    for nfr in analysis_result.get("non_functional_requirements", []):
        nfr_id = nfr.get("id") or nfr.get("requirement_id")
        if nfr_id:
            current_biz_ids.add(nfr_id)

    # 按分配获取当前需求的相关图表
    req_diagrams = {}
    if current_biz_ids:
        for biz_id in current_biz_ids:
            assigned = _get_diagrams_for_requirement(
                biz_id, diagrams, diagram_assignment
            )
            req_diagrams.update(assigned)
    else:
        # 兜底：无法确定业务编号时返回所有图表
        req_diagrams = dict(diagrams)

    # 更新当前需求的 analysis_result
    analysis_result["diagram_plan"] = diagram_plan
    analysis_result["diagrams"] = req_diagrams
    req.analysis_result = analysis_result

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="generate_diagrams",
        target_type="requirement",
        target_id=req_id,
        detail={"diagram_count": len(req_diagrams)},
    ))

    return {
        "requirement_id": str(req.id),
        "diagram_plan": diagram_plan,
        "diagrams": req_diagrams,
        "all_diagrams": diagrams,
    }


@router.delete("/{req_id}", response_model=MessageResponse)
async def delete_requirement(
    project_id: uuid.UUID, req_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """删除需求（级联删除子需求及关联数据）"""
    result = await db.execute(
        select(Requirement).where(Requirement.id == req_id, Requirement.project_id == project_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="需求不存在")

    # 查找子需求
    child_result = await db.execute(
        select(Requirement).where(Requirement.parent_id == req_id)
    )
    children = list(child_result.scalars().all())
    child_ids = [c.id for c in children]

    # 删除子需求的关联数据
    if child_ids:
        await db.execute(delete(UserStory).where(UserStory.requirement_id.in_(child_ids)))
        await db.execute(delete(UseCase).where(UseCase.requirement_id.in_(child_ids)))
        await db.execute(delete(QualityEvaluation).where(QualityEvaluation.requirement_id.in_(child_ids)))
        await db.execute(delete(Requirement).where(Requirement.id.in_(child_ids)))

    # 删除当前需求的关联数据（cascade 会自动处理，但显式删除更安全）
    await db.execute(delete(UserStory).where(UserStory.requirement_id == req_id))
    await db.execute(delete(UseCase).where(UseCase.requirement_id == req_id))
    await db.execute(delete(QualityEvaluation).where(QualityEvaluation.requirement_id == req_id))

    # 删除需求本身
    await db.execute(delete(Requirement).where(Requirement.id == req_id))
    await db.commit()

    return MessageResponse(message="需求已删除")


@router.post("/{req_id}/re-analyze", response_model=dict)
async def re_analyze_requirement(
    project_id: uuid.UUID, req_id: uuid.UUID, current_user: RequireRE, db: DBSession,
):
    """重新分析单条用户需求：删除旧子需求后重新 AI 分析"""
    result = await db.execute(
        select(Requirement).where(
            Requirement.id == req_id,
            Requirement.project_id == project_id,
            Requirement.is_ai_extracted == False,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="用户需求不存在或该需求为 AI 提取的需求")

    # 获取项目
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 删除旧子需求及其关联数据
    child_result = await db.execute(
        select(Requirement).where(Requirement.parent_id == req_id)
    )
    children = list(child_result.scalars().all())
    child_ids = [c.id for c in children]

    if child_ids:
        await db.execute(delete(UserStory).where(UserStory.requirement_id.in_(child_ids)))
        await db.execute(delete(UseCase).where(UseCase.requirement_id.in_(child_ids)))
        await db.execute(delete(QualityEvaluation).where(QualityEvaluation.requirement_id.in_(child_ids)))
        await db.execute(delete(Requirement).where(Requirement.id.in_(child_ids)))

    # 重新分析
    provider = get_llm_provider()
    try:
        analysis_result = await _analyze_single_user_requirement(
            provider, project, req, current_user, db
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 重新分析失败: {str(e)}")

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="re_analyze",
        target_type="requirement",
        target_id=req_id,
        detail={"extracted_count": analysis_result["extracted_count"]},
    ))

    return analysis_result["analysis"]
