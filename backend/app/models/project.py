"""项目模型"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.core.db import Base


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class Project(Base):
    """项目表"""
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=ProjectStatus.ACTIVE)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # 关系
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    requirements = relationship("Requirement", back_populates="project", cascade="all, delete-orphan", lazy="noload")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan", lazy="noload")
    architectures = relationship("ArchitectureSolution", back_populates="project", cascade="all, delete-orphan", lazy="noload")


class ProjectMember(Base):
    """项目成员表（多对多）"""
    __tablename__ = "project_members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # RE / SA
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # 关系
    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="projects")