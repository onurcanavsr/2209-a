-- Faz 2: belge işleme alanları (api/app/store.py ile uyumlu)
alter table public.documents
  add column if not exists size_bytes bigint,
  add column if not exists page_count int,
  add column if not exists char_count int,
  add column if not exists used_ocr boolean not null default false,
  add column if not exists truncated boolean not null default false,
  add column if not exists note text,
  add column if not exists error text;

-- durumlar: processing | ready | failed
update public.documents set status = 'failed' where status not in ('processing','ready','failed');
alter table public.documents alter column status set default 'processing';
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check
  check (status in ('processing','ready','failed'));

-- Aynı kullanıcının aynı dosyası tekrar işlenmesin (önbellek)
create unique index if not exists documents_user_hash_uniq
  on public.documents (user_id, content_hash) where content_hash is not null;
