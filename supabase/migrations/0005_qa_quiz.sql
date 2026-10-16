-- Faz 5: belge soru-cevabı geçmişi ve pekiştirme testleri (quiz)
-- Not: Arama (retrieval) veritabanında değil, api/app/qa.py içinde yapılır; document_chunks tablosu kullanılmaz.

create table if not exists public.qa_messages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  sources jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists qa_messages_doc_idx on public.qa_messages (document_id, user_id, created_at);

-- Sorular (doğru cevap ve açıklamalarıyla) jsonb olarak saklanır; istemciye cevaplar gönderilmez.
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  question_count int not null check (question_count > 0),
  questions jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists quizzes_doc_idx on public.quizzes (document_id, user_id, created_at desc);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null,
  score int not null check (score >= 0),
  total int not null check (total > 0),
  created_at timestamptz not null default now()
);
create index if not exists quiz_attempts_quiz_idx on public.quiz_attempts (quiz_id, user_id, created_at desc);

alter table public.qa_messages  enable row level security;
alter table public.quizzes      enable row level security;
alter table public.quiz_attempts enable row level security;

revoke all on public.qa_messages, public.quizzes, public.quiz_attempts from anon;

create policy "soru-cevap: sahibi" on public.qa_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "test: sahibi" on public.quizzes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "deneme: sahibi" on public.quiz_attempts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
