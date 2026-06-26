"""架构设计模型"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class ArchitectureSolution(Base):
    """架构方案表"""
    __tablename__ = "arch_solutions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    pattern: Mapped[str] = mapped_column(String(100), nullable=True)  # 分层/微服务/事件驱动等
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed/selected/reviewed/confirmed
    # AI 推荐结果 (JSONB)
    recommendation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    quality_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="architectures")
    components = relationship("ArchComponent", back_populates="solution", cascade="all, delete-orphan", lazy="selectin")
    reviews = relationship("ArchReview", back_populates="solution", cascade="all, delete-orphan", lazy="noload")
    adrs = relationship("ADR", back_populates="solution", cascade="all, delete-orphan", lazy="noload")


class ArchComponent(Base):
    """架构组件表"""
    __tablename__ = "arch_components"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    solution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("arch_solutions.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    comp_type: Mapped[str] = mapped_column(String(50), nullable=True)  # service/database/cache/gateway/frontend等
    responsibility: Mapped[str | None] = mapped_column(Text, nullable=True)
    interfaces: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dependencies: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    solution = relationship("ArchitectureSolution", back_populates="components")
    traceability_links = relationship("TraceabilityLink", back_populates="component", cascade="all, delete-orphan", lazy="noload")


class ArchReview(Base):
    """架构评审表"""
    __tablename__ = "arch_reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    solution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("arch_solutions.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=True)  # 1-5
    status: Mapped[str] = mapped_column(String(20), default="open")  # open/addressed/resolved
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    solution = relationship("ArchitectureSolution", back_populates="reviews")


class ADR(Base):
    """架构决策记录表"""
    __tablename__ = "adrs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    solution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("arch_solutions.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    context: Mapped[str] = mapped_column(Text, nullable=False)
    decision: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed/accepted/deprecated/superseded
    consequences: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    solution = relationship("ArchitectureSolution", back_populates="adrs")


class TraceabilityLink(Base):
    """需求-架构追踪表"""
    __tablename__ = "traceability_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requirement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False, index=True)
    component_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("arch_components.id", ondelete="CASCADE"), nullable=False, index=True)
    solution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("arch_solutions.id", ondelete="CASCADE"), nullable=False)
    mapping_type: Mapped[str] = mapped_column(String(30), nullable=True)  # direct/indirect/constraint
    confidence: Mapped[float] = mapped_column(nullable=True)  # 0.0-1.0
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)

    requirement = relationship("Requirement", back_populates="traceability_links")
    component = relationship("ArchComponent", back_populates="traceability_links")