import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.decisions import AlertOut

router = APIRouter()

@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.patch("/alerts/{alert_id}", response_model=AlertOut)
async def dismiss_alert(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
