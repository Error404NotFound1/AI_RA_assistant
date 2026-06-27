"""文档管理 API - SRS 文档自动生成与管理"""

import difflib
import html as html_lib
import re
import uuid
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select

from app.core.deps import DBSession, CurrentUser, RequireRE
from app.models.project import Project
from app.models.requirement import Requirement, RequirementStatus
from app.models.document import Document, OperationLog
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import (
    DOC_GENERATOR_SYSTEM_PROMPT,
    DOC_GENERATOR_USER_TEMPLATE,
)
import json

router = APIRouter(prefix="/projects/{project_id}/documents", tags=["文档管理"])


@router.post("/generate", response_model=dict)
async def generate_document(
    project_id: uuid.UUID, current_user: RequireRE, db: DBSession,
):
    """AI 生成 SRS 需求规格说明书文档"""
    # 获取项目信息
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取已分析的需求
    req_result = await db.execute(
        select(Requirement).where(
            Requirement.project_id == project_id,
            Requirement.status.in_([RequirementStatus.ANALYZED, RequirementStatus.CONFIRMED]),
        )
    )
    requirements = req_result.scalars().all()
    if not requirements:
        raise HTTPException(status_code=400, detail="没有已分析的需求，请先完成需求分析")

    # 收集分析结果
    analysis_data = {
        "project_name": project.name,
        "project_description": project.description,
        "requirements": [
            {
                "id": str(r.id),
                "title": r.title,
                "description": r.description,
                "req_type": r.req_type,
                "priority": r.priority,
                "analysis_result": r.analysis_result,
            }
            for r in requirements
        ],
    }

    # 收集所有需求的软件工程图表
    all_diagrams = {}
    for req in requirements:
        diagrams = req.analysis_result.get("diagrams", {}) if req.analysis_result else {}
        for diagram_type, code in diagrams.items():
            if diagram_type not in all_diagrams and code:
                all_diagrams[diagram_type] = code

    diagrams_json = json.dumps(all_diagrams, ensure_ascii=False, indent=2) if all_diagrams else "{}"

    provider = get_llm_provider()
    prompt = DOC_GENERATOR_USER_TEMPLATE.format(
        project_name=project.name,
        analysis_result_json=json.dumps(analysis_data, ensure_ascii=False),
        diagrams_json=diagrams_json,
    )

    # DOC_GENERATOR 输出 Markdown，使用 json_mode=False
    result = await provider.complete(DOC_GENERATOR_SYSTEM_PROMPT, prompt, json_mode=False)

    # 获取当前最大版本号
    existing_docs = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    max_version = max([d.version for d in existing_docs.scalars().all()], default=0)

    # 创建文档记录
    doc = Document(
        project_id=project_id,
        title=f"{project.name} - 需求规格说明书 v{max_version + 1}",
        content=result.content,
        doc_type="SRS",
        version=max_version + 1,
        created_by=current_user.id,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="generate_document",
        target_type="document",
        target_id=project_id,
        detail={"document_id": str(doc.id), "version": doc.version},
    ))

    return {
        "id": str(doc.id),
        "title": doc.title,
        "version": doc.version,
        "content": doc.content,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.get("", response_model=list[dict])
async def list_documents(
    project_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """获取项目文档列表"""
    result = await db.execute(
        select(Document).where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "doc_type": d.doc_type,
            "version": d.version,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.get("/compare", response_model=dict)
async def compare_documents(
    project_id: uuid.UUID,
    v1: uuid.UUID,
    v2: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
):
    """对比两个版本的文档"""
    # 获取两个版本的文档
    result1 = await db.execute(
        select(Document).where(Document.id == v1, Document.project_id == project_id)
    )
    doc1 = result1.scalar_one_or_none()
    result2 = await db.execute(
        select(Document).where(Document.id == v2, Document.project_id == project_id)
    )
    doc2 = result2.scalar_one_or_none()

    if not doc1 or not doc2:
        raise HTTPException(status_code=404, detail="一个或两个文档版本不存在")

    # 生成行级 diff
    content1 = doc1.content if isinstance(doc1.content, str) else str(doc1.content)
    content2 = doc2.content if isinstance(doc2.content, str) else str(doc2.content)
    lines1 = content1.splitlines(keepends=True)
    lines2 = content2.splitlines(keepends=True)

    differ = difflib.unified_diff(
        lines1, lines2,
        fromfile=f"v{doc1.version}", tofile=f"v{doc2.version}",
        lineterm="",
    )
    diff_text = "\n".join(differ)

    # 统计变更
    additions = sum(1 for line in diff_text.split("\n") if line.startswith("+") and not line.startswith("+++"))
    deletions = sum(1 for line in diff_text.split("\n") if line.startswith("-") and not line.startswith("---"))

    return {
        "v1": {"id": str(doc1.id), "version": doc1.version, "title": doc1.title},
        "v2": {"id": str(doc2.id), "version": doc2.version, "title": doc2.title},
        "diff": diff_text,
        "additions": additions,
        "deletions": deletions,
    }


@router.get("/{doc_id}", response_model=dict)
async def get_document(
    project_id: uuid.UUID, doc_id: uuid.UUID, current_user: CurrentUser, db: DBSession,
):
    """获取文档详情"""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")
    return {
        "id": str(doc.id),
        "title": doc.title,
        "content": doc.content,
        "doc_type": doc.doc_type,
        "version": doc.version,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.put("/{doc_id}", response_model=dict)
async def update_document(
    project_id: uuid.UUID, doc_id: uuid.UUID,
    data: dict,  # {"content": "新的 Markdown 内容", "title": "新标题（可选）"}
    current_user: RequireRE, db: DBSession,
):
    """在线编辑文档内容"""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 更新内容
    if "content" in data:
        doc.content = data["content"]
    if "title" in data:
        doc.title = data["title"]

    await db.flush()
    await db.refresh(doc)

    # 记录操作日志
    db.add(OperationLog(
        user_id=current_user.id,
        action="edit_document",
        target_type="document",
        target_id=doc_id,
        detail={"version": doc.version},
    ))

    return {
        "id": str(doc.id),
        "title": doc.title,
        "content": doc.content,
        "version": doc.version,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


@router.get("/{doc_id}/export")
async def export_document(
    project_id: uuid.UUID, doc_id: uuid.UUID,
    current_user: CurrentUser, db: DBSession,
    format: str = "md",  # md | html | txt
):
    """导出文档"""
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="文档不存在")

    content = doc.content if isinstance(doc.content, str) else str(doc.content)

    if format == "md":
        # Markdown 导出
        filename = quote(f"{doc.title}.md")
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    elif format == "html":
        # 简单的 Markdown 转 HTML（使用 <pre> 包裹）
        escaped = html_lib.escape(content)
        html_content = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{doc.title}</title></head>
<body>
<pre>{escaped}</pre>
</body>
</html>"""
        filename = quote(f"{doc.title}.html")
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    elif format == "txt":
        # 纯文本导出（去除 Markdown 语法符号的简化版本）
        text = re.sub(r'[#*`_\[\]()]', '', content)
        filename = quote(f"{doc.title}.txt")
        return Response(
            content=text,
            media_type="text/plain",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
        )
    else:
        raise HTTPException(status_code=400, detail=f"不支持的导出格式: {format}")
