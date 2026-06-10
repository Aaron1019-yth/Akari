from __future__ import annotations

from pathlib import Path

from backend.db.database import DATA_DIR
from backend.services.tools.base import Tool, ToolResult


def create_document_tools() -> list[Tool]:
    return [
        Tool(
            name="read_document",
            description="读取用户上传的文档（PDF/Word），提取文本。WHEN 用户提供文件需要分析时使用。",
            parameters={
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "max_length": {"type": "integer", "default": 10000},
                },
                "required": ["file_path"],
            },
            execute=_read_document,
        )
    ]


def _read_document(file_path: str, max_length: int = 10000) -> ToolResult:
    path = Path(file_path).expanduser().resolve()
    uploads = (DATA_DIR / "uploads").resolve()
    if uploads not in path.parents:
        return ToolResult(content="只能读取通过 Akari 上传的文件。", ok=False)
    if not path.exists():
        return ToolResult(content="文件不存在。", ok=False)

    try:
        if path.suffix.lower() == ".pdf":
            text = _read_pdf(path)
        elif path.suffix.lower() == ".docx":
            text = _read_docx(path)
        else:
            return ToolResult(content="仅支持 PDF 和 Word(.docx) 文件。", ok=False)
    except ImportError as exc:
        return ToolResult(content=f"读取该格式需要安装额外依赖: {exc.name}", ok=False)

    truncated = len(text) > max_length
    content = text[:max_length] + ("\n\n[内容已截断]" if truncated else "")
    return ToolResult(content=content, details={"file_path": str(path), "truncated": truncated})


def _read_pdf(path: Path) -> str:
    import pdfplumber

    with pdfplumber.open(path) as pdf:
        return "\n\n".join(page.extract_text() or "" for page in pdf.pages).strip()


def _read_docx(path: Path) -> str:
    import docx

    document = docx.Document(path)
    return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()
