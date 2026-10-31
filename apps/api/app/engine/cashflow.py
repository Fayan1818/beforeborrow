from datetime import date
from app.engine.types import CashEvent, CashPath

def simulate(
    events: list[CashEvent],
    opening_cash: int,
    reserve: int,
    start: date,
    end: date,
) -> CashPath:
    raise NotImplementedError
