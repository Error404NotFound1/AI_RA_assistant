"""需求模型"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, Float, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class RequirementType(str, Enum):
    FUNCTIONAL = "FR"
    NON_FUNCTIONAL = "NFR"


class RequirementPriority(str, Enum):
    MUST = "Must"
    SHOULD = "Should"
    COULD = "Could"
    WONT = "Wont"


class RequirementStatus(str, Enum):
    DRAFT = "draft"
    ANALYZED = "analyzed"
    CONFIRMED = "confirmed"
    NEEDS_REVISION = "needs_revision"


class Requirement(Base):
    """需求表"""
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    req_type: Mapped[str] = mapped_column(String(10), nullable=True)  # FR / NFR, AI 分析后填充
    priority: Mapped[str] = mapped_column(String(10), nullable=True)  # MoSCoW, AI 分析后填充
    status: Mapped[str] = mapped_column(String(20), default=RequirementStatus.DRAFT)
    # AI 分析结果 (JSONB)
    analysis_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # 关系
    project = relationship("Project", back_populates="requirements")
    user_stories = relationship("UserStory", back_populates="requirement", cascade="all, delete-orphan", lazy="noload")
    quality_evaluation = relationship("QualityEvaluation", back_populates="requirement", uselist=False, lazy="noload")
    traceability_links = relationship("TraceabilityLink", back_populates="requirement", cascade="all, delete-orphan", lazy="noload")
    use_cases = relationship("UseCase", back_populates="requirement", cascade="all, delete-orphan", lazy="noload")


class UserStory(Base):
    """用户故事表"""
    __tablename__ = "user_stories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(255), nullable=False)  # As a...
    goal: Mapped[str] = mapped_column(Text, nullable=False)  # I want...
    benefit: Mapped[str] = mapped_column(Text, nullable=True)  # So that...
    acceptance_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    requirement = relationship("Requirement", back_populates="user_stories")


class QualityEvaluation(Base):
    """需求质量评估表（INCOSE 7 项属性）"""
    __tablename__ = "quality_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False, unique=True)
    completeness: Mapped[int] = mapped_column(Integer, nullable=True)  # 0-10
    consistency: Mapped[str] = mapped_column(String(10), nullable=True)  # 通过/不通过
    verifiability: Mapped[int] = mapped_column(Integer, nullable=True)
    unambiguity: Mapped[int] = mapped_column(Integer, nullable=True)
    traceability: Mapped[str] = mapped_column(String(10), nullable=True)
    feasibility: Mapped[int] = mapped_column(Integer, nullable=True)
    singularity: Mapped[str] = mapped_column(String(10), nullable=True)
    suggestions: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # 改进建议
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    requirement = relationship("Requirement", back_populates="quality_evaluation")


class UseCase(Base):
    """用例描述表"""
    __tablename__ = "use_cases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    preconditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    main_flow: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 步骤数组
    alternative_flows: Mapped[list | None] = mapped_column(JSON, nullable=True)  # 异常流程数组
    postconditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    requirement = relationship("Requirement", back_populates="use_cases")