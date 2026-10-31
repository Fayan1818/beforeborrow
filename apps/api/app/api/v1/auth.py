from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.schemas.identity import LoginRequest, SignupRequest, UserOut

router = APIRouter()

@router.get("/me", response_model=UserOut)
async def me():
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def signup(body: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    raise HTTPException(status_code=501, detail="Not implemented")
