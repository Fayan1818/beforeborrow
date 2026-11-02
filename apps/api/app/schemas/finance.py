import uuid
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from typing_extensions import Self

from app.engine.types import (
    CashEvent as EngineCashEvent,
    FinancialSnapshot as EngineFinancialSnapshot,
)

# ---------------------------------------------------------------------------
# Common Literals
# ---------------------------------------------------------------------------

CashflowDirection = Literal["income", "expense"]
CashflowTiming = Literal["known", "estimated"]
CashflowFrequency = Literal["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"]
ObligationKind = Literal["bnpl", "term_loan", "card", "other"]
ObligationStatus = Literal["active", "paid", "paused", "closed", "defaulted"]
PaymentStatus = Literal["planned", "scheduled", "paid", "missed", "cancelled", "disputed"]

# ---------------------------------------------------------------------------
# Profile Schemas
# ---------------------------------------------------------------------------

class ProfileIn(BaseModel):
    opening_cash_paise: int = Field(ge=0, strict=True, description="Available bank cash in integer paise")
    balance_as_of: date = Field(description="Date when opening cash was verified")
    reserve_floor_paise: int = Field(default=0, ge=0, strict=True, description="Emergency reserve threshold in paise")
    currency: str = Field(default="INR", max_length=3)
    timezone: str = Field(default="Asia/Kolkata", max_length=64)
    expected_version: int | None = Field(default=None, ge=1, strict=True, description="Version check for existing profile upsert")


class ProfileUpdate(BaseModel):
    opening_cash_paise: int | None = Field(default=None, ge=0, strict=True)
    balance_as_of: date | None = None
    reserve_floor_paise: int | None = Field(default=None, ge=0, strict=True)
    currency: str | None = Field(default=None, max_length=3)
    timezone: str | None = Field(default=None, max_length=64)
    expected_version: int = Field(ge=1, strict=True, description="Mandatory version check for optimistic concurrency")


class ProfileOut(BaseModel):
    id: uuid.UUID
    currency: str
    timezone: str
    opening_cash_paise: int
    balance_as_of: date
    reserve_floor_paise: int
    data_version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Cashflow Rule Schemas
# ---------------------------------------------------------------------------

class CashflowRuleIn(BaseModel):
    direction: CashflowDirection
    category: str = Field(min_length=1, max_length=64)
    amount_paise: int = Field(ge=0, strict=True, description="Amount in integer paise")
    due_date: date | None = None
    start_date: date | None = None
    frequency: CashflowFrequency = "once"
    end_date: date | None = None
    timing: CashflowTiming = "known"
    source: str = Field(default="manual", max_length=32)

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class CashflowRuleUpdate(BaseModel):
    expected_data_version: int = Field(
        ge=1,
        description="Expected profile data_version for optimistic concurrency control",
    )
    direction: CashflowDirection | None = None
    category: str | None = Field(default=None, min_length=1, max_length=64)
    amount_paise: int | None = Field(default=None, ge=0, strict=True)
    due_date: date | None = None
    start_date: date | None = None
    frequency: CashflowFrequency | None = None
    end_date: date | None = None
    timing: CashflowTiming | None = None
    source: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


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


# ---------------------------------------------------------------------------
# Obligation Payment Schemas
# ---------------------------------------------------------------------------

class ObligationPaymentIn(BaseModel):
    due_date: date
    amount_paise: int = Field(ge=0, strict=True)
    interest_paise: int = Field(default=0, ge=0, strict=True)
    fee_paise: int = Field(default=0, ge=0, strict=True)
    payment_status: PaymentStatus = "scheduled"
    actual_paid_date: date | None = None

    @model_validator(mode="after")
    def validate_payment_status_and_date(self) -> Self:
        if self.payment_status != "paid" and self.actual_paid_date is not None:
            raise ValueError("actual_paid_date cannot be set for non-paid payments")
        return self


class PaymentStatusUpdate(BaseModel):
    payment_status: PaymentStatus
    actual_paid_date: date | None = None

    @model_validator(mode="after")
    def validate_payment_status_and_date(self) -> Self:
        if self.payment_status != "paid" and self.actual_paid_date is not None:
            raise ValueError("actual_paid_date cannot be set for non-paid payments")
        return self


class ObligationPaymentOut(BaseModel):
    id: uuid.UUID
    obligation_id: uuid.UUID
    owner_id: uuid.UUID
    due_date: date
    amount_paise: int
    interest_paise: int
    fee_paise: int
    payment_status: str
    actual_paid_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Obligation Schemas
# ---------------------------------------------------------------------------

class ObligationIn(BaseModel):
    provider_alias: str = Field(min_length=1, max_length=128)
    kind: ObligationKind
    principal_remaining_paise: int = Field(ge=0, strict=True)
    status: ObligationStatus = "active"
    source: str = Field(default="manual", max_length=32)
    source_ref: str | None = Field(default=None, max_length=256)
    source_as_of: date | None = None
    payments: list[ObligationPaymentIn] = Field(default_factory=list)
    expected_version: int | None = Field(default=None, ge=1, strict=True)


class ObligationUpdate(BaseModel):
    provider_alias: str | None = Field(default=None, min_length=1, max_length=128)
    kind: ObligationKind | None = None
    principal_remaining_paise: int | None = Field(default=None, ge=0, strict=True)
    status: ObligationStatus | None = None
    source: str | None = Field(default=None, max_length=32)
    source_ref: str | None = Field(default=None, max_length=256)
    source_as_of: date | None = None
    payments: list[ObligationPaymentIn] | None = None
    expected_version: int = Field(ge=1, strict=True, description="Mandatory version check for optimistic concurrency")


class ObligationOut(BaseModel):
    id: uuid.UUID
    provider_alias: str
    kind: str
    principal_remaining_paise: int
    status: str
    source: str
    source_ref: str | None
    source_as_of: date | None
    confirmed_at: datetime | None
    version: int
    payments: list[ObligationPaymentOut] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Goal Schemas
# ---------------------------------------------------------------------------

class GoalIn(BaseModel):
    label: str = Field(min_length=1, max_length=128)
    target_amount_paise: int = Field(ge=0, strict=True)
    target_date: date | None = None
    protected: bool = False
    contribution_rule_id: uuid.UUID | None = None


class GoalUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=128)
    target_amount_paise: int | None = Field(default=None, ge=0, strict=True)
    target_date: date | None = None
    protected: bool | None = None
    contribution_rule_id: uuid.UUID | None = None


class GoalOut(BaseModel):
    id: uuid.UUID
    label: str
    target_amount_paise: int
    target_date: date | None
    protected: bool
    contribution_rule_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Import Batch Schemas
# ---------------------------------------------------------------------------

class ImportBatchOut(BaseModel):
    id: uuid.UUID
    file_hash: str
    status: str
    preview_json: dict | list | None = None
    errors_json: dict | list | None = None
    idempotency_key: str | None = None
    result_json: dict | list | None = None
    committed_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CSVRowPreview(BaseModel):
    row_id: str
    row_index: int
    provider_alias: str
    external_ref: str
    kind: str
    due_date: date | None = None
    amount_paise: int | None = None
    amount_inr_raw: str
    status: str
    is_valid: bool
    match_status: str  # "MATCHED", "UNMATCHED_OBLIGATION", "EXACT_DUPLICATE_FILE", "EXACT_DUPLICATE_DB", "POSSIBLE_DUPLICATE_DB"
    matched_obligation_id: str | None = None
    duplicate_reason: str | None = None
    display_provider_alias: str | None = None
    display_external_ref: str | None = None
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ImportPreviewResult(BaseModel):
    import_batch_id: uuid.UUID
    file_hash: str
    total_rows: int
    valid_rows_count: int
    invalid_rows_count: int
    exact_duplicates_count: int
    possible_duplicates_count: int
    unmatched_count: int
    rows: list[CSVRowPreview] = Field(default_factory=list)
    file_errors: list[str] = Field(default_factory=list)


class ImportCommitRequest(BaseModel):
    batch_id: uuid.UUID
    idempotency_key: str = Field(min_length=1, max_length=64)
    selected_row_ids: list[str] = Field(default_factory=list)
    obligation_mappings: dict[str, uuid.UUID] = Field(default_factory=dict)


class ImportCommitResult(BaseModel):
    batch_id: uuid.UUID
    status: str
    idempotent_replay: bool
    committed_count: int
    committed_payment_ids: list[uuid.UUID] = Field(default_factory=list)
    data_version: int


# ---------------------------------------------------------------------------
# Financial Snapshot Schemas (Matches app.engine.types.FinancialSnapshot)
# ---------------------------------------------------------------------------

class SnapshotPayment(BaseModel):
    id: uuid.UUID
    due_date: date
    amount_paise: int
    interest_paise: int
    fee_paise: int
    payment_status: str

    model_config = {"from_attributes": True}


class SnapshotObligation(BaseModel):
    id: uuid.UUID
    provider_alias: str
    kind: str
    principal_remaining_paise: int
    payments: list[SnapshotPayment] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SnapshotIncomeRule(BaseModel):
    id: uuid.UUID
    category: str
    amount_paise: int
    due_date: date | None
    start_date: date | None
    frequency: str
    end_date: date | None
    timing: str

    model_config = {"from_attributes": True}


class SnapshotExpenseRule(BaseModel):
    id: uuid.UUID
    category: str
    amount_paise: int
    due_date: date | None
    start_date: date | None
    frequency: str
    end_date: date | None
    timing: str

    model_config = {"from_attributes": True}


class SnapshotGoal(BaseModel):
    id: uuid.UUID
    label: str
    target_amount_paise: int
    target_date: date | None
    protected: bool
    contribution_rule_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class FinancialSnapshotSchema(BaseModel):
    opening_cash_paise: int
    balance_as_of: date
    reserve_floor_paise: int
    income_rules: list[SnapshotIncomeRule] = Field(default_factory=list)
    expense_rules: list[SnapshotExpenseRule] = Field(default_factory=list)
    obligations: list[SnapshotObligation] = Field(default_factory=list)
    goals: list[SnapshotGoal] = Field(default_factory=list)
    data_version: int

    model_config = {"from_attributes": True}

    def to_engine_snapshot(self) -> EngineFinancialSnapshot:
        """Convert normalized Pydantic schema to immutable Engine FinancialSnapshot dataclass."""
        return EngineFinancialSnapshot(
            opening_cash_paise=self.opening_cash_paise,
            balance_as_of=self.balance_as_of,
            reserve_floor_paise=self.reserve_floor_paise,
            income_rules=tuple(self.income_rules),
            expense_rules=tuple(self.expense_rules),
            obligations=tuple(self.obligations),
            goals=tuple(self.goals),
            data_version=self.data_version,
        )


class SnapshotDataQualityOut(BaseModel):
    is_valid: bool
    data_version: int | None
    blocking_gaps: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    summary: str
    # NOTE: quality_score is omitted to prevent exposing internal metrics to users.


class SnapshotOut(BaseModel):
    snapshot: FinancialSnapshotSchema | None = None
    data_quality: SnapshotDataQualityOut
