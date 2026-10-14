-- Akademik Asistan: temel şema + Row Level Security
create extension if not exists vector;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'student' check (role in ('student','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- Yönetici kontrolü: JWT içindeki app_metadata'dan (kullanıcı değiştiremez)
create function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pdf','docx','pptx','youtube')),
  title text not null,
  content_hash text,
  raw_text text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index on public.documents (user_id, created_at desc);
create index on public.documents (content_hash);

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  level text not null check (level in ('short','medium','detailed')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Vektör boyutu, seçilecek embedding modeline göre değiştirilecek
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  position int not null,
  content text not null,
  embedding vector(1024)
);

create table public.usage_logs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  units int not null default 0,
  est_cost numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);
create index on public.usage_logs (user_id, created_at);

create table public.system_settings (
  key text primary key,
  value jsonb not null
);
insert into public.system_settings values
  ('daily_limit_per_user','20'), ('max_upload_mb','10');

-- RLS: tüm tablolar kapalı başlar, anonim rol hiçbir şeye erişemez
alter table public.profiles        enable row level security;
alter table public.documents       enable row level security;
alter table public.summaries       enable row level security;
alter table public.document_chunks enable row level security;
alter table public.usage_logs      enable row level security;
alter table public.system_settings enable row level security;

revoke all on all tables in schema public from anon;

create policy "profil: kendi" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "belge: sahibi" on public.documents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "özet: sahibi" on public.summaries for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

create policy "parça: sahibi" on public.document_chunks for all to authenticated
  using (exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()));

create policy "kullanım: kendi okur" on public.usage_logs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "ayar: yönetici" on public.system_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- İLK YÖNETİCİ (SQL Editor'de, e-postanızı yazarak çalıştırın):
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--   where email = 'sizin@mail.com';
-- update public.profiles set role = 'admin' where email = 'sizin@mail.com';
