from dataclasses import dataclass
from app.engine.types import FinancialSnapshot, ScenarioInput

@dataclass
class Alternative:
    description: str
    changes: dict
    assumptions: list[str]

@dataclass
class Alternatives:
    feasible: list[Alternative]
    no_feasible_plan: bool = False

def search_changes(
    snapshot: FinancialSnapshot,
    scenario: ScenarioInput,
    bounds: dict,
) -> Alternatives:
    raise NotImplementedError
