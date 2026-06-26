"""依赖注入 - 认证与权限（参考 full-stack-fastapi-template/api/deps.py）"""

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.db import get_db
from app.models.user import User, UserRole

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

# 类型别名，简化依赖注入
DBSession = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[str, Depends(reusable_oauth2)]


async def get_current_user(
    db: DBSession,
    token: TokenDep,
) -> User:
    """从 JWT 令牌获取当前用户"""
    payload = security.verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无法验证凭据",
        )
    token_type = payload.get("type")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的令牌类型",
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的令牌",
        )
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的令牌",
        )
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户已被禁用",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(allowed_roles: list[UserRole]):
    """创建角色检查依赖"""
    async def check_role(current_user: CurrentUser) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return current_user
    return check_role


# 预定义角色检查
RequireRE = Annotated[User, Depends(require_role([UserRole.REQUIREMENT_ENGINEER, UserRole.SYSTEM_ARCHITECT, UserRole.ADMIN]))]
RequireSA = Annotated[User, Depends(require_role([UserRole.SYSTEM_ARCHITECT, UserRole.ADMIN]))]
RequireAdmin = Annotated[User, Depends(require_role([UserRole.ADMIN]))]