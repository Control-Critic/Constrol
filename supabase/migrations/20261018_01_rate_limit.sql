-- Rate limit das Netlify Functions (fase 2). Idempotente: pode rodar mais de uma vez.
-- Só o service_role chama rate_hit; a chave já chega com hash (sem IP ou id em texto puro).
create table if not exists public.rate_limits (
  chave  text not null check (char_length(chave) <= 80),
  janela timestamptz not null,
  n      integer not null default 0,
  primary key (chave, janela)
);
alter table public.rate_limits enable row level security;   -- sem políticas: ninguém lê pela API pública
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_hit(chave text, maximo integer, segundos integer) returns boolean
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare j timestamptz; total integer;
begin
  if maximo < 1 or segundos < 1 or segundos > 86400 then return false; end if;
  j := to_timestamp(floor(extract(epoch from now()) / segundos) * segundos);
  insert into rate_limits as r (chave, janela, n) values (rate_hit.chave, j, 1)
    on conflict (chave, janela) do update set n = r.n + 1
    returning n into total;
  if random() < 0.01 then delete from rate_limits where janela < now() - interval '1 day'; end if;
  return total <= maximo;
end $$;
revoke execute on function public.rate_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_hit(text, integer, integer) to service_role;

-- Rollback (manual, se necessário):
--   drop function if exists public.rate_hit(text, integer, integer);
--   drop table if exists public.rate_limits;
