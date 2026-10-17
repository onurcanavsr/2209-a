-- Faz 6: yönetim paneli. Önce 0001-0005 çalıştırılmış olmalıdır.

-- Aralık sorguları için dizinler
create index if not exists usage_logs_created_idx on public.usage_logs (created_at);
create index if not exists usage_logs_action_created_idx on public.usage_logs (action, created_at);

-- Yönetici işlemlerinin denetim kaydı. Yalnızca API (service role) okur/yazar; kullanıcı rolleri erişemez.
-- target_id'ye bilerek FK konmadı: kullanıcı silinse de kayıt kalır (target_email ile).
create table if not exists public.admin_audit (
  id bigserial primary key,
  admin_id uuid,
  admin_email text,
  action text not null,
  target_id uuid,
  target_email text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
revoke all on sequence public.admin_audit_id_seq from anon, authenticated;

-- Toplulaştırma işlevleri. SECURITY DEFINER olduğundan YALNIZCA service_role çalıştırabilir
-- (PostgREST public şemadaki işlevleri varsayılan olarak herkese açar; aşağıda kapatılıyor).
create or replace function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'inactive_users',   (select count(*) from public.profiles where not is_active),
    'admins',           (select count(*) from public.profiles where role = 'admin'),
    'new_7d',           (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'active_7d',        (select count(distinct user_id) from public.usage_logs where created_at >= now() - interval '7 days'),
    'documents',        (select count(*) from public.documents),
    'documents_failed', (select count(*) from public.documents where status = 'failed'),
    'summaries',        (select count(*) from public.summaries),
    'quizzes',          (select count(*) from public.quizzes),
    'qa_messages',      (select count(*) from public.qa_messages)
  )
$$;

create or replace function public.admin_user_list(p_q text, p_limit int, p_offset int)
returns table (id uuid, email text, role text, is_active boolean, created_at timestamptz,
               doc_count bigint, last_activity timestamptz, total bigint)
language sql stable security definer set search_path = public as $$
  with f as (
    select p.id, p.email, p.role, p.is_active, p.created_at
    from public.profiles p
    where coalesce(p_q, '') = '' or p.email ilike '%' || p_q || '%'
  )
  select f.id, f.email, f.role, f.is_active, f.created_at,
         (select count(*) from public.documents d where d.user_id = f.id),
         (select max(u.created_at) from public.usage_logs u where u.user_id = f.id),
         (select count(*) from f)
  from f
  order by f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$$;

-- Günler Türkiye saatine göre (UTC+3) gruplanır.
create or replace function public.admin_usage_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, action text, calls bigint, units bigint, users bigint)
language sql stable security definer set search_path = public as $$
  select (u.created_at at time zone 'Europe/Istanbul')::date,
         u.action,
         count(*),
         coalesce(sum(u.units), 0)::bigint,
         count(distinct u.user_id)
  from public.usage_logs u
  where u.created_at >= p_from and u.created_at < p_to
  group by 1, 2
  order by 1, 2
$$;

-- En etkin p_limit kullanıcının eylem bazında kullanımı (maliyet API'de hesaplanır)
create or replace function public.admin_usage_by_user(p_from timestamptz, p_to timestamptz, p_limit int)
returns table (user_id uuid, email text, action text, calls bigint, units bigint)
language sql stable security definer set search_path = public as $$
  with top as (
    select u.user_id
    from public.usage_logs u
    where u.created_at >= p_from and u.created_at < p_to
    group by u.user_id
    order by count(*) desc
    limit greatest(p_limit, 1)
  )
  select u.user_id, p.email, u.action, count(*), coalesce(sum(u.units), 0)::bigint
  from public.usage_logs u
  join top t on t.user_id = u.user_id
  left join public.profiles p on p.id = u.user_id
  where u.created_at >= p_from and u.created_at < p_to
  group by u.user_id, p.email, u.action
$$;

revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_user_list(text, int, int) from public, anon, authenticated;
revoke all on function public.admin_usage_daily(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.admin_usage_by_user(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_user_list(text, int, int) to service_role;
grant execute on function public.admin_usage_daily(timestamptz, timestamptz) to service_role;
grant execute on function public.admin_usage_by_user(timestamptz, timestamptz, int) to service_role;
