"""Yönetim paneli için maliyet TAHMİNİ. usage_logs yalnızca (eylem, birim) saklar; gerçek token sayıları
kaydedilmediği için tutarlar kabaca hesaplanır ve panelde "tahmini" diye gösterilir. Gerçek fatura için
Anthropic Console ve (kullanılıyorsa) Azure panosuna bakın.

Birimler: summarize/quiz = belge karakteri, ask = modele giden istem karakteri, tts = seslendirilen karakter, stt = sesli komut sayısı."""
from math import ceil
from typing import Any

SINGLE_MAX_CHARS = 60_000   # summarize.SINGLE_MAX_CHARS ile aynı: altı tek çağrı
CHUNK_SIZE = 40_000         # summarize.CHUNK_SIZE
QUIZ_SOURCE_MAX = 40_000    # quiz.SOURCE_MAX_CHARS: test için en çok bu kadar metin modele gider
PROMPT_OVERHEAD_CHARS = 1_500   # sistem istemi + yönergeler

OUT_SUMMARY_TOKENS = 800        # orta düzey özet için varsayım (kısa/ayrıntılı ayrımı kaydedilmiyor)
OUT_MAP_TOKENS = 900            # uzun belgede her bölüm notu
IN_MAP_NOTES_CHARS = 3_000      # her bölüm notunun final çağrısına giren boyutu
OUT_ASK_TOKENS = 400
OUT_QUIZ_TOKENS = 2_000

KNOWN_ACTIONS = ("summarize", "ask", "quiz", "tts", "stt", "upload")


def _tokens(chars: float, s: Any) -> float:
    return chars / max(float(s.cost_chars_per_token), 0.5)


def _usd(tok_in: float, tok_out: float, rate_in: float, rate_out: float) -> float:
    return (tok_in * rate_in + tok_out * rate_out) / 1_000_000


def estimate_cost(action: str, units: int, s: Any) -> float:
    """Bir eylemin tahmini maliyeti (USD). Bilinmeyen eylem ve yükleme için 0."""
    units = max(int(units or 0), 0)
    main = (float(s.cost_llm_main_in_per_mtok), float(s.cost_llm_main_out_per_mtok))
    fast = (float(s.cost_llm_fast_in_per_mtok), float(s.cost_llm_fast_out_per_mtok))
    if action == "summarize":
        if units <= SINGLE_MAX_CHARS:
            return _usd(_tokens(units + PROMPT_OVERHEAD_CHARS, s), OUT_SUMMARY_TOKENS, *main)
        n = ceil(units / CHUNK_SIZE)
        map_cost = _usd(_tokens(units + n * PROMPT_OVERHEAD_CHARS, s), OUT_MAP_TOKENS * n, *fast)
        final = _usd(_tokens(n * IN_MAP_NOTES_CHARS + PROMPT_OVERHEAD_CHARS, s), OUT_SUMMARY_TOKENS, *main)
        return map_cost + final
    if action == "quiz":
        return _usd(_tokens(min(units, QUIZ_SOURCE_MAX) + PROMPT_OVERHEAD_CHARS, s), OUT_QUIZ_TOKENS, *main)
    if action == "ask":
        return _usd(_tokens(units + PROMPT_OVERHEAD_CHARS, s), OUT_ASK_TOKENS, *main)
    if action == "tts":
        # edge-tts ücretsizdir; yalnızca Azure'da karakter başına ücret var
        return units / 1_000_000 * float(s.cost_tts_per_mchar) if s.tts_provider == "azure" else 0.0
    if action == "stt":   # birim = komut sayısı; süre kaydedilmediğinden ortalama süreyle tahmin edilir
        return units * float(s.cost_stt_avg_seconds) / 60 * float(s.cost_stt_per_min)
    return 0.0
