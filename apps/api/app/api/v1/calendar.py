from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db

router = APIRouter()

@router.get("/calendar")
async def get_calendar(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    db: AsyncSession = Depends(get_db),
):
    raise HTTPException(status_code=501, detail="Not implemented")
