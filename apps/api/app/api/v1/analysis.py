import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.decisions import AnalysisOut

router = APIRouter()

@router.get("/analyses/{analysis_id}", response_model=AnalysisOut)
async def get_analysis(analysis_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
