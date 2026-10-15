-- Faz 3: özetler. Her belge için her seviyeden tek özet (önbellek).
alter table public.summaries add column if not exists model text;
create unique index if not exists summaries_doc_level_uniq
  on public.summaries (document_id, level);
