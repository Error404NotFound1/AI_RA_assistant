"""项目 API"""

import uuid
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireRE
from app.models.user import UserRole
from app.models.project import Project, ProjectMember, ProjectStatus
from app.models.requirement import Requirement
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectPublic, ProjectMemberAdd, MessageResponse,
)

router = APIRouter(prefix="/projects", tags=["项目"])


@router.get("", response_model=list[ProjectPublic])
async def list_projects(current_user: CurrentUser, db: DBSession):
    """获取用户所属项目列表"""
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ProjectPublic, status_code=status.HTTP_201_CREATED)
async def create_project(data: ProjectCreate, current_user: CurrentUser, db: DBSession):
    """创建项目"""
    project = Project(name=data.name, description=data.description, owner_id=current_user.id)
    db.add(project)
    await db.flush()
    await db.refresh(project)

    # 创建者自动成为项目成员
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role=current_user.role)
    db.add(member)
    return project


@router.get("/{project_id}", response_model=ProjectPublic)
async def get_project(project_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """获取项目详情"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.put("/{project_id}", response_model=ProjectPublic)
async def update_project(project_id: uuid.UUID, data: ProjectUpdate, current_user: CurrentUser, db: DBSession):
    """更新项目"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="权限不足")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    await db.flush()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", response_model=MessageResponse)
async def delete_project(project_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """删除项目（仅创建者或管理员）"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="权限不足")

    await db.delete(project)
    return MessageResponse(message="项目已删除")


@router.post("/{project_id}/members", response_model=MessageResponse)
async def add_member(project_id: uuid.UUID, data: ProjectMemberAdd, current_user: CurrentUser, db: DBSession):
    """添加项目成员"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 检查是否已是成员
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == data.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该用户已是项目成员")

    member = ProjectMember(project_id=project_id, user_id=data.user_id, role=data.role)
    db.add(member)
    return MessageResponse(message="成员已添加")