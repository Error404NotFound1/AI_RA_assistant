"""项目 API"""

import uuid
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import DBSession, CurrentUser, RequireRE

from app.models.project import Project, ProjectMember, ProjectStatus
from app.models.requirement import Requirement
from app.models.user import UserRole, User
from app.schemas.schemas import (
    ProjectCreate, ProjectUpdate, ProjectPublic, ProjectMemberAdd, ProjectMemberUpdate, MessageResponse,
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


@router.get("/{project_id}/members")
async def get_project_members(project_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """获取项目成员列表"""
    # 验证项目存在
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证当前用户是项目成员
    membership = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="您不是该项目成员")

    # 查询成员列表 JOIN users 表
    result = await db.execute(
        select(ProjectMember, User)
        .join(User, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.joined_at)
    )
    rows = result.all()
    members = []
    for member, user in rows:
        members.append({
            "user_id": str(user.id),
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": member.role,
            "joined_at": member.joined_at.isoformat() if member.joined_at else None,
            "is_owner": user.id == project.owner_id,
        })
    return members


@router.delete("/{project_id}/members/{user_id}", response_model=MessageResponse)
async def remove_project_member(project_id: uuid.UUID, user_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    """移除项目成员（仅项目创建者可操作）"""
    # 验证项目存在
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证当前用户是项目创建者
    if project.owner_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="只有项目创建者可以移除成员")

    # 不能移除自己（创建者）
    if user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="不能移除项目创建者")

    # 查找并删除成员记录
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="该用户不是项目成员")

    await db.delete(member)
    return MessageResponse(message="成员已移除")


@router.put("/{project_id}/members/{user_id}", response_model=MessageResponse)
async def update_member_role(project_id: uuid.UUID, user_id: uuid.UUID, data: ProjectMemberUpdate, current_user: CurrentUser, db: DBSession):
    """修改项目成员角色（仅项目创建者可操作）"""
    # 验证项目存在
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证当前用户是项目创建者
    if project.owner_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="只有项目创建者可以修改成员角色")

    # 查找成员记录
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="该用户不是项目成员")

    # 更新角色
    member.role = data.role
    await db.flush()
    await db.refresh(member)
    return MessageResponse(message="成员角色已更新")