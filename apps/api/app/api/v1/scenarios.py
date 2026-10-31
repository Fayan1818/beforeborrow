import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.decisions import AnalyzeRequest, AnalysisOut, CounterfactualRequest, ScenarioIn, ScenarioOut

router = APIRouter()

@router.post("/scenarios", response_model=ScenarioOut, status_code=201)
async def create_scenario(body: ScenarioIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.put("/scenarios/{scenario_id}", response_model=ScenarioOut)
async def update_scenario(scenario_id: uuid.UUID, body: ScenarioIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/scenarios/{scenario_id}/analyze", response_model=AnalysisOut)
async def analyze_scenario(scenario_id: uuid.UUID, body: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/scenarios/{scenario_id}/counterfactuals")
async def counterfactuals(scenario_id: uuid.UUID, body: CounterfactualRequest, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
