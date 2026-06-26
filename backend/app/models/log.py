"""数据库模型汇总 - 导入所有模型以确保 Alembic 能检测到"""

from app.models.user import User, UserRole
from app.models.project import Project, ProjectMember, ProjectStatus
from app.models.requirement import Requirement, UserStory, QualityEvaluation, RequirementType, RequirementPriority, RequirementStatus
from app.models.architecture import ArchitectureSolution, ArchComponent, ArchReview, ADR, TraceabilityLink
from app.models.document import Document, OperationLog

__all__ = [
    "User", "UserRole",
    "Project", "ProjectMember", "ProjectStatus",
    "Requirement", "UserStory", "QualityEvaluation", "RequirementType", "RequirementPriority", "RequirementStatus",
    "ArchitectureSolution", "ArchComponent", "ArchReview", "ADR", "TraceabilityLink",
    "Document", "OperationLog",
]