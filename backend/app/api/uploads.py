"""文件上传 API"""

import os
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.deps import DBSession, CurrentUser
from app.core.config import settings
from app.models.project import Project
from app.models.document import Attachment
from app.schemas.schemas import MessageResponse, AttachmentUploadResponse
from app.services.document_parser import extract_text

router = APIRouter(prefix="/projects/{project_id}/attachments", tags=["附件"])

# 上传目录（backend/uploads），基于配置项但解析为绝对路径
_UPLOAD_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(_UPLOAD_BASE, settings.UPLOAD_DIR)
MAX_FILE_SIZE = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024  # 字节
ALLOWED_EXTENSIONS = {
    ".md", ".txt", ".pdf", ".doc", ".docx",
    ".png", ".jpg", ".jpeg", ".gif",
    ".csv", ".xlsx",
}

# 扩展名到 MIME 类型的映射（补充 UploadFile.content_type 无法识别的类型）
EXTENSION_MIME = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
}


@router.post("", response_model=AttachmentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    file: UploadFile = File(...),
):
    """上传文件附件"""
    # 验证项目存在
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="项目不存在")

    # 验证文件扩展名
    _, ext = os.path.splitext(file.filename or "")
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext}")

    # 读取文件内容并验证大小
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过 {settings.MAX_UPLOAD_SIZE_MB}MB 限制",
        )

    # 创建上传目录
    project_upload_dir = os.path.join(UPLOAD_DIR, str(project_id))
    os.makedirs(project_upload_dir, exist_ok=True)

    # 生成唯一文件名
    stored_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(project_upload_dir, stored_filename)

    # 写入文件
    with open(file_path, "wb") as f:
        f.write(content)

    # 确定 MIME 类型：优先使用 content_type，若为空或通用类型则按扩展名查表补充
    resolved_file_type = file.content_type
    if not resolved_file_type or resolved_file_type == "application/octet-stream":
        resolved_file_type = EXTENSION_MIME.get(ext.lower(), resolved_file_type)

    # 创建数据库记录
    attachment = Attachment(
        project_id=project_id,
        filename=file.filename or "unnamed",
        file_path=file_path,
        file_size=len(content),
        file_type=resolved_file_type,
        uploaded_by=current_user.id,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    # 根因 A 修复：上传后立即提取文本内容
    extracted_text = None
    try:
        extracted_text = extract_text(file_path, file.filename or "")
    except Exception:
        # 文本提取失败不阻塞上传流程
        pass

    # 使用 Pydantic 模型返回，确保 FastAPI 正确序列化（自动转义控制字符）
    return AttachmentUploadResponse(
        id=attachment.id,
        filename=attachment.filename,
        file_size=attachment.file_size,
        file_type=attachment.file_type,
        created_at=attachment.created_at,
        extracted_text=extracted_text,
    )


@router.get("", response_model=list[dict])
async def list_attachments(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """获取项目附件列表"""
    result = await db.execute(
        select(Attachment)
        .where(Attachment.project_id == project_id)
        .order_by(Attachment.created_at.desc())
    )
    attachments = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "filename": a.filename,
            "file_size": a.file_size,
            "file_type": a.file_type,
            "requirement_id": str(a.requirement_id) if a.requirement_id else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attachments
    ]


@router.get("/{attachment_id}/download")
async def download_attachment(
    project_id: uuid.UUID,
    attachment_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """下载附件"""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.project_id == project_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=attachment.file_path,
        filename=attachment.filename,
        media_type=attachment.file_type or "application/octet-stream",
    )


@router.delete("/{attachment_id}", response_model=MessageResponse)
async def delete_attachment(
    project_id: uuid.UUID,
    attachment_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    """删除附件"""
    result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.project_id == project_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="附件不存在")

    # 删除文件
    if os.path.exists(attachment.file_path):
        os.remove(attachment.file_path)

    await db.delete(attachment)
    return MessageResponse(message="附件已删除")
