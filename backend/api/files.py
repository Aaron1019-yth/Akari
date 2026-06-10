from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.services import files_service

router = APIRouter()


class RenameRequest(BaseModel):
    filename: str


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)) -> dict:
    try:
        stored = await files_service.save_upload(file)
    except OverflowError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return stored.__dict__


@router.get("")
def list_files() -> dict:
    return {"files": files_service.list_files()}


@router.delete("/{file_id}")
def delete_file(file_id: str) -> dict:
    ok = files_service.delete_file(file_id)
    if not ok:
        raise HTTPException(status_code=404, detail="File not found")
    return {"ok": True}


@router.patch("/{file_id}")
def rename_file(file_id: str, payload: RenameRequest) -> dict:
    result = files_service.rename_file(file_id, payload.filename)
    if result is None:
        raise HTTPException(status_code=404, detail="File not found")
    return result
