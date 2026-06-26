"""Pydantic 请求/响应模型"""

import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


# ===== 认证相关 =====
class UserRegister(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = None
    role: UserRole = UserRole.REQUIREMENT_ENGINEER


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserPublic(BaseModel):
    id: uuid.UUID
    username: str
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None


class UserRoleUpdate(BaseModel):
    role: UserRole


# ===== 项目相关 =====
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = None


class ProjectPublic(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    owner_id: uuid.UUID
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role: str = "RE"


# ===== 需求相关 =====
class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    source: str | None = None


class RequirementUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    req_type: str | None = None
    priority: str | None = None
    status: str | None = None


class RequirementPublic(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str
    source: str | None
    req_type: str | None
    priority: str | None
    status: str
    analysis_result: dict | None = None
    created_by: uuid.UUID
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class RequirementAnalyzeRequest(BaseModel):
    """AI 分析请求"""
    requirement_ids: list[uuid.UUID] | None = None  # 空=分析全部 draft 需求


class QualityEvaluationPublic(BaseModel):
    completeness: int | None
    consistency: str | None
    verifiability: int | None
    unambiguity: int | None
    traceability: str | None
    feasibility: int | None
    singularity: str | None
    suggestions: dict | None = None

    model_config = {"from_attributes": True}


# ===== 架构相关 =====
class ArchitectureRecommendRequest(BaseModel):
    """AI 架构推荐请求"""
    quality_attributes: list[str] | None = None  # 关注的质量属性
    constraints: dict | None = None  # 项目约束


class ArchSolutionPublic(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    pattern: str | None
    description: str | None
    version: int
    status: str
    recommendation: dict | None = None
    quality_scores: dict | None = None
    created_by: uuid.UUID
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ArchReviewCreate(BaseModel):
    comment: str
    rating: int | None = Field(default=None, ge=1, le=5)


class ADRCreate(BaseModel):
    title: str
    context: str
    decision: str
    consequences: str | None = None


# ===== 文档相关 =====
class DocumentPublic(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    doc_type: str
    content: dict | None = None
    version: int
    created_by: uuid.UUID
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class DocumentGenerateRequest(BaseModel):
    doc_type: str = "srs"  # srs / architecture


# ===== 通用响应 =====
class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    data: list
    total: int
    page: int
    size: int