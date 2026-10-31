import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.finance import ObligationIn, ObligationOut

router = APIRouter()

@router.get("/obligations", response_model=list[ObligationOut])
async def list_obligations(db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/obligations", response_model=ObligationOut, status_code=201)
async def create_obligation(body: ObligationIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.patch("/obligations/{obligation_id}", response_model=ObligationOut)
async def update_obligation(obligation_id: uuid.UUID, body: ObligationIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.delete("/obligations/{obligation_id}", status_code=204)
async def delete_obligation(obligation_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
