-- Fase 17: métricas de produto com privacidade. Idempotente.
-- Nada de rastreamento individual: só contadores diários por tipo de evento (sem usuário, sem IP, sem página com parâmetros)
-- e indicadores calculados na hora a partir dos dados que o site já guarda.

create table if not exists public.metric_daily (
  dia     date not null default current_date,
  evento  text not null check (evento in ('visita','clique_cadastro','cadastro_inicio','cadastro_enviado','onboarding_fim','grupo_criado','call_entrou','instalou_app')),
  total   integer not null default 0,
  primary key (dia, evento)
);
alter table public.metric_daily enable row level security;
drop policy if exists md_staff on public.metric_daily;
create policy md_staff on public.metric_daily for select using (is_staff());

create or replace function public.contar_evento(nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into metric_daily as m (dia, evento, total) values (current_date, nome, 1)
  on conflict (dia, evento) do update set total = least(m.total + 1, 10000000);
exception when check_violation then null; -- evento desconhecido: ignora
end $$;
revoke execute on function public.contar_evento(text) from public;
grant execute on function public.contar_evento(text) to anon, authenticated;

-- Indicadores para a equipe (só agregados; nenhum id ou nome sai daqui)
create or replace function public.metricas_produto(dias integer default 28) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; desde timestamptz := now() - make_interval(days => greatest(1, least(dias, 365)));
begin
  if not is_staff() then raise exception 'Só a equipe.'; end if;
  with novos as (select id, created_at from profiles where created_at >= desde),
  ativos as ( -- interação significativa: avaliar, postar, comentar, criar/entrar em grupo, mandar mensagem, publicar story, mexer na biblioteca
    select user_id, created_at as quando from reviews where created_at >= now() - interval '7 days'
    union all select user_id, created_at from posts where created_at >= now() - interval '7 days'
    union all select user_id, created_at from post_comments where created_at >= now() - interval '7 days'
    union all select user_id, created_at from lfg_posts where created_at >= now() - interval '7 days'
    union all select user_id, created_at from lfg_interest where created_at >= now() - interval '7 days'
    union all select sender_id, created_at from direct_messages where created_at >= now() - interval '7 days'
    union all select user_id, created_at from stories where created_at >= now() - interval '7 days'
    union all select user_id, updated_at from user_games where updated_at >= now() - interval '7 days'
  ),
  login as (select distinct user_id, (created_at at time zone 'America/Sao_Paulo')::date as dia from xp_log where reason = 'login diário'),
  ret as (
    select n.id,
      exists (select 1 from login l where l.user_id = n.id and l.dia = (n.created_at at time zone 'America/Sao_Paulo')::date + 1) as d1,
      exists (select 1 from login l where l.user_id = n.id and l.dia between (n.created_at at time zone 'America/Sao_Paulo')::date + 7 and (n.created_at at time zone 'America/Sao_Paulo')::date + 13) as d7,
      exists (select 1 from login l where l.user_id = n.id and l.dia between (n.created_at at time zone 'America/Sao_Paulo')::date + 30 and (n.created_at at time zone 'America/Sao_Paulo')::date + 36) as d30,
      n.created_at
    from novos n)
  select jsonb_build_object(
    'periodo_dias', dias,
    'usuarios_semanais_significativos', (select count(distinct user_id) from ativos),
    'novos_cadastros', (select count(*) from novos),
    'ativacao', jsonb_build_object(
      'onboarding', (select count(*) from novos n join profiles p using (id) where p.onboarded),
      'primeiro_jogo', (select count(distinct n.id) from novos n join user_games ug on ug.user_id = n.id),
      'primeira_avaliacao', (select count(distinct n.id) from novos n join reviews x on x.user_id = n.id),
      'primeira_comunidade', (select count(distinct n.id) from novos n join community_members x on x.user_id = n.id),
      'primeiro_grupo', (select count(distinct n.id) from novos n where exists (select 1 from lfg_posts x where x.user_id = n.id) or exists (select 1 from lfg_interest x where x.user_id = n.id)),
      'primeira_call', (select count(*) from novos n join profiles p using (id) where coalesce(p.call_minutos, 0) > 0)),
    'retencao', jsonb_build_object(
      'd1', (select round(100.0 * count(*) filter (where d1) / nullif(count(*) filter (where created_at < now() - interval '1 day'), 0), 1) from ret),
      'd7', (select round(100.0 * count(*) filter (where d7) / nullif(count(*) filter (where created_at < now() - interval '13 days'), 0), 1) from ret),
      'd30', (select round(100.0 * count(*) filter (where d30) / nullif(count(*) filter (where created_at < now() - interval '36 days'), 0), 1) from ret)),
    'uso_7_dias', jsonb_build_object(
      'avaliacoes', (select count(*) from reviews where created_at >= now() - interval '7 days'),
      'posts', (select count(*) from posts where created_at >= now() - interval '7 days'),
      'grupos', (select count(*) from lfg_posts where created_at >= now() - interval '7 days'),
      'mensagens', (select count(*) from direct_messages where created_at >= now() - interval '7 days'),
      'stories', (select count(*) from stories where created_at >= now() - interval '7 days')),
    'eventos', (select coalesce(jsonb_object_agg(evento, total), '{}') from (select evento, sum(total) as total from metric_daily where dia >= desde::date group by evento) e),
    'erros_por_pagina', (select coalesce(jsonb_object_agg(pagina, n), '{}') from (select pagina, sum(vezes) as n from client_errors where dia >= desde::date group by pagina order by 2 desc limit 10) e)
  ) into r;
  return r;
end $$;
revoke execute on function public.metricas_produto(integer) from public, anon;
grant execute on function public.metricas_produto(integer) to authenticated;

-- Retenção dos contadores: 400 dias
create or replace function public.limpar_metricas() returns void language sql security definer set search_path = public as $$
  delete from metric_daily where dia < current_date - 400;
$$;
revoke execute on function public.limpar_metricas() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('limpar-metricas') where exists (select 1 from cron.job where jobname = 'limpar-metricas');
    perform cron.schedule('limpar-metricas', '27 4 * * 0', 'select public.limpar_metricas()');
  end if;
end $$;
