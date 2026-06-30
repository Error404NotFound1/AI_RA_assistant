"""架构设计 API"""

import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireSA
from app.models.requirement import Requirement, RequirementStatus, UserStory, UseCase
from app.models.architecture import ArchitectureSolution, ArchComponent, ArchReview, ADR, TraceabilityLink
from app.models.document import OperationLog
from app.models.project import Project
from app.schemas.schemas import (
    ArchitectureRecommendRequest, ArchSolutionPublic, ArchReviewCreate,
    ADRCreate, MessageResponse,
    # 新增
    ArchReviewPublic, ArchReviewUpdate,
    ADRPublic, ADRUpdate,
    ArchComponentCreate, ArchComponentUpdate, ArchComponentPublic,
    TraceabilityLinkCreate, TraceabilityLinkUpdate, TraceabilityLinkPublic,
    ArchSolutionUpdate,
    AIReviewResponse,
)
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import (
    ARCH_RECOMMENDER_SYSTEM_PROMPT, ARCH_RECOMMENDER_USER_TEMPLATE,
    TRACEABILITY_MAPPER_SYSTEM_PROMPT, TRACEABILITY_MAPPER_USER_TEMPLATE,
    ARCH_DOC_GENERATOR_SYSTEM_PROMPT, ARCH_DOC_GENERATOR_USER_TEMPLATE,
    PLANTUML_GENERATOR_SYSTEM_PROMPT, PLANTUML_GENERATOR_USER_TEMPLATE,
    ARCH_REVIEW_SYSTEM_PROMPT, ARCH_REVIEW_USER_TEMPLATE,
)
import json
from sqlalchemy import func

router = APIRouter(prefix="/projects/{project_id}/architectures", tags=["架构设计"])


async def _get_solution_or_404(
    db: AsyncSession, project_id: uuid.UUID, solution_id: uuid.UUID
) -> ArchitectureSolution:
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
    solutions = []
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
        solutions.append(solution)

    # flush 后 solution.id 可用，避免在 flush 前使用 None
    await db.flush()

    # 组件仅与第一个 solution 关联，避免在 patterns 循环中重复写入
    if solutions:
        for comp in recommendation.get("components", []):
            component = ArchComponent(
                solution_id=solutions[0].id,
                name=comp.get("name", "未命名组件"),
                comp_type=comp.get("type", "service"),
                responsibility=comp.get("responsibility"),
                interfaces=comp.get("interfaces"),
                dependencies=comp.get("dependencies"),
            )
            db.add(component)

    db.add(OperationLog(
        user_id=current_user.id,
        action="recommend",
        target_type="architecture",
        target_id=project_id,
        detail={"pattern_count": len(recommendation.get("recommended_patterns", []))},
    ))

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
    comp_list = [{"id": str(c.id), "name": c.name, "type": c.comp_type, "responsibility": c.responsibility} for c in components]

    provider = get_llm_provider()
    prompt = TRACEABILITY_MAPPER_USER_TEMPLATE.format(
        requirements_json=json.dumps(req_list, ensure_ascii=False),
        components_json=json.dumps(comp_list, ensure_ascii=False),
    )

    result = await provider.complete(TRACEABILITY_MAPPER_SYSTEM_PROMPT, prompt)
    if not result.parsed_json:
        raise HTTPException(status_code=500, detail="追踪映射结果解析失败")

    mappings = result.parsed_json.get("mappings", [])

    # 构建 name → component 映射，用于 ID 解析失败时模糊匹配
    comp_name_map = {c.name: c for c in components}
    comp_id_map = {str(c.id): c for c in components}
    # 构建 id → requirement 映射
    req_id_map = {str(r.id): r for r in requirements}

    # 保存映射到数据库
    for mapping in mappings:
        # 解析 requirement_id（LLM 可能返回 UUID 或 "FR-001" 等格式）
        req_id_raw = mapping.get("requirement_id", "")
        req = None
        try:
            req = req_id_map.get(req_id_raw)
            if not req:
                # 尝试作为 UUID 直接解析并匹配
                req_uuid = uuid.UUID(req_id_raw)
                for r in requirements:
                    if r.id == req_uuid:
                        req = r
                        break
        except (ValueError, TypeError):
            pass

        if not req:
            continue  # 跳过无法匹配的

        # 解析 component_id（LLM 可能返回 UUID 或名称）
        comp_id_raw = mapping.get("component_id", "")
        comp = None
        try:
            comp = comp_id_map.get(comp_id_raw)
            if not comp:
                comp_uuid = uuid.UUID(comp_id_raw)
                for c in components:
                    if c.id == comp_uuid:
                        comp = c
                        break
        except (ValueError, TypeError):
            pass

        # 如果 component_id 解析失败，尝试按名称匹配
        if not comp:
            comp_name = mapping.get("component_name", "")
            comp = comp_name_map.get(comp_name)

        if not comp:
            continue  # 跳过无法匹配的

        link = TraceabilityLink(
            requirement_id=req.id,
            component_id=comp.id,
            solution_id=solution.id,
            mapping_type=mapping.get("mapping_type", "direct"),
            confidence=mapping.get("confidence", 0.8),
            rationale=mapping.get("rationale"),
        )
        db.add(link)

    db.add(OperationLog(
        user_id=current_user.id,
        action="auto_map",
        target_type="traceability",
        target_id=project_id,
        detail={"mapping_count": len(mappings)},
    ))

    return result.parsed_json


@router.get("/traceability/matrix", response_model=dict)
async def get_traceability_matrix(
    project_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """获取需求级 traceability 矩阵（需求→用户故事→用例→架构组件）"""
    # 查询所有已分析/已确认需求
    req_result = await db.execute(
        select(Requirement).where(Requirement.project_id == project_id)
    )
    requirements = req_result.scalars().all()

    # 查询用户故事
    story_result = await db.execute(
        select(UserStory).where(
            UserStory.requirement_id.in_([r.id for r in requirements])
        )
    )
    user_stories = story_result.scalars().all()

    # 查询用例
    uc_result = await db.execute(
        select(UseCase).where(
            UseCase.requirement_id.in_([r.id for r in requirements])
        )
    )
    use_cases = uc_result.scalars().all()

    # 查询架构追溯链接
    link_result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.requirement_id.in_([r.id for r in requirements])
        )
    )
    links = link_result.scalars().all()

    # 获取组件名称映射
    comp_ids = {l.component_id for l in links}
    comp_names = {}
    if comp_ids:
        comp_result = await db.execute(
            select(ArchComponent).where(ArchComponent.id.in_(list(comp_ids)))
        )
        for c in comp_result.scalars().all():
            comp_names[str(c.id)] = c.name

    # 构建矩阵
    req_list = []
    covered_count = 0
    for r in requirements:
        req_stories = [s for s in user_stories if s.requirement_id == r.id]
        req_ucs = [uc for uc in use_cases if uc.requirement_id == r.id]
        req_links = [
            {
                "component_name": comp_names.get(str(l.component_id), "未知"),
                "mapping_type": l.mapping_type,
                "confidence": l.confidence,
            }
            for l in links if l.requirement_id == r.id
        ]
        is_covered = bool(req_stories or req_ucs or req_links)
        if is_covered:
            covered_count += 1
        req_list.append({
            "id": str(r.id),
            "title": r.title,
            "req_type": r.req_type,
            "priority": r.priority,
            "status": r.status,
            "user_stories": [{"role": s.role, "goal": s.goal, "benefit": s.benefit} for s in req_stories],
            "use_cases": [{"title": uc.title, "actor": uc.actor} for uc in req_ucs],
            "arch_links": req_links,
            "covered": is_covered,
        })

    total = len(requirements)
    return {
        "requirements": req_list,
        "coverage": {
            "total": total,
            "covered": covered_count,
            "percentage": round(covered_count / total * 100, 1) if total > 0 else 0.0,
        },
    }


@router.post("/{solution_id}/generate-doc", response_model=dict)
async def generate_arch_doc(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """生成架构设计文档"""
    result = await db.execute(
        select(ArchitectureSolution).where(
            ArchitectureSolution.id == solution_id,
            ArchitectureSolution.project_id == project_id,
        )
    )
    solution = result.scalar_one_or_none()
    if not solution:
        raise HTTPException(status_code=404, detail="架构方案不存在")

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    provider = get_llm_provider()
    prompt = ARCH_DOC_GENERATOR_USER_TEMPLATE.format(
        project_name=project.name,
        project_description=project.description or "无",
        architecture_result_json=json.dumps(solution.recommendation or {}, ensure_ascii=False),
    )

    # 架构文档输出 Markdown，使用 json_mode=False
    result = await provider.complete(ARCH_DOC_GENERATOR_SYSTEM_PROMPT, prompt, json_mode=False)

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="generate_arch_doc",
        target_type="architecture",
        target_id=solution_id,
    ))

    return {
        "solution_id": str(solution.id),
        "solution_name": solution.name,
        "document": result.content,
    }


@router.post("/{solution_id}/generate-plantuml", response_model=dict)
async def generate_plantuml(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """生成 PlantUML 组件图代码"""
    result = await db.execute(
        select(ArchitectureSolution).where(
            ArchitectureSolution.id == solution_id,
            ArchitectureSolution.project_id == project_id,
        )
    )
    solution = result.scalar_one_or_none()
    if not solution:
        raise HTTPException(status_code=404, detail="架构方案不存在")

    # 获取组件列表
    comp_result = await db.execute(
        select(ArchComponent).where(ArchComponent.solution_id == solution_id)
    )
    components = comp_result.scalars().all()

    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()

    comp_list = [
        {
            "name": c.name,
            "type": c.comp_type,
            "responsibility": c.responsibility,
            "interfaces": c.interfaces,
            "dependencies": c.dependencies,
        }
        for c in components
    ]

    recommendation = solution.recommendation or {}
    patterns = recommendation.get("recommended_patterns", [])

    provider = get_llm_provider()
    prompt = PLANTUML_GENERATOR_USER_TEMPLATE.format(
        project_name=project.name,
        components_json=json.dumps(comp_list, ensure_ascii=False),
        patterns_json=json.dumps(patterns, ensure_ascii=False),
    )

    # PlantUML 输出纯文本，使用 json_mode=False
    result = await provider.complete(PLANTUML_GENERATOR_SYSTEM_PROMPT, prompt, json_mode=False)

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="generate_plantuml",
        target_type="architecture",
        target_id=solution_id,
    ))

    return {
        "solution_id": str(solution.id),
        "solution_name": solution.name,
        "plantuml": result.content,
    }


# =============================================
# 2.1 Review 管理
# =============================================

@router.get("/{solution_id}/reviews", response_model=list[ArchReviewPublic])
async def list_reviews(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取架构评审列表"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchReview).where(
            ArchReview.solution_id == solution_id,
        ).order_by(ArchReview.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{solution_id}/reviews/{review_id}", response_model=ArchReviewPublic)
async def get_review(
    project_id: uuid.UUID, solution_id: uuid.UUID, review_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取评审详情"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchReview).where(
            ArchReview.id == review_id,
            ArchReview.solution_id == solution_id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="评审不存在")
    return review


@router.put("/{solution_id}/reviews/{review_id}", response_model=ArchReviewPublic)
async def update_review(
    project_id: uuid.UUID, solution_id: uuid.UUID, review_id: uuid.UUID,
    data: ArchReviewUpdate, current_user: RequireSA, db: DBSession,
):
    """更新评审状态"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchReview).where(
            ArchReview.id == review_id,
            ArchReview.solution_id == solution_id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="评审不存在")

    # 状态流转验证: open→addressed→resolved（严格单向）
    if data.status is not None:
        valid_transitions = {"open": "addressed", "addressed": "resolved"}
        expected = valid_transitions.get(review.status)
        if expected != data.status:
            raise HTTPException(
                status_code=400,
                detail=f"评审状态不允许从 {review.status} 变更为 {data.status}",
            )

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(review, key, value)

    db.add(OperationLog(
        user_id=current_user.id,
        action="update_review",
        target_type="arch_review",
        target_id=review_id,
        detail=updates,
    ))
    await db.flush()
    await db.refresh(review)
    return review


@router.delete("/{solution_id}/reviews/{review_id}", response_model=MessageResponse)
async def delete_review(
    project_id: uuid.UUID, solution_id: uuid.UUID, review_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """删除评审"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchReview).where(
            ArchReview.id == review_id,
            ArchReview.solution_id == solution_id,
        )
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="评审不存在")

    await db.delete(review)
    db.add(OperationLog(
        user_id=current_user.id,
        action="delete_review",
        target_type="arch_review",
        target_id=review_id,
        detail={"comment": review.comment},
    ))
    return MessageResponse(message="评审已删除")


# =============================================
# 2.2 ADR 管理
# =============================================

@router.get("/{solution_id}/adrs", response_model=list[ADRPublic])
async def list_adrs(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取ADR列表"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ADR).where(
            ADR.solution_id == solution_id,
            ADR.project_id == project_id,
        ).order_by(ADR.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{solution_id}/adrs/{adr_id}", response_model=ADRPublic)
async def get_adr(
    project_id: uuid.UUID, solution_id: uuid.UUID, adr_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取ADR详情"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ADR).where(
            ADR.id == adr_id,
            ADR.solution_id == solution_id,
            ADR.project_id == project_id,
        )
    )
    adr = result.scalar_one_or_none()
    if not adr:
        raise HTTPException(status_code=404, detail="ADR不存在")
    return adr


@router.put("/{solution_id}/adrs/{adr_id}", response_model=ADRPublic)
async def update_adr(
    project_id: uuid.UUID, solution_id: uuid.UUID, adr_id: uuid.UUID,
    data: ADRUpdate, current_user: RequireSA, db: DBSession,
):
    """更新ADR"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ADR).where(
            ADR.id == adr_id,
            ADR.solution_id == solution_id,
            ADR.project_id == project_id,
        )
    )
    adr = result.scalar_one_or_none()
    if not adr:
        raise HTTPException(status_code=404, detail="ADR不存在")

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(adr, key, value)

    db.add(OperationLog(
        user_id=current_user.id,
        action="update_adr",
        target_type="adr",
        target_id=adr_id,
        detail=updates,
    ))
    await db.flush()
    await db.refresh(adr)
    return adr


@router.delete("/{solution_id}/adrs/{adr_id}", response_model=MessageResponse)
async def delete_adr(
    project_id: uuid.UUID, solution_id: uuid.UUID, adr_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """删除ADR"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ADR).where(
            ADR.id == adr_id,
            ADR.solution_id == solution_id,
            ADR.project_id == project_id,
        )
    )
    adr = result.scalar_one_or_none()
    if not adr:
        raise HTTPException(status_code=404, detail="ADR不存在")

    await db.delete(adr)
    db.add(OperationLog(
        user_id=current_user.id,
        action="delete_adr",
        target_type="adr",
        target_id=adr_id,
        detail={"title": adr.title},
    ))
    return MessageResponse(message="ADR已删除")


# =============================================
# 2.3 Component 管理
# =============================================

@router.get("/{solution_id}/components", response_model=list[ArchComponentPublic])
async def list_components(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取架构组件列表"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.solution_id == solution_id,
        )
    )
    return result.scalars().all()


@router.post("/{solution_id}/components", response_model=ArchComponentPublic, status_code=status.HTTP_201_CREATED)
async def create_component(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    data: ArchComponentCreate, current_user: RequireSA, db: DBSession,
):
    """创建架构组件"""
    await _get_solution_or_404(db, project_id, solution_id)

    component = ArchComponent(
        solution_id=solution_id,
        name=data.name,
        comp_type=data.comp_type,
        responsibility=data.responsibility,
        interfaces=data.interfaces,
        dependencies=data.dependencies,
    )
    db.add(component)
    db.add(OperationLog(
        user_id=current_user.id,
        action="create_component",
        target_type="arch_component",
        target_id=solution_id,
        detail={"name": data.name},
    ))
    await db.flush()
    await db.refresh(component)
    return component


@router.get("/{solution_id}/components/{component_id}", response_model=ArchComponentPublic)
async def get_component(
    project_id: uuid.UUID, solution_id: uuid.UUID, component_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取组件详情"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.id == component_id,
            ArchComponent.solution_id == solution_id,
        )
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="组件不存在")
    return component


@router.put("/{solution_id}/components/{component_id}", response_model=ArchComponentPublic)
async def update_component(
    project_id: uuid.UUID, solution_id: uuid.UUID, component_id: uuid.UUID,
    data: ArchComponentUpdate, current_user: RequireSA, db: DBSession,
):
    """编辑架构组件"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.id == component_id,
            ArchComponent.solution_id == solution_id,
        )
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="组件不存在")

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(component, key, value)

    db.add(OperationLog(
        user_id=current_user.id,
        action="update_component",
        target_type="arch_component",
        target_id=component_id,
        detail=updates,
    ))
    await db.flush()
    await db.refresh(component)
    return component


@router.delete("/{solution_id}/components/{component_id}", response_model=MessageResponse)
async def delete_component(
    project_id: uuid.UUID, solution_id: uuid.UUID, component_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """删除架构组件（级联删除关联的TraceabilityLink）"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.id == component_id,
            ArchComponent.solution_id == solution_id,
        )
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="组件不存在")

    # 级联删除关联的 TraceabilityLink
    await db.execute(
        delete(TraceabilityLink).where(TraceabilityLink.component_id == component_id)
    )
    await db.delete(component)

    db.add(OperationLog(
        user_id=current_user.id,
        action="delete_component",
        target_type="arch_component",
        target_id=component_id,
        detail={"name": component.name},
    ))
    return MessageResponse(message="组件已删除")


# =============================================
# 2.4 TraceabilityLink 管理
# =============================================

@router.get("/{solution_id}/traceability/links", response_model=list[TraceabilityLinkPublic])
async def list_traceability_links(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取追溯链接列表"""
    await _get_solution_or_404(db, project_id, solution_id)

    result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.solution_id == solution_id,
        )
    )
    return result.scalars().all()


@router.post("/{solution_id}/traceability/links", response_model=TraceabilityLinkPublic, status_code=status.HTTP_201_CREATED)
async def create_traceability_link(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    data: TraceabilityLinkCreate, current_user: RequireSA, db: DBSession,
):
    """创建追溯链接"""
    await _get_solution_or_404(db, project_id, solution_id)

    # 验证 requirement 存在且属于当前项目
    req_result = await db.execute(
        select(Requirement).where(
            Requirement.id == data.requirement_id,
            Requirement.project_id == project_id,
        )
    )
    if not req_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="需求不存在或不属于当前项目")

    # 验证 component 存在且属于当前方案
    comp_result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.id == data.component_id,
            ArchComponent.solution_id == solution_id,
        )
    )
    if not comp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="组件不存在或不属于当前方案")

    # 检查重复链接
    dup_result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.requirement_id == data.requirement_id,
            TraceabilityLink.component_id == data.component_id,
            TraceabilityLink.solution_id == solution_id,
        )
    )
    if dup_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="追溯链接已存在")

    link = TraceabilityLink(
        requirement_id=data.requirement_id,
        component_id=data.component_id,
        solution_id=solution_id,
        mapping_type=data.mapping_type,
        confidence=data.confidence,
        rationale=data.rationale,
    )
    db.add(link)
    db.add(OperationLog(
        user_id=current_user.id,
        action="create_traceability_link",
        target_type="traceability_link",
        target_id=solution_id,
        detail={"requirement_id": str(data.requirement_id), "component_id": str(data.component_id)},
    ))
    await db.flush()
    await db.refresh(link)
    return link


@router.put("/{solution_id}/traceability/links/{link_id}", response_model=TraceabilityLinkPublic)
async def update_traceability_link(
    project_id: uuid.UUID, solution_id: uuid.UUID, link_id: uuid.UUID,
    data: TraceabilityLinkUpdate, current_user: RequireSA, db: DBSession,
):
    """编辑追溯链接"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.id == link_id,
            TraceabilityLink.solution_id == solution_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="追溯链接不存在")

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(link, key, value)

    db.add(OperationLog(
        user_id=current_user.id,
        action="update_traceability_link",
        target_type="traceability_link",
        target_id=link_id,
        detail=updates,
    ))
    await db.flush()
    await db.refresh(link)
    return link


@router.delete("/{solution_id}/traceability/links/{link_id}", response_model=MessageResponse)
async def delete_traceability_link(
    project_id: uuid.UUID, solution_id: uuid.UUID, link_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """删除追溯链接"""
    await _get_solution_or_404(db, project_id, solution_id)
    result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.id == link_id,
            TraceabilityLink.solution_id == solution_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="追溯链接不存在")

    await db.delete(link)
    db.add(OperationLog(
        user_id=current_user.id,
        action="delete_traceability_link",
        target_type="traceability_link",
        target_id=link_id,
        detail={"requirement_id": str(link.requirement_id), "component_id": str(link.component_id)},
    ))
    return MessageResponse(message="追溯链接已删除")


@router.get("/{solution_id}/components/{component_id}/requirements", response_model=list[dict])
async def get_component_requirements(
    project_id: uuid.UUID, solution_id: uuid.UUID, component_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """双向追溯：查询组件关联的所有需求"""
    await _get_solution_or_404(db, project_id, solution_id)

    # 验证组件存在
    comp_result = await db.execute(
        select(ArchComponent).where(
            ArchComponent.id == component_id,
            ArchComponent.solution_id == solution_id,
        )
    )
    if not comp_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="组件不存在")

    # 查询该组件关联的所有追溯链接
    link_result = await db.execute(
        select(TraceabilityLink).where(
            TraceabilityLink.component_id == component_id,
            TraceabilityLink.solution_id == solution_id,
        )
    )
    links = link_result.scalars().all()
    if not links:
        return []

    # 查询关联的需求
    req_ids = [l.requirement_id for l in links]
    req_result = await db.execute(
        select(Requirement).where(Requirement.id.in_(req_ids))
    )
    requirements = {r.id: r for r in req_result.scalars().all()}

    result_list = []
    for l in links:
        req = requirements.get(l.requirement_id)
        if req:
            result_list.append({
                "requirement_id": str(req.id),
                "requirement_title": req.title,
                "requirement_type": req.req_type,
                "mapping_type": l.mapping_type,
                "confidence": l.confidence,
                "rationale": l.rationale,
            })
    return result_list


# =============================================
# 2.5 Solution 编辑
# =============================================

@router.put("/{solution_id}", response_model=ArchSolutionPublic)
async def update_solution(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    data: ArchSolutionUpdate, current_user: RequireSA, db: DBSession,
):
    """编辑架构方案"""
    solution = await _get_solution_or_404(db, project_id, solution_id)

    updates = data.model_dump(exclude_unset=True)

    # 编辑 recommendation 时自动递增 version
    if "recommendation" in updates:
        solution.version = (solution.version or 0) + 1

    # 状态合法性验证
    if "status" in updates:
        valid_statuses = {"proposed", "selected", "reviewed", "confirmed"}
        if updates["status"] not in valid_statuses:
            raise HTTPException(status_code=400, detail="无效的方案状态")

    for key, value in updates.items():
        setattr(solution, key, value)

    db.add(OperationLog(
        user_id=current_user.id,
        action="update_solution",
        target_type="architecture",
        target_id=solution_id,
        detail=updates,
    ))
    await db.flush()
    await db.refresh(solution)
    return solution


# =============================================
# 2.6 AI 架构评审
# =============================================

@router.post("/{solution_id}/ai-review", response_model=AIReviewResponse)
async def ai_review_architecture(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: RequireSA, db: DBSession,
):
    """使用 AI 进行架构评审"""
    solution = await _get_solution_or_404(db, project_id, solution_id)

    # 获取组件列表
    comp_result = await db.execute(
        select(ArchComponent).where(ArchComponent.solution_id == solution_id)
    )
    components = comp_result.scalars().all()

    comp_text = "\n".join([
        f"- {c.name} ({c.comp_type}): {c.responsibility or '无描述'}"
        for c in components
    ]) if components else "无组件"

    # 调用 LLM
    provider = get_llm_provider()
    prompt = ARCH_REVIEW_USER_TEMPLATE.format(
        solution_name=solution.name,
        solution_description=solution.description or "无",
        solution_status=solution.status,
        recommendation=json.dumps(solution.recommendation or {}, ensure_ascii=False),
        components=comp_text,
    )

    try:
        result = await provider.complete(ARCH_REVIEW_SYSTEM_PROMPT, prompt)
        if not result.parsed_json:
            raise ValueError("AI 评审结果解析失败")
        ai_result = result.parsed_json
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 架构评审失败: {str(e)}")

    # 创建 ArchReview 记录
    summary = ai_result.get("summary", "无评审意见")
    overall_rating = ai_result.get("overall_rating", 5)
    # rating 字段为 1-5，将 10 分制转为 5 分制
    rating_5 = max(1, min(5, round(overall_rating / 2))) if overall_rating else 3

    review = ArchReview(
        solution_id=solution_id,
        reviewer_id=current_user.id,
        comment=f"[AI评审] {summary}",
        rating=rating_5,
        status="open",
    )
    db.add(review)
    await db.flush()
    await db.refresh(review)

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="ai_review",
        target_type="architecture",
        target_id=solution_id,
        detail={"overall_rating": overall_rating, "defects_count": len(ai_result.get("defects", []))},
    ))

    return AIReviewResponse(
        review_id=review.id,
        solution_id=review.solution_id,
        reviewer_id=review.reviewer_id,
        comment=review.comment,
        rating=review.rating,
        status=review.status,
        created_at=review.created_at,
        quality_assessment=ai_result.get("quality_assessment"),
        pattern_fitness=ai_result.get("pattern_fitness"),
        component_analysis=ai_result.get("component_analysis"),
        defects=ai_result.get("defects"),
        suggestions=ai_result.get("suggestions"),
        overall_rating=overall_rating,
        summary=summary,
    )


# =============================================
# 2.7 统计计数
# =============================================

@router.get("/{solution_id}/stats", response_model=dict)
async def get_architecture_stats(
    project_id: uuid.UUID, solution_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """获取架构方案统计计数"""
    await _get_solution_or_404(db, project_id, solution_id)

    # recommend_count: action="recommend" 且 target_id=solution_id
    recommend_result = await db.execute(
        select(func.count()).select_from(OperationLog).where(
            OperationLog.action == "recommend",
            OperationLog.target_id == solution_id,
        )
    )
    recommend_count = recommend_result.scalar() or 0

    # view_count: action="view_architecture" 且 target_id=solution_id
    view_result = await db.execute(
        select(func.count()).select_from(OperationLog).where(
            OperationLog.action == "view_architecture",
            OperationLog.target_id == solution_id,
        )
    )
    view_count = view_result.scalar() or 0

    # review_count: 该solution的review总数
    review_result = await db.execute(
        select(func.count()).select_from(ArchReview).where(
            ArchReview.solution_id == solution_id,
        )
    )
    review_count = review_result.scalar() or 0

    return {
        "recommend_count": recommend_count,
        "view_count": view_count,
        "review_count": review_count,
    }