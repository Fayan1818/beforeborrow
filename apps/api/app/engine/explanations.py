from app.engine.types import OfferResult

REASON_CODE_MESSAGES: dict[str, str] = {
    "insufficient_data": "Required data is missing; this comparison cannot be completed.",
    "reserve_breach": "Cash balance would fall below the reserve floor.",
    "negative_balance": "Cash balance would go negative.",
    "high_financing_cost": "Financing cost exceeds 20% of the borrowed amount.",
    "tight_pressure_window": "Cash headroom drops below ₹5,000 for more than 7 consecutive days.",
}

def explain(result: OfferResult, mode: str = "template") -> str:
    if mode != "template":
        raise NotImplementedError("LLM mode is P1 only")
    lines = []
    for code in result.reason_codes:
        msg = REASON_CODE_MESSAGES.get(code, code)
        lines.append(f"• {msg}")
    return "\n".join(lines) if lines else "No issues detected."
