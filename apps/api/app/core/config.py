from typing import Literal
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "production", "test"] = "development"
    api_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://app:localonly@localhost:5432/bb"
    frontend_origins: list[str] = ["http://localhost:5173"]

    session_secret: str = "replace-with-random-local-secret"
    session_ttl_seconds: int = 28800
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    model_version: str = "rules-v1"
    default_horizon_days: int = 180
    max_horizon_days: int = 1825

    data_mode: Literal["manual", "mock_aa"] = "manual"
    enable_demo_data: bool = True
    explanation_mode: Literal["template", "llm"] = "template"
    llm_api_key: str = ""

    max_import_bytes: int = 1_048_576
    log_level: str = "INFO"

    def validate_production_safety(self) -> None:
        if self.app_env == "production":
            if self.enable_demo_data:
                raise ValueError("ENABLE_DEMO_DATA must be false in production")
            if not self.cookie_secure:
                raise ValueError("COOKIE_SECURE must be true in production")
            if self.session_secret == "replace-with-random-local-secret":
                raise ValueError("SESSION_SECRET must be changed in production")


settings = Settings()
