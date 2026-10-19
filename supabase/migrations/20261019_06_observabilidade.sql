-- Fase 15: registro de erros do site (agregado, sem dados pessoais) e status dos robôs. Idempotente.

-- Um erro igual (mesma categoria, página e mensagem) no mesmo dia vira uma linha só, com contador.
create table if not exists public.client_errors (
  id          bigserial primary key,
  dia         date not null default current_date,
  assinatura  text not null check (char_length(assinatura) <= 64),
  categoria   text not null check (categoria in ('js','promessa','rede','supabase','call','push','outro')),
  pagina      text not null check (char_length(pagina) <= 80),
  acao        text check (char_length(acao) <= 80),
  mensagem    text not null check (char_length(mensagem) <= 300),
  versao      text check (char_length(versao) <= 40),
  vezes       integer not null default 1,
  ultima      timestamptz not null default now(),
  unique (dia, assinatura)
);
alter table public.client_errors enable row level security;
drop policy if exists ce_staff on public.client_errors;
create policy ce_staff on public.client_errors for select using (is_staff());
create index if not exists client_errors_dia_idx on public.client_errors (dia desc, vezes desc);

-- O site manda o erro já limpo; o banco limpa de novo (e-mails, tokens, números longos) e limita o volume.
create or replace function public.registrar_erro(categoria text, pagina text, mensagem text, acao text default null, versao text default null)
returns void language plpgsql security definer set search_path = public as $$
#variable_conflict use_variable
declare limpa text; pag text; total int;
begin
  pag := left(regexp_replace(coalesce(pagina, ''), '[?#].*$', ''), 80);  -- sem parâmetros da URL
  limpa := left(regexp_replace(regexp_replace(regexp_replace(coalesce(mensagem, ''),
             '[\w.+-]+@[\w-]+\.[\w.]+', '***@***', 'g'),
             '(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_[a-z]+_[\w-]+|Bearer\s+\S+)', '***', 'g'),
             '\d{6,}', '#', 'g'), 300);
  -- trava contra enxurrada: no máximo 2000 assinaturas novas por dia no total
  select count(*) into total from client_errors where dia = current_date;
  insert into client_errors as c (assinatura, categoria, pagina, acao, mensagem, versao)
  select md5(registrar_erro.categoria || '|' || pag || '|' || limpa), registrar_erro.categoria,
         pag, left(registrar_erro.acao, 80), limpa, left(registrar_erro.versao, 40)
  where total < 2000 and registrar_erro.categoria in ('js','promessa','rede','supabase','call','push','outro')
  on conflict (dia, assinatura) do update set vezes = least(c.vezes + 1, 1000000), ultima = now();
end $$;
revoke execute on function public.registrar_erro(text, text, text, text, text) from public;
grant execute on function public.registrar_erro(text, text, text, text, text) to anon, authenticated;

-- Retenção: 30 dias
create or replace function public.limpar_erros() returns void language sql security definer set search_path = public as $$
  delete from client_errors where dia < current_date - 30;
$$;
revoke execute on function public.limpar_erros() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('limpar-erros') where exists (select 1 from cron.job where jobname = 'limpar-erros');
    perform cron.schedule('limpar-erros', '17 4 * * *', 'select public.limpar_erros()');
  end if;
end $$;

-- Robôs registram a última execução (o painel de status lê daqui)
create table if not exists public.robot_runs (
  robo       text primary key check (char_length(robo) <= 40),
  inicio     timestamptz not null,
  fim        timestamptz,
  ok         boolean,
  resumo     text check (char_length(resumo) <= 300)
);
alter table public.robot_runs enable row level security;
drop policy if exists rr_staff on public.robot_runs;
create policy rr_staff on public.robot_runs for select using (is_staff());
