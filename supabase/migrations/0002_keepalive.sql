-- Ücretsiz Supabase projesinin duraklatılmaması için günlük ping'in çağırdığı işlev.
-- Veri döndürmez, hiçbir tabloya dokunmaz.
create or replace function public.keepalive() returns int
language sql stable as 'select 1';
grant execute on function public.keepalive() to anon, authenticated;
