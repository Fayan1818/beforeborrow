from datetime import date
from app.engine.types import CashEvent, FinancialSnapshot

def expand_rules(snapshot: FinancialSnapshot, start: date, end: date) -> list[CashEvent]:
    raise NotImplementedError
