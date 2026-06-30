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


class ProjectMemberUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=20)


# ===== 需求相关 =====
class RequirementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1)
    source: str | None = None
    parent_id: uuid.UUID | None = None


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
    is_ai_extracted: bool = False
    parent_id: uuid.UUID | None = None
    analysis_result: dict | None = None
    created_by: uuid.UUID
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class RequirementAnalyzeRequest(BaseModel):
    """AI 分析请求"""
    requirement_ids: list[uuid.UUID] | None = None  # 空=分析全部 draft 需求


class ImportFromDocumentRequest(BaseModel):
    """从文档导入需求请求"""
    content: str = Field(..., description="文档纯文本内容")
    attachment_id: str | None = Field(None, description="附件 ID（可选）")


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


class AttachmentUploadResponse(BaseModel):
    """附件上传响应（使用 Pydantic 模型确保 JSON 序列化正确转义控制字符）"""
    id: uuid.UUID
    filename: str
    file_size: int
    file_type: str | None = None
    created_at: datetime | None = None
    extracted_text: str | None = None


# ===== 操作日志相关 =====
class OperationLogPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    username: str | None = None
    action: str
    target_type: str | None = None
    target_id: uuid.UUID | None = None
    detail: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class OperationLogListResponse(BaseModel):
    items: list[OperationLogPublic]
    total: int
    page: int
    page_size: int


# ===== 通用响应 =====
class MessageResponse(BaseModel):
    message: str


class PaginatedResponse(BaseModel):
    data: list
    total: int
    page: int
    size: int


# ===== 用例相关 =====
class UseCasePublic(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    title: str
    actor: str
    preconditions: str | None = None
    main_flow: list | None = None
    alternative_flows: list | None = None
    postconditions: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


# ===== 架构评审管理 =====
class ArchReviewPublic(BaseModel):
    id: uuid.UUID
    solution_id: uuid.UUID
    reviewer_id: uuid.UUID
    comment: str
    rating: int | None = None
    status: str
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ArchReviewUpdate(BaseModel):
    status: str | None = Field(None, pattern="^(open|addressed|resolved)$")
    response_comment: str | None = None


# ===== ADR管理 =====
class ADRPublic(BaseModel):
    id: uuid.UUID
    solution_id: uuid.UUID
    project_id: uuid.UUID
    title: str
    context: str
    decision: str
    status: str
    consequences: str | None = None
    created_at: datetime | None = None
    model_config = {"from_attributes": True}


class ADRUpdate(BaseModel):
    title: str | None = None
    context: str | None = None
    decision: str | None = None
    consequences: str | None = None
    status: str | None = Field(None, pattern="^(proposed|accepted|deprecated|superseded)$")


# ===== 架构组件管理 =====
class ArchComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    comp_type: str | None = None
    responsibility: str | None = None
    interfaces: dict | list | None = None
    dependencies: dict | list | None = None


class ArchComponentUpdate(BaseModel):
    name: str | None = None
    comp_type: str | None = None
    responsibility: str | None = None
    interfaces: dict | list | None = None
    dependencies: dict | list | None = None


class ArchComponentPublic(BaseModel):
    id: uuid.UUID
    solution_id: uuid.UUID
    name: str
    comp_type: str | None = None
    responsibility: str | None = None
    interfaces: dict | list | None = None
    dependencies: dict | list | None = None
    model_config = {"from_attributes": True}


# ===== 追溯链接管理 =====
class TraceabilityLinkCreate(BaseModel):
    requirement_id: uuid.UUID
    component_id: uuid.UUID
    mapping_type: str | None = "direct"
    confidence: float | None = Field(default=0.8, ge=0.0, le=1.0)
    rationale: str | None = None


class TraceabilityLinkUpdate(BaseModel):
    mapping_type: str | None = None
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    rationale: str | None = None


class TraceabilityLinkPublic(BaseModel):
    id: uuid.UUID
    requirement_id: uuid.UUID
    component_id: uuid.UUID
    solution_id: uuid.UUID
    mapping_type: str | None = None
    confidence: float | None = None
    rationale: str | None = None
    model_config = {"from_attributes": True}


# ===== AI 架构评审响应 =====
class AIReviewResponse(BaseModel):
    """AI 架构评审响应"""
    review_id: uuid.UUID
    solution_id: uuid.UUID
    reviewer_id: uuid.UUID
    comment: str
    rating: int | None = None
    status: str
    created_at: datetime | None = None
    # AI 分析详情
    quality_assessment: dict | None = None
    pattern_fitness: str | None = None
    component_analysis: str | None = None
    defects: list[str] | None = None
    suggestions: list[str] | None = None
    overall_rating: int | None = None
    summary: str | None = None

    model_config = {"from_attributes": True}


# ===== 架构方案编辑 =====
class ArchSolutionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = Field(None, pattern="^(proposed|selected|reviewed|confirmed)$")
    recommendation: dict | None = None
    quality_scores: dict | None = None