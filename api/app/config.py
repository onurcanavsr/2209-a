from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-5-5"
    llm_model_fast: str = "claude-haiku-4-5-20251001"
    anthropic_api_key: str = ""
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"
    max_upload_mb: int = 10
    daily_limit_per_user: int = 20
    daily_summary_limit: int = 30
    max_pages: int = 300
    ocr_max_pages: int = 40
    max_text_chars: int = 400_000
    max_uncompressed_mb: int = 300
    max_concurrent_extractions: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
