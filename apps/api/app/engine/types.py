from dataclasses import dataclass, field
from datetime import date

@dataclass(frozen=True)
class CashEvent:
    event_date: date
    amount_paise: int
    category: str
    source_id: str = ""

@dataclass(frozen=True)
class OfferSchedule:
    offer_id: str
    offer_type: str
    credit_benefit_paise: int
    fees_cash_paise: int
    payments: tuple[CashEvent, ...]

@dataclass(frozen=True)
class FinancialSnapshot:
    opening_cash_paise: int
    balance_as_of: date
    reserve_floor_paise: int
    income_rules: tuple
    expense_rules: tuple
    obligations: tuple
    goals: tuple
    data_version: int

@dataclass(frozen=True)
class ScenarioInput:
    expense_amount_paise: int
    expense_date: date
    need_cash: bool
    allowed_savings_paise: int
    horizon_days: int
    offers: tuple[OfferSchedule, ...]

@dataclass
class CashPath:
    dates: list[date]
    balances_paise: list[int]
    headrooms_paise: list[int]
    first_reserve_breach: date | None = None
    first_negative: date | None = None
    trough_paise: int | None = None
    trough_date: date | None = None

@dataclass
class OfferResult:
    offer_id: str
    funding_gap_paise: int
    cash_required_now_paise: int
    total_repayment_paise: int
    financing_cost_paise: int
    remaining_balance_paise: int
    shortfall_paise: int
    cash_path: CashPath
    pressure_windows: list[tuple[date, date]]
    reason_codes: list[str]
    excluded_obligations: list[str]
    status: str

@dataclass
class AnalysisResult:
    baseline: CashPath
    offers: list[OfferResult]
    model_version: str
    stress_results: dict[str, list[OfferResult]] = field(default_factory=dict)
