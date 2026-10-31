from app.engine.types import AnalysisResult, FinancialSnapshot, ScenarioInput
from app.engine.policy import Policy, DEFAULT_POLICY

def normalize_offer(offer) -> object:
    raise NotImplementedError

def analyze(
    snapshot: FinancialSnapshot,
    scenario: ScenarioInput,
    policy: Policy = DEFAULT_POLICY,
) -> AnalysisResult:
    raise NotImplementedError
