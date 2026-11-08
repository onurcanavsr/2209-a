-- Çıkarılan metinde sayfa sayfa gezinme.
-- raw_text DEĞİŞMEZ; her sayfanın raw_text içindeki başlangıç karakteri ayrıca saklanır (örn. [0, 1843, 1843, 3920]).
-- PDF ve PowerPoint için doldurulur; Word, YouTube ve bu güncellemeden önce yüklenmiş belgelerde null kalır (gezinti görünmez).
-- ÖNEMLİ: API'yi yayınlamadan ÖNCE bu dosyayı Supabase SQL editöründe çalıştırın.
alter table public.documents add column if not exists page_starts jsonb;
