import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: uuid.UUID
    email_normalized: str
    created_at: datetime
    csrf_token: str

    model_config = {"from_attributes": True}
