import uuid
from datetime import date, datetime
from pydantic import BaseModel

class OfferIn(BaseModel):
    offer_type: str
    principal_paise: int
    fees_paise: int = 0
    rate_annual_pct: str = "0.00"
    term_months: int | None = None
    availability_deadline: date | None = None
    eligibility_evidence: str | None = None
    schedule_json: str | None = None

class ScenarioIn(BaseModel):
    expense_amount_paise: int
    expense_date: date
    merchant: str | None = None
    category: str | None = None
    need_cash: bool = False
    allowed_savings_paise: int = 0
    horizon_days: int
    offers: list[OfferIn] = []

class ScenarioOut(BaseModel):
    id: uuid.UUID
    expense_amount_paise: int
    expense_date: date
    need_cash: bool
    allowed_savings_paise: int
    horizon_days: int
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}

class AnalyzeRequest(BaseModel):
    scenario_version: int
    expected_data_version: int
    stress_cases: list[str] = []

class AnalysisOut(BaseModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    result_json: str
    model_version: str
    source_data_version: int
    calculated_at: datetime
    stale: bool = False

    model_config = {"from_attributes": True}

class CounterfactualRequest(BaseModel):
    analysis_id: uuid.UUID
    allowed_changes: list[str]
    bounds: dict

class ReceiptIn(BaseModel):
    analysis_id: uuid.UUID
    chosen_option: str
    reflection_answers: dict | None = None

class ReceiptOut(BaseModel):
    id: uuid.UUID
    analysis_id: uuid.UUID
    chosen_option: str
    created_at: datetime

    model_config = {"from_attributes": True}

class AlertOut(BaseModel):
    id: uuid.UUID
    alert_type: str
    due_date: date | None
    message: str
    dismissed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
