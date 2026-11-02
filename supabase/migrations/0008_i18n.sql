-- Faz 8: çok dillilik (tr / en). Özetler artık belge + seviye + DİL başına tek kayıttır;
-- böylece aynı belgenin Türkçe ve İngilizce özeti birbirini ezmez. Mevcut özetler Türkçe sayılır.
-- Supabase > SQL Editor'de bir kez çalıştırın (güvenle yeniden çalıştırılabilir).
alter table public.summaries add column if not exists language text not null default 'tr';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'summaries_language_check') then
    alter table public.summaries add constraint summaries_language_check check (language in ('tr', 'en'));
  end if;
end $$;

drop index if exists public.summaries_doc_level_uniq;
create unique index if not exists summaries_doc_level_lang_uniq
  on public.summaries (document_id, level, language);
