-- Faz 7: notlar, yer imleri ve öğrenme kartları (belge başına, kullanıcıya özel)
-- Supabase SQL Editor'de 0001-0006'dan sonra çalıştırılır.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_doc_idx on public.notes (document_id, user_id, created_at desc);

-- word_index: "Çıkarılan metin" içindeki kelime sırası (VurguluMetin ile aynı numaralandırma)
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  word_index int not null check (word_index >= 0),
  snippet text not null default '' check (char_length(snippet) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists bookmarks_doc_idx on public.bookmarks (document_id, user_id, word_index);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null check (char_length(front) between 1 and 500),
  back text not null check (char_length(back) between 1 and 1000),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now()
);
create index if not exists flashcards_doc_idx on public.flashcards (document_id, user_id, created_at);

alter table public.notes      enable row level security;
alter table public.bookmarks  enable row level security;
alter table public.flashcards enable row level security;

revoke all on public.notes, public.bookmarks, public.flashcards from anon;

create policy "not: sahibi" on public.notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "yer imi: sahibi" on public.bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "kart: sahibi" on public.flashcards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
