"""Maliyet tahmini: biçim, sınırlar ve hesabın makul aralıkta kalması (gerçek faturanın yerine geçmez)."""
from types import SimpleNamespace

import pytest

from app.costs import CHUNK_SIZE, SINGLE_MAX_CHARS, estimate_cost


def cfg(**kw):
    base = dict(cost_llm_main_in_per_mtok=2.0, cost_llm_main_out_per_mtok=10.0,
                cost_llm_fast_in_per_mtok=1.0, cost_llm_fast_out_per_mtok=5.0,
                cost_tts_per_mchar=15.0, cost_chars_per_token=3.0, tts_provider="edge")
    base.update(kw)
    return SimpleNamespace(**base)


def test_unknown_and_free_actions_cost_nothing():
    assert estimate_cost("upload", 5_000_000, cfg()) == 0
    assert estimate_cost("bilinmeyen", 1000, cfg()) == 0
    assert estimate_cost("summarize", 0, cfg()) > 0          # istem yükü her zaman vardır
    assert estimate_cost("summarize", -5, cfg()) == estimate_cost("summarize", 0, cfg())  # negatif birim sıfır sayılır


def test_edge_tts_is_free_azure_is_per_character():
    assert estimate_cost("tts", 1_000_000, cfg(tts_provider="edge")) == 0
    assert estimate_cost("tts", 1_000_000, cfg(tts_provider="azure")) == pytest.approx(15.0)
    assert estimate_cost("tts", 2_000, cfg(tts_provider="azure")) == pytest.approx(0.03)


def test_summarize_hand_calculated_single_pass():
    # 30.000 karakter + 1.500 yük = 31.500 kar / 3 = 10.500 token girdi; 800 token çıktı
    expected = (10_500 * 2.0 + 800 * 10.0) / 1_000_000
    assert estimate_cost("summarize", 30_000, cfg()) == pytest.approx(expected)


def test_summarize_long_document_uses_map_reduce_and_is_costlier_per_char_but_cheap_model():
    n = 3  # 100.000 / 40.000 → 3 bölüm
    assert -(-100_000 // CHUNK_SIZE) == n
    map_cost = ((100_000 + n * 1_500) / 3 * 1.0 + 900 * n * 5.0) / 1_000_000          # ucuz model
    final = ((n * 3_000 + 1_500) / 3 * 2.0 + 800 * 10.0) / 1_000_000                 # ana model, yalnızca notlar
    assert estimate_cost("summarize", 100_000, cfg()) == pytest.approx(map_cost + final)
    # eşik civarında süreksizlik yok denecek kadar küçük olmalı (aşırı sıçrama = hatalı formül)
    a, b = estimate_cost("summarize", SINGLE_MAX_CHARS, cfg()), estimate_cost("summarize", SINGLE_MAX_CHARS + 1, cfg())
    assert b < a * 3


def test_quiz_input_is_capped_at_source_limit():
    assert estimate_cost("quiz", 400_000, cfg()) == estimate_cost("quiz", 40_000, cfg())
    assert estimate_cost("quiz", 10_000, cfg()) < estimate_cost("quiz", 40_000, cfg())


def test_ask_scales_with_prompt_and_rates_are_configurable():
    small, big = estimate_cost("ask", 2_000, cfg()), estimate_cost("ask", 30_000, cfg())
    assert 0 < small < big
    assert estimate_cost("ask", 30_000, cfg(cost_llm_main_in_per_mtok=4.0, cost_llm_main_out_per_mtok=20.0)) == pytest.approx(big * 2)


def test_chars_per_token_never_divides_by_zero():
    assert estimate_cost("ask", 1000, cfg(cost_chars_per_token=0)) > 0


def test_sanity_monthly_scale():
    """Kaba makullük: 100 öğrenci × günde 5 özet(20k) + 20 soru(8k) + 1 test(20k) ≈ ayda onlarca dolar, binlerce değil."""
    gunluk = 5 * estimate_cost("summarize", 20_000, cfg()) + 20 * estimate_cost("ask", 8_000, cfg()) + estimate_cost("quiz", 20_000, cfg())
    aylik = gunluk * 100 * 30
    assert 10 < aylik < 2_000, aylik
