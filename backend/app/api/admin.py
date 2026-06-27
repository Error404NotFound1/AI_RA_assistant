"""管理员 API"""

import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, RequireAdmin
from app.core import security
from app.models.user import User, UserRole
from app.models.document import OperationLog
from app.models.requirement import Requirement
from app.models.project import Project
from app.models.architecture import ArchitectureSolution
from app.schemas.schemas import UserPublic, UserRoleUpdate, MessageResponse

router = APIRouter(prefix="/admin", tags=["系统管理"])


@router.get("/users", response_model=list[UserPublic])
async def list_users(admin: RequireAdmin, db: DBSession):
    """获取用户列表"""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.put("/users/{user_id}/role", response_model=MessageResponse)
async def update_user_role(user_id: uuid.UUID, data: UserRoleUpdate, admin: RequireAdmin, db: DBSession):
    """修改用户角色"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能修改自己的角色")
    user.role = data.role
    return MessageResponse(message="角色已更新")


@router.put("/users/{user_id}/status", response_model=MessageResponse)
async def toggle_user_status(user_id: uuid.UUID, admin: RequireAdmin, db: DBSession):
    """启用/禁用用户"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能禁用自己")
    user.is_active = not user.is_active
    return MessageResponse(message=f"用户已{'启用' if user.is_active else '禁用'}")


@router.get("/dashboard", response_model=dict)
async def get_dashboard(admin: RequireAdmin, db: DBSession):
    """管理员仪表盘统计"""
    # 用户统计
    user_count = await db.scalar(select(func.count(User.id)))
    active_user_count = await db.scalar(select(func.count(User.id)).where(User.is_active == True))

    # 项目统计
    project_count = await db.scalar(select(func.count(Project.id)))

    # 需求统计
    req_count = await db.scalar(select(func.count(Requirement.id)))

    # 架构方案统计
    arch_count = await db.scalar(select(func.count(ArchitectureSolution.id)))

    # AI 使用频次（与 /statistics 端点使用相同的统计口径）
    ai_actions = ["analyze", "recommend", "auto_map", "generate_document", "generate_arch_doc", "generate_plantuml"]
    ai_usage = await db.scalar(
        select(func.count(OperationLog.id)).where(OperationLog.action.in_(ai_actions))
    )

    return {
        "user_count": user_count,
        "active_user_count": active_user_count,
        "project_count": project_count,
        "requirement_count": req_count,
        "architecture_count": arch_count,
        "ai_usage_count": ai_usage,
    }


@router.get("/statistics", response_model=dict)
async def get_statistics(
    admin: RequireAdmin, db: DBSession,
):
    """获取系统统计数据（AI使用频次、分析覆盖率等）"""
    from app.models.requirement import RequirementStatus, UserStory, UseCase
    from app.models.architecture import ArchComponent, TraceabilityLink
    from app.models.document import Document, Attachment

    # 1. AI 使用频次统计（从 OperationLog）
    ai_actions = ["analyze", "recommend", "auto_map", "generate_document", "generate_arch_doc", "generate_plantuml"]
    ai_usage_result = await db.execute(
        select(OperationLog.action, func.count(OperationLog.id).label("count"))
        .where(OperationLog.action.in_(ai_actions))
        .group_by(OperationLog.action)
    )
    ai_usage = {row.action: row.count for row in ai_usage_result}

    # 2. 需求分析覆盖率
    total_reqs_result = await db.execute(select(func.count(Requirement.id)))
    total_reqs = total_reqs_result.scalar() or 0

    analyzed_reqs_result = await db.execute(
        select(func.count(Requirement.id)).where(
            Requirement.status.in_([RequirementStatus.ANALYZED, RequirementStatus.CONFIRMED])
        )
    )
    analyzed_reqs = analyzed_reqs_result.scalar() or 0

    confirmed_reqs_result = await db.execute(
        select(func.count(Requirement.id)).where(Requirement.status == RequirementStatus.CONFIRMED)
    )
    confirmed_reqs = confirmed_reqs_result.scalar() or 0

    # 3. 结构化数据统计
    user_stories_count = (await db.execute(select(func.count(UserStory.id)))).scalar() or 0
    use_cases_count = (await db.execute(select(func.count(UseCase.id)))).scalar() or 0

    # 4. 架构统计
    total_solutions = (await db.execute(select(func.count(ArchitectureSolution.id)))).scalar() or 0
    total_components = (await db.execute(select(func.count(ArchComponent.id)))).scalar() or 0
    total_traceability_links = (await db.execute(select(func.count(TraceabilityLink.id)))).scalar() or 0

    # 5. 文档统计
    total_documents = (await db.execute(select(func.count(Document.id)))).scalar() or 0

    # 6. 附件统计
    total_attachments = (await db.execute(select(func.count(Attachment.id)))).scalar() or 0

    # 7. 用户统计
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active_users_result = await db.execute(
        select(func.count(func.distinct(OperationLog.user_id)))
        .where(OperationLog.action.in_(ai_actions))
    )
    active_users = active_users_result.scalar() or 0

    return {
        "ai_usage": {
            "total_calls": sum(ai_usage.values()),
            "by_action": ai_usage,
        },
        "requirement_coverage": {
            "total": total_reqs,
            "analyzed": analyzed_reqs,
            "confirmed": confirmed_reqs,
            "analysis_coverage": round(analyzed_reqs / total_reqs * 100, 1) if total_reqs > 0 else 0.0,
            "confirmation_rate": round(confirmed_reqs / analyzed_reqs * 100, 1) if analyzed_reqs > 0 else 0.0,
        },
        "structured_data": {
            "user_stories": user_stories_count,
            "use_cases": use_cases_count,
            "traceability_links": total_traceability_links,
        },
        "architecture": {
            "total_solutions": total_solutions,
            "total_components": total_components,
        },
        "documents": {
            "total": total_documents,
            "attachments": total_attachments,
        },
        "users": {
            "total": total_users,
            "active": active_users,
        },
    }


@router.get("/logs", response_model=list[dict])
async def list_logs(
    admin: RequireAdmin, db: DBSession,
    action: str | None = None, limit: int = 50,
):
    """查询操作日志"""
    query = select(OperationLog).order_by(OperationLog.created_at.desc()).limit(limit)
    if action:
        query = query.where(OperationLog.action == action)
    result = await db.execute(query)
    logs = result.scalars().all()
    return [
        {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action,
            "target_type": log.target_type,
            "target_id": str(log.target_id) if log.target_id else None,
            "detail": log.detail,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]