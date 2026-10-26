-- Desafios: ao terminar, o post mais curtido ganha sozinho; em caso de empate, TODOS os empatados ganham. Idempotente.
-- A equipe continua podendo premiar mais gente à mão (a "escolha da equipe"), pelo admin.
alter table public.challenges add column if not exists premiado_auto_em timestamptz;

-- Entrega os prêmios (sem checar quem chama): usada pelo admin e pela rotina automática
create or replace function public.premiar_desafio_interno(chid bigint, vencedores uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare ch challenges; v uuid; extra text;
begin
  select * into ch from challenges where id = chid;
  if ch.id is null then raise exception 'Desafio não encontrado.'; end if;
  foreach v in array vencedores loop
    continue when v = any(ch.winners);
    if ch.reward_cosmetic is not null then perform grant_cosmetic(v, ch.reward_cosmetic); end if;
    foreach extra in array coalesce(ch.reward_extras, '{}') loop perform grant_cosmetic(v, extra); end loop;
    if ch.reward_xp > 0 then perform add_xp(v, ch.reward_xp, 'desafio'); end if;
    insert into notifications (user_id, type, title, body, link)
    values (v, 'desafio', '🏆 Você venceu o desafio "' || ch.title || '"!', 'Seus prêmios já estão na sua conta.', 'conquistas.html');
  end loop;
  update challenges set winners = (select array_agg(distinct x) from unnest(winners || vencedores) x) where id = chid;
end $$;
revoke execute on function public.premiar_desafio_interno(bigint, uuid[]) from public, anon, authenticated;

create or replace function public.award_challenge(chid bigint, vencedores uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Somente administradores.'; end if;
  perform premiar_desafio_interno(chid, vencedores);
end $$;
revoke execute on function public.award_challenge(bigint,uuid[]) from public, anon;
grant execute on function public.award_challenge(bigint,uuid[]) to authenticated;

-- Rotina: desafios encerrados ainda não premiados -> todos os autores com o maior número de curtidas (mínimo 1)
create or replace function public.premiar_desafios_encerrados() returns void
language plpgsql security definer set search_path = public as $$
declare ch record; maximo integer; ganhadores uuid[];
begin
  for ch in select id from challenges where ends_at < now() and premiado_auto_em is null and ends_at > now() - interval '30 days' loop
    select max(likes_count) into maximo from posts where challenge_id = ch.id and status = 'published';
    if coalesce(maximo, 0) >= 1 then
      select array_agg(distinct p.user_id) into ganhadores from posts p join profiles pr on pr.id = p.user_id
        where p.challenge_id = ch.id and p.status = 'published' and p.likes_count = maximo and not pr.banned;
      if ganhadores is not null then perform premiar_desafio_interno(ch.id, ganhadores); end if;
    end if;
    update challenges set premiado_auto_em = now() where id = ch.id;
  end loop;
end $$;
revoke execute on function public.premiar_desafios_encerrados() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('premiar-desafios') where exists (select 1 from cron.job where jobname = 'premiar-desafios');
  perform cron.schedule('premiar-desafios', '12 * * * *', 'select public.premiar_desafios_encerrados()');
exception when others then null; end $$;
