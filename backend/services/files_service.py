from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import re
from uuid import uuid4

from fastapi import UploadFile

from backend.db.database import DATA_DIR

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_SUFFIXES = {".pdf", ".docx"}
FILES_DIR = DATA_DIR / "uploads"
INDEX_PATH = FILES_DIR / "index.json"


@dataclass
class StoredFile:
    file_id: str
    filename: str
    file_path: str
    size: int
    uploaded_at: str


def _safe_filename(name: str) -> str:
    stem = Path(name).stem or "document"
    suffix = Path(name).suffix.lower()
    safe = re.sub(r"[^A-Za-z0-9_.\-\u4e00-\u9fff]", "_", stem)[:80]
    return f"{safe}{suffix}"


def _read_index() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def list_files() -> list[dict]:
    return _read_index()


def _write_index(items: list[dict]) -> None:
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_PATH.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


async def save_upload(file: UploadFile) -> StoredFile:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError("仅支持 PDF 和 Word(.docx) 文件")

    FILES_DIR.mkdir(parents=True, exist_ok=True)
    file_id = f"file_{uuid4().hex[:12]}"
    filename = _safe_filename(file.filename or f"{file_id}{suffix}")
    target = FILES_DIR / f"{file_id}_{filename}"

    size = 0
    with target.open("wb") as fh:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_FILE_SIZE:
                target.unlink(missing_ok=True)
                raise OverflowError("文件不能超过 10MB")
            fh.write(chunk)

    stored = StoredFile(
        file_id=file_id,
        filename=filename,
        file_path=str(target),
        size=size,
        uploaded_at=datetime.now().isoformat(timespec="seconds"),
    )
    items = _read_index()
    items.insert(0, stored.__dict__)
    _write_index(items)
    return stored


def delete_file(file_id: str) -> bool:
    try:
        items = _read_index()
        match = next((item for item in items if item.get("file_id") == file_id), None)
        if match is None:
            return False
        file_path = Path(match["file_path"])
        file_path.unlink(missing_ok=True)
        items.remove(match)
        _write_index(items)
        return True
    except OSError as e:
        raise OSError(f"Failed to delete file: {e}")


def rename_file(file_id: str, new_filename: str) -> dict | None:
    try:
        items = _read_index()
        match = next((item for item in items if item.get("file_id") == file_id), None)
        if match is None:
            return None
        old_path = Path(match["file_path"])
        new_filename = _safe_filename(new_filename)
        match["filename"] = new_filename
        new_path = old_path.parent / f"{file_id}_{new_filename}"
        if old_path.exists():
            old_path.rename(new_path)
        match["file_path"] = str(new_path)
        _write_index(items)
        return match
    except OSError as e:
        raise OSError(f"Failed to rename file: {e}")
