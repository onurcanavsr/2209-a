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
    daily_qa_limit: int = 60              # kullanıcı başına günlük soru sayısı
    daily_quiz_limit: int = 15            # kullanıcı başına günlük test üretimi
    tts_provider: str = "edge"            # "edge" (ücretsiz, resmî olmayan) | "azure" (resmî)
    tts_voice: str = "tr-TR-EmelNeural"
    azure_speech_key: str = ""
    azure_speech_region: str = "westeurope"
    audio_dir: str = "/data/audio"
    audio_ttl_days: int = 14
    daily_tts_chars: int = 100_000        # kullanıcı başına günlük yeni sentezlenen karakter
    tts_segment_chars: int = 1200
    tts_max_download_chars: int = 60_000  # asıl metnin tek MP3 olarak indirilebileceği üst sınır
    tts_concurrency: int = 3
    max_pages: int = 300
    ocr_max_pages: int = 40
    max_text_chars: int = 400_000
    max_uncompressed_mb: int = 300
    max_concurrent_extractions: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
