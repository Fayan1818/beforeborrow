import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.decisions import ReceiptIn, ReceiptOut

router = APIRouter()

@router.post("/receipts", response_model=ReceiptOut, status_code=201)
async def create_receipt(body: ReceiptIn, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
async def get_receipt(receipt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/receipts/{receipt_id}/export")
async def export_receipt(receipt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")
