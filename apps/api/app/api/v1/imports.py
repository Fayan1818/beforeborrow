import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

router = APIRouter()

@router.post("/preview")
async def preview_import(file: UploadFile, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/{batch_id}/commit")
async def commit_import(batch_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
