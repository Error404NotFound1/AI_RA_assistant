"""认证 API"""

import uuid
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.deps import DBSession, CurrentUser
from app.models.user import User, UserRole
from app.schemas.schemas import (
    UserRegister, UserLogin, TokenResponse, TokenRefresh,
    UserPublic, MessageResponse,
)

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: DBSession):
    """用户注册"""
    # 检查用户名和邮箱是否已存在
    result = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    existing = result.scalar_one_or_none()
    if existing:
        if existing.username == data.username:
            raise HTTPException(status_code=400, detail="用户名已存在")
        raise HTTPException(status_code=400, detail="邮箱已注册")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=security.get_password_hash(data.password),
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: DBSession):
    """用户登录"""
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not security.verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")

    access_token = security.create_access_token(subject=str(user.id))
    refresh_token = security.create_refresh_token(subject=str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: TokenRefresh, db: DBSession):
    """刷新令牌"""
    payload = security.verify_token(data.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="无效的刷新令牌")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已被禁用")

    access_token = security.create_access_token(subject=str(user.id))
    refresh_token = security.create_refresh_token(subject=str(user.id))
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserPublic)
async def get_me(current_user: CurrentUser):
    """获取当前用户信息"""
    return current_user