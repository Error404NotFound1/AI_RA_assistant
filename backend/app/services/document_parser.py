"""文档解析服务 - 从上传文件中提取纯文本"""

import os
from pathlib import Path


def extract_text(file_path: str, filename: str = "") -> str:
    """根据文件扩展名提取纯文本内容

    支持: .md, .markdown, .txt (直接读取)
          .pdf (需要 pypdf)
          .docx/.doc (需要 python-docx)
          其他文件尝试以文本方式读取
    """
    ext = Path(filename or file_path).suffix.lower()

    if ext in (".md", ".markdown", ".txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    if ext == ".pdf":
        # 尝试使用 pypdf
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise ValueError("PDF 解析需要安装 pypdf: pip install pypdf")

    if ext in (".docx", ".doc"):
        # 尝试使用 python-docx
        try:
            import docx
            doc = docx.Document(file_path)
            return "\n\n".join(para.text for para in doc.paragraphs if para.text.strip())
        except ImportError:
            raise ValueError("DOCX 解析需要安装 python-docx: pip install python-docx")

    # 默认尝试以文本方式读取
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, "r", encoding="gbk") as f:
            return f.read()
