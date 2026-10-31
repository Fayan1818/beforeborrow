from app.engine.types import FinancialSnapshot

SUPPORTED_STRESS_CASES: set[str] = {
    "income_delay_30d",
    "expense_spike_20pct",
    "income_drop_50pct",
}

def stress(snapshot: FinancialSnapshot, case: str) -> FinancialSnapshot:
    if case not in SUPPORTED_STRESS_CASES:
        raise ValueError(f"Unknown stress case: {case!r}")
    raise NotImplementedError
