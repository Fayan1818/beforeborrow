import uuid
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, field_validator

class ProfileIn(BaseModel):
    opening_cash_paise: int
    balance_as_of: date
    reserve_floor_paise: int = 0
    timezone: str = "Asia/Kolkata"
    expected_version: int

    @field_validator("opening_cash_paise", "reserve_floor_paise")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v

class ProfileOut(BaseModel):
    id: uuid.UUID
    currency: str
    timezone: str
    opening_cash_paise: int
    balance_as_of: date
    reserve_floor_paise: int
    data_version: int
    updated_at: datetime

    model_config = {"from_attributes": True}

class CashflowRuleIn(BaseModel):
    direction: Literal["income", "expense"]
    category: str
    amount_paise: int
    due_date: date | None = None
    start_date: date | None = None
    frequency: str = "once"
    end_date: date | None = None
    timing: Literal["known", "estimated"] = "known"

    @field_validator("amount_paise")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v

class CashflowRuleOut(BaseModel):
    id: uuid.UUID
    direction: str
    category: str
    amount_paise: int
    due_date: date | None
    start_date: date | None
    frequency: str
    end_date: date | None
    timing: str
    source: str
    confirmed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

class ObligationPaymentIn(BaseModel):
    due_date: date
    amount_paise: int
    interest_paise: int = 0
    fee_paise: int = 0

class ObligationIn(BaseModel):
    provider_alias: str
    kind: Literal["bnpl", "term_loan", "card", "other"]
    principal_remaining_paise: int
    payments: list[ObligationPaymentIn] = []
    expected_version: int | None = None

class ObligationPaymentOut(BaseModel):
    id: uuid.UUID
    due_date: date
    amount_paise: int
    interest_paise: int
    fee_paise: int
    payment_status: str
    actual_paid_date: date | None

    model_config = {"from_attributes": True}

class ObligationOut(BaseModel):
    id: uuid.UUID
    provider_alias: str
    kind: str
    principal_remaining_paise: int
    status: str
    source: str
    version: int
    payments: list[ObligationPaymentOut]
    created_at: datetime

    model_config = {"from_attributes": True}
