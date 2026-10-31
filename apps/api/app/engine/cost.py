from decimal import ROUND_HALF_UP, Decimal
from datetime import date
from dateutil.relativedelta import relativedelta

def calculate_emi(principal_paise: int, annual_rate_pct: str, term_months: int) -> list[int]:
    if term_months <= 0:
        raise ValueError("term_months must be positive")

    P = Decimal(principal_paise)
    annual_rate = Decimal(annual_rate_pct)

    if annual_rate == 0:
        base = (P / term_months).to_integral_value(rounding=ROUND_HALF_UP)
        installments = [int(base)] * term_months
        installments[-1] += principal_paise - sum(installments)
        return installments

    r = annual_rate / 100 / 12
    factor = r * (1 + r) ** term_months / ((1 + r) ** term_months - 1)
    emi = (P * factor).to_integral_value(rounding=ROUND_HALF_UP)

    installments = [int(emi)] * term_months
    installments[-1] += principal_paise - sum(installments)
    return installments

def generate_schedule_dates(first_date: date, term_months: int) -> list[date]:
    return [first_date + relativedelta(months=i) for i in range(term_months)]
