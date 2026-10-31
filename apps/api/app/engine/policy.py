from dataclasses import dataclass

MODEL_VERSION = "rules-v1"
SUPPORTED_VERSIONS: set[str] = {"rules-v1"}

@dataclass(frozen=True)
class Policy:
    model_version: str
    reserve_floor_default_paise: int = 0
    high_cost_threshold_pct: float = 20.0
    pressure_headroom_paise: int = 500_000
    pressure_window_days: int = 7
    default_horizon_days: int = 180
    max_horizon_days: int = 1825

DEFAULT_POLICY = Policy(model_version=MODEL_VERSION)

def get_policy(version: str = MODEL_VERSION) -> Policy:
    if version not in SUPPORTED_VERSIONS:
        raise ValueError(f"Unsupported model version: {version!r}")
    return DEFAULT_POLICY
