-- Fase 3: correções de RLS e privilégios encontradas pelos testes em tests/rls.sql. Idempotente.

-- 1) Mensagens diretas: quem recebe só pode marcar como lida (não pode reescrever texto, remetente ou destinatário)
create or replace function public.protect_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('cc.sistema', true), '') in ('1', 'on') then return new; end if;
  if new.body is distinct from old.body or new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id or new.created_at is distinct from old.created_at then
    raise exception 'Só é possível marcar a mensagem como lida.';
  end if;
  return new;
end $$;
drop trigger if exists direct_messages_protect on public.direct_messages;
create trigger direct_messages_protect before update on public.direct_messages
  for each row execute function public.protect_dm();

-- 2) Storage (bucket media): limite de tamanho e tipos aceitos no próprio bucket (antes só o site conferia)
--    50 MB = limite do plano grátis por arquivo; imagens e os vídeos que o site aceita.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set file_size_limit = 52428800,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime']
     where id = 'media';
  end if;
end $$;

-- 3) Cada pessoa pode apagar os próprios arquivos (pasta avatars/<id>/), ex.: ao trocar a foto ou excluir um story
drop policy if exists media_avatar_delete on storage.objects;
create policy media_avatar_delete on storage.objects for delete
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);
-- e o update só vale dentro da própria pasta também depois de alterar (with check)
drop policy if exists media_avatar_update on storage.objects;
create policy media_avatar_update on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- 4) Storage: a política de leitura só servia para LISTAR o bucket (arquivos de bucket público abrem pela URL
--    sem ela). Sem listagem, ninguém descobre nomes de arquivos de outras pessoas (ex.: stories de melhores amigos).
drop policy if exists media_read on storage.objects;
-- cada pessoa continua vendo (listando) só a própria pasta, o que também é exigido para apagar/substituir
drop policy if exists media_own_read on storage.objects;
create policy media_own_read on storage.objects for select
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);

-- 5) Comunidades: entrar como membro comum (não dá para se colocar como moderador)
drop policy if exists members_join on public.community_members;
create policy members_join on public.community_members for insert with check (
  user_id = auth.uid() and is_active_user() and coalesce(role, 'member') = 'member'
  and not coalesce((select is_private from communities c where c.id = community_id), false));
-- quem é membro de comunidade privada só aparece para membros e equipe
drop policy if exists members_read on public.community_members;
create policy members_read on public.community_members for select using (can_see_community(community_id));
-- eventos de comunidade privada: só membros entram
drop policy if exists att_join on public.event_attendees;
create policy att_join on public.event_attendees for insert with check (
  user_id = auth.uid() and is_active_user()
  and exists (select 1 from events e where e.id = event_id and (e.community_id is null or can_see_community(e.community_id))));
-- quem cria o evento não pode movê-lo para outra comunidade nem mexer no controle de lembretes
create or replace function public.protect_event() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not is_staff()
     and (new.community_id is distinct from old.community_id or new.reminded is distinct from old.reminded) then
    raise exception 'Não é possível mover o evento ou alterar o lembrete.';
  end if;
  return new;
end $$;
drop trigger if exists events_protect on public.events;
create trigger events_protect before update on public.events for each row execute function public.protect_event();

-- 6) Colunas que só o servidor grava. Os gatilhos abaixo são SECURITY INVOKER de propósito: current_user é
--    'authenticated'/'anon' só quando o pedido vem direto do site; dentro das funções do banco é o dono.
create or replace function public.protect_posts_cols() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.likes_count := 0; new.comments_count := 0; new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists posts_protect_cols on public.posts;
create trigger posts_protect_cols before insert on public.posts for each row execute function public.protect_posts_cols();

create or replace function public.protect_reviews_cols() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.helpful_count := 0; new.comments_count := 0; new.created_at := now();
    elsif not is_staff() then
      new.game_id := old.game_id; new.user_id := old.user_id; new.helpful_count := old.helpful_count;
      new.comments_count := old.comments_count; new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reviews_protect_cols on public.reviews;
create trigger reviews_protect_cols before insert or update on public.reviews for each row execute function public.protect_reviews_cols();

-- Biblioteca: conquistas e "jogado recentemente" vêm só da Steam (pelo servidor). A pessoa pode apagar (null),
-- mas não inventar. Horas continuam editáveis (jogos fora da Steam), com teto realista.
create or replace function public.protect_user_games_cols() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.ach_done := null; new.ach_total := null; new.hours_2weeks := null; new.last_played := null;
    else
      if new.ach_done is not null then new.ach_done := old.ach_done; end if;
      if new.ach_total is not null then new.ach_total := old.ach_total; end if;
      if new.hours_2weeks is not null then new.hours_2weeks := old.hours_2weeks; end if;
      if new.last_played is not null then new.last_played := old.last_played; end if;
    end if;
    if new.hours is not null and (new.hours < 0 or new.hours > 30000) then raise exception 'Horas inválidas.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists user_games_protect_cols on public.user_games;
create trigger user_games_protect_cols before insert or update on public.user_games for each row execute function public.protect_user_games_cols();

-- Perfil: data de cadastro, aceite dos termos (depois de registrado) e vitrine só com itens que a pessoa tem
create or replace function public.protect_profile_extra() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not is_admin() then
    new.created_at := old.created_at;
    if old.accepted_terms_at is not null then new.accepted_terms_at := old.accepted_terms_at; end if;
    if new.showcase is distinct from old.showcase and new.showcase is not null
       and exists (select 1 from unnest(new.showcase) x
                   where not exists (select 1 from user_cosmetics uc where uc.user_id = new.id and uc.cosmetic_id = x)) then
      raise exception 'A vitrine só pode ter itens que você conquistou.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_extra on public.profiles;
create trigger profiles_protect_extra before update on public.profiles for each row execute function public.protect_profile_extra();

-- 7) XP sem farm: o limite diário conta o histórico de XP (apagar o post não "devolve" a vaga),
--    comunidade criada vale XP no máximo 1 vez por semana e o voto útil vale XP uma única vez por pessoa.
create or replace function public.posts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from xp_log where user_id = new.user_id and reason = 'post' and created_at > now() - interval '1 day') < 5 then
    perform add_xp(new.user_id, 5, 'post');
  end if;
  return null;
end $$;

create or replace function public.communities_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into community_members (community_id, user_id) values (new.id, new.owner_id) on conflict do nothing;
    if not exists (select 1 from xp_log where user_id = new.owner_id and reason = 'comunidade criada' and created_at > now() - interval '7 days') then
      perform add_xp(new.owner_id, 20, 'comunidade criada');
    end if;
  end if;
  return null;
end $$;

create table if not exists public.review_vote_xp (
  review_id bigint not null, voter_id uuid not null, primary key (review_id, voter_id)
);
alter table public.review_vote_xp enable row level security;
revoke all on public.review_vote_xp from anon, authenticated;

create or replace function public.review_votes_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid bigint := coalesce(new.review_id, old.review_id); autor uuid; total int; primeira boolean;
begin
  update reviews set helpful_count = (select count(*) from review_votes where review_id = rid) where id = rid
    returning user_id into autor;
  if tg_op = 'INSERT' then
    insert into review_vote_xp (review_id, voter_id) values (rid, new.user_id) on conflict do nothing returning true into primeira;
    if coalesce(primeira, false) then perform add_xp(autor, 2, 'crítica útil'); end if;
    select coalesce(sum(helpful_count), 0) into total from reviews where user_id = autor;
    if total >= 10 then perform grant_cosmetic(autor, 's_util10'); end if;
    if total >= 100 then perform grant_cosmetic(autor, 's_util100'); end if;
  end if;
  return null;
end $$;

-- 8) Limites contra spam (por pessoa, por minuto). Mensagem clara para o site mostrar.
create or replace function public.limite_insercao() returns trigger
language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; maximo int := tg_argv[1]::int; n int; quem uuid;
begin
  if coalesce(current_setting('cc.sistema', true), '') in ('1', 'on') then return new; end if;
  quem := (to_jsonb(new) ->> col)::uuid;
  if quem is null or quem <> auth.uid() then return new; end if; -- inserções do próprio banco não contam
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - interval ''1 minute''', tg_table_schema, tg_table_name, col)
    into n using quem;
  if n >= maximo then raise exception 'Calma! Você está fazendo isso rápido demais. Espere um minuto.'; end if;
  return new;
end $$;
do $$ declare t record; begin
  for t in select * from (values ('posts','user_id',5), ('post_comments','user_id',15), ('review_comments','user_id',15),
                                 ('direct_messages','sender_id',30), ('reports','reporter_id',5), ('follows','follower_id',30),
                                 ('lfg_interest','user_id',20), ('story_reactions','user_id',30)) v(tab, col, maximo) loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t.tab and column_name = 'created_at') then
      execute format('drop trigger if exists %I on public.%I', t.tab || '_limite', t.tab);
      execute format('create trigger %I before insert on public.%I for each row execute function public.limite_insercao(%L, %L)', t.tab || '_limite', t.tab, t.col, t.maximo);
    end if;
  end loop;
end $$;

-- 9) Funções internas que não devem ser chamadas pelo site
revoke execute on function public.cleanup_lfg() from public, anon, authenticated;
revoke execute on function public.refresh_game_rating(int) from public, anon, authenticated;
revoke execute on function public.answer_join_request(bigint, uuid, boolean) from public, anon;
grant execute on function public.answer_join_request(bigint, uuid, boolean) to authenticated;

-- 10) Comunidade sem dono não pode ter pedidos aceitos por qualquer um; stories de melhores amigos não
--     aceitam reação/resposta de quem não está na lista
create or replace function public.answer_join_request(cid bigint, uid uuid, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  select * into c from communities where id = cid;
  if c.id is null then raise exception 'Comunidade não encontrada.'; end if;
  if (c.owner_id is null or c.owner_id <> auth.uid()) and not is_staff() then raise exception 'Só o dono da comunidade pode responder.'; end if;
  if not exists (select 1 from community_requests where community_id = cid and user_id = uid) then raise exception 'Pedido não encontrado.'; end if;
  delete from community_requests where community_id = cid and user_id = uid;
  if aceitar then
    insert into community_members (community_id, user_id) values (cid, uid) on conflict do nothing;
    insert into notifications (user_id, type, title, link) values (uid, 'request', 'Você entrou em ' || c.name || '! 🎉', 'comunidade.html?id=' || cid);
  end if;
end $$;

create or replace function public.react_story(sid bigint, e text) returns void
language plpgsql security definer set search_path = public as $$
declare s stories; quem text; novo boolean;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta.'; end if;
  select * into s from stories where id = sid and expires_at > now();
  if s.id is null or (s.close_friends and s.user_id <> auth.uid() and not is_close_friend(s.user_id)) then raise exception 'Story não encontrado.'; end if;
  if s.id is null then raise exception 'Story não encontrado.'; end if;
  if s.user_id = auth.uid() then return; end if;
  novo := not exists (select 1 from story_reactions where story_id = sid and user_id = auth.uid());
  insert into story_reactions (story_id, user_id, emoji) values (sid, auth.uid(), e)
    on conflict (story_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  if novo then
    select username into quem from profiles where id = auth.uid();
    insert into notifications (user_id, type, title, body, link)
    values (s.user_id, 'story', e || ' @' || quem || ' reagiu ao seu story', coalesce(left(s.caption, 80), ''), 'perfil.html?u=' || quem);
  end if;
end $$;

create or replace function public.answer_story(sid bigint, texto text) returns void
language plpgsql security definer set search_path = public as $$
declare s stories; quem text;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta.'; end if;
  if char_length(coalesce(trim(texto), '')) not between 1 and 300 then raise exception 'Resposta de 1 a 300 caracteres.'; end if;
  select * into s from stories where id = sid and expires_at > now();
  if s.id is null or (s.close_friends and s.user_id <> auth.uid() and not is_close_friend(s.user_id)) then raise exception 'Story não encontrado.'; end if;
  if s.id is null or s.question is null then raise exception 'Story não encontrado.'; end if;
  select username into quem from profiles where id = auth.uid();
  insert into notifications (user_id, type, title, body, link)
  values (s.user_id, 'story', '💬 @' || quem || ' respondeu: ' || left(s.question, 60), left(trim(texto), 300), 'perfil.html?u=' || quem);
end $$;

-- Rollback: ver supabase/migrations/ROLLBACK.md
