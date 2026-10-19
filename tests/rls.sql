-- Testes de RLS e privilégios (fase 3). Rodar DEPOIS de tests/supabase-stub.sql e supabase/schema.sql:
--   psql -v ON_ERROR_STOP=1 -f tests/rls.sql
-- Cada bloco simula um papel (visitante, usuário A, usuário B, moderador, admin, banido) e falha com
-- "ASSERT" se alguma regra de acesso não for respeitada. Tudo roda numa transação desfeita no fim.
begin;

create schema if not exists teste;
grant usage on schema teste to anon, authenticated;

-- Linhas visíveis por uma consulta (como o papel atual)
create or replace function teste.ve(q text) returns integer language plpgsql as $$
declare n integer; begin execute format('select count(*) from (%s) x', q) into n; return n;
exception when insufficient_privilege then return -1; end $$;
-- Linhas afetadas por um comando; -1 se o banco recusou com erro
create or replace function teste.faz(q text) returns integer language plpgsql as $$
declare n integer; begin execute q; get diagnostics n = row_count; return n;
exception when others then return -1; end $$;
grant execute on all functions in schema teste to anon, authenticated;

-- Quem é quem
create or replace function teste.como(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute case when uid is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

-- Pessoas de teste (criadas como superusuário, com as proteções desligadas)
select set_config('cc.sistema', '1', true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@teste.invalid', '{"username":"t_ana"}'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@teste.invalid', '{"username":"t_bia"}'),
  ('cccccccc-0000-0000-0000-00000000000c', 'c@teste.invalid', '{"username":"t_adm"}'),
  ('dddddddd-0000-0000-0000-00000000000d', 'd@teste.invalid', '{"username":"t_mod"}'),
  ('eeeeeeee-0000-0000-0000-00000000000e', 'e@teste.invalid', '{"username":"t_ban"}');
update public.profiles set role = 'admin' where id = 'cccccccc-0000-0000-0000-00000000000c';
update public.profiles set role = 'moderator' where id = 'dddddddd-0000-0000-0000-00000000000d';
update public.profiles set banned = true where id = 'eeeeeeee-0000-0000-0000-00000000000e';
update public.profiles set accepted_terms_at = now();
insert into public.direct_messages (sender_id, receiver_id, body) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b', 'segredo da ana');
insert into public.notifications (user_id, type, title) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'teste', 'notificação da bia');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://push.invalid/b', 'bbbbbbbb-0000-0000-0000-00000000000b', 'k', 'a');
insert into public.close_friends (owner_id, friend_id) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'dddddddd-0000-0000-0000-00000000000d');
insert into public.stories (user_id, image_url, close_friends) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'https://teste.supabase.co/storage/v1/object/public/media/t/s.webp', true);
insert into public.communities (id, name, owner_id, is_private) values (900001, 'Privada de teste', 'bbbbbbbb-0000-0000-0000-00000000000b', true);
insert into public.posts (community_id, user_id, body) values (900001, 'bbbbbbbb-0000-0000-0000-00000000000b', 'post da privada');
insert into public.posts (user_id, body) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'post público da bia');
insert into public.app_secrets (key, value) values ('teste_segredo', '"nao-pode-vazar"') on conflict (key) do nothing;
insert into public.settings (key, value) values ('push', '{"url":"https://x.invalid","segredo":"nao-pode-vazar"}') on conflict (key) do update set value = excluded.value;
select set_config('cc.sistema', '', true);

-- ---------- Visitante ----------
select teste.como(null);
do $$ begin
  assert teste.ve('select 1 from public.direct_messages') <= 0, 'visitante leu mensagens diretas';
  assert teste.ve('select 1 from public.notifications') <= 0, 'visitante leu notificações';
  assert teste.ve('select 1 from public.push_subscriptions') <= 0, 'visitante leu inscrições de push';
  assert teste.ve('select 1 from public.app_secrets') <= 0, 'visitante leu app_secrets';
  assert teste.ve($q$select 1 from public.settings where value::text like '%nao-pode-vazar%'$q$) <= 0, 'visitante leu segredo em settings';
  assert teste.ve('select 1 from public.close_friends') <= 0, 'visitante leu melhores amigos';
  assert teste.ve('select 1 from public.stories where close_friends') <= 0, 'visitante viu story de melhores amigos';
  assert teste.ve('select 1 from public.posts where community_id = 900001') <= 0, 'visitante viu post de comunidade privada';
  assert teste.faz($q$insert into public.posts (user_id, body) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'falso')$q$) <= 0, 'visitante postou como outra pessoa';
  assert teste.faz($q$insert into public.user_cosmetics (user_id, cosmetic_id) select 'aaaaaaaa-0000-0000-0000-00000000000a', id from public.cosmetics limit 1$q$) <= 0, 'visitante deu item';
end $$;
reset role;

-- ---------- Usuária A tentando acessar dados da B ----------
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ begin
  assert teste.ve('select 1 from public.direct_messages') = 1, 'A deveria ver a própria mensagem enviada';
  assert teste.ve($q$select 1 from public.notifications where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) = 0, 'A leu notificação da B';
  assert teste.ve('select 1 from public.push_subscriptions') = 0, 'A leu push da B';
  assert teste.ve('select 1 from public.close_friends') = 0, 'A viu a lista de melhores amigos da B';
  assert teste.ve('select 1 from public.stories where close_friends') = 0, 'A viu story só para melhores amigos';
  assert teste.ve('select 1 from public.posts where community_id = 900001') = 0, 'A viu post de comunidade privada sem ser membro';
  assert teste.ve('select 1 from public.app_secrets') <= 0, 'A leu app_secrets';
  assert teste.ve($q$select 1 from public.settings where value::text like '%nao-pode-vazar%'$q$) <= 0, 'A leu segredo em settings';
  -- escrever no que é da B
  assert teste.faz($q$update public.profiles set bio = 'hackeado' where id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) <= 0, 'A alterou o perfil da B';
  assert teste.faz($q$update public.posts set body = 'hackeado' where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) <= 0, 'A editou post da B';
  assert teste.faz($q$delete from public.posts where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) <= 0, 'A apagou post da B';
  assert teste.faz($q$insert into public.posts (user_id, body) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'em nome da B')$q$) <= 0, 'A postou em nome da B';
  assert teste.faz($q$insert into public.direct_messages (sender_id, receiver_id, body) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000a', 'falsa')$q$) <= 0, 'A mandou mensagem como B';
  assert teste.faz($q$delete from public.notifications where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$) <= 0, 'A apagou notificação da B';
  -- promover a si mesma ou ganhar coisas
  assert teste.faz($q$update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) <= 0
      or (select role from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a') <> 'admin', 'A virou admin';
  perform teste.faz($q$update public.profiles set xp = 999999, banned = false, call_minutos = 99999, stories_total = 9999, steam_conquistas = '{"falso":1}' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  assert (select xp from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a') < 999999, 'A alterou o próprio XP';
  assert coalesce((select call_minutos from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0) < 99999, 'A alterou os próprios minutos de call';
  assert coalesce((select stories_total from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0) < 9999, 'A alterou o próprio contador de stories';
  assert (select steam_conquistas from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a') is distinct from '{"falso":1}'::jsonb, 'A alterou as próprias conquistas da Steam';
  assert teste.faz($q$insert into public.user_cosmetics (user_id, cosmetic_id) select 'aaaaaaaa-0000-0000-0000-00000000000a', id from public.cosmetics limit 1$q$) <= 0, 'A deu um item para si';
  assert teste.faz($q$insert into public.xp_log (user_id, amount, reason) values ('aaaaaaaa-0000-0000-0000-00000000000a', 1000, 'x')$q$) <= 0, 'A escreveu no xp_log';
  -- funções privilegiadas
  assert teste.faz($q$select public.grant_cosmetic('aaaaaaaa-0000-0000-0000-00000000000a', (select id from public.cosmetics limit 1))$q$) = -1, 'A executou grant_cosmetic';
  assert teste.faz($q$select public.check_regras('aaaaaaaa-0000-0000-0000-00000000000a')$q$) = -1, 'A executou check_regras';
  assert teste.faz($q$select public.admin_aplicar_regras()$q$) = -1, 'A executou função de admin';
end $$;
reset role;

-- ---------- Storage: cada um só mexe na própria pasta ----------
grant select, insert, update, delete on storage.objects to anon, authenticated;
select set_config('cc.sistema', '1', true);
insert into storage.objects (bucket_id, name) values ('media', 'avatars/bbbbbbbb-0000-0000-0000-00000000000b/foto.webp');
select set_config('cc.sistema', '', true);
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ begin
  assert teste.faz($q$insert into storage.objects (bucket_id, name) values ('media', 'avatars/aaaaaaaa-0000-0000-0000-00000000000a/x.webp')$q$) = 1, 'A deveria enviar na própria pasta';
  assert teste.faz($q$insert into storage.objects (bucket_id, name) values ('media', 'avatars/bbbbbbbb-0000-0000-0000-00000000000b/x.webp')$q$) <= 0, 'A enviou arquivo na pasta da B';
  assert teste.faz($q$insert into storage.objects (bucket_id, name) values ('media', 'capas/x.webp')$q$) <= 0, 'A enviou arquivo fora da própria pasta';
  assert teste.faz($q$delete from storage.objects where name like 'avatars/bbbbbbbb%'$q$) <= 0, 'A apagou arquivo da B';
  assert teste.faz($q$update storage.objects set name = 'avatars/bbbbbbbb-0000-0000-0000-00000000000b/y.webp' where name like 'avatars/aaaaaaaa%'$q$) <= 0, 'A moveu arquivo para a pasta da B';
  assert teste.faz($q$delete from storage.objects where name like 'avatars/aaaaaaaa%'$q$) = 1, 'A deveria apagar o próprio arquivo';
end $$;
reset role;

-- ---------- Usuária B (dona) ----------
select teste.como('bbbbbbbb-0000-0000-0000-00000000000b');
do $$ begin
  assert teste.ve('select 1 from public.direct_messages') = 1, 'B deveria ver a mensagem recebida';
  assert teste.ve('select 1 from public.notifications where title = ''notificação da bia''') = 1, 'B deveria ver a própria notificação';
  assert teste.ve('select 1 from public.push_subscriptions') = 1, 'B deveria ver o próprio push';
  assert teste.ve('select 1 from public.stories') >= 1, 'B deveria ver o próprio story';
  -- quem recebe pode marcar como lida, mas não reescrever o texto
  perform teste.faz($q$update public.direct_messages set body = 'adulterado' where receiver_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$q$);
  assert (select body from public.direct_messages limit 1) = 'segredo da ana', 'quem recebe alterou o texto da mensagem';
end $$;
reset role;

-- ---------- Melhor amigo (moderador também) ----------
select teste.como('dddddddd-0000-0000-0000-00000000000d');
do $$ begin
  assert teste.ve('select 1 from public.stories where close_friends') = 1, 'melhor amigo deveria ver o story';
  assert teste.ve('select 1 from public.direct_messages') = 0, 'moderador leu DM de outras pessoas';
  assert teste.ve('select 1 from public.app_secrets') <= 0, 'moderador leu app_secrets';
  assert teste.faz($q$select public.admin_aplicar_regras()$q$) = -1, 'moderador executou função só de admin';
end $$;
reset role;

-- ---------- Banido ----------
select teste.como('eeeeeeee-0000-0000-0000-00000000000e');
do $$ begin
  assert teste.faz($q$insert into public.posts (user_id, body) values ('eeeeeeee-0000-0000-0000-00000000000e', 'spam')$q$) <= 0, 'banido conseguiu postar';
  assert teste.faz($q$insert into public.direct_messages (sender_id, receiver_id, body) values ('eeeeeeee-0000-0000-0000-00000000000e', 'aaaaaaaa-0000-0000-0000-00000000000a', 'spam')$q$) <= 0, 'banido mandou mensagem';
  assert teste.faz($q$update public.profiles set banned = false where id = 'eeeeeeee-0000-0000-0000-00000000000e'$q$) <= 0
      or (select banned from public.profiles where id = 'eeeeeeee-0000-0000-0000-00000000000e'), 'banido se desbaniu';
end $$;
reset role;


-- ---------- Achados da auditoria (fase 3) ----------
select set_config('cc.sistema', '1', true);
insert into public.communities (id, name, owner_id, is_private) values (900002, 'Pública de teste', 'bbbbbbbb-0000-0000-0000-00000000000b', false);
insert into public.community_members (community_id, user_id) values (900001, 'bbbbbbbb-0000-0000-0000-00000000000b') on conflict do nothing;
insert into public.games (id, slug, title) values (900001, 'jogo-teste-rls', 'Jogo Teste RLS') on conflict do nothing;
select set_config('cc.sistema', '', true);
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ declare xp0 int; xp1 int; begin
  -- H1: não dá para entrar como moderador
  assert teste.faz($q$insert into public.community_members (community_id, user_id, role) values (900002, 'aaaaaaaa-0000-0000-0000-00000000000a', 'mod')$q$) <= 0, 'A entrou como moderadora';
  assert teste.faz($q$insert into public.community_members (community_id, user_id) values (900002, 'aaaaaaaa-0000-0000-0000-00000000000a')$q$) = 1, 'A deveria entrar como membro';
  -- M1: membros de comunidade privada não aparecem para quem é de fora
  assert teste.ve('select 1 from public.community_members where community_id = 900001') = 0, 'A viu membros da comunidade privada';
  -- H3: contadores e campos do servidor
  perform teste.faz($q$insert into public.posts (user_id, body, likes_count, comments_count, created_at) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'post A', 999999, 999, '2000-01-01')$q$);
  assert (select likes_count from public.posts where body = 'post A') = 0, 'A inseriu post com curtidas falsas';
  assert (select created_at from public.posts where body = 'post A') > now() - interval '1 minute', 'A antedatou o post';
  perform teste.faz($q$insert into public.reviews (game_id, user_id, rating, helpful_count) values (900001, 'aaaaaaaa-0000-0000-0000-00000000000a', 5, 500)$q$);
  assert coalesce((select helpful_count from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0) = 0, 'A inseriu crítica com votos falsos';
  perform teste.faz($q$update public.reviews set helpful_count = 500, game_id = 1 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  assert coalesce((select helpful_count from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0) = 0, 'A alterou votos da crítica';
  assert (select game_id from public.reviews where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') = 900001, 'A moveu a crítica para outro jogo';
  perform teste.faz($q$insert into public.user_games (user_id, game_id, status, ach_done, ach_total) values ('aaaaaaaa-0000-0000-0000-00000000000a', 900001, 'jogando', 50, 50)$q$);
  assert (select ach_done from public.user_games where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and game_id = 900001) is null, 'A inventou conquistas da Steam';
  perform teste.faz($q$update public.user_games set ach_done = 50, ach_total = 50 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  assert (select ach_done from public.user_games where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and game_id = 900001) is null, 'A alterou conquistas da Steam';
  assert teste.faz($q$update public.user_games set hours = 999999 where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) = -1, 'A colocou horas impossíveis';
  -- M4: vitrine só com itens próprios; data de cadastro
  assert teste.faz($q$update public.profiles set showcase = array['f_lenda'] where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) = -1, 'A exibiu item que não tem';
  perform teste.faz($q$update public.profiles set created_at = '2000-01-01' where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$);
  assert (select created_at from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a') > '2001-01-01', 'A mudou a data de cadastro';
  -- H4: postar e apagar não farma XP (máximo 5 posts com XP por dia)
  select xp into xp0 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  for i in 1..4 loop
    perform teste.faz($q$insert into public.posts (user_id, body) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'farm')$q$);
    perform teste.faz($q$delete from public.posts where body = 'farm'$q$);
  end loop;
  select xp into xp1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  assert xp1 - xp0 <= 20, format('farm de XP: ganhou %s', xp1 - xp0);
  -- M8: limite de spam (5 posts por minuto)
  for i in 1..6 loop perform teste.faz($q$insert into public.posts (user_id, body) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'spam')$q$); end loop;
  assert (select count(*) from public.posts where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a' and created_at > now() - interval '1 minute') <= 5, 'A passou do limite de posts por minuto';
  -- L2: reagir a story só de melhores amigos
  assert teste.faz($q$select public.react_story((select id from public.stories where close_friends limit 1), '🔥')$q$) = -1, 'A reagiu a story de melhores amigos';
end $$;
reset role;
select teste.como(null);
do $$ begin
  -- M3: visitante não aceita pedidos em comunidade sem dono
  assert teste.faz($q$select public.answer_join_request(900001, 'aaaaaaaa-0000-0000-0000-00000000000a', true)$q$) = -1, 'visitante respondeu pedido de comunidade';
  assert teste.faz($q$select public.cleanup_lfg()$q$) = -1, 'visitante executou cleanup_lfg';
  assert teste.ve('select 1 from storage.objects') <= 0, 'visitante listou o bucket';
end $$;
reset role;


-- ---------- Procurando grupo e onboarding (fase 6) ----------
select set_config('cc.sistema', '1', true);
insert into public.friendships (user_a, user_b, requester, status) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'dddddddd-0000-0000-0000-00000000000d', 'bbbbbbbb-0000-0000-0000-00000000000b', 'aceita') on conflict do nothing;
insert into public.lfg_posts (id, user_id, slots, visibility, expires_at) values
  (900001, 'bbbbbbbb-0000-0000-0000-00000000000b', 1, 'publico', now() + interval '1 hour'),
  (900002, 'bbbbbbbb-0000-0000-0000-00000000000b', 3, 'amigos', now() + interval '1 hour');
select set_config('cc.sistema', '', true);
select teste.como(null);
do $$ begin
  assert teste.ve('select 1 from public.lfg_posts where id = 900001') = 1, 'visitante deveria ver grupo público';
  assert teste.ve('select 1 from public.lfg_posts where id = 900002') = 0, 'visitante viu grupo só de amigos';
end $$;
reset role;
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ begin
  assert teste.ve('select 1 from public.lfg_posts where id = 900002') = 0, 'quem não é amigo viu grupo só de amigos';
  assert teste.faz($q$insert into public.lfg_interest (lfg_id, user_id) values (900002, 'aaaaaaaa-0000-0000-0000-00000000000a')$q$) <= 0, 'entrou em grupo só de amigos';
  assert teste.faz($q$insert into public.lfg_interest (lfg_id, user_id) values (900001, 'aaaaaaaa-0000-0000-0000-00000000000a')$q$) = 1, 'deveria entrar no grupo público';
  assert teste.faz($q$insert into public.lfg_posts (user_id, starts_at, expires_at) values ('aaaaaaaa-0000-0000-0000-00000000000a', now() + interval '3 days', now() + interval '3 days 1 hour')$q$) <= 0, 'criou grupo para daqui a 3 dias';
  assert teste.faz($q$insert into public.lfg_posts (user_id, starts_at, expires_at) values ('aaaaaaaa-0000-0000-0000-00000000000a', now(), now() + interval '10 hours')$q$) <= 0, 'criou grupo de 10 horas';
  assert teste.faz($q$insert into public.lfg_posts (user_id, starts_at, expires_at, mic, crossplay) values ('aaaaaaaa-0000-0000-0000-00000000000a', now() + interval '2 hours', now() + interval '4 hours', 'obrigatorio', true)$q$) = 1, 'deveria criar grupo agendado';
  -- XP de boas-vindas só uma vez
  assert (select public.concluir_onboarding()) = 25, 'boas-vindas deveria dar XP';
  assert (select public.concluir_onboarding()) = 0, 'boas-vindas deu XP de novo';
  assert teste.faz($q$update public.profiles set plataformas = array['Atari'] where id = 'aaaaaaaa-0000-0000-0000-00000000000a'$q$) = -1, 'aceitou plataforma inválida';
end $$;
reset role;
select teste.como('dddddddd-0000-0000-0000-00000000000d');
do $$ begin
  assert teste.ve('select 1 from public.lfg_posts where id = 900002') = 1, 'amigo deveria ver o grupo só de amigos';
  assert teste.faz($q$insert into public.lfg_interest (lfg_id, user_id) values (900001, 'dddddddd-0000-0000-0000-00000000000d')$q$) <= 0, 'entrou em grupo cheio';
end $$;
reset role;


-- ---------- Bloqueio e moderação ----------
select teste.como('bbbbbbbb-0000-0000-0000-00000000000b');
do $$ begin
  assert teste.faz($q$insert into public.user_blocks (blocker_id, blocked_id) values ('bbbbbbbb-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000a')$q$) = 1, 'B deveria bloquear A';
  assert teste.faz($q$insert into public.user_blocks (blocker_id, blocked_id) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-00000000000d')$q$) <= 0, 'B criou bloqueio em nome de A';
end $$;
reset role;
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ begin
  assert teste.ve('select 1 from public.user_blocks') = 0, 'A descobriu que foi bloqueada';
  assert teste.faz($q$insert into public.follows (follower_id, followed_id) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b')$q$) <= 0, 'A seguiu quem a bloqueou';
  assert teste.faz($q$insert into public.post_comments (post_id, user_id, body) select id, 'aaaaaaaa-0000-0000-0000-00000000000a', 'oi' from public.posts where user_id = 'bbbbbbbb-0000-0000-0000-00000000000b' and community_id is null limit 1$q$) <= 0, 'A comentou no post de quem a bloqueou';
  assert teste.faz($q$insert into public.appeals (user_id, texto) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'texto de apelação válido')$q$) = 1, 'A deveria poder apelar';
  assert teste.faz($q$insert into public.appeals (user_id, texto) values ('aaaaaaaa-0000-0000-0000-00000000000a', 'segunda apelação no mesmo dia')$q$) <= 0, 'A apelou duas vezes na semana';
  assert teste.faz($q$update public.appeals set status = 'aceita'$q$) <= 0, 'A aceitou a própria apelação';
end $$;
reset role;

-- ---------- Contador de membros (fase 9) ----------
do $$ begin
  assert (select members_count from public.communities where id = 900002) = (select count(*) from public.community_members where community_id = 900002),
    'contador de membros não acompanha quem entra';
  assert (select count(*) from public.community_members where community_id = 900002) >= 1, 'teste sem membros';
end $$;

-- ---------- Observabilidade (fase 15) ----------
select teste.como(null);
do $$ begin
  perform public.registrar_erro('js', '/x.html?token=abc', 'falhou para fulano@email.com');
  assert teste.ve('select 1 from public.client_errors') <= 0, 'visitante leu os erros registrados';
  assert teste.ve('select 1 from public.robot_runs') <= 0, 'visitante leu o status dos robôs';
  assert teste.faz($q$insert into public.client_errors (assinatura, categoria, pagina, mensagem) values ('x', 'js', '/', 'x')$q$) <= 0, 'visitante gravou erro direto na tabela';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.client_errors where pagina = '/x.html' and mensagem like '%***@***%'), 'erro não foi registrado limpo';
  assert not exists (select 1 from public.client_errors where mensagem like '%fulano%' or pagina like '%token%'), 'dado pessoal ficou no registro de erro';
end $$;

-- ---------- Métricas (fase 17) ----------
select teste.como(null);
do $$ begin
  perform public.contar_evento('visita');
  perform public.contar_evento('evento_inventado');
  assert teste.ve('select 1 from public.metric_daily') <= 0, 'visitante leu as métricas';
  assert teste.faz('select public.metricas_produto(28)') = -1, 'visitante viu os indicadores';
end $$;
reset role;
select teste.como('aaaaaaaa-0000-0000-0000-00000000000a');
do $$ begin assert teste.faz('select public.metricas_produto(28)') = -1, 'usuária comum viu os indicadores'; end $$;
reset role;
do $$ begin
  assert (select total from public.metric_daily where evento = 'visita' and dia = current_date) >= 1, 'evento não contado';
  assert not exists (select 1 from public.metric_daily where evento = 'evento_inventado'), 'evento desconhecido gravado';
end $$;

-- ---------- Admin ----------
select teste.como('cccccccc-0000-0000-0000-00000000000c');
do $$ begin
  assert teste.ve('select 1 from public.posts where community_id = 900001') = 1, 'admin deveria moderar comunidade privada';
  assert teste.ve('select 1 from public.direct_messages') = 0, 'admin não deve ler DMs alheias';
  assert (select (public.metricas_produto(28) ->> 'novos_cadastros')::int) >= 0, 'admin deveria ver os indicadores';
end $$;
reset role;

-- ---------- Privilégios de execução: nenhuma função security definer sem search_path ----------
do $$ declare n integer; begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  assert n = 0, format('%s função(ões) security definer sem search_path', n);
end $$;

rollback;
\echo 'RLS: todos os testes passaram'
