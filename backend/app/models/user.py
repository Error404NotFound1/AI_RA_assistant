"""用户模型 - 三角色 RBAC（参考 full-stack-fastapi-template/models.py）"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class UserRole(str, Enum):
    """用户角色枚举"""
    REQUIREMENT_ENGINEER = "RE"
    SYSTEM_ARCHITECT = "SA"
    ADMIN = "admin"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default=UserRole.REQUIREMENT_ENGINEER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # 关系
    projects = relationship("ProjectMember", back_populates="user", lazy="selectin")
    operation_logs = relationship("OperationLog", back_populates="user", lazy="noload")

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN