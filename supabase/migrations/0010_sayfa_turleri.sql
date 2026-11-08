-- Sayfa türleri (metin / OCR ile okunan / görüntü) ve Word sayfalarının yaklaşık olup olmadığı.
-- Örnek: {"kinds": ["text", "ocr", "image"], "approx": false}. 0009_sayfa_gezintisi.sql'den SONRA çalıştırın.
-- ÖNEMLİ: API'yi yayınlamadan ÖNCE çalıştırın. Önceki belgelerde null kalır (sayfa gezintisi yoksa zaten gösterilmez).
alter table public.documents add column if not exists page_meta jsonb;
