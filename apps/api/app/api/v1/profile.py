from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.finance import CashflowRuleIn, CashflowRuleOut, ProfileIn, ProfileOut

router = APIRouter()

@router.get("/profile", response_model=ProfileOut)
async def get_profile(db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.put("/profile", response_model=ProfileOut)
async def upsert_profile(body: ProfileIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/cashflow-rules", response_model=list[CashflowRuleOut])
async def list_cashflow_rules(db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/cashflow-rules", response_model=CashflowRuleOut, status_code=201)
async def create_cashflow_rule(body: CashflowRuleIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
