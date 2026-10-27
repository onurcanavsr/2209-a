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
    # ---- Sesli komut (STT) ----
    stt_provider: str = "openai"
    openai_api_key: str = ""
    stt_model: str = "gpt-transcribe"
    stt_language: str = "tr"
    stt_hints: bool = True                # komut sözcüklerini tanıyıcıya ipucu olarak ver
    stt_timeout_s: float = 20.0
    stt_max_bytes: int = 400_000          # tek komut kaydı için üst sınır (yaklaşık 20-40 sn ses)
    daily_stt_requests: int = 300         # kullanıcı başına günlük komut sayısı (maliyet koruması)
    cost_stt_per_min: float = 0.0045      # USD / ses dakikası (gpt-transcribe); yönetim paneli TAHMİNİ
    cost_stt_avg_seconds: float = 3.0     # bir komutun ortalama süresi (tahmin için)
    # Yönetim paneli maliyet TAHMİNİ (USD / milyon token). Varsayılanlar, Claude Platform fiyat sayfasına göre
    # Sonnet 5.5 ($2/$10) ve Haiku 4.5 ($1/$5) içindir; modeli değiştirirseniz bunları da güncelleyin.
    cost_llm_main_in_per_mtok: float = 2.0
    cost_llm_main_out_per_mtok: float = 10.0
    cost_llm_fast_in_per_mtok: float = 1.0
    cost_llm_fast_out_per_mtok: float = 5.0
    cost_tts_per_mchar: float = 15.0      # USD / milyon karakter, yalnızca TTS_PROVIDER=azure iken (edge ücretsiz sayılır)
    cost_chars_per_token: float = 3.0     # Türkçe için kaba oran; gerçek faturayla karşılaştırıp ayarlayın


@lru_cache
def get_settings() -> Settings:
    return Settings()
