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

    # AI 使用频次（最近 30 天的分析操作）
    ai_usage = await db.scalar(
        select(func.count(OperationLog.id)).where(OperationLog.action == "analyze")
    )

    return {
        "user_count": user_count,
        "active_user_count": active_user_count,
        "project_count": project_count,
        "requirement_count": req_count,
        "architecture_count": arch_count,
        "ai_usage_count": ai_usage,
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