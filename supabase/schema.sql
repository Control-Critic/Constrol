-- =====================================================================
-- Control Critic - esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma única vez).
-- Depois rode supabase/seed.sql para carregar categorias e jogos.
-- =====================================================================

-- ---------- Perfis ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null check (char_length(username) between 3 and 30),
  avatar_url  text,
  bio         text check (char_length(bio) <= 300),
  role        text not null default 'user' check (role in ('user','moderator','admin')),
  xp          integer not null default 0,
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Funções de permissão ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not banned);
$$;

-- ---------- Catálogo ----------
create table if not exists public.categories (
  id    serial primary key,
  name  text not null unique,
  slug  text not null unique
);

create table if not exists public.games (
  id             serial primary key,
  slug           text not null unique,
  title          text not null,
  description    text,
  cover_url      text,
  release_year   integer,
  category_id    integer references public.categories(id) on delete set null,
  featured       boolean not null default false,
  store_ps       text,
  store_xbox     text,
  store_steam    text,
  store_nintendo text,
  avg_rating     numeric(3,2) not null default 0,
  reviews_count  integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.reviews (
  id          bigserial primary key,
  game_id     integer not null references public.games(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 2000),
  status      text not null default 'published' check (status in ('published','hidden')),
  created_at  timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists public.news (
  id            bigserial primary key,
  title         text not null,
  body          text not null,
  cover_url     text,
  game_id       integer references public.games(id) on delete set null,
  published     boolean not null default false,
  author_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- Comunidades ----------
create table if not exists public.communities (
  id             bigserial primary key,
  name           text not null check (char_length(name) between 3 and 60),
  description    text check (char_length(description) <= 500),
  game_id        integer references public.games(id) on delete set null,
  owner_id       uuid references public.profiles(id) on delete set null,
  discord_invite text check (discord_invite is null or discord_invite ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]+$'),
  discord_guild_id text check (discord_guild_id is null or discord_guild_id ~ '^[0-9]{15,22}$'),
  members_count  integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id  bigint not null references public.communities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.posts (
  id            bigserial primary key,
  community_id  bigint not null references public.communities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  status        text not null default 'published' check (status in ('published','hidden')),
  created_at    timestamptz not null default now()
);

-- ---------- Contato ----------
create table if not exists public.contact_messages (
  id          bigserial primary key,
  name        text not null,
  email       text not null,
  age         integer check (age between 13 and 120),
  message     text not null check (char_length(message) <= 3000),
  status      text not null default 'novo' check (status in ('novo','lido','respondido')),
  created_at  timestamptz not null default now()
);

create index if not exists reviews_game_idx on public.reviews(game_id);
create index if not exists posts_comm_idx on public.posts(community_id, created_at desc);
create index if not exists games_cat_idx on public.games(category_id);

-- =====================================================================
-- AUTOMAÇÕES (triggers)
-- =====================================================================

-- 1) Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'jogador'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    n := n + 1; candidate := base || n;
  end loop;
  insert into profiles (id, username) values (new.id, candidate);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Usuário comum não pode mudar o próprio papel, XP ou banimento
-- (sem security definer: auth.uid() só é nulo no SQL Editor / service_role, que podem tudo)
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.role := old.role; new.xp := old.xp; new.banned := old.banned;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3) XP: +10 por avaliação, +5 por post, +20 por criar comunidade
create or replace function public.add_xp(uid uuid, amount int) returns void
language sql security definer set search_path = public as $$
  update profiles set xp = greatest(0, xp + amount) where id = uid;
$$;
revoke execute on function public.add_xp(uuid,int) from public, anon, authenticated;

-- 4) Recalcula média e total de avaliações do jogo
create or replace function public.refresh_game_rating(gid int) returns void
language sql security definer set search_path = public as $$
  update games g set
    avg_rating    = coalesce((select round(avg(rating)::numeric, 2) from reviews where game_id = gid and status = 'published'), 0),
    reviews_count = (select count(*) from reviews where game_id = gid and status = 'published')
  where g.id = gid;
$$;

create or replace function public.reviews_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform add_xp(new.user_id, 10, 'avaliação');
    perform refresh_game_rating(new.game_id);
  elsif tg_op = 'UPDATE' then
    perform refresh_game_rating(new.game_id);
  elsif tg_op = 'DELETE' then
    perform add_xp(old.user_id, -10, 'avaliação removida');
    perform refresh_game_rating(old.game_id);
  end if;
  return null;
end $$;

drop trigger if exists reviews_changed on public.reviews;
create trigger reviews_changed after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- 5) Posts dão XP
create or replace function public.posts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform add_xp(new.user_id, 5, 'post'); return null; end $$;

drop trigger if exists posts_inserted on public.posts;
create trigger posts_inserted after insert on public.posts
  for each row execute function public.posts_after_insert();

-- 6) Contador de membros
create or replace function public.members_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid bigint := coalesce(new.community_id, old.community_id);
begin
  update communities set members_count = (select count(*) from community_members where community_id = cid) where id = cid;
  return null;
end $$;

drop trigger if exists members_changed on public.community_members;
create trigger members_changed after insert or delete on public.community_members
  for each row execute function public.members_after_change();

-- 7) Quem cria a comunidade vira dono e membro automaticamente
create or replace function public.communities_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.owner_id := auth.uid(); new.members_count := 0; return new; end $$;

create or replace function public.communities_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into community_members (community_id, user_id) values (new.id, new.owner_id) on conflict do nothing;
    perform add_xp(new.owner_id, 20, 'comunidade criada');
  end if;
  return null;
end $$;

drop trigger if exists communities_bi on public.communities;
create trigger communities_bi before insert on public.communities
  for each row execute function public.communities_before_insert();
drop trigger if exists communities_ai on public.communities;
create trigger communities_ai after insert on public.communities
  for each row execute function public.communities_after_insert();

-- 7b) Dono não altera contador nem transfere a comunidade (só a equipe)
create or replace function public.communities_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.owner_id := old.owner_id; new.members_count := old.members_count;
  end if;
  return new;
end $$;
drop trigger if exists communities_bu on public.communities;
create trigger communities_bu before update on public.communities
  for each row execute function public.communities_before_update();

-- 8) Autor da notícia preenchido automaticamente
create or replace function public.news_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.author_id := auth.uid(); return new; end $$;
drop trigger if exists news_bi on public.news;
create trigger news_bi before insert on public.news
  for each row execute function public.news_before_insert();

-- 9) Estatísticas para o painel de admin
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'acesso negado'; end if;
  return json_build_object(
    'users',        (select count(*) from profiles),
    'users_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'games',        (select count(*) from games),
    'reviews',      (select count(*) from reviews),
    'reviews_7d',   (select count(*) from reviews where created_at > now() - interval '7 days'),
    'communities',  (select count(*) from communities),
    'posts',        (select count(*) from posts),
    'messages_new', (select count(*) from contact_messages where status = 'novo'),
    'top_games',    (select coalesce(json_agg(t), '[]'::json) from (
                       select title, avg_rating, reviews_count from games
                       where reviews_count > 0 order by avg_rating desc, reviews_count desc limit 5) t)
  );
end $$;

-- =====================================================================
-- SEGURANÇA (Row Level Security)
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.games             enable row level security;
alter table public.reviews           enable row level security;
alter table public.news              enable row level security;
alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.posts             enable row level security;
alter table public.contact_messages  enable row level security;

-- Perfis: todos leem; cada um edita o seu; admin edita todos
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- Categorias e jogos: leitura pública, escrita só admin
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (is_admin()) with check (is_admin());

drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (true);
drop policy if exists games_admin on public.games;
create policy games_admin on public.games for all using (is_admin()) with check (is_admin());

-- Avaliações
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (status = 'published' or user_id = auth.uid() or is_staff());
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (user_id = auth.uid() and is_active_user() and status = 'published');
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
  using (user_id = auth.uid() and status = 'published') with check (user_id = auth.uid() and status = 'published');
drop policy if exists reviews_staff on public.reviews;
create policy reviews_staff on public.reviews for update using (is_staff()) with check (is_staff());
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete using (user_id = auth.uid() or is_staff());

-- Notícias
drop policy if exists news_read on public.news;
create policy news_read on public.news for select using (published or is_staff());
drop policy if exists news_staff on public.news;
create policy news_staff on public.news for all using (is_staff()) with check (is_staff());

-- Comunidades
drop policy if exists communities_read on public.communities;
create policy communities_read on public.communities for select using (true);
drop policy if exists communities_insert on public.communities;
create policy communities_insert on public.communities for insert with check (auth.uid() is not null and is_active_user());
drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities for update
  using (owner_id = auth.uid() or is_staff()) with check (owner_id = auth.uid() or is_staff());
drop policy if exists communities_delete on public.communities;
create policy communities_delete on public.communities for delete using (owner_id = auth.uid() or is_staff());

drop policy if exists members_read on public.community_members;
create policy members_read on public.community_members for select using (true);
drop policy if exists members_join on public.community_members;
create policy members_join on public.community_members for insert with check (user_id = auth.uid() and is_active_user());
drop policy if exists members_leave on public.community_members;
create policy members_leave on public.community_members for delete using (user_id = auth.uid() or is_staff());

-- Posts: só membros publicam
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (status = 'published' or user_id = auth.uid() or is_staff());
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (
  user_id = auth.uid() and is_active_user() and status = 'published'
  and exists (select 1 from community_members m where m.community_id = posts.community_id and m.user_id = auth.uid()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (user_id = auth.uid() or is_staff());
drop policy if exists posts_staff on public.posts;
create policy posts_staff on public.posts for update using (is_staff()) with check (is_staff());

-- Contato: qualquer um envia, só a equipe lê
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert with check (status = 'novo');
drop policy if exists contact_staff on public.contact_messages;
create policy contact_staff on public.contact_messages for all using (is_staff()) with check (is_staff());

-- =====================================================================
-- STORAGE: bucket público para capas e avatares
-- =====================================================================
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_admin on storage.objects;
create policy media_admin on storage.objects for all
  using (bucket_id = 'media' and is_admin()) with check (bucket_id = 'media' and is_admin());
drop policy if exists media_avatar on storage.objects;
create policy media_avatar on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists media_avatar_update on storage.objects;
create policy media_avatar_update on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- =====================================================================
-- NOTÍCIAS AUTOMÁTICAS, PROMOÇÕES E RECOMENDAÇÕES
-- =====================================================================
alter table public.games    add column if not exists steam_appid integer;
alter table public.news     add column if not exists source text;          -- ex.: 'PlayStation Blog' (null = escrita pela equipe)
alter table public.news     add column if not exists source_url text unique;
alter table public.news     add column if not exists summary text;
alter table public.profiles add column if not exists fav_categories integer[] not null default '{}';

create table if not exists public.deals (
  id             bigserial primary key,
  game_id        integer not null references public.games(id) on delete cascade,
  store          text not null check (store in ('steam','playstation','xbox','nintendo','outra')),
  price_cents    integer,
  original_cents integer,
  discount_pct   integer not null default 0 check (discount_pct between 0 and 100),
  url            text,
  ends_at        timestamptz,
  auto           boolean not null default false,   -- true = atualizada pelo robô
  updated_at     timestamptz not null default now(),
  unique (game_id, store)
);
alter table public.deals enable row level security;
drop policy if exists deals_read on public.deals;
create policy deals_read on public.deals for select using (true);
drop policy if exists deals_admin on public.deals;
create policy deals_admin on public.deals for all using (is_staff()) with check (is_staff());

-- Configurações do robô (editáveis no painel de admin)
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);
alter table public.settings enable row level security;
drop policy if exists settings_staff on public.settings;
create policy settings_staff on public.settings for all using (is_admin()) with check (is_admin());
insert into public.settings (key, value) values
  ('auto_publish_news', 'true'::jsonb),
  ('feeds', '[
     {"name":"PlayStation Blog","url":"https://blog.br.playstation.com/feed/"},
     {"name":"Xbox Wire","url":"https://news.xbox.com/pt-br/feed/"}
   ]'::jsonb),
  ('last_sync', 'null'::jsonb)
on conflict (key) do nothing;

-- Recomendações: jogos das categorias favoritas e das que o usuário avaliou bem,
-- excluindo os que ele já avaliou. Sem dados, cai nos mais bem avaliados.
create or replace function public.recommend_games(lim int default 8)
returns setof public.games
language sql stable security definer set search_path = public as $$
  with gostos as (
    select unnest(fav_categories) as cat, 3 as peso from profiles where id = auth.uid()
    union all
    select g.category_id, r.rating - 2 from reviews r join games g on g.id = r.game_id
     where r.user_id = auth.uid() and r.rating >= 4 and g.category_id is not null
  ), pontos as (
    select cat, sum(peso) as score from gostos group by cat
  )
  select g.* from games g
  left join pontos p on p.cat = g.category_id
  where not exists (select 1 from reviews r where r.game_id = g.id and r.user_id = auth.uid())
  order by coalesce(p.score, 0) desc, g.avg_rating desc, g.reviews_count desc, g.id
  limit lim;
$$;

-- Posts aparecem em tempo real nas comunidades
do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- PERFIL: banner e contas de jogo (rode de novo este arquivo para aplicar)
-- =====================================================================
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists psn_id text check (psn_id is null or char_length(psn_id) <= 30);
alter table public.profiles add column if not exists xbox_gamertag text check (xbox_gamertag is null or char_length(xbox_gamertag) <= 30);
alter table public.profiles add column if not exists discord_user text check (discord_user is null or char_length(discord_user) <= 40);
alter table public.profiles add column if not exists steam_profile text check (steam_profile is null or steam_profile ~ '^https://steamcommunity\.com/(id|profiles)/[A-Za-z0-9_-]+/?$');

-- =====================================================================
-- CATÁLOGO COMPLETO (IGDB) — importação em massa e busca sob demanda
-- =====================================================================
alter table public.games add column if not exists igdb_id bigint unique;
alter table public.games add column if not exists platforms text[] not null default '{}';
alter table public.games add column if not exists igdb_rating numeric(5,2);
alter table public.games add column if not exists igdb_rating_count integer not null default 0;
alter table public.games add column if not exists steam_checked_at timestamptz;   -- última consulta de preço na Steam
alter table public.games add column if not exists added_by uuid references public.profiles(id) on delete set null;

create index if not exists games_popular_idx on public.games(igdb_rating_count desc);
create index if not exists games_steam_check_idx on public.games(steam_checked_at nulls first) where steam_appid is not null;
create index if not exists games_title_idx on public.games(lower(title));
-- A busca sob demanda (Netlify, com a chave secreta) dá XP a quem adiciona um jogo
grant execute on function public.add_xp(uuid,int) to service_role;

-- =====================================================================
-- LGPD: aceite dos termos, exclusão da conta
-- =====================================================================
alter table public.profiles add column if not exists accepted_terms_at timestamptz;

-- Exclui a conta de quem chamou (perfil, avaliações, posts etc. caem em cascata)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from storage.objects where bucket_id = 'media' and name like 'avatars/' || auth.uid()::text || '/%';
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
-- DENÚNCIAS
-- =====================================================================
create table if not exists public.reports (
  id           bigserial primary key,
  reporter_id  uuid references public.profiles(id) on delete set null,
  target_type  text not null check (target_type in ('review','post','profile','community','event')),
  target_id    text not null,
  reason       text not null check (reason in ('spam','ofensivo','assedio','conteudo_impróprio','golpe','outro')),
  details      text check (char_length(details) <= 1000),
  status       text not null default 'aberta' check (status in ('aberta','resolvida','descartada')),
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid() and status = 'aberta');
drop policy if exists reports_staff on public.reports;
create policy reports_staff on public.reports for all using (is_staff()) with check (is_staff());

-- =====================================================================
-- BIBLIOTECA E LISTA DE DESEJOS
-- =====================================================================
create table if not exists public.user_games (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    integer not null references public.games(id) on delete cascade,
  status     text check (status in ('jogando','zerado','quero_jogar','abandonei')),
  wishlist   boolean not null default false,
  hours      numeric(7,1) check (hours is null or hours between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists user_games_wish_idx on public.user_games(game_id) where wishlist;
alter table public.user_games enable row level security;
drop policy if exists ug_read on public.user_games;
create policy ug_read on public.user_games for select using (true);
drop policy if exists ug_write on public.user_games;
create policy ug_write on public.user_games for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- SEGUIDORES
-- =====================================================================
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  followed_id  uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
alter table public.follows enable row level security;
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select using (true);
drop policy if exists follows_write on public.follows;
create policy follows_write on public.follows for insert with check (follower_id = auth.uid() and is_active_user());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete using (follower_id = auth.uid());

-- =====================================================================
-- PARTIDAS AGENDADAS
-- =====================================================================
create table if not exists public.events (
  id            bigserial primary key,
  community_id  bigint not null references public.communities(id) on delete cascade,
  creator_id    uuid references public.profiles(id) on delete set null,
  title         text not null check (char_length(title) between 3 and 80),
  game_id       integer references public.games(id) on delete set null,
  platform      text check (platform in ('PlayStation','Xbox','PC','Nintendo','Mobile','Crossplay')),
  starts_at     timestamptz not null,
  slots         integer check (slots is null or slots between 2 and 100),
  description   text check (char_length(description) <= 1000),
  reminded      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists events_comm_idx on public.events(community_id, starts_at);
create table if not exists public.event_attendees (
  event_id   bigint not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.events enable row level security;
alter table public.event_attendees enable row level security;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert with check (
  creator_id = auth.uid() and is_active_user()
  and exists (select 1 from community_members m where m.community_id = events.community_id and m.user_id = auth.uid()));
drop policy if exists events_update on public.events;
create policy events_update on public.events for update using (creator_id = auth.uid() or is_staff()) with check (creator_id = auth.uid() or is_staff());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete using (creator_id = auth.uid() or is_staff());
drop policy if exists att_read on public.event_attendees;
create policy att_read on public.event_attendees for select using (true);
drop policy if exists att_join on public.event_attendees;
create policy att_join on public.event_attendees for insert with check (user_id = auth.uid() and is_active_user());
drop policy if exists att_leave on public.event_attendees;
create policy att_leave on public.event_attendees for delete using (user_id = auth.uid());

-- Vagas: bloqueia inscrição em partida lotada ou que já passou
create or replace function public.event_join_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = new.event_id;
  if e.starts_at < now() - interval '3 hours' then raise exception 'Essa partida já aconteceu.'; end if;
  if e.slots is not null and (select count(*) from event_attendees where event_id = e.id) >= e.slots then
    raise exception 'Partida lotada.';
  end if;
  return new;
end $$;
drop trigger if exists event_join on public.event_attendees;
create trigger event_join before insert on public.event_attendees for each row execute function public.event_join_check();

-- =====================================================================
-- NOTIFICAÇÕES (criadas só por automações)
-- =====================================================================
create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notif_user_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notif_own on public.notifications;
create policy notif_own on public.notifications for select using (user_id = auth.uid());
drop policy if exists notif_upd on public.notifications;
create policy notif_upd on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notif_del on public.notifications;
create policy notif_del on public.notifications for delete using (user_id = auth.uid());
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- Alguém te seguiu
create or replace function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text;
begin
  select username into quem from profiles where id = new.follower_id;
  insert into notifications (user_id, type, title, link)
  values (new.followed_id, 'follow', quem || ' começou a seguir você', 'perfil.html?u=' || quem);
  return null;
end $$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows for each row execute function public.notify_follow();

-- Jogo da lista de desejos entrou em promoção (ou ficou mais barato)
create or replace function public.notify_deal() returns trigger
language plpgsql security definer set search_path = public as $$
declare g games;
begin
  if new.discount_pct <= 0 then return null; end if;
  if tg_op = 'UPDATE' and old.discount_pct >= new.discount_pct and coalesce(old.price_cents, 0) <= coalesce(new.price_cents, 0) then return null; end if;
  select * into g from games where id = new.game_id;
  insert into notifications (user_id, type, title, body, link)
  select ug.user_id, 'deal', g.title || ' está com ' || new.discount_pct || '% de desconto!',
         'Na ' || new.store || coalesce(' por R$ ' || replace(to_char(new.price_cents / 100.0, 'FM999990.00'), '.', ','), ''),
         'jogo.html?slug=' || g.slug
  from user_games ug where ug.game_id = new.game_id and ug.wishlist;
  return null;
end $$;
drop trigger if exists deals_notify on public.deals;
create trigger deals_notify after insert or update on public.deals for each row execute function public.notify_deal();

-- Nova partida na comunidade: avisa os membros
create or replace function public.notify_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  select name into c from communities where id = new.community_id;
  insert into notifications (user_id, type, title, body, link)
  select m.user_id, 'event', 'Nova partida em ' || c || ': ' || new.title,
         to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
         'comunidade.html?id=' || new.community_id || '#partidas'
  from community_members m where m.community_id = new.community_id and m.user_id <> coalesce(new.creator_id, '00000000-0000-0000-0000-000000000000');
  -- quem cria já está confirmado
  if new.creator_id is not null then insert into event_attendees (event_id, user_id) values (new.id, new.creator_id) on conflict do nothing; end if;
  return null;
end $$;
drop trigger if exists events_notify on public.events;
create trigger events_notify after insert on public.events for each row execute function public.notify_event();

-- Lembrete 1h antes (chamado pelo robô a cada execução)
create or replace function public.send_event_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with prox as (
    update events set reminded = true
    where not reminded and starts_at between now() and now() + interval '60 minutes'
    returning id, title, community_id, starts_at
  ), ins as (
    insert into notifications (user_id, type, title, body, link)
    select a.user_id, 'reminder', 'Sua partida começa em breve: ' || p.title,
           to_char(p.starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') || ' — entre na call da comunidade',
           'comunidade.html?id=' || p.community_id || '#call'
    from prox p join event_attendees a on a.event_id = p.id
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
revoke execute on function public.send_event_reminders() from public, anon, authenticated;
grant execute on function public.send_event_reminders() to service_role;

-- =====================================================================
-- RECOMENDAÇÕES (agora também usam a biblioteca e a popularidade)
-- =====================================================================
create or replace function public.recommend_games(lim int default 8)
returns setof public.games
language sql stable security definer set search_path = public as $$
  with gostos as (
    select unnest(fav_categories) as cat, 3 as peso from profiles where id = auth.uid()
    union all
    select g.category_id, r.rating - 2 from reviews r join games g on g.id = r.game_id
     where r.user_id = auth.uid() and r.rating >= 4 and g.category_id is not null
    union all
    select g.category_id, case ug.status when 'zerado' then 2 when 'jogando' then 2 when 'abandonei' then -2 else 1 end
      from user_games ug join games g on g.id = ug.game_id
     where ug.user_id = auth.uid() and g.category_id is not null
  ), pontos as (
    select cat, sum(peso) as score from gostos group by cat
  )
  select g.* from games g
  left join pontos p on p.cat = g.category_id
  where not exists (select 1 from reviews r where r.game_id = g.id and r.user_id = auth.uid())
    and not exists (select 1 from user_games ug where ug.game_id = g.id and ug.user_id = auth.uid())
  order by coalesce(p.score, 0) desc, g.avg_rating desc, g.igdb_rating_count desc, g.id
  limit lim;
$$;

-- Estatísticas do admin incluem denúncias abertas
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'acesso negado'; end if;
  return json_build_object(
    'users',        (select count(*) from profiles),
    'users_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'games',        (select count(*) from games),
    'reviews',      (select count(*) from reviews),
    'reviews_7d',   (select count(*) from reviews where created_at > now() - interval '7 days'),
    'communities',  (select count(*) from communities),
    'posts',        (select count(*) from posts),
    'messages_new', (select count(*) from contact_messages where status = 'novo'),
    'reports_open', (select count(*) from reports where status = 'aberta'),
    'events_next',  (select count(*) from events where starts_at > now()),
    'top_games',    (select coalesce(json_agg(t), '[]'::json) from (
                       select title, avg_rating, reviews_count from games
                       where reviews_count > 0 order by avg_rating desc, reviews_count desc limit 5) t)
  );
end $$;

-- Cadastro registra o aceite dos termos (enviado pelo formulário de cadastro)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'jogador'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    n := n + 1; candidate := base || n;
  end loop;
  insert into profiles (id, username, accepted_terms_at)
  values (new.id, candidate, case when (new.raw_user_meta_data->>'accepted_terms') = 'true' then now() end);
  return new;
end $$;

-- Assunto no Fale Conosco (ex.: pedidos de privacidade)
alter table public.contact_messages add column if not exists subject text not null default 'geral'
  check (subject in ('geral','sugestao','problema','privacidade','parceria'));

-- Lembretes de partida a cada 10 minutos, dentro do próprio banco (pg_cron do Supabase).
-- Se a extensão não puder ser ativada, o robô de sincronização envia os lembretes como reserva.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule('lembretes-partidas') where exists (select 1 from cron.job where jobname = 'lembretes-partidas');
  perform cron.schedule('lembretes-partidas', '*/10 * * * *', 'select public.send_event_reminders()');
exception when others then
  raise notice 'pg_cron indisponível (%): lembretes ficam a cargo do robô.', sqlerrm;
end $$;

-- =====================================================================
-- IDIOMA DOS TEXTOS (descrições e notícias em inglês são traduzidas)
-- =====================================================================
alter table public.games add column if not exists description_lang text check (description_lang in ('pt','en'));
alter table public.games add column if not exists description_en text;   -- original em inglês, guardado ao traduzir
alter table public.news  add column if not exists lang text check (lang in ('pt','en'));

-- Classifica o que já existe (contagem de palavras comuns de cada idioma)
update public.games set description_lang = case
    when regexp_count(description, '\m(the|and|of|with|your|you|to|in|is|are|this|for|from|game|world)\M', 1, 'i')
       > regexp_count(description, '\m(de|que|uma|um|com|para|seu|sua|você|do|da|em|não|mais|como|é|são|jogo|mundo)\M', 1, 'i')
           + 2 * regexp_count(description, '(ção|ções|ão|ões)\M', 1, 'i')
    then 'en' else 'pt' end
  where description is not null and description_lang is null;
update public.news set lang = case
    when regexp_count(coalesce(title,'') || ' ' || coalesce(summary,''), '\m(the|and|of|with|your|you|to|in|is|are|this|for|from)\M', 1, 'i')
       > regexp_count(coalesce(title,'') || ' ' || coalesce(summary,''), '\m(de|que|uma|um|com|para|seu|você|do|da|em|não|mais|é|são)\M', 1, 'i')
    then 'en' else 'pt' end
  where lang is null;
create index if not exists games_desc_en_idx on public.games(id) where description_lang = 'en' and steam_appid is not null;

-- =====================================================================
-- GAMIFICAÇÃO: login diário, molduras, banners, conquistas e ranking
-- =====================================================================

-- Correção: XP concedido pelo sistema (avaliações, posts...) era bloqueado pela proteção
-- do perfil quando a ação vinha do próprio usuário. Agora o sistema se identifica.
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('cc.sistema', true), '') <> 'on' then
    new.role := old.role; new.xp := old.xp; new.banned := old.banned;
    new.streak_current := old.streak_current; new.streak_best := old.streak_best; new.last_checkin := old.last_checkin;
    new.equipped_frame := old.equipped_frame; new.equipped_banner := old.equipped_banner;
  end if;
  return new;
end $$;

alter table public.profiles add column if not exists streak_current integer not null default 0;
alter table public.profiles add column if not exists streak_best integer not null default 0;
alter table public.profiles add column if not exists last_checkin date;
alter table public.profiles add column if not exists equipped_frame text;
alter table public.profiles add column if not exists equipped_banner text;
alter table public.profiles add column if not exists showcase text[] not null default '{}';   -- selos em destaque

-- Histórico de XP (para o ranking mensal)
create table if not exists public.xp_log (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      integer not null,
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists xp_log_mes_idx on public.xp_log(created_at, user_id);
alter table public.xp_log enable row level security;
drop policy if exists xp_log_own on public.xp_log;
create policy xp_log_own on public.xp_log for select using (user_id = auth.uid());

create or replace function public.add_xp(uid uuid, amount int, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if uid is null or amount = 0 then return; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set xp = greatest(0, xp + amount) where id = uid;
  perform set_config('cc.sistema', 'off', true);
  insert into xp_log (user_id, amount, reason) values (uid, amount, reason);
end $$;
revoke execute on function public.add_xp(uuid,int,text) from public, anon, authenticated;
grant execute on function public.add_xp(uuid,int,text) to service_role;
-- versão antiga (2 parâmetros) continua funcionando
create or replace function public.add_xp(uid uuid, amount int) returns void
language sql security definer set search_path = public as $$ select public.add_xp(uid, amount, null); $$;
revoke execute on function public.add_xp(uuid,int) from public, anon, authenticated;
grant execute on function public.add_xp(uuid,int) to service_role;

-- Catálogo de itens (molduras, banners e selos)
create table if not exists public.cosmetics (
  id          text primary key,
  kind        text not null check (kind in ('frame','banner','badge')),
  name        text not null,
  description text not null,            -- como desbloquear
  rarity      text not null default 'comum' check (rarity in ('comum','rara','epica','lendaria','especial')),
  icon        text,                     -- emoji dos selos
  sort        integer not null default 0
);
alter table public.cosmetics enable row level security;
drop policy if exists cosmetics_read on public.cosmetics;
create policy cosmetics_read on public.cosmetics for select using (true);
drop policy if exists cosmetics_admin on public.cosmetics;
create policy cosmetics_admin on public.cosmetics for all using (is_admin()) with check (is_admin());

insert into public.cosmetics (id, kind, name, description, rarity, icon, sort) values
  -- Molduras
  ('f_bronze',    'frame',  'Bronze',            'Alcance o nível 5',                         'comum',    null, 10),
  ('f_prata',     'frame',  'Prata',             'Alcance o nível 10',                        'rara',     null, 20),
  ('f_ouro',      'frame',  'Ouro',              'Alcance o nível 20',                        'epica',    null, 30),
  ('f_diamante',  'frame',  'Diamante',          'Alcance o nível 30',                        'lendaria', null, 40),
  ('f_lenda',     'frame',  'Lenda',             'Alcance o nível 50',                        'lendaria', null, 50),
  ('f_chama7',    'frame',  'Chama',             'Entre 7 dias seguidos',                     'comum',    null, 60),
  ('f_chama30',   'frame',  'Chama Azul',        'Entre 30 dias seguidos',                    'epica',    null, 70),
  ('f_chama100',  'frame',  'Chama Arco-íris',   'Entre 100 dias seguidos',                   'lendaria', null, 80),
  ('f_destaque',  'frame',  'Destaque do Mês',   'Fique no top 10 do ranking mensal (vale por um mês)', 'especial', null, 90),
  ('f_fundador',  'frame',  'Fundador',          'Um dos 100 primeiros membros do Control Critic', 'especial', null, 5),
  -- Banners
  ('b_neon',      'banner', 'Neon',              'Alcance o nível 15',                        'rara',     null, 10),
  ('b_galaxia',   'banner', 'Galáxia',           'Alcance o nível 40',                        'lendaria', null, 20),
  ('b_retro',     'banner', 'Retrô',             'Entre 30 dias seguidos',                    'epica',    null, 30),
  ('b_critico',   'banner', 'Crítico de Ouro',   'Publique 50 avaliações',                    'epica',    null, 40),
  ('b_amarelo',   'banner', 'Control Critic',    'Faça seu primeiro login diário',            'comum',    null, 0),
  -- Selos (conquistas)
  ('s_primeira',     'badge', 'Primeira Crítica',  'Publique sua primeira avaliação',   'comum',    '✍️', 10),
  ('s_critico10',    'badge', 'Crítico',           'Publique 10 avaliações',            'rara',     '⭐', 20),
  ('s_critico50',    'badge', 'Crítico Veterano',  'Publique 50 avaliações',            'epica',    '🌟', 30),
  ('s_colecao25',    'badge', 'Colecionador',      'Tenha 25 jogos na biblioteca',      'comum',    '📚', 40),
  ('s_colecao100',   'badge', 'Arquivista',        'Tenha 100 jogos na biblioteca',     'rara',     '🗄️', 50),
  ('s_zerou10',      'badge', 'Finalizador',       'Marque 10 jogos como zerados',      'rara',     '🏆', 55),
  ('s_organizador',  'badge', 'Organizador',       'Agende sua primeira partida',       'comum',    '📅', 60),
  ('s_organizador10','badge', 'Líder de Squad',    'Agende 10 partidas',                'epica',    '🎖️', 70),
  ('s_social10',     'badge', 'Conhecido',         'Tenha 10 seguidores',               'rara',     '👥', 80),
  ('s_social100',    'badge', 'Influente',         'Tenha 100 seguidores',              'lendaria', '📣', 90),
  ('s_falante',      'badge', 'Comunicador',       'Publique 50 posts em comunidades',  'rara',     '💬', 100),
  ('s_fundou',       'badge', 'Fundador de Comunidade', 'Crie uma comunidade',          'comum',    '🏰', 110),
  ('s_semana',       'badge', 'Assíduo',           'Entre 7 dias seguidos',             'comum',    '🔥', 120),
  ('s_mes',          'badge', 'Dedicado',          'Entre 30 dias seguidos',            'epica',    '💎', 130),
  ('s_top10',        'badge', 'Top 10 do Mês',     'Termine um mês no top 10 do ranking', 'especial', '🥇', 140)
on conflict (id) do update set name = excluded.name, description = excluded.description, rarity = excluded.rarity, icon = excluded.icon, sort = excluded.sort;

create table if not exists public.user_cosmetics (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id  text not null references public.cosmetics(id) on delete cascade,
  unlocked_at  timestamptz not null default now(),
  expires_at   timestamptz,               -- itens temporários (ex.: Destaque do Mês)
  primary key (user_id, cosmetic_id)
);
alter table public.user_cosmetics enable row level security;
drop policy if exists uc_read on public.user_cosmetics;
create policy uc_read on public.user_cosmetics for select using (true);

-- Concede um item (uma vez) e avisa por notificação
create or replace function public.grant_cosmetic(uid uuid, cid text, expira timestamptz default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c cosmetics; novo boolean;
begin
  select * into c from cosmetics where id = cid;
  if c.id is null or uid is null then return false; end if;
  insert into user_cosmetics (user_id, cosmetic_id, expires_at) values (uid, cid, expira)
  on conflict (user_id, cosmetic_id) do update set expires_at = excluded.expires_at
    where user_cosmetics.expires_at is not null and user_cosmetics.expires_at < coalesce(excluded.expires_at, 'infinity')
  returning true into novo;
  if novo then
    insert into notifications (user_id, type, title, body, link)
    values (uid, 'reward', case c.kind when 'frame' then 'Nova moldura desbloqueada: ' when 'banner' then 'Novo banner desbloqueado: ' else 'Nova conquista: ' end || c.name,
            c.description, 'conquistas.html');
  end if;
  return coalesce(novo, false);
end $$;
revoke execute on function public.grant_cosmetic(uuid,text,timestamptz) from public, anon, authenticated;

-- Nível a partir do XP (mesma fórmula do site)
create or replace function public.level_of(xp int) returns int language sql immutable as $$
  select floor(sqrt(greatest(xp, 0) / 50.0))::int + 1;
$$;

-- Recompensas por nível (dispara quando o XP muda)
create or replace function public.rewards_on_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare lv int := level_of(new.xp);
begin
  if level_of(old.xp) >= lv then return null; end if;
  if lv >= 5  then perform grant_cosmetic(new.id, 'f_bronze'); end if;
  if lv >= 10 then perform grant_cosmetic(new.id, 'f_prata'); end if;
  if lv >= 15 then perform grant_cosmetic(new.id, 'b_neon'); end if;
  if lv >= 20 then perform grant_cosmetic(new.id, 'f_ouro'); end if;
  if lv >= 30 then perform grant_cosmetic(new.id, 'f_diamante'); end if;
  if lv >= 40 then perform grant_cosmetic(new.id, 'b_galaxia'); end if;
  if lv >= 50 then perform grant_cosmetic(new.id, 'f_lenda'); end if;
  insert into notifications (user_id, type, title, body, link)
  values (new.id, 'levelup', 'Você subiu para o nível ' || lv || '! 🎉', 'Veja as recompensas em Conquistas.', 'conquistas.html');
  return null;
end $$;
drop trigger if exists profiles_rewards on public.profiles;
create trigger profiles_rewards after update of xp on public.profiles
  for each row when (new.xp > old.xp) execute function public.rewards_on_xp();

-- Conquistas por atividade
create or replace function public.check_achievements(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if uid is null then return; end if;
  select count(*) into n from reviews where user_id = uid;
  if n >= 1 then perform grant_cosmetic(uid, 's_primeira'); end if;
  if n >= 10 then perform grant_cosmetic(uid, 's_critico10'); end if;
  if n >= 50 then perform grant_cosmetic(uid, 's_critico50'); perform grant_cosmetic(uid, 'b_critico'); end if;
  select count(*) into n from user_games where user_id = uid and status is not null;
  if n >= 25 then perform grant_cosmetic(uid, 's_colecao25'); end if;
  if n >= 100 then perform grant_cosmetic(uid, 's_colecao100'); end if;
  select count(*) into n from user_games where user_id = uid and status = 'zerado';
  if n >= 10 then perform grant_cosmetic(uid, 's_zerou10'); end if;
  select count(*) into n from events where creator_id = uid;
  if n >= 1 then perform grant_cosmetic(uid, 's_organizador'); end if;
  if n >= 10 then perform grant_cosmetic(uid, 's_organizador10'); end if;
  select count(*) into n from follows where followed_id = uid;
  if n >= 10 then perform grant_cosmetic(uid, 's_social10'); end if;
  if n >= 100 then perform grant_cosmetic(uid, 's_social100'); end if;
  select count(*) into n from posts where user_id = uid;
  if n >= 50 then perform grant_cosmetic(uid, 's_falante'); end if;
  if exists (select 1 from communities where owner_id = uid) then perform grant_cosmetic(uid, 's_fundou'); end if;
end $$;
revoke execute on function public.check_achievements(uuid) from public, anon, authenticated;

create or replace function public.achievements_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- cada tabela guarda o dono da ação numa coluna diferente
  if tg_table_name = 'follows' then perform check_achievements(new.followed_id);
  elsif tg_table_name = 'events' then perform check_achievements(new.creator_id);
  elsif tg_table_name = 'communities' then perform check_achievements(new.owner_id);
  else perform check_achievements(new.user_id);
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['reviews','user_games','events','follows','posts','communities'] loop
    execute format('drop trigger if exists achievements_%1$s on public.%1$s', t);
    execute format('create trigger achievements_%1$s after insert or update on public.%1$s for each row execute function public.achievements_trigger()', t);
  end loop;
end $$;

-- Login diário: sequência, XP e recompensas. Chamado pelo site uma vez por dia.
create or replace function public.daily_checkin() returns json
language plpgsql security definer set search_path = public as $$
declare p profiles; hoje date := (now() at time zone 'America/Sao_Paulo')::date; seq int; ganho int;
begin
  select * into p from profiles where id = auth.uid() for update;
  if p.id is null then raise exception 'não autenticado'; end if;
  if p.last_checkin = hoje then
    return json_build_object('ja_feito', true, 'streak', p.streak_current, 'best', p.streak_best);
  end if;
  seq := case when p.last_checkin = hoje - 1 then p.streak_current + 1 else 1 end;
  ganho := 5 + least(seq - 1, 10) * 2;            -- 5 XP no 1º dia, até 25 XP por dia na sequência
  if seq % 7 = 0 then ganho := ganho + 25; end if; -- bônus semanal
  perform set_config('cc.sistema', 'on', true);
  update profiles set streak_current = seq, streak_best = greatest(streak_best, seq), last_checkin = hoje where id = p.id;
  perform set_config('cc.sistema', 'off', true);
  perform add_xp(p.id, ganho, 'login diário');
  perform grant_cosmetic(p.id, 'b_amarelo');
  if seq >= 7 then perform grant_cosmetic(p.id, 'f_chama7'); perform grant_cosmetic(p.id, 's_semana'); end if;
  if seq >= 30 then perform grant_cosmetic(p.id, 'f_chama30'); perform grant_cosmetic(p.id, 'b_retro'); perform grant_cosmetic(p.id, 's_mes'); end if;
  if seq >= 100 then perform grant_cosmetic(p.id, 'f_chama100'); end if;
  return json_build_object('ja_feito', false, 'streak', seq, 'best', greatest(p.streak_best, seq), 'xp', ganho,
                           'bonus_semanal', seq % 7 = 0, 'recorde', seq > p.streak_best and seq > 1);
end $$;
revoke execute on function public.daily_checkin() from public, anon;
grant execute on function public.daily_checkin() to authenticated;

-- Equipar moldura/banner (só itens desbloqueados e válidos; null = remover)
create or replace function public.equip_cosmetic(tipo text, cid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  if tipo not in ('frame','banner') then raise exception 'tipo inválido'; end if;
  if cid is not null and not exists (
    select 1 from user_cosmetics uc join cosmetics c on c.id = uc.cosmetic_id
    where uc.user_id = auth.uid() and uc.cosmetic_id = cid and c.kind = tipo and (uc.expires_at is null or uc.expires_at > now())
  ) then raise exception 'Item ainda não desbloqueado.'; end if;
  perform set_config('cc.sistema', 'on', true);
  if tipo = 'frame' then update profiles set equipped_frame = cid where id = auth.uid();
  else update profiles set equipped_banner = cid where id = auth.uid(); end if;
  perform set_config('cc.sistema', 'off', true);
end $$;
grant execute on function public.equip_cosmetic(text,text) to authenticated;

-- Ranking do mês (XP ganho no mês, horário de Brasília)
create or replace function public.monthly_ranking(mes date default null, lim int default 20)
returns table (posicao bigint, user_id uuid, username text, avatar_url text, equipped_frame text, xp_mes bigint)
language sql stable security definer set search_path = public as $$
  with periodo as (
    select date_trunc('month', coalesce(mes, (now() at time zone 'America/Sao_Paulo')::date))::date as ini
  )
  select row_number() over (order by sum(l.amount) desc, min(l.created_at)), p.id, p.username, p.avatar_url, p.equipped_frame, sum(l.amount)
  from xp_log l join profiles p on p.id = l.user_id, periodo
  where (l.created_at at time zone 'America/Sao_Paulo')::date >= periodo.ini
    and (l.created_at at time zone 'America/Sao_Paulo')::date < (periodo.ini + interval '1 month')::date
    and not p.banned
  group by p.id
  having sum(l.amount) > 0
  order by 6 desc, min(l.created_at)
  limit least(lim, 100);
$$;

-- Premia o top 10 do mês anterior (roda no dia 1; seguro rodar mais de uma vez)
create or replace function public.award_monthly_top() returns integer
language plpgsql security definer set search_path = public as $$
declare anterior date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date;
        chave text := 'top10_' || to_char(anterior, 'YYYY_MM'); r record; n int := 0;
begin
  if exists (select 1 from settings where key = chave) then return 0; end if;
  for r in select * from monthly_ranking(anterior, 10) loop
    perform grant_cosmetic(r.user_id, 'f_destaque', (date_trunc('month', now()) + interval '1 month'));
    perform grant_cosmetic(r.user_id, 's_top10');
    n := n + 1;
  end loop;
  insert into settings (key, value) values (chave, to_jsonb(n));
  return n;
end $$;
revoke execute on function public.award_monthly_top() from public, anon, authenticated;
grant execute on function public.award_monthly_top() to service_role;

-- Itens temporários vencidos saem do perfil
create or replace function public.expire_cosmetics() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('cc.sistema', 'on', true);
  update profiles p set equipped_frame = null where equipped_frame is not null and exists (
    select 1 from user_cosmetics uc where uc.user_id = p.id and uc.cosmetic_id = p.equipped_frame and uc.expires_at < now());
  get diagnostics n = row_count;
  perform set_config('cc.sistema', 'off', true);
  return n;
end $$;
revoke execute on function public.expire_cosmetics() from public, anon, authenticated;
grant execute on function public.expire_cosmetics() to service_role;

-- Fundadores: os 100 primeiros membros (contas atuais e as próximas até completar 100)
create or replace function public.founder_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from profiles) <= 100 then perform grant_cosmetic(new.id, 'f_fundador'); end if;
  return null;
end $$;
drop trigger if exists profiles_founder on public.profiles;
create trigger profiles_founder after insert on public.profiles for each row execute function public.founder_on_signup();

-- Agendamentos no banco (se o pg_cron estiver disponível)
do $$ begin
  perform cron.unschedule('premiar-top10') where exists (select 1 from cron.job where jobname = 'premiar-top10');
  perform cron.schedule('premiar-top10', '15 3 1 * *', 'select public.award_monthly_top(); select public.expire_cosmetics();');
exception when others then raise notice 'pg_cron indisponível: o robô premia o ranking mensal.'; end $$;

-- Recompensas retroativas para quem já tem conta
do $$ declare r record; begin
  for r in select id, xp from profiles loop
    perform check_achievements(r.id);
    if level_of(r.xp) >= 5  then perform grant_cosmetic(r.id, 'f_bronze'); end if;
    if level_of(r.xp) >= 10 then perform grant_cosmetic(r.id, 'f_prata'); end if;
    if level_of(r.xp) >= 15 then perform grant_cosmetic(r.id, 'b_neon'); end if;
    if level_of(r.xp) >= 20 then perform grant_cosmetic(r.id, 'f_ouro'); end if;
    if level_of(r.xp) >= 30 then perform grant_cosmetic(r.id, 'f_diamante'); end if;
  end loop;
  perform grant_cosmetic(p.id, 'f_fundador') from (select id from profiles order by created_at limit 100) p;
end $$;

-- =====================================================================
-- COMUNIDADES PRIVADAS (convite, pedidos de entrada e call protegida)
-- =====================================================================
alter table public.communities add column if not exists is_private boolean not null default false;

-- Segredos de cada comunidade: só membros leem (código de convite e chave da sala de voz)
create table if not exists public.community_secrets (
  community_id  bigint primary key references public.communities(id) on delete cascade,
  invite_code   text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  room_key      text not null default replace(gen_random_uuid()::text, '-', '')
);
alter table public.community_secrets enable row level security;
drop policy if exists secrets_members on public.community_secrets;
create policy secrets_members on public.community_secrets for select using (
  is_staff() or exists (select 1 from community_members m where m.community_id = community_secrets.community_id and m.user_id = auth.uid()));
insert into public.community_secrets (community_id) select id from public.communities on conflict do nothing;

create or replace function public.communities_secret_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into community_secrets (community_id) values (new.id) on conflict do nothing; return null; end $$;
drop trigger if exists communities_secret on public.communities;
create trigger communities_secret after insert on public.communities for each row execute function public.communities_secret_insert();

create or replace function public.is_member(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members where community_id = cid and user_id = auth.uid());
$$;
create or replace function public.can_see_community(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select is_private from communities where id = cid), false) or is_member(cid) or is_staff();
$$;

-- Entrar direto só em comunidade pública (privadas: convite ou pedido aprovado, via funções abaixo)
drop policy if exists members_join on public.community_members;
create policy members_join on public.community_members for insert with check (
  user_id = auth.uid() and is_active_user()
  and not coalesce((select is_private from communities c where c.id = community_id), false));

-- Conteúdo de comunidade privada só para membros
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  (status = 'published' and can_see_community(community_id)) or user_id = auth.uid() or is_staff());
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (can_see_community(community_id));
drop policy if exists att_read on public.event_attendees;
create policy att_read on public.event_attendees for select using (
  exists (select 1 from events e where e.id = event_id and can_see_community(e.community_id)));

create table if not exists public.community_requests (
  community_id  bigint not null references public.communities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  message       text check (char_length(message) <= 300),
  created_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
alter table public.community_requests enable row level security;
drop policy if exists req_read on public.community_requests;
create policy req_read on public.community_requests for select using (
  user_id = auth.uid() or is_staff() or exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid()));
drop policy if exists req_cancel on public.community_requests;
create policy req_cancel on public.community_requests for delete using (user_id = auth.uid());

-- Participar: pública entra direto; privada entra com código de convite ou vira pedido para o dono
create or replace function public.join_community(cid bigint, codigo text default null, mensagem text default null) returns text
language plpgsql security definer set search_path = public as $$
declare c communities; quem text;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta para participar.'; end if;
  select * into c from communities where id = cid;
  if c.id is null then raise exception 'Comunidade não encontrada.'; end if;
  if is_member(cid) then return 'membro'; end if;
  if not c.is_private or (codigo is not null and exists (select 1 from community_secrets s where s.community_id = cid and s.invite_code = codigo)) then
    insert into community_members (community_id, user_id) values (cid, auth.uid()) on conflict do nothing;
    delete from community_requests where community_id = cid and user_id = auth.uid();
    return 'membro';
  end if;
  insert into community_requests (community_id, user_id, message) values (cid, auth.uid(), left(mensagem, 300))
    on conflict (community_id, user_id) do nothing;
  if found and c.owner_id is not null then
    select username into quem from profiles where id = auth.uid();
    insert into notifications (user_id, type, title, body, link)
    values (c.owner_id, 'request', quem || ' pediu para entrar em ' || c.name, left(mensagem, 140), 'comunidade.html?id=' || cid || '#pedidos');
  end if;
  return 'pedido';
end $$;
grant execute on function public.join_community(bigint, text, text) to authenticated;

create or replace function public.answer_join_request(cid bigint, uid uuid, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c communities;
begin
  select * into c from communities where id = cid;
  if c.owner_id is distinct from auth.uid() and not is_staff() then raise exception 'Só o dono da comunidade pode responder.'; end if;
  if not exists (select 1 from community_requests where community_id = cid and user_id = uid) then raise exception 'Pedido não encontrado.'; end if;
  delete from community_requests where community_id = cid and user_id = uid;
  if aceitar then
    insert into community_members (community_id, user_id) values (cid, uid) on conflict do nothing;
    insert into notifications (user_id, type, title, link) values (uid, 'request', 'Você entrou em ' || c.name || '! 🎉', 'comunidade.html?id=' || cid);
  end if;
end $$;
grant execute on function public.answer_join_request(bigint, uuid, boolean) to authenticated;

-- Dono pode gerar um novo código de convite (o anterior para de funcionar)
create or replace function public.reset_invite_code(cid bigint) returns text
language plpgsql security definer set search_path = public as $$
declare novo text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
begin
  if not exists (select 1 from communities where id = cid and owner_id = auth.uid()) and not is_staff() then raise exception 'Sem permissão.'; end if;
  update community_secrets set invite_code = novo where community_id = cid;
  return novo;
end $$;
grant execute on function public.reset_invite_code(bigint) to authenticated;

-- =====================================================================
-- AMIZADES (pedido, aceite e call privada entre amigos)
-- =====================================================================
create table if not exists public.friendships (
  user_a      uuid not null references public.profiles(id) on delete cascade,
  user_b      uuid not null references public.profiles(id) on delete cascade,
  requester   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pendente' check (status in ('pendente','aceita')),
  room_key    text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;
drop policy if exists fr_read on public.friendships;
create policy fr_read on public.friendships for select using (auth.uid() in (user_a, user_b));

create or replace function public.friend_request(alvo uuid) returns text
language plpgsql security definer set search_path = public as $$
declare a uuid := least(auth.uid(), alvo); b uuid := greatest(auth.uid(), alvo); f friendships; quem text;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta.'; end if;
  if alvo = auth.uid() then raise exception 'Você não pode adicionar a si mesmo.'; end if;
  if not exists (select 1 from profiles where id = alvo) then raise exception 'Usuário não encontrado.'; end if;
  select * into f from friendships where user_a = a and user_b = b;
  select username into quem from profiles where id = auth.uid();
  if f.status = 'aceita' then return 'amigos'; end if;
  if f.status = 'pendente' and f.requester <> auth.uid() then          -- o outro já tinha pedido: aceita
    update friendships set status = 'aceita' where user_a = a and user_b = b;
    insert into notifications (user_id, type, title, link) values (alvo, 'friend', quem || ' aceitou sua amizade! 🤝', 'amigos.html');
    return 'amigos';
  end if;
  if f.status is null then
    insert into friendships (user_a, user_b, requester) values (a, b, auth.uid());
    insert into notifications (user_id, type, title, body, link) values (alvo, 'friend', quem || ' quer ser seu amigo', 'Responda em Amigos.', 'amigos.html');
  end if;
  return 'pendente';
end $$;
grant execute on function public.friend_request(uuid) to authenticated;

create or replace function public.friend_answer(outro uuid, aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid := least(auth.uid(), outro); b uuid := greatest(auth.uid(), outro); quem text;
begin
  if not exists (select 1 from friendships where user_a = a and user_b = b and status = 'pendente' and requester = outro) then
    raise exception 'Pedido não encontrado.'; end if;
  if aceitar then
    update friendships set status = 'aceita' where user_a = a and user_b = b;
    select username into quem from profiles where id = auth.uid();
    insert into notifications (user_id, type, title, link) values (outro, 'friend', quem || ' aceitou sua amizade! 🤝', 'amigos.html');
  else
    delete from friendships where user_a = a and user_b = b;
  end if;
end $$;
grant execute on function public.friend_answer(uuid, boolean) to authenticated;

create or replace function public.friend_remove(outro uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where user_a = least(auth.uid(), outro) and user_b = greatest(auth.uid(), outro);
$$;
grant execute on function public.friend_remove(uuid) to authenticated;

-- Chamar um amigo para a call (notificação com link)
create or replace function public.friend_call(outro uuid) returns void
language plpgsql security definer set search_path = public as $$
declare quem text;
begin
  if not exists (select 1 from friendships where user_a = least(auth.uid(), outro) and user_b = greatest(auth.uid(), outro) and status = 'aceita') then
    raise exception 'Vocês ainda não são amigos.'; end if;
  select username into quem from profiles where id = auth.uid();
  insert into notifications (user_id, type, title, body, link)
  values (outro, 'call', '📞 ' || quem || ' está te chamando para uma call', 'Clique para entrar.', 'amigos.html?call=' || quem);
end $$;
grant execute on function public.friend_call(uuid) to authenticated;

-- Lista pública de amigos de um perfil (só nomes, para exibir no perfil)
create or replace function public.friends_of(uid uuid) returns table (id uuid, username text, avatar_url text, equipped_frame text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.avatar_url, p.equipped_frame from friendships f
  join profiles p on p.id = case when f.user_a = uid then f.user_b else f.user_a end
  where uid in (f.user_a, f.user_b) and f.status = 'aceita' order by p.username;
$$;

-- LGPD: dados exportados incluem amizades

-- =====================================================================
-- PAINEL DE ADMIN: cargos personalizados, banimento temporário, registro
-- de ações da equipe e aviso global
-- =====================================================================
alter table public.profiles add column if not exists banned_until timestamptz;   -- null + banned = permanente
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists titles text[] not null default '{}';   -- cargos personalizados (ids)

-- Banimento temporário vence sozinho
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (not banned or (banned_until is not null and banned_until < now())));
$$;

-- Cargos personalizados (só visuais: "Streamer", "Parceiro", "Equipe"...)
create table if not exists public.site_titles (
  id     text primary key check (id ~ '^[a-z0-9_]{2,30}$'),
  name   text not null check (char_length(name) between 2 and 30),
  color  text not null default '#ffd33c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon   text check (char_length(icon) <= 8),
  sort   integer not null default 0
);
alter table public.site_titles enable row level security;
drop policy if exists titles_read on public.site_titles;
create policy titles_read on public.site_titles for select using (true);
drop policy if exists titles_admin on public.site_titles;
create policy titles_admin on public.site_titles for all using (is_admin()) with check (is_admin());
insert into public.site_titles (id, name, color, icon, sort) values
  ('equipe', 'Equipe Control Critic', '#ffd33c', '🎮', 0),
  ('streamer', 'Streamer', '#9146ff', '📺', 10),
  ('parceiro', 'Parceiro', '#3ddc84', '🤝', 20),
  ('beta', 'Testador Beta', '#4fc3f7', '🧪', 30)
on conflict (id) do nothing;

-- Proteção do perfil inclui os novos campos
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('cc.sistema', true), '') <> 'on' then
    new.role := old.role; new.xp := old.xp; new.banned := old.banned;
    new.banned_until := old.banned_until; new.ban_reason := old.ban_reason; new.titles := old.titles;
    new.streak_current := old.streak_current; new.streak_best := old.streak_best; new.last_checkin := old.last_checkin;
    new.equipped_frame := old.equipped_frame; new.equipped_banner := old.equipped_banner;
  end if;
  return new;
end $$;

-- Registro de ações da equipe
create table if not exists public.admin_log (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_log_data_idx on public.admin_log(created_at desc);
alter table public.admin_log enable row level security;
drop policy if exists log_staff on public.admin_log;
create policy log_staff on public.admin_log for select using (is_staff());

create or replace function public.log_admin(acao text, tipo text, alvo text, det jsonb default null) returns void
language sql security definer set search_path = public as $$
  insert into admin_log (actor_id, action, target_type, target_id, details) values (auth.uid(), acao, tipo, alvo, det);
$$;
revoke execute on function public.log_admin(text,text,text,jsonb) from public, anon, authenticated;

-- Detalhes de um usuário (inclui e-mail e último acesso: só admin)
create or replace function public.admin_user_detail(uid uuid) returns json
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_staff() then raise exception 'acesso negado'; end if;
  return (select json_build_object(
    'profile', to_jsonb(p),
    'email', case when is_admin() then u.email end,
    'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
    'reviews', (select count(*) from reviews where user_id = uid),
    'posts', (select count(*) from posts where user_id = uid),
    'communities', (select count(*) from community_members where user_id = uid),
    'reports_against', (select count(*) from reports where target_type = 'profile' and target_id = uid::text),
    'cosmetics', (select coalesce(json_agg(cosmetic_id), '[]') from user_cosmetics where user_id = uid),
    'history', (select coalesce(json_agg(h order by h.created_at desc), '[]') from (
        select l.action, l.details, l.created_at, a.username as por from admin_log l left join profiles a on a.id = l.actor_id
        where l.target_type = 'user' and l.target_id = uid::text order by l.created_at desc limit 20) h)
  ) from profiles p left join auth.users u on u.id = p.id where p.id = uid);
end $$;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- Mudar permissão (user / moderator / admin). Não deixa o site sem admin nem você se rebaixar.
create or replace function public.admin_set_role(uid uuid, novo text) returns void
language plpgsql security definer set search_path = public as $$
declare antigo text;
begin
  if not is_admin() then raise exception 'Só administradores podem mudar permissões.'; end if;
  if novo not in ('user','moderator','admin') then raise exception 'Permissão inválida.'; end if;
  if uid = auth.uid() then raise exception 'Você não pode mudar a própria permissão.'; end if;
  select role into antigo from profiles where id = uid;
  if antigo = 'admin' and novo <> 'admin' and (select count(*) from profiles where role = 'admin') <= 1 then
    raise exception 'O site precisa ter pelo menos um administrador.'; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set role = novo where id = uid;
  perform set_config('cc.sistema', 'off', true);
  perform log_admin('permissão', 'user', uid::text, json_build_object('de', antigo, 'para', novo)::jsonb);
  insert into notifications (user_id, type, title, body) values (uid, 'admin', 'Sua permissão no site mudou',
    case novo when 'admin' then 'Agora você é administrador.' when 'moderator' then 'Agora você é moderador.' else 'Agora você é usuário comum.' end);
end $$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- Banir (dias = null → permanente) e desbanir. Moderador pode banir usuários comuns.
create or replace function public.admin_ban(uid uuid, dias integer, motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare alvo profiles;
begin
  if not is_staff() then raise exception 'Sem permissão.'; end if;
  select * into alvo from profiles where id = uid;
  if alvo.id is null then raise exception 'Usuário não encontrado.'; end if;
  if uid = auth.uid() then raise exception 'Você não pode banir a si mesmo.'; end if;
  if alvo.role <> 'user' and not is_admin() then raise exception 'Moderadores não podem banir membros da equipe.'; end if;
  if alvo.role = 'admin' then raise exception 'Rebaixe o administrador antes de banir.'; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set banned = true, ban_reason = left(motivo, 300),
    banned_until = case when dias is null then null else now() + make_interval(days => dias) end where id = uid;
  perform set_config('cc.sistema', 'off', true);
  perform log_admin('banimento', 'user', uid::text, json_build_object('dias', dias, 'motivo', motivo)::jsonb);
  insert into notifications (user_id, type, title, body) values (uid, 'admin',
    case when dias is null then 'Sua conta foi suspensa' else 'Sua conta foi suspensa por ' || dias || ' dia(s)' end,
    'Motivo: ' || coalesce(motivo, 'não informado') || '. Dúvidas? Use o Fale Conosco.');
end $$;
grant execute on function public.admin_ban(uuid, integer, text) to authenticated;

create or replace function public.admin_unban(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão.'; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set banned = false, banned_until = null, ban_reason = null where id = uid;
  perform set_config('cc.sistema', 'off', true);
  perform log_admin('desbanimento', 'user', uid::text, null);
  insert into notifications (user_id, type, title) values (uid, 'admin', 'Sua conta foi reativada. Bem-vindo de volta!');
end $$;
grant execute on function public.admin_unban(uuid) to authenticated;

-- Ajustar XP (ex.: prêmio de evento ou correção)
create or replace function public.admin_adjust_xp(uid uuid, quantidade integer, motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Só administradores podem ajustar XP.'; end if;
  if quantidade = 0 or abs(quantidade) > 100000 then raise exception 'Quantidade inválida.'; end if;
  perform add_xp(uid, quantidade, 'admin: ' || coalesce(motivo, ''));
  perform log_admin('ajuste de XP', 'user', uid::text, json_build_object('xp', quantidade, 'motivo', motivo)::jsonb);
  if quantidade > 0 then insert into notifications (user_id, type, title, body) values (uid, 'reward', 'Você ganhou ' || quantidade || ' XP da equipe! 🎁', motivo); end if;
end $$;
grant execute on function public.admin_adjust_xp(uuid, integer, text) to authenticated;

-- Dar ou remover itens (molduras, banners, selos)
create or replace function public.admin_cosmetic(uid uuid, cid text, dar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Só administradores podem dar itens.'; end if;
  if dar then perform grant_cosmetic(uid, cid);
  else
    delete from user_cosmetics where user_id = uid and cosmetic_id = cid;
    perform set_config('cc.sistema', 'on', true);
    update profiles set equipped_frame = null where id = uid and equipped_frame = cid;
    update profiles set equipped_banner = null where id = uid and equipped_banner = cid;
    perform set_config('cc.sistema', 'off', true);
  end if;
  perform log_admin(case when dar then 'item concedido' else 'item removido' end, 'user', uid::text, json_build_object('item', cid)::jsonb);
end $$;
grant execute on function public.admin_cosmetic(uuid, text, boolean) to authenticated;

-- Definir cargos personalizados de um usuário
create or replace function public.admin_set_titles(uid uuid, ids text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Só administradores podem dar cargos.'; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set titles = (select coalesce(array_agg(id order by sort), '{}') from site_titles where id = any(ids)) where id = uid;
  perform set_config('cc.sistema', 'off', true);
  perform log_admin('cargos', 'user', uid::text, json_build_object('cargos', ids)::jsonb);
end $$;
grant execute on function public.admin_set_titles(uuid, text[]) to authenticated;

-- Aviso global no topo do site (configurações públicas, sem expor as demais)
create or replace function public.public_settings() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('aviso', (select value from settings where key = 'aviso_site'));
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- Registro também para ações já existentes do painel
create or replace function public.log_moderacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_staff() then return null; end if;
  if tg_op = 'DELETE' then
    perform log_admin('excluiu ' || tg_table_name, tg_table_name, old.id::text, null);
  elsif tg_op = 'UPDATE' and (to_jsonb(new) ? 'status') and (to_jsonb(new)->>'status') is distinct from (to_jsonb(old)->>'status') then
    perform log_admin('status ' || tg_table_name || ': ' || (to_jsonb(new)->>'status'), tg_table_name, new.id::text, null);
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['reviews','posts','communities','news','games','reports'] loop
    execute format('drop trigger if exists log_mod_%1$s on public.%1$s', t);
    execute format('create trigger log_mod_%1$s after update or delete on public.%1$s for each row execute function public.log_moderacao()', t);
  end loop;
end $$;

-- Estatísticas: cadastros por dia (30 dias) e totais por permissão
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'acesso negado'; end if;
  return json_build_object(
    'users',        (select count(*) from profiles),
    'users_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'banned',       (select count(*) from profiles where banned and (banned_until is null or banned_until > now())),
    'staff',        (select count(*) from profiles where role <> 'user'),
    'games',        (select count(*) from games),
    'reviews',      (select count(*) from reviews),
    'reviews_7d',   (select count(*) from reviews where created_at > now() - interval '7 days'),
    'communities',  (select count(*) from communities),
    'posts',        (select count(*) from posts),
    'messages_new', (select count(*) from contact_messages where status = 'novo'),
    'reports_open', (select count(*) from reports where status = 'aberta'),
    'events_next',  (select count(*) from events where starts_at > now()),
    'active_7d',    (select count(distinct user_id) from xp_log where created_at > now() - interval '7 days'),
    'signups',      (select coalesce(json_agg(json_build_object('dia', d::date, 'n', (select count(*) from profiles where created_at::date = d::date)) order by d), '[]')
                     from generate_series(current_date - 29, current_date, interval '1 day') d),
    'top_games',    (select coalesce(json_agg(t), '[]'::json) from (
                       select title, avg_rating, reviews_count from games
                       where reviews_count > 0 order by avg_rating desc, reviews_count desc limit 5) t)
  );
end $$;

-- =====================================================================
-- ITENS PERSONALIZADOS: admin cria molduras, banners e selos pelo painel
-- =====================================================================
alter table public.cosmetics add column if not exists custom boolean not null default false;
alter table public.cosmetics add column if not exists style jsonb;            -- aparência (cores, animação, imagem)
alter table public.cosmetics add column if not exists unlock_level integer check (unlock_level is null or unlock_level between 1 and 500);
alter table public.cosmetics add column if not exists unlock_streak integer check (unlock_streak is null or unlock_streak between 1 and 3650);
-- Valida a aparência (cores #rrggbb, imagem só do armazenamento do próprio projeto, emoji curto)
create or replace function public.cosmetic_style_ok(st jsonb) returns boolean
language plpgsql immutable as $$
declare c text;
begin
  if st is null then return true; end if;
  if jsonb_typeof(st) <> 'object' then return false; end if;
  if st ? 'cores' and st->'cores' <> 'null'::jsonb then
    if jsonb_typeof(st->'cores') <> 'array' or jsonb_array_length(st->'cores') not between 1 and 6 then return false; end if;
    for c in select jsonb_array_elements_text(st->'cores') loop
      if c !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
    end loop;
  end if;
  if coalesce(st->>'imagem', '') <> '' and st->>'imagem' !~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9/_.-]+$' then return false; end if;
  if char_length(coalesce(st->>'emoji', '')) > 4 then return false; end if;
  return true;
end $$;
alter table public.cosmetics drop constraint if exists cosmetics_style_ok;
alter table public.cosmetics add constraint cosmetics_style_ok check (public.cosmetic_style_ok(style));

-- Recompensas automáticas também para itens criados no painel
create or replace function public.rewards_on_xp() returns trigger
language plpgsql security definer set search_path = public as $$
declare lv int := level_of(new.xp);
begin
  if level_of(old.xp) >= lv then return null; end if;
  if lv >= 5  then perform grant_cosmetic(new.id, 'f_bronze'); end if;
  if lv >= 10 then perform grant_cosmetic(new.id, 'f_prata'); end if;
  if lv >= 15 then perform grant_cosmetic(new.id, 'b_neon'); end if;
  if lv >= 20 then perform grant_cosmetic(new.id, 'f_ouro'); end if;
  if lv >= 30 then perform grant_cosmetic(new.id, 'f_diamante'); end if;
  if lv >= 40 then perform grant_cosmetic(new.id, 'b_galaxia'); end if;
  if lv >= 50 then perform grant_cosmetic(new.id, 'f_lenda'); end if;
  perform grant_cosmetic(new.id, c.id) from cosmetics c where c.unlock_level is not null and c.unlock_level <= lv;
  insert into notifications (user_id, type, title, body, link)
  values (new.id, 'levelup', 'Você subiu para o nível ' || lv || '! 🎉', 'Veja as recompensas em Conquistas.', 'conquistas.html');
  return null;
end $$;

create or replace function public.streak_rewards() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.streak_current > coalesce(old.streak_current, 0) then
    perform grant_cosmetic(new.id, c.id) from cosmetics c where c.unlock_streak is not null and c.unlock_streak <= new.streak_current;
  end if;
  return null;
end $$;
drop trigger if exists profiles_streak_rewards on public.profiles;
create trigger profiles_streak_rewards after update of streak_current on public.profiles
  for each row execute function public.streak_rewards();

-- Ao criar/alterar a regra de um item, quem já cumpre recebe na hora
create or replace function public.cosmetic_retro_grant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unlock_level is not null then
    perform grant_cosmetic(p.id, new.id) from profiles p where level_of(p.xp) >= new.unlock_level;
  end if;
  if new.unlock_streak is not null then
    perform grant_cosmetic(p.id, new.id) from profiles p where p.streak_best >= new.unlock_streak;
  end if;
  return null;
end $$;
drop trigger if exists cosmetics_retro on public.cosmetics;
create trigger cosmetics_retro after insert or update of unlock_level, unlock_streak on public.cosmetics
  for each row execute function public.cosmetic_retro_grant();

-- Itens personalizados podem ser excluídos; os originais do site não
drop policy if exists cosmetics_admin on public.cosmetics;
drop policy if exists cosmetics_admin_ins on public.cosmetics;
create policy cosmetics_admin_ins on public.cosmetics for insert with check (is_admin() and custom);
drop policy if exists cosmetics_admin_upd on public.cosmetics;
create policy cosmetics_admin_upd on public.cosmetics for update using (is_admin()) with check (is_admin());
drop policy if exists cosmetics_admin_del on public.cosmetics;
create policy cosmetics_admin_del on public.cosmetics for delete using (is_admin() and custom);

-- Admin pode enviar imagens de itens para a pasta "itens/" do armazenamento (já coberto pela política media_admin)

-- Ao excluir um item, ele sai de quem estava usando
create or replace function public.cosmetic_before_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cc.sistema', 'on', true);
  update profiles set equipped_frame = null where equipped_frame = old.id;
  update profiles set equipped_banner = null where equipped_banner = old.id;
  perform set_config('cc.sistema', 'off', true);
  return old;
end $$;
drop trigger if exists cosmetics_bd on public.cosmetics;
create trigger cosmetics_bd before delete on public.cosmetics for each row execute function public.cosmetic_before_delete();

-- =====================================================================
-- SOCIAL V2: críticas úteis e comentários, listas, histórico de preço,
-- mensagens diretas, "procurando grupo", trailers, Twitch e push
-- =====================================================================

-- ---------- Críticas: "útil" e comentários ----------
alter table public.reviews add column if not exists helpful_count integer not null default 0;
alter table public.reviews add column if not exists comments_count integer not null default 0;

create table if not exists public.review_votes (
  review_id  bigint not null references public.reviews(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
alter table public.review_votes enable row level security;
drop policy if exists rv_read on public.review_votes;
create policy rv_read on public.review_votes for select using (true);
drop policy if exists rv_ins on public.review_votes;
create policy rv_ins on public.review_votes for insert with check (
  user_id = auth.uid() and is_active_user()
  and not exists (select 1 from reviews r where r.id = review_id and r.user_id = auth.uid()));   -- não vota na própria
drop policy if exists rv_del on public.review_votes;
create policy rv_del on public.review_votes for delete using (user_id = auth.uid());

create table if not exists public.review_comments (
  id          bigserial primary key,
  review_id   bigint not null references public.reviews(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  status      text not null default 'published' check (status in ('published','hidden')),
  created_at  timestamptz not null default now()
);
create index if not exists rc_review_idx on public.review_comments(review_id, created_at);
alter table public.review_comments enable row level security;
drop policy if exists rc_read on public.review_comments;
create policy rc_read on public.review_comments for select using (status = 'published' or user_id = auth.uid() or is_staff());
drop policy if exists rc_ins on public.review_comments;
create policy rc_ins on public.review_comments for insert with check (user_id = auth.uid() and is_active_user() and status = 'published');
drop policy if exists rc_del on public.review_comments;
create policy rc_del on public.review_comments for delete using (user_id = auth.uid() or is_staff());
drop policy if exists rc_staff on public.review_comments;
create policy rc_staff on public.review_comments for update using (is_staff()) with check (is_staff());

insert into public.cosmetics (id, kind, name, description, rarity, icon, sort) values
  ('s_util10', 'badge', 'Crítica Útil', 'Receba 10 votos de "útil" nas suas avaliações', 'rara', '👍', 150),
  ('s_util100', 'badge', 'Crítico Confiável', 'Receba 100 votos de "útil" nas suas avaliações', 'lendaria', '🎖️', 160)
on conflict (id) do nothing;

create or replace function public.review_votes_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid bigint := coalesce(new.review_id, old.review_id); autor uuid; total int;
begin
  update reviews set helpful_count = (select count(*) from review_votes where review_id = rid) where id = rid
    returning user_id into autor;
  if tg_op = 'INSERT' then
    perform add_xp(autor, 2, 'crítica útil');
    select coalesce(sum(helpful_count), 0) into total from reviews where user_id = autor;
    if total >= 10 then perform grant_cosmetic(autor, 's_util10'); end if;
    if total >= 100 then perform grant_cosmetic(autor, 's_util100'); end if;
  end if;
  return null;
end $$;
drop trigger if exists review_votes_trg on public.review_votes;
create trigger review_votes_trg after insert or delete on public.review_votes for each row execute function public.review_votes_changed();

create or replace function public.review_comments_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid bigint := coalesce(new.review_id, old.review_id); r reviews; quem text; g games;
begin
  update reviews set comments_count = (select count(*) from review_comments where review_id = rid and status = 'published') where id = rid returning * into r;
  if tg_op = 'INSERT' and r.user_id <> new.user_id then
    select username into quem from profiles where id = new.user_id;
    select * into g from games where id = r.game_id;
    insert into notifications (user_id, type, title, body, link)
    values (r.user_id, 'comment', quem || ' comentou sua avaliação de ' || g.title, left(new.body, 140), 'jogo.html?slug=' || g.slug || '#r' || rid);
  end if;
  return null;
end $$;
drop trigger if exists review_comments_trg on public.review_comments;
create trigger review_comments_trg after insert or delete or update of status on public.review_comments for each row execute function public.review_comments_changed();

-- ---------- Listas pessoais ----------
create table if not exists public.user_lists (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 500),
  is_public   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists public.list_items (
  list_id    bigint not null references public.user_lists(id) on delete cascade,
  game_id    integer not null references public.games(id) on delete cascade,
  position   integer not null default 0,
  note       text check (char_length(note) <= 200),
  primary key (list_id, game_id)
);
alter table public.user_lists enable row level security;
alter table public.list_items enable row level security;
drop policy if exists ul_read on public.user_lists;
create policy ul_read on public.user_lists for select using (is_public or user_id = auth.uid() or is_staff());
drop policy if exists ul_write on public.user_lists;
create policy ul_write on public.user_lists for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_active_user());
drop policy if exists li_read on public.list_items;
create policy li_read on public.list_items for select using (exists (select 1 from user_lists l where l.id = list_id and (l.is_public or l.user_id = auth.uid() or is_staff())));
drop policy if exists li_write on public.list_items;
create policy li_write on public.list_items for all using (exists (select 1 from user_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from user_lists l where l.id = list_id and l.user_id = auth.uid()));

-- ---------- Histórico de preço (gravado automaticamente quando o preço muda) ----------
create table if not exists public.price_history (
  id           bigserial primary key,
  game_id      integer not null references public.games(id) on delete cascade,
  store        text not null,
  price_cents  integer,
  discount_pct integer not null default 0,
  recorded_at  timestamptz not null default now()
);
create index if not exists ph_game_idx on public.price_history(game_id, recorded_at desc);
alter table public.price_history enable row level security;
drop policy if exists ph_read on public.price_history;
create policy ph_read on public.price_history for select using (true);

create or replace function public.deals_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents or new.discount_pct is distinct from old.discount_pct then
    insert into price_history (game_id, store, price_cents, discount_pct) values (new.game_id, new.store, new.price_cents, new.discount_pct);
  end if;
  return null;
end $$;
drop trigger if exists deals_history_trg on public.deals;
create trigger deals_history_trg after insert or update on public.deals for each row execute function public.deals_history();

create or replace function public.price_summary(gid int) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'menor', (select json_build_object('preco', price_cents, 'loja', store, 'quando', recorded_at) from price_history
              where game_id = gid and price_cents is not null order by price_cents, recorded_at desc limit 1),
    'desde', (select min(recorded_at) from price_history where game_id = gid),
    'pontos', (select coalesce(json_agg(json_build_object('quando', recorded_at, 'preco', price_cents, 'loja', store) order by recorded_at), '[]')
               from (select * from price_history where game_id = gid and price_cents is not null order by recorded_at desc limit 60) x));
$$;

-- ---------- Mensagens diretas entre amigos ----------
create table if not exists public.direct_messages (
  id          bigserial primary key,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists dm_par_idx on public.direct_messages(least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at desc);
alter table public.direct_messages enable row level security;
drop policy if exists dm_read on public.direct_messages;
create policy dm_read on public.direct_messages for select using (auth.uid() in (sender_id, receiver_id));
drop policy if exists dm_send on public.direct_messages;
create policy dm_send on public.direct_messages for insert with check (
  sender_id = auth.uid() and is_active_user() and read = false
  and exists (select 1 from friendships f where f.user_a = least(sender_id, receiver_id) and f.user_b = greatest(sender_id, receiver_id) and f.status = 'aceita'));
drop policy if exists dm_mark on public.direct_messages;
create policy dm_mark on public.direct_messages for update using (receiver_id = auth.uid()) with check (receiver_id = auth.uid());
drop policy if exists dm_del on public.direct_messages;
create policy dm_del on public.direct_messages for delete using (sender_id = auth.uid());
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;

-- Aviso de mensagem nova (no máximo um aviso não lido por conversa)
create or replace function public.dm_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text;
begin
  select username into quem from profiles where id = new.sender_id;
  if not exists (select 1 from notifications where user_id = new.receiver_id and type = 'dm' and not read and link = 'amigos.html?chat=' || quem) then
    insert into notifications (user_id, type, title, body, link)
    values (new.receiver_id, 'dm', 'Mensagem de ' || quem, left(new.body, 140), 'amigos.html?chat=' || quem);
  end if;
  return null;
end $$;
drop trigger if exists dm_notify_trg on public.direct_messages;
create trigger dm_notify_trg after insert on public.direct_messages for each row execute function public.dm_notify();

-- ---------- "Procurando grupo agora" ----------
create table if not exists public.lfg_posts (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  game_id     integer references public.games(id) on delete set null,
  platform    text check (platform in ('PlayStation','Xbox','PC','Nintendo','Mobile','Crossplay')),
  slots       integer check (slots is null or slots between 1 and 20),
  note        text check (char_length(note) <= 200),
  expires_at  timestamptz not null default now() + interval '1 hour',
  created_at  timestamptz not null default now()
);
create index if not exists lfg_ativos_idx on public.lfg_posts(expires_at desc);
create table if not exists public.lfg_interest (
  lfg_id      bigint not null references public.lfg_posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (lfg_id, user_id)
);
alter table public.lfg_posts enable row level security;
alter table public.lfg_interest enable row level security;
drop policy if exists lfg_read on public.lfg_posts;
create policy lfg_read on public.lfg_posts for select using (true);
drop policy if exists lfg_ins on public.lfg_posts;
create policy lfg_ins on public.lfg_posts for insert with check (
  user_id = auth.uid() and is_active_user() and expires_at <= now() + interval '6 hours'
  and (select count(*) from lfg_posts where user_id = auth.uid() and expires_at > now()) < 3);
drop policy if exists lfg_upd on public.lfg_posts;
create policy lfg_upd on public.lfg_posts for update using (user_id = auth.uid()) with check (user_id = auth.uid() and expires_at <= now() + interval '6 hours');
drop policy if exists lfg_del on public.lfg_posts;
create policy lfg_del on public.lfg_posts for delete using (user_id = auth.uid() or is_staff());
drop policy if exists lfgi_read on public.lfg_interest;
create policy lfgi_read on public.lfg_interest for select using (true);
drop policy if exists lfgi_ins on public.lfg_interest;
create policy lfgi_ins on public.lfg_interest for insert with check (user_id = auth.uid() and is_active_user());
drop policy if exists lfgi_del on public.lfg_interest;
create policy lfgi_del on public.lfg_interest for delete using (user_id = auth.uid());

create or replace function public.lfg_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text; jogo text;
begin
  select username into quem from profiles where id = new.user_id;
  select title into jogo from games where id = new.game_id;
  insert into notifications (user_id, type, title, body, link)
  select case when f.user_a = new.user_id then f.user_b else f.user_a end, 'lfg',
         '🎮 ' || quem || ' quer jogar ' || coalesce(jogo, 'agora'), coalesce(new.platform || ' · ', '') || coalesce(new.note, ''), 'index.html#grupo'
  from friendships f where new.user_id in (f.user_a, f.user_b) and f.status = 'aceita';
  return null;
end $$;
drop trigger if exists lfg_notify_trg on public.lfg_posts;
create trigger lfg_notify_trg after insert on public.lfg_posts for each row execute function public.lfg_notify();

create or replace function public.lfg_interest_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare dono uuid; quem text;
begin
  select user_id into dono from lfg_posts where id = new.lfg_id;
  select username into quem from profiles where id = new.user_id;
  if dono <> new.user_id then
    insert into notifications (user_id, type, title, body, link)
    values (dono, 'lfg', quem || ' quer jogar com você!', 'Chame para uma call ou adicione como amigo.', 'perfil.html?u=' || quem);
  end if;
  return null;
end $$;
drop trigger if exists lfg_interest_trg on public.lfg_interest;
create trigger lfg_interest_trg after insert on public.lfg_interest for each row execute function public.lfg_interest_notify();

-- ---------- Trailers (IGDB) e Twitch ----------
alter table public.games add column if not exists videos text[] not null default '{}';     -- IDs de vídeos do YouTube
alter table public.profiles add column if not exists twitch_user text check (twitch_user is null or twitch_user ~ '^[A-Za-z0-9_]{3,25}$');

-- ---------- Notificações no celular (Web Push) ----------
create table if not exists public.push_subscriptions (
  endpoint    text primary key check (endpoint ~ '^https://'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cada notificação nova é enviada ao celular pela função do Netlify (via pg_net, se disponível).
-- Configure no SQL Editor (uma vez):
--   insert into settings (key, value) values ('push', '{"url":"https://SEU-SITE.netlify.app/.netlify/functions/push","segredo":"MESMO_PUSH_SECRET_DO_NETLIFY"}')
--   on conflict (key) do update set value = excluded.value;
do $$ begin create extension if not exists pg_net; exception when others then raise notice 'pg_net indisponível: push no celular desativado.'; end $$;

create or replace function public.push_on_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  select value into cfg from settings where key = 'push';
  if cfg is null or cfg->>'url' is null or not exists (select 1 from push_subscriptions where user_id = new.user_id) then return null; end if;
  perform net.http_post(
    url := cfg->>'url',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg->>'segredo'),
    body := jsonb_build_object('user_id', new.user_id, 'title', new.title, 'body', new.body, 'link', new.link, 'type', new.type));
  return null;
exception when others then return null;   -- push nunca pode atrapalhar a notificação no site
end $$;
drop trigger if exists push_trg on public.notifications;
create trigger push_trg after insert on public.notifications for each row execute function public.push_on_notification();

-- Exportação LGPD e limpeza: "procurando grupo" vencido some depois de 1 dia
create or replace function public.cleanup_lfg() returns void language sql security definer set search_path = public as $$
  delete from lfg_posts where expires_at < now() - interval '1 day';
$$;
do $$ begin
  perform cron.unschedule('limpar-lfg') where exists (select 1 from cron.job where jobname = 'limpar-lfg');
  perform cron.schedule('limpar-lfg', '7 * * * *', 'select public.cleanup_lfg()');
exception when others then null; end $$;

-- Denúncias também de comentários
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('review','post','profile','community','event','comment'));

-- =====================================================================
-- ENGAJAMENTO: feed de posts com imagem e curtidas, vitrine do perfil,
-- Steam "jogando agora", configurações e moderadores de comunidade,
-- integração inicial (onboarding) e exclusão de itens originais
-- =====================================================================

-- ---------- Itens: originais podem ser "excluídos" (desativados) pelo admin ----------
alter table public.cosmetics add column if not exists active boolean not null default true;
create or replace function public.cosmetic_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active then
    perform set_config('cc.sistema', 'on', true);
    update profiles set equipped_frame = null where equipped_frame = new.id;
    update profiles set equipped_banner = null where equipped_banner = new.id;
    perform set_config('cc.sistema', 'off', true);
  end if;
  return null;
end $$;
drop trigger if exists cosmetics_au on public.cosmetics;
create trigger cosmetics_au after update of active on public.cosmetics for each row execute function public.cosmetic_after_update();

-- ---------- Perfil: vitrine de jogos, Steam e onboarding ----------
alter table public.profiles add column if not exists showcase_games bigint[] not null default '{}';
alter table public.profiles add column if not exists steam_id text;
alter table public.profiles add column if not exists onboarded boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_showcase_max check (cardinality(showcase_games) <= 6);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_steam_id_fmt check (steam_id is null or steam_id ~ '^\d{17}$');
exception when duplicate_object then null; end $$;
-- Quem já usa o site não precisa ver o tutorial
update public.profiles set onboarded = true where not onboarded and created_at < now() - interval '1 day';

-- steam_id só é gravado pelo servidor (importação da Steam): impede alguém de se passar por outra conta
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('cc.sistema', true), '') <> 'on' then
    new.role := old.role; new.xp := old.xp; new.banned := old.banned;
    new.banned_until := old.banned_until; new.ban_reason := old.ban_reason; new.titles := old.titles;
    new.streak_current := old.streak_current; new.streak_best := old.streak_best; new.last_checkin := old.last_checkin;
    new.equipped_frame := old.equipped_frame; new.equipped_banner := old.equipped_banner;
    if new.steam_id is not null then new.steam_id := old.steam_id; end if;   -- pode apagar (desfazer importação), não trocar
  end if;
  return new;
end $$;

alter table public.user_games add column if not exists last_played timestamptz;
alter table public.user_games add column if not exists hours_2weeks numeric;

-- ---------- Comunidades: banner, ícone e moderadores ----------
alter table public.communities add column if not exists banner_url text;
alter table public.communities add column if not exists icon_url text;
do $$ begin
  alter table public.communities add constraint communities_imgs_fmt check (
    (banner_url is null or banner_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/')
    and (icon_url is null or icon_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/'));
exception when duplicate_object then null; end $$;
alter table public.community_members add column if not exists role text not null default 'member';
do $$ begin
  alter table public.community_members add constraint community_members_role_chk check (role in ('member','mod'));
exception when duplicate_object then null; end $$;

create or replace function public.is_comm_mod(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff()
      or exists (select 1 from communities where id = cid and owner_id = auth.uid())
      or exists (select 1 from community_members where community_id = cid and user_id = auth.uid() and role = 'mod');
$$;

-- Só o dono (ou a equipe) promove/rebaixa moderadores e remove membros
create or replace function public.set_community_role(cid bigint, uid uuid, papel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_staff() or exists (select 1 from communities where id = cid and owner_id = auth.uid())) then
    raise exception 'Só o dono da comunidade pode fazer isso.';
  end if;
  if papel = 'remover' then
    delete from community_members where community_id = cid and user_id = uid
      and uid <> (select owner_id from communities where id = cid);
  elsif papel in ('member','mod') then
    update community_members set role = papel where community_id = cid and user_id = uid;
  else raise exception 'Cargo inválido.';
  end if;
end $$;
revoke execute on function public.set_community_role(bigint,uuid,text) from public, anon;
grant execute on function public.set_community_role(bigint,uuid,text) to authenticated;

-- ---------- Posts: perfil/feed (sem comunidade), imagem, jogo marcado, curtidas e comentários ----------
alter table public.posts alter column community_id drop not null;
alter table public.posts add column if not exists image_url text;
alter table public.posts add column if not exists game_id bigint references public.games(id) on delete set null;
alter table public.posts add column if not exists likes_count integer not null default 0;
alter table public.posts add column if not exists comments_count integer not null default 0;
do $$ begin
  alter table public.posts add constraint posts_image_fmt check (image_url is null or image_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/');
exception when duplicate_object then null; end $$;
create index if not exists posts_feed_idx on public.posts(created_at desc) where status = 'published';
create index if not exists posts_user_idx on public.posts(user_id, created_at desc);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (
  (status = 'published' and (community_id is null or can_see_community(community_id))) or user_id = auth.uid() or is_staff());
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (
  user_id = auth.uid() and is_active_user() and status = 'published'
  and (community_id is null or exists (select 1 from community_members m where m.community_id = posts.community_id and m.user_id = auth.uid())));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (user_id = auth.uid() or is_staff() or (community_id is not null and is_comm_mod(community_id)));

-- XP por post: no máximo 5 posts por dia contam (evita farmar XP)
create or replace function public.posts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from posts where user_id = new.user_id and created_at > now() - interval '1 day') <= 5 then
    perform add_xp(new.user_id, 5, 'post');
  end if;
  return null;
end $$;

create table if not exists public.post_likes (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.post_comments (
  id         bigserial primary key,
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_idx on public.post_comments(post_id, created_at);
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists pl_read on public.post_likes;
create policy pl_read on public.post_likes for select using (exists (select 1 from posts p where p.id = post_id));
drop policy if exists pl_ins on public.post_likes;
create policy pl_ins on public.post_likes for insert with check (user_id = auth.uid() and is_active_user() and exists (select 1 from posts p where p.id = post_id));
drop policy if exists pl_del on public.post_likes;
create policy pl_del on public.post_likes for delete using (user_id = auth.uid());

drop policy if exists pc_read on public.post_comments;
create policy pc_read on public.post_comments for select using (exists (select 1 from posts p where p.id = post_id));
drop policy if exists pc_ins on public.post_comments;
create policy pc_ins on public.post_comments for insert with check (user_id = auth.uid() and is_active_user() and exists (select 1 from posts p where p.id = post_id));
drop policy if exists pc_del on public.post_comments;
create policy pc_del on public.post_comments for delete using (
  user_id = auth.uid() or is_staff()
  or exists (select 1 from posts p where p.id = post_id and (p.user_id = auth.uid() or (p.community_id is not null and is_comm_mod(p.community_id)))));

-- Contadores + aviso para o autor
create or replace function public.post_counters() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid bigint := coalesce(new.post_id, old.post_id); autor uuid; quem text; titulo text; texto text;
begin
  -- Ramos separados: NEW de post_likes não tem "body" (um CASE daria erro)
  if tg_table_name = 'post_likes' then
    update posts set likes_count = (select count(*) from post_likes where post_id = pid) where id = pid returning user_id into autor;
    titulo := ' curtiu seu post';
  else
    update posts set comments_count = (select count(*) from post_comments where post_id = pid) where id = pid returning user_id into autor;
    titulo := ' comentou no seu post';
    if tg_op = 'INSERT' then texto := left(new.body, 140); end if;
  end if;
  if tg_op = 'INSERT' and autor is not null and autor <> new.user_id then
    select username into quem from profiles where id = new.user_id;
    insert into notifications (user_id, type, title, body, link) values (autor, 'post', quem || titulo, texto, 'index.html?post=' || pid);
  end if;
  return null;
end $$;
drop trigger if exists post_likes_cnt on public.post_likes;
create trigger post_likes_cnt after insert or delete on public.post_likes for each row execute function public.post_counters();
drop trigger if exists post_comments_cnt on public.post_comments;
create trigger post_comments_cnt after insert or delete on public.post_comments for each row execute function public.post_counters();

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('review','post','community','profile','comment','post_comment'));

-- Feed da página inicial: mistura recência com relevância.
-- Pontos: curtidas e comentários, +amigos, +quem eu sigo, +minhas comunidades, +jogos da minha biblioteca;
-- tudo dividido pela idade (o que é novo e relevante sobe). Respeita as permissões (RLS) de quem chama.
create or replace function public.home_feed(lim int default 20, offs int default 0)
returns setof public.posts language sql stable set search_path = public as $$
  with eu as (select auth.uid() as id),
  amigos as (select case when f.user_a = eu.id then f.user_b else f.user_a end as id
             from friendships f, eu where f.status = 'aceita' and eu.id in (f.user_a, f.user_b)),
  sigo as (select followed_id as id from follows, eu where follower_id = eu.id),
  comms as (select community_id as id from community_members, eu where user_id = eu.id),
  meus_jogos as (select game_id as id from user_games, eu where user_id = eu.id)
  select p.* from posts p
  where p.status = 'published' and p.created_at > now() - interval '30 days'
  order by (
      1 + p.likes_count * 2 + p.comments_count * 3
      + case when p.user_id in (select id from amigos) then 12 else 0 end
      + case when p.user_id in (select id from sigo) then 8 else 0 end
      + case when p.community_id in (select id from comms) then 6 else 0 end
      + case when p.game_id in (select id from meus_jogos) then 4 else 0 end
      + case when p.image_url is not null then 2 else 0 end
    ) / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.3) desc, p.id desc
  limit least(lim, 50) offset offs;
$$;
grant execute on function public.home_feed(int,int) to anon, authenticated;

-- Atividade de quem eu sigo e dos meus amigos (críticas e jogos na biblioteca), para a página inicial
create or replace function public.friends_activity(lim int default 12)
returns table (tipo text, quando timestamptz, user_id uuid, username text, avatar_url text, equipped_frame text,
               game_slug text, game_title text, cover_url text, nota int, status text)
language sql stable security definer set search_path = public as $$
  with eu as (select auth.uid() as id),
  gente as (
    select followed_id as id from follows, eu where follower_id = eu.id
    union select case when f.user_a = eu.id then f.user_b else f.user_a end from friendships f, eu where f.status = 'aceita' and eu.id in (f.user_a, f.user_b))
  (select 'review', r.created_at, pr.id, pr.username, pr.avatar_url, pr.equipped_frame, g.slug, g.title, g.cover_url, r.rating, null::text
     from reviews r join profiles pr on pr.id = r.user_id join games g on g.id = r.game_id
    where r.user_id in (select id from gente) and r.status = 'published' and r.created_at > now() - interval '14 days')
  union all
  (select 'jogo', ug.updated_at, pr.id, pr.username, pr.avatar_url, pr.equipped_frame, g.slug, g.title, g.cover_url, null, ug.status
     from user_games ug join profiles pr on pr.id = ug.user_id join games g on g.id = ug.game_id
    where ug.user_id in (select id from gente) and ug.status in ('jogando','zerado') and ug.updated_at > now() - interval '14 days')
  order by 2 desc limit least(lim, 30);
$$;
revoke execute on function public.friends_activity(int) from public, anon;
grant execute on function public.friends_activity(int) to authenticated;

-- Capturas de tela do IGDB (só o código da imagem) para o carrossel da página do jogo
alter table public.games add column if not exists screenshots text[] not null default '{}';

-- =====================================================================
-- LANÇAMENTO: relatos de problemas, registro de erros, uso do banco,
-- menções (@usuario), resumo semanal e limpeza automática
-- =====================================================================

-- ---------- Relatos de problemas (botão no rodapé) e erros automáticos do navegador ----------
create table if not exists public.app_feedback (
  id          bigserial primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('bug','sugestao','erro')),
  message     text not null check (char_length(message) between 1 and 2000),
  page        text check (char_length(page) <= 300),
  agent       text check (char_length(agent) <= 300),
  details     jsonb,
  status      text not null default 'aberto' check (status in ('aberto','resolvido')),
  created_at  timestamptz not null default now()
);
create index if not exists app_feedback_idx on public.app_feedback(status, created_at desc);
alter table public.app_feedback enable row level security;
drop policy if exists fb_ins on public.app_feedback;
-- Qualquer visitante pode relatar (erros acontecem antes do login também); o id gravado é sempre o de quem está logado
create policy fb_ins on public.app_feedback for insert with check (user_id is not distinct from auth.uid() and status = 'aberto');
drop policy if exists fb_staff on public.app_feedback;
create policy fb_staff on public.app_feedback for all using (is_staff()) with check (is_staff());

-- Limite contra abuso: no máximo 20 relatos por pessoa (ou visitante) por hora
create or replace function public.feedback_limite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (select count(*) from app_feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Muitos relatos em pouco tempo. Tente mais tarde.';
  end if;
  if new.user_id is null and (select count(*) from app_feedback where user_id is null and created_at > now() - interval '1 minute') >= 30 then
    return null; -- visitantes: descarta em silêncio se houver uma enxurrada
  end if;
  -- Erros iguais repetidos (mesma mensagem na mesma hora) não duplicam
  if new.kind = 'erro' and exists (select 1 from app_feedback where kind = 'erro' and message = new.message and created_at > now() - interval '1 hour') then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists feedback_bi on public.app_feedback;
create trigger feedback_bi before insert on public.app_feedback for each row execute function public.feedback_limite();

-- ---------- Uso do banco e do armazenamento (painel do admin) ----------
create or replace function public.admin_usage() returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not is_admin() then raise exception 'Somente administradores.'; end if;
  select json_build_object(
    'banco_bytes', pg_database_size(current_database()),
    'tabelas', (select json_agg(t) from (
        select c.relname as nome, pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as linhas
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' order by 2 desc limit 12) t),
    'arquivos', (select count(*) from storage.objects where bucket_id = 'media'),
    'arquivos_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'media')
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_usage() from public, anon;
grant execute on function public.admin_usage() to authenticated;

-- ---------- Menções: @usuario em posts e comentários avisa a pessoa ----------
create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
declare autor text; alvo record; link text; pid bigint;
begin
  if new.body !~ '@[A-Za-z0-9_]{3,30}' then return null; end if;
  select username into autor from profiles where id = new.user_id;
  if tg_table_name = 'posts' then pid := new.id; else pid := new.post_id; end if;
  link := 'index.html?post=' || pid;
  for alvo in
    select distinct p.id from profiles p
    where lower(p.username) in (select lower(m[1]) from regexp_matches(new.body, '@([A-Za-z0-9_]{3,30})', 'g') m)
      and p.id <> new.user_id
    limit 10
  loop
    insert into notifications (user_id, type, title, body, link)
    values (alvo.id, 'mencao', autor || ' mencionou você', left(new.body, 140), link);
  end loop;
  return null;
end $$;
drop trigger if exists posts_mentions on public.posts;
create trigger posts_mentions after insert on public.posts for each row execute function public.notify_mentions();
drop trigger if exists post_comments_mentions on public.post_comments;
create trigger post_comments_mentions after insert on public.post_comments for each row execute function public.notify_mentions();

-- ---------- Resumo semanal (domingo 10h de Brasília): só para quem tem novidade ----------
create or replace function public.weekly_digest() returns void
language plpgsql security definer set search_path = public as $$
declare u record; promos int; zeraram int; curtidas int; partes text[];
begin
  for u in select id from profiles where coalesce(last_checkin, created_at::date) > current_date - 30 and not banned loop
    select count(*) into promos from user_games ug join deals d on d.game_id = ug.game_id
      where ug.user_id = u.id and ug.wishlist and d.discount_pct > 0;
    select count(*) into zeraram from user_games ug
      where ug.status = 'zerado' and ug.updated_at > now() - interval '7 days'
        and ug.user_id in (select case when f.user_a = u.id then f.user_b else f.user_a end from friendships f where f.status = 'aceita' and u.id in (f.user_a, f.user_b));
    select count(*) into curtidas from post_likes l join posts p on p.id = l.post_id
      where p.user_id = u.id and l.created_at > now() - interval '7 days';
    partes := array_remove(array[
      case when promos > 0 then promos || ' jogo(s) da sua lista de desejos em promoção' end,
      case when zeraram > 0 then 'seus amigos zeraram ' || zeraram || ' jogo(s)' end,
      case when curtidas > 0 then 'seus posts receberam ' || curtidas || ' curtida(s)' end], null);
    if cardinality(partes) > 0 then
      insert into notifications (user_id, type, title, body, link)
      values (u.id, 'resumo', '📬 Seu resumo da semana', array_to_string(partes, ' · '), case when promos > 0 then 'perfil.html' else 'index.html' end);
    end if;
  end loop;
end $$;
revoke execute on function public.weekly_digest() from public, anon, authenticated;

-- Limpeza: erros automáticos com mais de 60 dias e notificações lidas com mais de 90 dias
create or replace function public.cleanup_old() returns void language sql security definer set search_path = public as $$
  delete from app_feedback where kind = 'erro' and created_at < now() - interval '60 days';
  delete from notifications where read and created_at < now() - interval '90 days';
$$;
revoke execute on function public.cleanup_old() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('resumo-semanal') where exists (select 1 from cron.job where jobname = 'resumo-semanal');
  perform cron.schedule('resumo-semanal', '0 13 * * 0', 'select public.weekly_digest()');
  perform cron.unschedule('limpeza') where exists (select 1 from cron.job where jobname = 'limpeza');
  perform cron.schedule('limpeza', '30 4 * * *', 'select public.cleanup_old()');
exception when others then null; end $$;

-- ---------- Desafios (ex.: "Melhor print da semana"): posts participam, o admin premia ----------
create table if not exists public.challenges (
  id               bigserial primary key,
  title            text not null check (char_length(title) between 3 and 80),
  description      text check (char_length(description) <= 1000),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  reward_cosmetic  text references public.cosmetics(id) on delete set null,
  reward_xp        integer not null default 100 check (reward_xp between 0 and 5000),
  winners          uuid[] not null default '{}',
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.challenges enable row level security;
drop policy if exists ch_read on public.challenges;
create policy ch_read on public.challenges for select using (true);
drop policy if exists ch_admin on public.challenges;
create policy ch_admin on public.challenges for all using (is_admin()) with check (is_admin());

alter table public.posts add column if not exists challenge_id bigint references public.challenges(id) on delete set null;
create index if not exists posts_challenge_idx on public.posts(challenge_id, likes_count desc) where challenge_id is not null;

-- Só dá para participar enquanto o desafio está aberto
create or replace function public.posts_challenge_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.challenge_id is not null and not exists (select 1 from challenges where id = new.challenge_id and now() between starts_at and ends_at) then
    raise exception 'Este desafio não está aberto.';
  end if;
  return new;
end $$;
drop trigger if exists posts_challenge_bi on public.posts;
create trigger posts_challenge_bi before insert on public.posts for each row execute function public.posts_challenge_check();

-- Premia os vencedores (item + XP + aviso). Pode ser chamado de novo para acrescentar vencedores.
create or replace function public.award_challenge(chid bigint, vencedores uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare ch challenges; v uuid;
begin
  if not is_admin() then raise exception 'Somente administradores.'; end if;
  select * into ch from challenges where id = chid;
  if ch.id is null then raise exception 'Desafio não encontrado.'; end if;
  foreach v in array vencedores loop
    continue when v = any(ch.winners);
    if ch.reward_cosmetic is not null then perform grant_cosmetic(v, ch.reward_cosmetic); end if;
    if ch.reward_xp > 0 then perform add_xp(v, ch.reward_xp, 'desafio'); end if;
    insert into notifications (user_id, type, title, body, link)
    values (v, 'desafio', '🏆 Você venceu o desafio "' || ch.title || '"!', 'Seu prêmio já está na sua conta.', 'conquistas.html');
  end loop;
  update challenges set winners = (select array_agg(distinct x) from unnest(winners || vencedores) x) where id = chid;
end $$;
revoke execute on function public.award_challenge(bigint,uuid[]) from public, anon;
grant execute on function public.award_challenge(bigint,uuid[]) to authenticated;

-- =====================================================================
-- PONTE DE VOZ OFICIAL (robô do Control Critic para várias comunidades)
-- O dono da comunidade escolhe o canal de voz; um administrador do servidor do Discord confirma
-- com /vincular <código>. Só então o robô (que roda com a chave secreta) liga a ponte.
-- =====================================================================
create table if not exists public.discord_bridges (
  community_id  bigint primary key references public.communities(id) on delete cascade,
  guild_id      text not null check (guild_id ~ '^\d{17,20}$'),
  channel_id    text not null check (channel_id ~ '^\d{17,20}$'),
  verify_code   text not null default lpad((floor(random() * 1000000))::int::text, 6, '0'),
  verified      boolean not null default false,
  verified_by   text,                    -- usuário do Discord que confirmou
  active        boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.discord_bridges enable row level security;

create or replace function public.is_comm_owner(cid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists (select 1 from communities where id = cid and owner_id = auth.uid());
$$;

drop policy if exists db_owner_read on public.discord_bridges;
create policy db_owner_read on public.discord_bridges for select using (is_comm_owner(community_id));
drop policy if exists db_owner_ins on public.discord_bridges;
create policy db_owner_ins on public.discord_bridges for insert with check (is_comm_owner(community_id) and not verified);
drop policy if exists db_owner_upd on public.discord_bridges;
create policy db_owner_upd on public.discord_bridges for update using (is_comm_owner(community_id)) with check (is_comm_owner(community_id));
drop policy if exists db_owner_del on public.discord_bridges;
create policy db_owner_del on public.discord_bridges for delete using (is_comm_owner(community_id));

-- Trocar servidor ou canal invalida a confirmação e gera um código novo; o dono não pode se "auto-verificar"
create or replace function public.discord_bridges_bu() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.verified := false; new.verified_by := null; new.created_by := auth.uid();
    else
      if new.guild_id is distinct from old.guild_id or new.channel_id is distinct from old.channel_id then
        new.verified := false; new.verified_by := null;
        new.verify_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
      else
        new.verified := old.verified; new.verified_by := old.verified_by; new.verify_code := old.verify_code;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists discord_bridges_bu on public.discord_bridges;
create trigger discord_bridges_bu before insert or update on public.discord_bridges for each row execute function public.discord_bridges_bu();

-- Configurações públicas: agora inclui o ID do aplicativo do robô (para o botão "Adicionar ao Discord")
create or replace function public.public_settings() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('aviso', (select value from settings where key = 'aviso_site'),
                           'robo_discord', (select value->>'client_id' from settings where key = 'robo_discord'));
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- =====================================================================
-- INSTAGRAM: o robô publica o resumo do dia e as notícias urgentes
-- =====================================================================
alter table public.news add column if not exists instagram_status text;   -- 'urgente' = publicar agora
alter table public.news add column if not exists instagram_at timestamptz; -- quando foi publicada no Instagram
alter table public.news add column if not exists instagram_url text;
do $$ begin
  alter table public.news add constraint news_instagram_status_chk check (instagram_status is null or instagram_status in ('urgente','erro'));
exception when duplicate_object then null; end $$;

-- Segredos usados só pelos robôs (token do Instagram, que é renovado sozinho).
-- RLS ligado e SEM políticas: ninguém do site lê; só a chave secreta (service role) acessa.
create table if not exists public.app_secrets (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- =====================================================================
-- INSTAGRAM: memes da comunidade (o autor autoriza, a equipe aprova, o robô publica com crédito)
-- =====================================================================
alter table public.posts add column if not exists ig_ok boolean not null default false;       -- o autor autorizou ir para o Instagram
alter table public.posts add column if not exists ig_aprovado boolean not null default false; -- só a equipe marca
alter table public.posts add column if not exists ig_recusado boolean not null default false;
alter table public.posts add column if not exists instagram_at timestamptz;
alter table public.posts add column if not exists instagram_url text;
create index if not exists posts_ig_fila_idx on public.posts(created_at) where ig_ok and instagram_at is null;
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (
  user_id = auth.uid() and is_active_user() and status = 'published'
  and not ig_aprovado and not ig_recusado and instagram_at is null and instagram_url is null
  and (ig_ok = false or image_url is not null)
  and (community_id is null or exists (select 1 from community_members m where m.community_id = posts.community_id and m.user_id = auth.uid())));

-- =====================================================================
-- VÁRIAS CATEGORIAS POR JOGO (até 3, a primeira é a principal = category_id)
-- =====================================================================
alter table public.games add column if not exists category_ids integer[] not null default '{}';
create index if not exists games_cat_ids_idx on public.games using gin (category_ids);
update public.games set category_ids = array[category_id] where category_ids = '{}' and category_id is not null;
-- jogo cadastrado/editado à mão: a categoria principal sempre faz parte da lista
create or replace function public.games_cat_ids() returns trigger language plpgsql as $$
begin
  if new.category_id is not null and not (new.category_id = any(new.category_ids)) then
    new.category_ids := array[new.category_id] || coalesce(new.category_ids, '{}');
  end if;
  new.category_ids := new.category_ids[1:3];
  return new;
end $$;
drop trigger if exists games_cat_ids_trg on public.games;
create trigger games_cat_ids_trg before insert or update of category_id, category_ids on public.games
  for each row execute function public.games_cat_ids();

-- =====================================================================
-- MAIS RECOMPENSAS: desafios com vários prêmios e conquistas novas com moldura/banner
-- =====================================================================
alter table public.challenges add column if not exists reward_extras text[] not null default '{}';  -- prêmios a mais (moldura, banner, selo)

create or replace function public.award_challenge(chid bigint, vencedores uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare ch challenges; v uuid; extra text;
begin
  if not is_admin() then raise exception 'Somente administradores.'; end if;
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

insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style) values
  ('s_cacador',   'badge',  'Caçador de Ofertas', 'Tenha 10 jogos na lista de desejos', 'comum', '🎯', 1100, false, null),
  ('f_cacador',   'frame',  'Caçador de Ofertas', 'Tenha 30 jogos na lista de desejos', 'rara', null, 1101, true,
     '{"cores":["#00e676","#ffd33c"],"animado":true,"velocidade":6,"emoji":"💸"}'),
  ('s_ecletico',  'badge',  'Eclético', 'Avalie jogos de 5 categorias diferentes', 'rara', '🎨', 1102, false, null),
  ('b_ecletico',  'banner', 'Eclético', 'Avalie jogos de 8 categorias diferentes', 'epica', null, 1103, true,
     '{"cores":["#ff4081","#7c4dff","#00b0ff","#00e676"]}'),
  ('f_maratona',  'frame',  'Maratonista', 'Marque 25 jogos como zerados', 'epica', null, 1104, true,
     '{"cores":["#ff6d00","#ffd33c","#ff1744"],"animado":true,"brilho":true,"velocidade":3,"emoji":"🏁"}'),
  ('b_maratona',  'banner', 'Maratonista Lendário', 'Marque 100 jogos como zerados', 'lendaria', null, 1105, true,
     '{"cores":["#0b0b0d","#ff6d00","#ffd33c"]}'),
  ('f_popular',   'frame',  'Estrela da Comunidade', 'Receba 50 curtidas nos seus posts', 'epica', null, 1106, true,
     '{"cores":["#ff4081","#ffd33c","#ff4081"],"animado":true,"brilho":true,"velocidade":5,"emoji":"💖"}')
on conflict (id) do nothing;

create or replace function public.check_achievements_extra(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if uid is null then return; end if;
  select count(*) into n from user_games where user_id = uid and wishlist;
  if n >= 10 then perform grant_cosmetic(uid, 's_cacador'); end if;
  if n >= 30 then perform grant_cosmetic(uid, 'f_cacador'); end if;
  select count(distinct c) into n from reviews r join games g on g.id = r.game_id, unnest(case when g.category_ids = '{}' then array[g.category_id] else g.category_ids end) c
   where r.user_id = uid and c is not null;
  if n >= 5 then perform grant_cosmetic(uid, 's_ecletico'); end if;
  if n >= 8 then perform grant_cosmetic(uid, 'b_ecletico'); end if;
  select count(*) into n from user_games where user_id = uid and status = 'zerado';
  if n >= 25 then perform grant_cosmetic(uid, 'f_maratona'); end if;
  if n >= 100 then perform grant_cosmetic(uid, 'b_maratona'); end if;
  select coalesce(sum(likes_count), 0) into n from posts where user_id = uid;
  if n >= 50 then perform grant_cosmetic(uid, 'f_popular'); end if;
exception when others then null;   -- conquista nunca pode atrapalhar a ação da pessoa
end $$;
revoke execute on function public.check_achievements_extra(uuid) from public, anon, authenticated;

create or replace function public.achievements_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  -- IF em vez de CASE: o CASE avalia campos que não existem em NEW de outras tabelas
  if tg_table_name = 'follows' then uid := new.followed_id;
  elsif tg_table_name = 'events' then uid := new.creator_id;
  elsif tg_table_name = 'communities' then uid := new.owner_id;
  else uid := new.user_id;
  end if;
  perform check_achievements(uid);
  perform check_achievements_extra(uid);
  return null;
end $$;

-- =====================================================================
-- CONQUISTAS DA STEAM (gravadas só pelo servidor na importação)
-- =====================================================================
alter table public.user_games add column if not exists ach_done integer;
alter table public.user_games add column if not exists ach_total integer;
alter table public.profiles add column if not exists steam_conquistas jsonb;   -- { total, jogos, raras: [{jogo,nome,icone,pct}], em }
create or replace function public.protect_steam_conquistas() returns trigger
language plpgsql set search_path = public as $$
begin
  -- o usuário pode apagar (desfazer importação), mas não inventar conquistas
  if auth.uid() is not null and not is_admin() and new.steam_conquistas is not null then new.steam_conquistas := old.steam_conquistas; end if;
  return new;
end $$;
drop trigger if exists profiles_steam_conq on public.profiles;
create trigger profiles_steam_conq before update of steam_conquistas on public.profiles
  for each row execute function public.protect_steam_conquistas();

-- =====================================================================
-- SOCIAL INSPIRADO NO INSTAGRAM: stories (24 h, enquete, pergunta, música, melhores amigos, destaques),
-- notas (status de 60 caracteres por 24 h), música do Spotify no perfil e nos posts, avisos de comunidade
-- =====================================================================
-- Música: guarda só "track/ID" (ou album/playlist) do Spotify; o site mostra o player oficial
create or replace function public.spotify_ok(m text) returns boolean language sql immutable as $$
  select m is null or m ~ '^(track|album|playlist|episode)/[A-Za-z0-9]{22}$'
$$;
alter table public.profiles add column if not exists nota text;
alter table public.profiles add column if not exists nota_at timestamptz;
alter table public.profiles add column if not exists musica text;
alter table public.posts add column if not exists musica text;
alter table public.posts add column if not exists aviso boolean not null default false;
do $$ begin
  alter table public.profiles add constraint profiles_nota_len check (nota is null or char_length(nota) <= 60);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_musica_ok check (public.spotify_ok(musica));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.posts add constraint posts_musica_ok check (public.spotify_ok(musica));
exception when duplicate_object then null; end $$;

-- Aviso fixado na comunidade: só dono/moderador da comunidade pode marcar
create or replace function public.posts_aviso_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.aviso and (new.community_id is null or not is_comm_mod(new.community_id)) then new.aviso := false; end if;
  return new;
end $$;
drop trigger if exists posts_aviso_bi on public.posts;
create trigger posts_aviso_bi before insert or update of aviso on public.posts for each row execute function public.posts_aviso_check();

-- Melhores amigos (lista de quem vê os stories "só melhores amigos")
create table if not exists public.close_friends (
  owner_id  uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  primary key (owner_id, friend_id),
  check (owner_id <> friend_id)
);
alter table public.close_friends enable row level security;
drop policy if exists cf_own on public.close_friends;
create policy cf_own on public.close_friends for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create or replace function public.is_close_friend(dono uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select dono = auth.uid() or exists (select 1 from close_friends where owner_id = dono and friend_id = auth.uid())
$$;

create table if not exists public.stories (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  image_url     text not null check (image_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9/_.-]+$'),
  caption       text check (char_length(caption) <= 200),
  poll          jsonb check (poll is null or (jsonb_typeof(poll) = 'object' and char_length(poll->>'pergunta') between 1 and 80
                 and char_length(poll->>'a') between 1 and 30 and char_length(poll->>'b') between 1 and 30)),
  question      text check (char_length(question) <= 100),
  musica        text check (public.spotify_ok(musica)),
  close_friends boolean not null default false,
  highlight     text check (char_length(highlight) between 1 and 30),   -- pasta de destaque no perfil (fica depois das 24 h)
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_user_idx on public.stories(user_id, created_at desc);
create index if not exists stories_ativos_idx on public.stories(expires_at);
alter table public.stories enable row level security;
drop policy if exists st_read on public.stories;
create policy st_read on public.stories for select using (
  (expires_at > now() or highlight is not null or user_id = auth.uid()) and (not close_friends or is_close_friend(user_id)));
drop policy if exists st_ins on public.stories;
create policy st_ins on public.stories for insert with check (user_id = auth.uid() and is_active_user() and highlight is null);
drop policy if exists st_upd on public.stories;
create policy st_upd on public.stories for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists st_del on public.stories;
create policy st_del on public.stories for delete using (user_id = auth.uid() or is_staff());

create table if not exists public.story_views (
  story_id bigint not null references public.stories(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  seen_at  timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.story_views enable row level security;
drop policy if exists sv_ins on public.story_views;
create policy sv_ins on public.story_views for insert with check (user_id = auth.uid());
drop policy if exists sv_read on public.story_views;
create policy sv_read on public.story_views for select using (
  user_id = auth.uid() or exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid()));

create table if not exists public.story_votes (
  story_id bigint not null references public.stories(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  choice   text not null check (choice in ('a','b')),
  primary key (story_id, user_id)
);
alter table public.story_votes enable row level security;
drop policy if exists svo_ins on public.story_votes;
create policy svo_ins on public.story_votes for insert with check (user_id = auth.uid());
drop policy if exists svo_read on public.story_votes;
create policy svo_read on public.story_votes for select using (user_id = auth.uid());

-- Resultado da enquete (contagem, sem expor quem votou em quê)
create or replace function public.story_poll(sid bigint) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('a', count(*) filter (where choice = 'a'), 'b', count(*) filter (where choice = 'b'))
  from story_votes where story_id = sid
$$;
grant execute on function public.story_poll(bigint) to anon, authenticated;

-- Resposta à "caixinha de perguntas": chega como notificação para o dono do story
create or replace function public.answer_story(sid bigint, texto text) returns void
language plpgsql security definer set search_path = public as $$
declare s stories; quem text;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta.'; end if;
  if char_length(coalesce(trim(texto), '')) not between 1 and 300 then raise exception 'Resposta de 1 a 300 caracteres.'; end if;
  select * into s from stories where id = sid and expires_at > now();
  if s.id is null or s.question is null then raise exception 'Story não encontrado.'; end if;
  select username into quem from profiles where id = auth.uid();
  insert into notifications (user_id, type, title, body, link)
  values (s.user_id, 'story', '💬 @' || quem || ' respondeu: ' || left(s.question, 60), left(trim(texto), 300), 'perfil.html?u=' || quem);
end $$;
revoke execute on function public.answer_story(bigint, text) from public, anon;
grant execute on function public.answer_story(bigint, text) to authenticated;

-- Limpeza diária também apaga stories vencidos que não viraram destaque (a imagem fica no armazenamento)
create or replace function public.cleanup_old() returns void language sql security definer set search_path = public as $$
  delete from app_feedback where kind = 'erro' and created_at < now() - interval '60 days';
  delete from notifications where read and created_at < now() - interval '90 days';
  delete from stories where highlight is null and expires_at < now() - interval '2 days';
$$;
revoke execute on function public.cleanup_old() from public, anon, authenticated;

-- Banner só com cor (1 a 3 cores em degradê), sem precisar enviar imagem
alter table public.profiles add column if not exists banner_cor text;
do $$ begin
  alter table public.profiles add constraint profiles_banner_cor_ok check (banner_cor is null or banner_cor ~ '^#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6}){0,2}$');
exception when duplicate_object then null; end $$;

-- Posts com vídeo (MP4/WebM de até 50 MB, guardado no armazenamento do site)
alter table public.posts add column if not exists video_url text;
do $$ begin
  alter table public.posts add constraint posts_video_ok check (video_url is null or video_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9/_.-]+\.(mp4|webm|mov)$');
exception when duplicate_object then null; end $$;

-- Stories com vídeo (até ~60 s) e reações rápidas
alter table public.stories alter column image_url drop not null;
alter table public.stories add column if not exists video_url text;
do $$ begin
  alter table public.stories add constraint stories_video_ok check (video_url is null or video_url ~ '^https://[A-Za-z0-9.-]+\.supabase\.co/storage/v1/object/public/media/[A-Za-z0-9/_.-]+\.(mp4|webm|mov)$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stories add constraint stories_midia_ok check (image_url is not null or video_url is not null);
exception when duplicate_object then null; end $$;

create table if not exists public.story_reactions (
  story_id bigint not null references public.stories(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  emoji    text not null check (emoji in ('🔥','😂','😮','😍','👏','💀')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.story_reactions enable row level security;
drop policy if exists sr_read on public.story_reactions;
create policy sr_read on public.story_reactions for select using (
  user_id = auth.uid() or exists (select 1 from stories s where s.id = story_id and s.user_id = auth.uid()));

-- Reagir: grava (ou troca) a reação e avisa o dono só na primeira vez
create or replace function public.react_story(sid bigint, e text) returns void
language plpgsql security definer set search_path = public as $$
declare s stories; quem text; novo boolean;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'Entre na sua conta.'; end if;
  select * into s from stories where id = sid and expires_at > now();
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
revoke execute on function public.react_story(bigint, text) from public, anon;
grant execute on function public.react_story(bigint, text) to authenticated;

-- Os stories vencidos agora são apagados pelo robô semanal, que remove também a imagem/vídeo do armazenamento
create or replace function public.cleanup_old() returns void language sql security definer set search_path = public as $$
  delete from app_feedback where kind = 'erro' and created_at < now() - interval '60 days';
  delete from notifications where read and created_at < now() - interval '90 days';
$$;
revoke execute on function public.cleanup_old() from public, anon, authenticated;

-- Mais fontes de notícias em português (acrescenta só as que ainda não estão na lista; dá para editar em Admin → Automação)
update public.settings set value = value || (
  select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements('[
    {"name":"IGN Brasil","url":"https://br.ign.com/feed.xml"},
    {"name":"Eurogamer","url":"https://www.eurogamer.pt/feed"},
    {"name":"Critical Hits","url":"https://www.criticalhits.com.br/feed/"},
    {"name":"MeuPlayStation","url":"https://meups.com.br/feed/"},
    {"name":"Nintendo Blast","url":"https://www.nintendoblast.com.br/feeds/posts/default"},
    {"name":"Xbox Power","url":"https://www.xboxpower.com.br/feed/"},
    {"name":"GameHall","url":"https://gamehall.com.br/feed/"}
  ]'::jsonb) f
  where not exists (select 1 from jsonb_array_elements(settings.value) x where x->>'url' = f->>'url'))
where key = 'feeds' and jsonb_typeof(value) = 'array';

-- Preço-alvo na lista de desejos: com alvo, só avisa quando o preço ficar igual ou abaixo dele
alter table public.user_games add column if not exists alvo_cents integer check (alvo_cents is null or alvo_cents between 100 and 200000);
create or replace function public.notify_deal() returns trigger
language plpgsql security definer set search_path = public as $$
declare g games;
begin
  if new.discount_pct <= 0 then return null; end if;
  if tg_op = 'UPDATE' and old.discount_pct >= new.discount_pct and coalesce(old.price_cents, 0) <= coalesce(new.price_cents, 0) then return null; end if;
  select * into g from games where id = new.game_id;
  insert into notifications (user_id, type, title, body, link)
  select ug.user_id, 'deal',
         case when ug.alvo_cents is not null then '🎯 ' || g.title || ' chegou no seu preço-alvo!' else g.title || ' está com ' || new.discount_pct || '% de desconto!' end,
         'Na ' || new.store || coalesce(' por R$ ' || replace(to_char(new.price_cents / 100.0, 'FM999990.00'), '.', ','), ''),
         'jogo.html?slug=' || g.slug
  from user_games ug
  where ug.game_id = new.game_id and ug.wishlist
    and (ug.alvo_cents is null or (new.price_cents is not null and new.price_cents <= ug.alvo_cents
         and (tg_op = 'INSERT' or old.price_cents is null or old.price_cents > ug.alvo_cents)));   -- avisa uma vez ao cruzar o alvo
  return null;
end $$;

-- =====================================================================
-- CONQUISTAS DAS NOVAS FUNÇÕES: posts, vídeos, stories, enquetes, reações, música, memes no Instagram e desafios
-- =====================================================================
insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style) values
  ('s_posts10',    'badge',  'Postador',               'Publique 10 posts',                              'comum',    '📝', 1200, false, null),
  ('f_criador',    'frame',  'Criador de Conteúdo',     'Publique 100 posts',                             'lendaria', null, 1201, true,
     '{"cores":["#ffd33c","#ff4081","#7c4dff","#00b0ff"],"animado":true,"brilho":true,"velocidade":4,"emoji":"✍️"}'),
  ('s_video',      'badge',  'Diretor',                 'Poste 5 vídeos',                                 'rara',     '🎬', 1202, false, null),
  ('b_diretor',    'banner', 'Diretor de Cinema',       'Poste 20 vídeos',                                'epica',    null, 1203, true,
     '{"cores":["#0b0b0d","#3a0d0d","#e5484d"]}'),
  ('s_story1',     'badge',  'Contador de Histórias',   'Publique seu primeiro story',                    'comum',    '📸', 1204, false, null),
  ('f_story',      'frame',  'Aro de Story',            'Publique 30 stories',                            'epica',    null, 1205, true,
     '{"cores":["#feda75","#fa7e1e","#d62976","#962fbf","#4f5bd5"],"animado":true,"velocidade":5,"emoji":"📸"}'),
  ('s_story100',   'badge',  'Influencer',              'Publique 100 stories',                           'lendaria', '🌟', 1206, false, null),
  ('s_enquete',    'badge',  'Pesquisador',             'Crie 5 enquetes nos stories',                    'rara',     '📊', 1207, false, null),
  ('s_reativo',    'badge',  'Reativo',                 'Reaja a 25 stories',                             'comum',    '🔥', 1208, false, null),
  ('b_queridinho', 'banner', 'Queridinho',              'Receba 100 reações nos seus stories',            'epica',    null, 1209, true,
     '{"cores":["#ff4081","#ffd33c","#ff6d00"]}'),
  ('s_dj',         'badge',  'DJ',                      'Coloque uma música do Spotify no seu perfil',    'comum',    '🎵', 1210, false, null),
  ('s_destaque',   'badge',  'Curador',                 'Salve um story nos destaques do perfil',         'comum',    '⭐', 1211, false, null),
  ('s_viral',      'badge',  'Viral',                   'Tenha um meme publicado no Instagram do Control Critic', 'lendaria', '😂', 1212, false, null),
  ('f_viral',      'frame',  'Viral',                   'Tenha 3 memes publicados no Instagram do Control Critic', 'especial', null, 1213, true,
     '{"cores":["#833ab4","#fd1d1d","#fcb045"],"animado":true,"brilho":true,"velocidade":3,"emoji":"😂"}'),
  ('s_desafio5',   'badge',  'Desafiante',              'Participe de 5 desafios',                        'rara',     '🏆', 1214, false, null),
  ('b_desafiante', 'banner', 'Competidor Nato',         'Participe de 15 desafios',                       'epica',    null, 1215, true,
     '{"cores":["#0b0b0d","#ffd33c","#b8860b"]}')
on conflict (id) do nothing;

create or replace function public.check_achievements_social(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if uid is null then return; end if;
  select count(*) into n from posts where user_id = uid;
  if n >= 10 then perform grant_cosmetic(uid, 's_posts10'); end if;
  if n >= 100 then perform grant_cosmetic(uid, 'f_criador'); end if;
  select count(*) into n from posts where user_id = uid and video_url is not null;
  if n >= 5 then perform grant_cosmetic(uid, 's_video'); end if;
  if n >= 20 then perform grant_cosmetic(uid, 'b_diretor'); end if;
  select count(*) into n from posts where user_id = uid and instagram_at is not null;
  if n >= 1 then perform grant_cosmetic(uid, 's_viral'); end if;
  if n >= 3 then perform grant_cosmetic(uid, 'f_viral'); end if;
  select count(distinct challenge_id) into n from posts where user_id = uid and challenge_id is not null;
  if n >= 5 then perform grant_cosmetic(uid, 's_desafio5'); end if;
  if n >= 15 then perform grant_cosmetic(uid, 'b_desafiante'); end if;
  -- stories contam mesmo depois de vencidos: usa o contador guardado no perfil (os antigos são apagados pela limpeza)
  select coalesce(stories_total, 0) into n from profiles where id = uid;
  if n >= 1 then perform grant_cosmetic(uid, 's_story1'); end if;
  if n >= 30 then perform grant_cosmetic(uid, 'f_story'); end if;
  if n >= 100 then perform grant_cosmetic(uid, 's_story100'); end if;
  select coalesce(enquetes_total, 0) into n from profiles where id = uid;
  if n >= 5 then perform grant_cosmetic(uid, 's_enquete'); end if;
  if exists (select 1 from stories where user_id = uid and highlight is not null) then perform grant_cosmetic(uid, 's_destaque'); end if;
  select count(*) into n from story_reactions where user_id = uid;
  if n >= 25 then perform grant_cosmetic(uid, 's_reativo'); end if;
  select count(*) into n from story_reactions r join stories s on s.id = r.story_id where s.user_id = uid;
  if n >= 100 then perform grant_cosmetic(uid, 'b_queridinho'); end if;
  if exists (select 1 from profiles where id = uid and musica is not null) then perform grant_cosmetic(uid, 's_dj'); end if;
exception when others then null;   -- conquista nunca atrapalha a ação da pessoa
end $$;
revoke execute on function public.check_achievements_social(uuid) from public, anon, authenticated;

-- Contadores de stories e enquetes (não somem quando os stories vencem)
alter table public.profiles add column if not exists stories_total integer not null default 0;
alter table public.profiles add column if not exists enquetes_total integer not null default 0;
create or replace function public.stories_contar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cc.sistema', 'on', true);
  update profiles set stories_total = stories_total + 1, enquetes_total = enquetes_total + (case when new.poll is not null then 1 else 0 end) where id = new.user_id;
  perform set_config('cc.sistema', 'off', true);
  perform check_achievements_social(new.user_id);
  return null;
end $$;
drop trigger if exists stories_contar_trg on public.stories;
create trigger stories_contar_trg after insert on public.stories for each row execute function public.stories_contar();

-- Destaque, reações (de quem reage e de quem recebe) e música no perfil também conferem as conquistas
create or replace function public.social_conquistas_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'story_reactions' then
    perform check_achievements_social(new.user_id);
    perform check_achievements_social((select user_id from stories where id = new.story_id));
  else
    perform check_achievements_social(new.user_id);
  end if;
  return null;
end $$;
drop trigger if exists stories_destaque_conq on public.stories;
create trigger stories_destaque_conq after update of highlight on public.stories for each row when (new.highlight is not null) execute function public.social_conquistas_trg();
drop trigger if exists reacoes_conq on public.story_reactions;
create trigger reacoes_conq after insert on public.story_reactions for each row execute function public.social_conquistas_trg();
create or replace function public.musica_conq() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform check_achievements_social(new.id); return null; end $$;
drop trigger if exists profiles_musica_conq on public.profiles;
create trigger profiles_musica_conq after update of musica on public.profiles for each row when (new.musica is not null and new.musica is distinct from old.musica) execute function public.musica_conq();

-- Posts (inclusive meme publicado no Instagram e participação em desafio) passam pela checagem social também
create or replace function public.achievements_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  -- IF em vez de CASE: o CASE avalia campos que não existem em NEW de outras tabelas
  if tg_table_name = 'follows' then uid := new.followed_id;
  elsif tg_table_name = 'events' then uid := new.creator_id;
  elsif tg_table_name = 'communities' then uid := new.owner_id;
  else uid := new.user_id;
  end if;
  perform check_achievements(uid);
  perform check_achievements_extra(uid);
  if tg_table_name = 'posts' then perform check_achievements_social(uid); end if;
  return null;
end $$;

-- Quem já fez antes de existir a conquista recebe agora (uma vez, ao rodar este arquivo)
update public.profiles p set stories_total = greatest(stories_total, (select count(*) from stories s where s.user_id = p.id)),
  enquetes_total = greatest(enquetes_total, (select count(*) from stories s where s.user_id = p.id and s.poll is not null));
do $$ declare r record; begin
  for r in select id from public.profiles loop perform public.check_achievements_social(r.id); end loop;
end $$;
-- Ninguém edita os próprios contadores de stories pelo site
create or replace function public.protect_contadores() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('cc.sistema', true), '') <> 'on' then
    new.stories_total := old.stories_total; new.enquetes_total := old.enquetes_total;
  end if;
  return new;
end $$;
drop trigger if exists profiles_contadores on public.profiles;
create trigger profiles_contadores before update of stories_total, enquetes_total on public.profiles for each row execute function public.protect_contadores();

-- =====================================================================
-- CONQUISTAS (2ª leva): amizades, mensagens, comentários, curtidas, grupos, partidas, comunidades, listas,
-- enquetes, melhores amigos, notas, Steam, calls e quem ajuda a achar bugs
-- =====================================================================
alter table public.profiles add column if not exists call_minutos integer not null default 0;
alter table public.profiles add column if not exists call_visto timestamptz;

insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style) values
  ('s_amigos5',    'badge',  'Turma',                 'Tenha 5 amigos',                                   'comum',    '🤝', 1300, false, null),
  ('f_amigos25',   'frame',  'Alma da Festa',         'Tenha 25 amigos',                                  'epica',    null, 1301, true,
     '{"cores":["#00e676","#00b0ff","#7c4dff"],"animado":true,"velocidade":6,"emoji":"🤝"}'),
  ('s_papo',       'badge',  'Tagarela',              'Envie 100 mensagens diretas',                      'comum',    '💬', 1302, false, null),
  ('s_comenta',    'badge',  'Comentarista',          'Faça 50 comentários em posts',                     'comum',    '🗨️', 1303, false, null),
  ('s_curte',      'badge',  'Coração Mole',          'Curta 100 posts',                                  'comum',    '❤️', 1304, false, null),
  ('b_amado',      'banner', 'Amado pela Galera',     'Receba 250 curtidas nos seus posts',               'lendaria', null, 1305, true,
     '{"cores":["#ff1744","#ff4081","#ffd33c"]}'),
  ('s_squad',      'badge',  'Bora Jogar',            'Procure grupo 5 vezes ("Quero jogar agora")',     'comum',    '🎮', 1306, false, null),
  ('s_parceiro',   'badge',  'Parceiro de Squad',     'Entre no grupo de outras pessoas 10 vezes',        'rara',     '🙋', 1307, false, null),
  ('s_presente',   'badge',  'Sempre Presente',       'Participe de 10 partidas marcadas',                'rara',     '📅', 1308, false, null),
  ('s_nomade',     'badge',  'Nômade',                'Entre em 5 comunidades',                           'comum',    '🏘️', 1309, false, null),
  ('s_listas',     'badge',  'Curador de Listas',     'Tenha 3 listas públicas com 5 ou mais jogos',      'rara',     '📋', 1310, false, null),
  ('s_votante',    'badge',  'Eleitor',               'Vote em 20 enquetes de stories',                   'comum',    '🗳️', 1311, false, null),
  ('s_bff',        'badge',  'Círculo Íntimo',        'Adicione 3 pessoas aos melhores amigos',           'comum',    '💚', 1312, false, null),
  ('s_nota',       'badge',  'Pensador',              'Publique uma nota no seu perfil',                  'comum',    '💭', 1313, false, null),
  ('s_steam',      'badge',  'Conectado',             'Importe sua biblioteca da Steam',                  'comum',    '🖥️', 1314, false, null),
  ('s_horas1000',  'badge',  'Viciado',               'Tenha 1.000 horas jogadas (Steam)',                'rara',     '⏱️', 1315, false, null),
  ('b_horas5000',  'banner', 'Lenda das Horas',       'Tenha 5.000 horas jogadas (Steam)',                'lendaria', null, 1316, true,
     '{"cores":["#0b0b0d","#1db954","#ffd33c"]}'),
  ('s_conq500',    'badge',  'Colecionador de Troféus','Tenha 500 conquistas da Steam',                   'rara',     '🏅', 1317, false, null),
  ('f_rara',       'frame',  'Caçador de Raras',      'Desbloqueie uma conquista da Steam que menos de 1% dos jogadores têm', 'lendaria', null, 1318, true,
     '{"cores":["#b388ff","#ffd33c","#b388ff"],"animado":true,"brilho":true,"velocidade":4,"emoji":"💎"}'),
  ('s_call1',      'badge',  'Primeira Call',         'Fique 10 minutos numa call do site',               'comum',    '📞', 1319, false, null),
  ('s_call24',     'badge',  'Rato de Call',          'Fique 24 horas em calls (somando todas)',          'rara',     '🎧', 1320, false, null),
  ('f_call',       'frame',  'Voz da Comunidade',     'Fique 100 horas em calls (somando todas)',         'epica',    null, 1321, true,
     '{"cores":["#5865f2","#00b0ff","#5865f2"],"animado":true,"velocidade":5,"emoji":"🎧"}'),
  ('s_bug',        'badge',  'Olho de Lince',         'Envie 3 problemas ou sugestões pelo "Reportar"',   'comum',    '🐞', 1322, false, null),
  ('f_testador',   'frame',  'Testador Oficial',      'Tenha 3 problemas que você reportou resolvidos pela equipe', 'especial', null, 1323, true,
     '{"cores":["#00e5ff","#00e676"],"animado":true,"brilho":true,"velocidade":5,"emoji":"🐞"}')
on conflict (id) do nothing;

create or replace function public.check_achievements_mais(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; p profiles;
begin
  if uid is null then return; end if;
  select * into p from profiles where id = uid;
  if p.id is null then return; end if;
  select count(*) into n from friendships where status = 'aceita' and (user_a = uid or user_b = uid);
  if n >= 5 then perform grant_cosmetic(uid, 's_amigos5'); end if;
  if n >= 25 then perform grant_cosmetic(uid, 'f_amigos25'); end if;
  select count(*) into n from direct_messages where sender_id = uid;
  if n >= 100 then perform grant_cosmetic(uid, 's_papo'); end if;
  select count(*) into n from post_comments where user_id = uid;
  if n >= 50 then perform grant_cosmetic(uid, 's_comenta'); end if;
  select count(*) into n from post_likes where user_id = uid;
  if n >= 100 then perform grant_cosmetic(uid, 's_curte'); end if;
  select coalesce(sum(likes_count), 0) into n from posts where user_id = uid;
  if n >= 250 then perform grant_cosmetic(uid, 'b_amado'); end if;
  select count(*) into n from lfg_posts where user_id = uid;
  if n >= 5 then perform grant_cosmetic(uid, 's_squad'); end if;
  select count(*) into n from lfg_interest where user_id = uid;
  if n >= 10 then perform grant_cosmetic(uid, 's_parceiro'); end if;
  select count(*) into n from event_attendees where user_id = uid;
  if n >= 10 then perform grant_cosmetic(uid, 's_presente'); end if;
  select count(*) into n from community_members where user_id = uid;
  if n >= 5 then perform grant_cosmetic(uid, 's_nomade'); end if;
  select count(*) into n from user_lists l where l.user_id = uid and l.is_public and (select count(*) from list_items i where i.list_id = l.id) >= 5;
  if n >= 3 then perform grant_cosmetic(uid, 's_listas'); end if;
  select count(*) into n from story_votes where user_id = uid;
  if n >= 20 then perform grant_cosmetic(uid, 's_votante'); end if;
  select count(*) into n from close_friends where owner_id = uid;
  if n >= 3 then perform grant_cosmetic(uid, 's_bff'); end if;
  if p.nota is not null then perform grant_cosmetic(uid, 's_nota'); end if;
  if p.steam_id is not null then perform grant_cosmetic(uid, 's_steam'); end if;
  select coalesce(sum(hours), 0) into n from user_games where user_id = uid;
  if n >= 1000 then perform grant_cosmetic(uid, 's_horas1000'); end if;
  if n >= 5000 then perform grant_cosmetic(uid, 'b_horas5000'); end if;
  if coalesce((p.steam_conquistas->>'total')::int, 0) >= 500 then perform grant_cosmetic(uid, 's_conq500'); end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p.steam_conquistas->'raras', '[]'::jsonb)) a where (a->>'pct')::numeric < 1) then perform grant_cosmetic(uid, 'f_rara'); end if;
  if p.call_minutos >= 10 then perform grant_cosmetic(uid, 's_call1'); end if;
  if p.call_minutos >= 24 * 60 then perform grant_cosmetic(uid, 's_call24'); end if;
  if p.call_minutos >= 100 * 60 then perform grant_cosmetic(uid, 'f_call'); end if;
  select count(*) into n from app_feedback where user_id = uid and kind in ('bug', 'sugestao');
  if n >= 3 then perform grant_cosmetic(uid, 's_bug'); end if;
  select count(*) into n from app_feedback where user_id = uid and kind in ('bug', 'sugestao') and status = 'resolvido';
  if n >= 3 then perform grant_cosmetic(uid, 'f_testador'); end if;
exception when others then null;
end $$;
revoke execute on function public.check_achievements_mais(uuid) from public, anon, authenticated;

-- Um gatilho só para todas as tabelas novas: descobre de quem é a ação (e, quando faz sentido, quem recebe)
create or replace function public.mais_conquistas_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'friendships' then
    if new.status = 'aceita' then perform check_achievements_mais(new.user_a); perform check_achievements_mais(new.user_b); end if;
  elsif tg_table_name = 'direct_messages' then perform check_achievements_mais(new.sender_id);
  elsif tg_table_name = 'post_likes' then
    perform check_achievements_mais(new.user_id);
    perform check_achievements_mais((select user_id from posts where id = new.post_id));
  elsif tg_table_name = 'list_items' then perform check_achievements_mais((select user_id from user_lists where id = new.list_id));
  elsif tg_table_name = 'close_friends' then perform check_achievements_mais(new.owner_id);
  elsif tg_table_name = 'profiles' then perform check_achievements_mais(new.id);
  else perform check_achievements_mais(new.user_id);
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['friendships','direct_messages','post_comments','post_likes','lfg_posts','lfg_interest','event_attendees',
                           'community_members','user_lists','list_items','story_votes','close_friends','app_feedback'] loop
    execute format('drop trigger if exists mais_conq_%1$s on public.%1$s', t);
    execute format('create trigger mais_conq_%1$s after insert or update on public.%1$s for each row execute function public.mais_conquistas_trg()', t);
  end loop;
end $$;
drop trigger if exists mais_conq_user_games on public.user_games;
create trigger mais_conq_user_games after insert or update of hours on public.user_games for each row execute function public.mais_conquistas_trg();
drop trigger if exists mais_conq_profiles on public.profiles;
create trigger mais_conq_profiles after update of nota, steam_id, steam_conquistas, call_minutos on public.profiles
  for each row execute function public.mais_conquistas_trg();

-- Tempo em call: o site chama a cada minuto enquanto a pessoa está numa call (no máximo 1 minuto a cada 50 s)
create or replace function public.registrar_call() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set call_minutos = call_minutos + 1, call_visto = now()
   where id = auth.uid() and (call_visto is null or call_visto < now() - interval '50 seconds');
  perform set_config('cc.sistema', 'off', true);
end $$;
revoke execute on function public.registrar_call() from public, anon;
grant execute on function public.registrar_call() to authenticated;
create or replace function public.protect_call_minutos() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() and coalesce(current_setting('cc.sistema', true), '') <> 'on' then
    new.call_minutos := old.call_minutos; new.call_visto := old.call_visto;
  end if;
  return new;
end $$;
drop trigger if exists profiles_call_min on public.profiles;
create trigger profiles_call_min before update of call_minutos, call_visto on public.profiles for each row execute function public.protect_call_minutos();

-- Entrega agora para quem já cumpre
do $$ declare r record; begin
  for r in select id from public.profiles loop perform public.check_achievements_mais(r.id); end loop;
end $$;

-- Dar/tirar VÁRIOS itens de VÁRIAS pessoas de uma vez (ou de todos os usuários). Só administradores.
create or replace function public.admin_cosmetics_lote(uids uuid[], dar text[] default '{}', tirar text[] default '{}', todos boolean default false)
returns integer language plpgsql security definer set search_path = public as $$
declare alvo uuid; cid text; n integer := 0;
begin
  if not is_admin() then raise exception 'Só administradores podem dar itens.'; end if;
  if todos then select array_agg(id) into uids from profiles where not banned; end if;
  foreach alvo in array coalesce(uids, '{}') loop
    foreach cid in array coalesce(dar, '{}') loop perform grant_cosmetic(alvo, cid); end loop;
    if coalesce(array_length(tirar, 1), 0) > 0 then
      delete from user_cosmetics where user_id = alvo and cosmetic_id = any(tirar);
      perform set_config('cc.sistema', 'on', true);
      update profiles set equipped_frame = case when equipped_frame = any(tirar) then null else equipped_frame end,
                          equipped_banner = case when equipped_banner = any(tirar) then null else equipped_banner end where id = alvo;
      perform set_config('cc.sistema', 'off', true);
    end if;
    n := n + 1;
  end loop;
  perform log_admin('itens em lote', 'user', case when todos then 'todos' else n::text || ' usuário(s)' end,
    json_build_object('dar', dar, 'tirar', tirar)::jsonb);
  return n;
end $$;
revoke execute on function public.admin_cosmetics_lote(uuid[], text[], text[], boolean) from public, anon;
grant execute on function public.admin_cosmetics_lote(uuid[], text[], text[], boolean) to authenticated;

-- XP para várias pessoas de uma vez (ex.: todos que participaram de um evento)
create or replace function public.admin_xp_lote(uids uuid[], quantidade integer, motivo text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare alvo uuid; n integer := 0;
begin
  if not is_admin() then raise exception 'Só administradores podem ajustar XP.'; end if;
  if quantidade = 0 or abs(quantidade) > 100000 then raise exception 'Quantidade inválida.'; end if;
  foreach alvo in array coalesce(uids, '{}') loop perform admin_adjust_xp(alvo, quantidade, motivo); n := n + 1; end loop;
  return n;
end $$;
revoke execute on function public.admin_xp_lote(uuid[], integer, text) from public, anon;
grant execute on function public.admin_xp_lote(uuid[], integer, text) to authenticated;

-- =====================================================================
-- METAS AUTOMÁTICAS (Steam e biblioteca): o item é liberado quando a pessoa cumpre a regra
--   horas_serie        {padrao, min}  horas somadas nos jogos cujo nome contém o padrão (ex.: "devil may cry")
--   conquistas_serie   {padrao, pct}  algum jogo da série com pct% das conquistas da Steam (100 = platinou). padrao vazio = qualquer jogo
--   horas_categoria    {categoria, min}   horas em jogos da categoria (slug: terror, rpg, fps...)
--   jogos_categoria    {categoria, min}   quantidade de jogos da categoria na biblioteca
--   zerados_categoria  {categoria, min}   jogos da categoria marcados como zerado
--   horas_total        {min}  ·  jogos_total {min}
-- =====================================================================
alter table public.cosmetics add column if not exists regra jsonb;
create or replace function public.regra_ok(r jsonb) returns boolean language sql immutable as $$
  select r is null or (jsonb_typeof(r) = 'object'
    and r->>'tipo' in ('horas_serie','conquistas_serie','horas_categoria','jogos_categoria','zerados_categoria','horas_total','jogos_total')
    and coalesce((r->>'min')::numeric, (r->>'pct')::numeric, 0) > 0
    and char_length(coalesce(r->>'padrao', '')) <= 60 and char_length(coalesce(r->>'categoria', '')) <= 40)
$$;
do $$ begin
  alter table public.cosmetics add constraint cosmetics_regra_ok check (public.regra_ok(regra));
exception when duplicate_object then null; end $$;

-- Valor atual da pessoa para uma regra (usado para liberar e para mostrar o progresso)
create or replace function public.regra_valor(uid uuid, r jsonb) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v numeric := 0; cat int; padrao text := '%' || lower(coalesce(r->>'padrao', '')) || '%';
begin
  if r->>'categoria' is not null then select id into cat from categories where slug = r->>'categoria'; end if;
  case r->>'tipo'
    when 'horas_serie' then
      select coalesce(sum(ug.hours), 0) into v from user_games ug join games g on g.id = ug.game_id where ug.user_id = uid and lower(g.title) like padrao;
    when 'conquistas_serie' then
      select coalesce(max(ug.ach_done * 100.0 / nullif(ug.ach_total, 0)), 0) into v from user_games ug join games g on g.id = ug.game_id
       where ug.user_id = uid and lower(g.title) like padrao and ug.ach_total > 0;
    when 'horas_categoria' then
      select coalesce(sum(ug.hours), 0) into v from user_games ug join games g on g.id = ug.game_id where ug.user_id = uid and cat = any(g.category_ids);
    when 'jogos_categoria' then
      select count(*) into v from user_games ug join games g on g.id = ug.game_id where ug.user_id = uid and cat = any(g.category_ids) and (ug.status is not null or ug.hours > 0);
    when 'zerados_categoria' then
      select count(*) into v from user_games ug join games g on g.id = ug.game_id where ug.user_id = uid and cat = any(g.category_ids) and ug.status = 'zerado';
    when 'horas_total' then select coalesce(sum(hours), 0) into v from user_games where user_id = uid;
    when 'jogos_total' then select count(*) into v from user_games where user_id = uid and (status is not null or hours > 0);
    else v := 0;
  end case;
  return v;
end $$;
grant execute on function public.regra_valor(uuid, jsonb) to authenticated;

create or replace function public.check_regras(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if uid is null then return; end if;
  for c in select id, regra from cosmetics where regra is not null and active
             and not exists (select 1 from user_cosmetics uc where uc.user_id = uid and uc.cosmetic_id = cosmetics.id)
             order by tier desc nulls last loop
    if regra_valor(uid, c.regra) >= coalesce((c.regra->>'min')::numeric, (c.regra->>'pct')::numeric) then perform grant_cosmetic(uid, c.id); end if;
  end loop;
exception when others then null;
end $$;
revoke execute on function public.check_regras(uuid) from public, anon, authenticated;

-- Confere a cada mudança na biblioteca (importação da Steam, robô semanal, marcar zerado...)
create or replace function public.regras_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform check_regras(new.user_id); return null; end $$;
drop trigger if exists user_games_regras on public.user_games;
create trigger user_games_regras after insert or update of hours, status, ach_done on public.user_games
  for each row execute function public.regras_trg();

-- Admin cria/edita uma meta e aplica para quem já cumpre (botão no painel)
create or replace function public.admin_aplicar_regras() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not is_admin() then raise exception 'Só administradores.'; end if;
  for r in select distinct user_id from user_games loop perform check_regras(r.user_id); n := n + 1; end loop;
  return n;
end $$;
revoke execute on function public.admin_aplicar_regras() from public, anon;
grant execute on function public.admin_aplicar_regras() to authenticated;

-- Metas prontas (dá para editar ou criar outras em Admin → Itens)
insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style, regra) values
  ('f_dmc',      'frame',  'Caçador de Demônios', 'Jogue 100 horas de Devil May Cry (somando a série)', 'epica', null, 1400, true,
     '{"cores":["#b71c1c","#0b0b0d","#ff1744"],"animado":true,"brilho":true,"velocidade":3,"emoji":"⚔️"}', '{"tipo":"horas_serie","padrao":"devil may cry","min":100}'),
  ('b_dmc',      'banner', 'Smokin'' Sexy Style!!', 'Platine (100% das conquistas) um Devil May Cry na Steam', 'lendaria', null, 1401, true,
     '{"cores":["#0b0b0d","#b71c1c","#ffd33c"]}', '{"tipo":"conquistas_serie","padrao":"devil may cry","pct":100}'),
  ('s_souls',    'badge',  'Não Morri (Muito)',   'Jogue 100 horas de Dark Souls (somando a série)', 'rara', '🔥', 1402, false, null, '{"tipo":"horas_serie","padrao":"dark souls","min":100}'),
  ('s_elden',    'badge',  'Maculado',            'Jogue 80 horas de Elden Ring', 'rara', '💍', 1403, false, null, '{"tipo":"horas_serie","padrao":"elden ring","min":80}'),
  ('s_witcher',  'badge',  'Bruxo de Rívia',      'Jogue 100 horas de The Witcher (somando a série)', 'rara', '🐺', 1404, false, null, '{"tipo":"horas_serie","padrao":"witcher","min":100}'),
  ('s_mk',       'badge',  'Fatality',            'Jogue 100 horas de Mortal Kombat (somando a série)', 'rara', '🐉', 1405, false, null, '{"tipo":"horas_serie","padrao":"mortal kombat","min":100}'),
  ('b_dbd',      'banner', 'Sobrevivente da Névoa','Jogue 300 horas de Dead by Daylight', 'epica', null, 1406, true,
     '{"cores":["#0b0b0d","#3a0d0d","#7a7a7a"]}', '{"tipo":"horas_serie","padrao":"dead by daylight","min":300}'),
  ('s_terror',   'badge',  'Corajoso',            'Jogue 100 horas de jogos de terror', 'rara', '👻', 1407, false, null, '{"tipo":"horas_categoria","categoria":"terror","min":100}'),
  ('f_terror',   'frame',  'Sobrevivente',        'Zere 10 jogos de terror', 'epica', null, 1408, true,
     '{"cores":["#0b0b0d","#2e7d32","#0b0b0d"],"animado":true,"velocidade":8,"emoji":"🔦"}', '{"tipo":"zerados_categoria","categoria":"terror","min":10}'),
  ('s_rpg',      'badge',  'Aventureiro',         'Tenha 20 RPGs na biblioteca', 'comum', '🗡️', 1409, false, null, '{"tipo":"jogos_categoria","categoria":"rpg","min":20}'),
  ('s_fps',      'badge',  'Mira Afiada',         'Jogue 200 horas de FPS', 'rara', '🎯', 1410, false, null, '{"tipo":"horas_categoria","categoria":"fps","min":200}'),
  ('s_luta',     'badge',  'Mestre do Combo',     'Jogue 100 horas de jogos de luta', 'rara', '🥊', 1411, false, null, '{"tipo":"horas_categoria","categoria":"luta","min":100}'),
  ('s_platina',  'badge',  'Platinador',          'Tenha 100% das conquistas de algum jogo na Steam', 'epica', '🏆', 1412, false, null, '{"tipo":"conquistas_serie","padrao":"","pct":100}'),
  ('s_200jogos', 'badge',  'Biblioteca Infinita', 'Tenha 200 jogos na biblioteca', 'epica', '📚', 1413, false, null, '{"tipo":"jogos_total","min":200}'),
  ('f_10mil',    'frame',  'Sem Vida Social',     'Tenha 10.000 horas jogadas', 'lendaria', null, 1414, true,
     '{"cores":["#ffd33c","#ff6d00","#ff1744","#7c4dff"],"animado":true,"brilho":true,"velocidade":2,"emoji":"🕹️"}', '{"tipo":"horas_total","min":10000}')
on conflict (id) do nothing;

do $$ declare r record; begin
  for r in select distinct user_id from public.user_games loop perform public.check_regras(r.user_id); end loop;
end $$;

-- Metas prontas dos jogos mais populares (selos; algumas molduras) e itens em destaque
alter table public.cosmetics add column if not exists destaque boolean not null default false;
insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style, regra, destaque) values
  ('s_gta',       'badge', 'Rei de Los Santos',     'Jogue 100 horas de Grand Theft Auto (somando a série)', 'rara', '🚗', 1500, false, null, '{"tipo":"horas_serie","padrao":"grand theft auto","min":100}', false),
  ('s_rdr',       'badge', 'Fora da Lei',           'Jogue 80 horas de Red Dead Redemption (somando a série)', 'rara', '🤠', 1501, false, null, '{"tipo":"horas_serie","padrao":"red dead redemption","min":80}', false),
  ('s_skyrim',    'badge', 'Dovahkiin',             'Jogue 100 horas de The Elder Scrolls (somando a série)', 'rara', '🐲', 1502, false, null, '{"tipo":"horas_serie","padrao":"elder scrolls","min":100}', false),
  ('s_fallout',   'badge', 'Morador do Vault',      'Jogue 100 horas de Fallout (somando a série)', 'rara', '☢️', 1503, false, null, '{"tipo":"horas_serie","padrao":"fallout","min":100}', false),
  ('s_cs',        'badge', 'Headshot',              'Jogue 500 horas de Counter-Strike', 'epica', '🔫', 1504, false, null, '{"tipo":"horas_serie","padrao":"counter-strike","min":500}', false),
  ('f_dota',      'frame', 'Ancião',                'Jogue 1.000 horas de Dota 2', 'lendaria', null, 1505, true,
     '{"cores":["#b71c1c","#1b5e20","#b71c1c"],"animado":true,"velocidade":6,"emoji":"🛡️"}', '{"tipo":"horas_serie","padrao":"dota 2","min":1000}', false),
  ('s_apex',      'badge', 'Campeão da Arena',      'Jogue 200 horas de Apex Legends', 'rara', '🏹', 1506, false, null, '{"tipo":"horas_serie","padrao":"apex legends","min":200}', false),
  ('s_rust',      'badge', 'Sobrevivente Nato',     'Jogue 300 horas de Rust', 'epica', '🪓', 1507, false, null, '{"tipo":"horas_serie","padrao":"rust","min":300}', false),
  ('s_cyber',     'badge', 'Mercenário de Night City','Jogue 80 horas de Cyberpunk 2077', 'rara', '🤖', 1508, false, null, '{"tipo":"horas_serie","padrao":"cyberpunk","min":80}', false),
  ('s_bg3',       'badge', 'Rolou um 20',           'Jogue 100 horas de Baldur''s Gate', 'rara', '🎲', 1509, false, null, '{"tipo":"horas_serie","padrao":"baldur","min":100}', false),
  ('f_re',        'frame', 'Agente da S.T.A.R.S.',  'Jogue 100 horas de Resident Evil (somando a série)', 'epica', null, 1510, true,
     '{"cores":["#0d47a1","#b71c1c","#0d47a1"],"animado":true,"velocidade":5,"emoji":"🧟"}', '{"tipo":"horas_serie","padrao":"resident evil","min":100}', false),
  ('s_hk',        'badge', 'Cavaleiro Oco',         'Platine Hollow Knight (100% das conquistas na Steam)', 'lendaria', '🪲', 1511, false, null, '{"tipo":"conquistas_serie","padrao":"hollow knight","pct":100}', false),
  ('s_hades',     'badge', 'Fuga do Submundo',      'Jogue 60 horas de Hades', 'rara', '🔱', 1512, false, null, '{"tipo":"horas_serie","padrao":"hades","min":60}', false),
  ('s_stardew',   'badge', 'Fazendeiro',            'Jogue 100 horas de Stardew Valley', 'rara', '🌱', 1513, false, null, '{"tipo":"horas_serie","padrao":"stardew","min":100}', false),
  ('s_terraria',  'badge', 'Escavador',             'Jogue 100 horas de Terraria', 'rara', '⛏️', 1514, false, null, '{"tipo":"horas_serie","padrao":"terraria","min":100}', false),
  ('s_rl',        'badge', 'Gol Aéreo',             'Jogue 200 horas de Rocket League', 'rara', '⚽', 1515, false, null, '{"tipo":"horas_serie","padrao":"rocket league","min":200}', false),
  ('s_cod',       'badge', 'Soldado',               'Jogue 200 horas de Call of Duty (somando a série)', 'rara', '🪖', 1516, false, null, '{"tipo":"horas_serie","padrao":"call of duty","min":200}', false),
  ('s_destiny',   'badge', 'Guardião',              'Jogue 300 horas de Destiny', 'epica', '🌌', 1517, false, null, '{"tipo":"horas_serie","padrao":"destiny","min":300}', false),
  ('s_mh',        'badge', 'Caçador de Monstros',   'Jogue 150 horas de Monster Hunter (somando a série)', 'epica', '🐉', 1518, false, null, '{"tipo":"horas_serie","padrao":"monster hunter","min":150}', false),
  ('s_gow',       'badge', 'Fantasma de Esparta',   'Jogue 50 horas de God of War (somando a série)', 'rara', '🪓', 1519, false, null, '{"tipo":"horas_serie","padrao":"god of war","min":50}', false),
  ('s_sekiro',    'badge', 'Lobo de Um Braço',      'Platine Sekiro (100% das conquistas na Steam)', 'lendaria', '🗡️', 1520, false, null, '{"tipo":"conquistas_serie","padrao":"sekiro","pct":100}', false),
  ('s_persona',   'badge', 'Fantasma Ladrão',       'Jogue 100 horas de Persona (somando a série)', 'rara', '🎭', 1521, false, null, '{"tipo":"horas_serie","padrao":"persona","min":100}', false),
  ('s_ff',        'badge', 'Guerreiro da Luz',      'Jogue 150 horas de Final Fantasy (somando a série)', 'epica', '💎', 1522, false, null, '{"tipo":"horas_serie","padrao":"final fantasy","min":150}', false),
  ('s_sf',        'badge', 'Hadouken',              'Jogue 100 horas de Street Fighter (somando a série)', 'rara', '👊', 1523, false, null, '{"tipo":"horas_serie","padrao":"street fighter","min":100}', false),
  ('s_tekken',    'badge', 'Punho de Ferro',        'Jogue 100 horas de Tekken (somando a série)', 'rara', '🥋', 1524, false, null, '{"tipo":"horas_serie","padrao":"tekken","min":100}', false),
  ('f_zomboid',   'frame', 'Assim Você Morreu',     'Jogue 200 horas de Project Zomboid', 'epica', null, 1525, true,
     '{"cores":["#33691e","#0b0b0d","#8d6e63"],"animado":true,"velocidade":9,"emoji":"🧟"}', '{"tipo":"horas_serie","padrao":"zomboid","min":200}', false),
  ('s_civ',       'badge', 'Só Mais Um Turno',      'Jogue 200 horas de Civilization (somando a série)', 'epica', '🏛️', 1526, false, null, '{"tipo":"horas_serie","padrao":"civilization","min":200}', false),
  ('s_tlou',      'badge', 'Vagalume',              'Jogue 40 horas de The Last of Us', 'rara', '🦒', 1527, false, null, '{"tipo":"horas_serie","padrao":"last of us","min":40}', false),
  ('s_mc',        'badge', 'Arquiteto de Blocos',   'Jogue 200 horas de Minecraft', 'rara', '🧱', 1528, false, null, '{"tipo":"horas_serie","padrao":"minecraft","min":200}', false),
  ('s_poe',       'badge', 'Exilado',               'Jogue 300 horas de Path of Exile', 'epica', '💀', 1529, false, null, '{"tipo":"horas_serie","padrao":"path of exile","min":300}', false)
on conflict (id) do nothing;
-- Começam em destaque na página de Conquistas (dá para trocar em Admin → Itens → ⭐)
update public.cosmetics set destaque = true where id in ('f_dmc','b_dmc','s_platina','f_10mil','f_re','f_zomboid') and not destaque
  and not exists (select 1 from public.cosmetics where destaque and id not in ('f_dmc','b_dmc','s_platina','f_10mil','f_re','f_zomboid'));

do $$ declare r record; begin
  for r in select distinct user_id from public.user_games loop perform public.check_regras(r.user_id); end loop;
end $$;

-- =====================================================================
-- SELOS QUE SOBEM DE NÍVEL: cada meta de selo vira uma série de 4 níveis
--   I Comum (25% da meta) · II Rara (a meta) · III Épica (2,5×) · IV Lendária (5×)
--   Metas de % de conquistas: 25% · 50% · 75% · 100%
-- No perfil aparece só o nível mais alto de cada série.
-- =====================================================================
alter table public.cosmetics add column if not exists serie text;
alter table public.cosmetics add column if not exists tier smallint;

-- Mais metas (viram séries de 4 níveis abaixo)
insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style, regra) values
  ('s_horas',      'badge', 'Viciado em Jogos',     'Tenha 1.000 horas jogadas', 'rara', '⏱️', 1600, false, null, '{"tipo":"horas_total","min":1000}'),
  ('s_colecao',    'badge', 'Colecionador',         'Tenha 100 jogos na biblioteca', 'rara', '🗃️', 1601, false, null, '{"tipo":"jogos_total","min":100}'),
  ('s_zerador',    'badge', 'Zerador',              'Zere 10 jogos de ação', 'rara', '🏁', 1602, false, null, '{"tipo":"zerados_categoria","categoria":"acao","min":10}'),
  ('s_aventura',   'badge', 'Explorador',           'Jogue 200 horas de jogos de aventura', 'rara', '🧭', 1603, false, null, '{"tipo":"horas_categoria","categoria":"aventura","min":200}'),
  ('s_estrategia', 'badge', 'Estrategista',         'Jogue 200 horas de jogos de estratégia', 'rara', '♟️', 1604, false, null, '{"tipo":"horas_categoria","categoria":"estrategia","min":200}'),
  ('s_indie',      'badge', 'Alma Indie',           'Tenha 20 jogos indie na biblioteca', 'rara', '🎨', 1605, false, null, '{"tipo":"jogos_categoria","categoria":"indies","min":20}'),
  ('s_simulacao',  'badge', 'Simulador',            'Jogue 150 horas de jogos de simulação', 'rara', '🚜', 1606, false, null, '{"tipo":"horas_categoria","categoria":"simulacao","min":150}'),
  ('s_esportes',   'badge', 'Craque',               'Jogue 150 horas de jogos de esportes', 'rara', '🏆', 1607, false, null, '{"tipo":"horas_categoria","categoria":"esportes","min":150}'),
  ('s_rpg_horas',  'badge', 'Mestre de RPG',        'Jogue 300 horas de RPG', 'rara', '🧙', 1608, false, null, '{"tipo":"horas_categoria","categoria":"rpg","min":300}'),
  ('s_terror_z',   'badge', 'Não Tenho Medo',       'Zere 5 jogos de terror', 'rara', '🕯️', 1609, false, null, '{"tipo":"zerados_categoria","categoria":"terror","min":5}'),
  ('s_re_pl',      'badge', 'Mestre do Inventário', 'Tenha 50% das conquistas de algum Resident Evil na Steam', 'rara', '🌿', 1611, false, null, '{"tipo":"conquistas_serie","padrao":"resident evil","pct":50}'),
  ('s_halo',       'badge', 'Spartan',              'Jogue 100 horas de Halo (somando a série)', 'rara', '🪖', 1612, false, null, '{"tipo":"horas_serie","padrao":"halo","min":100}'),
  ('s_ac',         'badge', 'Nada é Verdade',       'Jogue 100 horas de Assassin''s Creed (somando a série)', 'rara', '🦅', 1613, false, null, '{"tipo":"horas_serie","padrao":"assassin","min":100}'),
  ('s_fifa',       'badge', 'Camisa 10',            'Jogue 200 horas de EA Sports FC', 'rara', '⚽', 1614, false, null, '{"tipo":"horas_serie","padrao":"ea sports fc","min":200}'),
  ('s_lol',        'badge', 'Invocador',            'Jogue 300 horas de League of Legends', 'rara', '🧿', 1615, false, null, '{"tipo":"horas_serie","padrao":"league of legends","min":300}'),
  ('s_valorant',   'badge', 'Agente',               'Jogue 200 horas de Valorant', 'rara', '🎯', 1616, false, null, '{"tipo":"horas_serie","padrao":"valorant","min":200}'),
  ('s_fortnite',   'badge', 'Vitória Royale',       'Jogue 200 horas de Fortnite', 'rara', '🪂', 1617, false, null, '{"tipo":"horas_serie","padrao":"fortnite","min":200}'),
  ('s_pubg',       'badge', 'Galinha Assada',       'Jogue 200 horas de PUBG', 'rara', '🍗', 1618, false, null, '{"tipo":"horas_serie","padrao":"pubg","min":200}'),
  ('s_r6',         'badge', 'Operador',             'Jogue 200 horas de Rainbow Six', 'rara', '🛡️', 1619, false, null, '{"tipo":"horas_serie","padrao":"rainbow six","min":200}'),
  ('s_ets',        'badge', 'Caminhoneiro',         'Jogue 100 horas de Euro/American Truck Simulator', 'rara', '🚚', 1620, false, null, '{"tipo":"horas_serie","padrao":"truck simulator","min":100}'),
  ('s_forza',      'badge', 'Piloto',               'Jogue 100 horas de Forza (somando a série)', 'rara', '🏎️', 1621, false, null, '{"tipo":"horas_serie","padrao":"forza","min":100}'),
  ('s_warframe',   'badge', 'Tenno',                'Jogue 300 horas de Warframe', 'rara', '🥷', 1622, false, null, '{"tipo":"horas_serie","padrao":"warframe","min":300}'),
  ('s_sims',       'badge', 'Sul Sul',              'Jogue 200 horas de The Sims', 'rara', '💎', 1623, false, null, '{"tipo":"horas_serie","padrao":"sims","min":200}'),
  ('s_metal_gear', 'badge', 'Kept You Waiting',     'Jogue 60 horas de Metal Gear (somando a série)', 'rara', '📦', 1624, false, null, '{"tipo":"horas_serie","padrao":"metal gear","min":60}'),
  ('s_borderlands','badge', 'Caçador da Arca',      'Jogue 100 horas de Borderlands', 'rara', '🔫', 1625, false, null, '{"tipo":"horas_serie","padrao":"borderlands","min":100}'),
  ('s_nms',        'badge', 'Viajante',             'Jogue 100 horas de No Man''s Sky', 'rara', '🪐', 1626, false, null, '{"tipo":"horas_serie","padrao":"no man","min":100}'),
  ('s_ark',        'badge', 'Domador de Dinos',     'Jogue 200 horas de ARK', 'rara', '🦖', 1627, false, null, '{"tipo":"horas_serie","padrao":"ark:","min":200}'),
  ('s_l4d',        'badge', 'Sobrevivente Zumbi',   'Jogue 100 horas de Left 4 Dead', 'rara', '🧟', 1628, false, null, '{"tipo":"horas_serie","padrao":"left 4 dead","min":100}'),
  ('s_tf2',        'badge', 'Mercenário',           'Jogue 200 horas de Team Fortress 2', 'rara', '🎩', 1629, false, null, '{"tipo":"horas_serie","padrao":"team fortress","min":200}')
on conflict (id) do nothing;

do $$
declare c record; t int; mult numeric[] := array[0.25, 1, 2.5, 5]; pcts int[] := array[25, 50, 75, 100];
  rar text[] := array['comum','rara','epica','lendaria']; rom text[] := array['I','II','III','IV'];
  r jsonb; base_tier int; alvo numeric; descr text;
begin
  for c in select * from public.cosmetics where kind = 'badge' and regra is not null and (serie is null or serie = id) loop
    if c.serie is not null then base_tier := c.tier;
    elsif c.regra ? 'pct' then base_tier := greatest(1, least(4, round((c.regra->>'pct')::numeric / 25)::int));
    else base_tier := 2; end if;
    if c.serie is null then
      update public.cosmetics set serie = c.id, tier = base_tier, rarity = rar[base_tier], name = c.name || ' ' || rom[base_tier] where id = c.id;
    end if;
    for t in 1..4 loop
      continue when t = base_tier;
      if c.regra ? 'pct' then
        alvo := pcts[t]; r := jsonb_set(c.regra, '{pct}', to_jsonb(alvo));
        descr := 'Tenha ' || alvo || '% das conquistas de ' || case when coalesce(c.regra->>'padrao', '') = '' then 'algum jogo' else initcap(c.regra->>'padrao') end || ' na Steam';
      else
        alvo := greatest(1, round((c.regra->>'min')::numeric * mult[t]));
        r := jsonb_set(c.regra, '{min}', to_jsonb(alvo));
        descr := regexp_replace(c.description, '\d[\d.]*', replace(to_char(alvo, 'FM999,999,999'), ',', '.'), '');
      end if;
      insert into public.cosmetics (id, kind, name, description, rarity, icon, sort, custom, style, regra, serie, tier)
      values (c.id || '_n' || t, 'badge', regexp_replace(c.name, ' (I|II|III|IV)$', '') || ' ' || rom[t], descr, rar[t], c.icon, c.sort, false, null, r, c.id, t)
      on conflict (id) do update set name = excluded.name, description = excluded.description, regra = excluded.regra, icon = excluded.icon, sort = excluded.sort;
    end loop;
  end loop;
end $$;

-- Ao liberar um nível, os anteriores da série também são liberados (sem notificação extra)
create or replace function public.serie_niveis_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text; t smallint;
begin
  select serie, tier into s, t from cosmetics where id = new.cosmetic_id;
  if s is not null and t > 1 then
    insert into user_cosmetics (user_id, cosmetic_id)
      select new.user_id, id from cosmetics where serie = s and tier < t
    on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists user_cosmetics_serie on public.user_cosmetics;
create trigger user_cosmetics_serie after insert on public.user_cosmetics
  for each row execute function public.serie_niveis_trg();

do $$ declare r record; begin
  for r in select distinct user_id from public.user_games loop perform public.check_regras(r.user_id); end loop;
end $$;

-- =====================================================================
-- RATE LIMIT DAS FUNCTIONS (migração supabase/migrations/20261018_01_rate_limit.sql)
-- =====================================================================
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
-- CORREÇÕES DE RLS E PRIVILÉGIOS (fase 3) — mesmo conteúdo de supabase/migrations/20261018_02_rls_correcoes.sql
-- =====================================================================
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


-- =====================================================================
-- PROCURANDO GRUPO E ONBOARDING (fase 6) — mesmo conteúdo de supabase/migrations/20261019_03_lfg_onboarding.sql
-- =====================================================================
-- Fase 6: "Procurando grupo" completo e onboarding progressivo. Idempotente.

-- 1) Grupo: início agendado (até 24 h), crossplay, microfone, visibilidade e aviso aos amigos
alter table public.lfg_posts add column if not exists starts_at timestamptz not null default now();
alter table public.lfg_posts add column if not exists crossplay boolean not null default false;
alter table public.lfg_posts add column if not exists mic text not null default 'opcional';
alter table public.lfg_posts add column if not exists visibility text not null default 'publico';
alter table public.lfg_posts add column if not exists notify_friends boolean not null default true;
do $$ begin
  alter table public.lfg_posts add constraint lfg_mic_ok check (mic in ('obrigatorio', 'opcional', 'sem'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.lfg_posts add constraint lfg_vis_ok check (visibility in ('publico', 'amigos'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.lfg_posts add constraint lfg_janela_ok check (expires_at > starts_at and expires_at <= starts_at + interval '6 hours') not valid; -- not valid: não confere grupos antigos já expirados
exception when duplicate_object then null; end $$;

create or replace function public.sao_amigos(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships f where f.status = 'aceita'
    and ((f.user_a = a and f.user_b = b) or (f.user_a = b and f.user_b = a)));
$$;

-- Leitura: grupos públicos para todos (inclusive visitantes); "só amigos" para o dono e os amigos dele
drop policy if exists lfg_read on public.lfg_posts;
create policy lfg_read on public.lfg_posts for select using (
  visibility = 'publico' or user_id = auth.uid() or sao_amigos(user_id, auth.uid()) or is_staff());
-- Criar: início em até 24 h, duração de até 6 h, no máximo 3 grupos ativos
drop policy if exists lfg_ins on public.lfg_posts;
create policy lfg_ins on public.lfg_posts for insert with check (
  user_id = auth.uid() and is_active_user()
  and starts_at >= now() - interval '5 minutes' and starts_at <= now() + interval '24 hours'
  and (select count(*) from lfg_posts where user_id = auth.uid() and expires_at > now()) < 3);
drop policy if exists lfg_upd on public.lfg_posts;
create policy lfg_upd on public.lfg_posts for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and starts_at <= now() + interval '24 hours');

-- Aviso aos amigos só quando a pessoa quiser
create or replace function public.lfg_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text; jogo text;
begin
  if not new.notify_friends then return null; end if;
  select username into quem from profiles where id = new.user_id;
  select title into jogo from games where id = new.game_id;
  insert into notifications (user_id, type, title, body, link)
  select case when f.user_a = new.user_id then f.user_b else f.user_a end, 'lfg',
         '🎮 ' || quem || ' criou um grupo de ' || coalesce(jogo, 'jogo'),
         coalesce(new.platform || ' · ', '') || case when new.starts_at > now() + interval '10 minutes'
           then 'começa ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ' · ' else 'agora · ' end || coalesce(new.note, ''),
         'index.html#b-grupo'
  from friendships f where new.user_id in (f.user_a, f.user_b) and f.status = 'aceita';
  return null;
end $$;

-- Entrar no grupo respeita as vagas e a visibilidade
create or replace function public.lfg_vagas() returns trigger
language plpgsql security definer set search_path = public as $$
declare g lfg_posts; n int;
begin
  select * into g from lfg_posts where id = new.lfg_id;
  if g.id is null or g.expires_at <= now() then raise exception 'Este grupo já encerrou.'; end if;
  if g.user_id = new.user_id then raise exception 'Você é quem criou o grupo.'; end if;
  if g.visibility = 'amigos' and not sao_amigos(g.user_id, new.user_id) then raise exception 'Grupo só para amigos.'; end if;
  select count(*) into n from lfg_interest where lfg_id = new.lfg_id;
  if g.slots is not null and n >= g.slots then raise exception 'O grupo está cheio.'; end if;
  return new;
end $$;
drop trigger if exists lfg_vagas_trg on public.lfg_interest;
create trigger lfg_vagas_trg before insert on public.lfg_interest for each row execute function public.lfg_vagas();

-- 2) Onboarding: plataformas favoritas e XP de boas-vindas uma única vez
alter table public.profiles add column if not exists plataformas text[] not null default '{}';
do $$ begin
  alter table public.profiles add constraint plataformas_ok check (
    plataformas <@ array['PlayStation','Xbox','PC','Nintendo','Mobile']::text[]);
exception when duplicate_object then null; end $$;

create or replace function public.concluir_onboarding() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  perform set_config('cc.sistema', 'on', true);
  update profiles set onboarded = true where id = auth.uid();
  perform set_config('cc.sistema', 'off', true);
  -- XP só na primeira vez (o histórico de XP é a prova)
  if exists (select 1 from xp_log where user_id = auth.uid() and reason = 'boas-vindas') then return 0; end if;
  perform add_xp(auth.uid(), 25, 'boas-vindas');
  return 25;
end $$;
revoke execute on function public.concluir_onboarding() from public, anon;
grant execute on function public.concluir_onboarding() to authenticated;

-- =====================================================================
-- BLOQUEIO E MODERAÇÃO — mesmo conteúdo de supabase/migrations/20261019_04_bloqueio_moderacao.sql
-- =====================================================================
-- Bloquear usuários e moderação (exigências de apps com conteúdo de usuários). Idempotente.

-- 1) Bloqueios: só quem bloqueou vê a própria lista; a pessoa bloqueada não fica sabendo
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists ub_read on public.user_blocks;
create policy ub_read on public.user_blocks for select using (blocker_id = auth.uid());
drop policy if exists ub_ins on public.user_blocks;
create policy ub_ins on public.user_blocks for insert with check (blocker_id = auth.uid()
  and (select count(*) from user_blocks where blocker_id = auth.uid()) < 1000);
drop policy if exists ub_del on public.user_blocks;
create policy ub_del on public.user_blocks for delete using (blocker_id = auth.uid());

-- Há bloqueio entre as duas pessoas (em qualquer sentido)?
create or replace function public.bloqueio_entre(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke execute on function public.bloqueio_entre(uuid, uuid) from public, anon;
grant execute on function public.bloqueio_entre(uuid, uuid) to authenticated;

-- Ao bloquear: desfaz amizade, pedidos e "seguir" nos dois sentidos (as DMs dependem de amizade e param juntas)
create or replace function public.ao_bloquear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from friendships where user_a = least(new.blocker_id, new.blocked_id) and user_b = greatest(new.blocker_id, new.blocked_id);
  delete from follows where (follower_id = new.blocker_id and followed_id = new.blocked_id) or (follower_id = new.blocked_id and followed_id = new.blocker_id);
  delete from close_friends where (owner_id = new.blocker_id and friend_id = new.blocked_id) or (owner_id = new.blocked_id and friend_id = new.blocker_id);
  return null;
end $$;
drop trigger if exists user_blocks_ai on public.user_blocks;
create trigger user_blocks_ai after insert on public.user_blocks for each row execute function public.ao_bloquear();

-- Com bloqueio, não dá para seguir, pedir amizade, mandar mensagem, comentar, reagir nem entrar no grupo da pessoa
create or replace function public.barrar_bloqueio() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  case tg_table_name
    when 'follows' then a := new.follower_id; b := new.followed_id;
    when 'friendships' then a := new.user_a; b := new.user_b;
    when 'direct_messages' then a := new.sender_id; b := new.receiver_id;
    when 'post_comments' then a := new.user_id; select user_id into b from posts where id = new.post_id;
    when 'story_reactions' then a := new.user_id; select user_id into b from stories where id = new.story_id;
    when 'lfg_interest' then a := new.user_id; select user_id into b from lfg_posts where id = new.lfg_id;
    else return new;
  end case;
  if a is not null and b is not null and bloqueio_entre(a, b) then
    raise exception 'Não é possível interagir com esta pessoa.';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['follows','friendships','direct_messages','post_comments','story_reactions','lfg_interest'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_bloqueio', t);
    execute format('create trigger %I before insert on public.%I for each row execute function public.barrar_bloqueio()', t || '_bloqueio', t);
  end loop;
end $$;

-- 2) Denúncias: mensagens também; gravidade para ordenar a fila; histórico da decisão; apelação
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('review','post','community','profile','comment','post_comment','message','event'));
alter table public.reports add column if not exists gravidade smallint not null default 1;
alter table public.reports add column if not exists decisao text check (char_length(decisao) <= 500);
alter table public.reports add column if not exists decidido_por uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists decidido_em timestamptz;

create or replace function public.reports_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- gravidade pelo motivo (3 = urgente)
    new.gravidade := case new.reason when 'assedio' then 3 when 'golpe' then 3 when 'conteudo_impróprio' then 3
                                     when 'ofensivo' then 2 else 1 end;
    -- proteção contra denúncias em massa: no máximo 20 por dia por pessoa
    if (select count(*) from reports where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Você atingiu o limite de denúncias de hoje. A equipe já está analisando as anteriores.';
    end if;
  elsif new.status is distinct from old.status and new.status <> 'aberta' then
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists reports_antes_trg on public.reports;
create trigger reports_antes_trg before insert or update on public.reports for each row execute function public.reports_antes();

-- Apelação: quem foi suspenso pode pedir revisão (uma por suspensão), vai para a fila da equipe
create table if not exists public.appeals (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  texto      text not null check (char_length(texto) between 10 and 1000),
  status     text not null default 'aberta' check (status in ('aberta','aceita','negada')),
  resposta   text check (char_length(resposta) <= 500),
  created_at timestamptz not null default now()
);
alter table public.appeals enable row level security;
drop policy if exists ap_own on public.appeals;
create policy ap_own on public.appeals for select using (user_id = auth.uid() or is_staff());
drop policy if exists ap_ins on public.appeals;
create policy ap_ins on public.appeals for insert with check (user_id = auth.uid() and status = 'aberta' and resposta is null
  and not exists (select 1 from appeals a where a.user_id = auth.uid() and a.created_at > now() - interval '7 days'));
drop policy if exists ap_staff on public.appeals;
create policy ap_staff on public.appeals for update using (is_staff()) with check (is_staff());

-- Equipe lê o texto de uma mensagem direta SÓ quando ela foi denunciada (DMs continuam privadas no resto)
create or replace function public.mensagem_denunciada(rid bigint) returns table (autor text, destinatario text, corpo text, enviada timestamptz)
language sql stable security definer set search_path = public as $$
  select pa.username, pb.username, m.body, m.created_at
  from reports r join direct_messages m on m.id::text = r.target_id
  join profiles pa on pa.id = m.sender_id join profiles pb on pb.id = m.receiver_id
  where r.id = rid and r.target_type = 'message' and is_staff()
    and r.reporter_id = m.receiver_id;  -- só quem recebeu a mensagem pode denunciá-la
$$;
revoke execute on function public.mensagem_denunciada(bigint) from public, anon;
grant execute on function public.mensagem_denunciada(bigint) to authenticated;

-- Quem pediu revisão é avisado da resposta
create or replace function public.appeals_resposta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status <> 'aberta' then
    insert into notifications (user_id, type, title, body, link)
    values (new.user_id, 'moderacao', case new.status when 'aceita' then '✅ Sua suspensão foi revista e removida' else 'Seu pedido de revisão foi analisado' end,
            new.resposta, 'diretrizes.html');
  end if;
  return null;
end $$;
drop trigger if exists appeals_resposta_trg on public.appeals;
create trigger appeals_resposta_trg after update on public.appeals for each row execute function public.appeals_resposta();

-- =====================================================================
-- COMUNIDADES (fase 9) — mesmo conteúdo de supabase/migrations/20261019_05_comunidades.sql
-- =====================================================================
-- Fase 9: comunidades (contador de membros, atividade, regras, oficiais). Idempotente.

-- 2) Atividade (para ordenar por "mais ativas"), regras e selo de comunidade oficial
alter table public.communities add column if not exists ultima_atividade timestamptz;
alter table public.communities add column if not exists regras text check (char_length(regras) <= 2000);
alter table public.communities add column if not exists oficial boolean not null default false;
create index if not exists communities_atividade_idx on public.communities (ultima_atividade desc nulls last);


-- 1) Contador de membros zerado: o gatilho que protege o contador (dono não pode editar) também barrava a
--    recontagem automática feita pelo próprio banco. Agora só barra pedidos vindos direto do site.
create or replace function public.communities_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not is_staff() then
    new.owner_id := old.owner_id; new.members_count := old.members_count;
    new.oficial := old.oficial; new.ultima_atividade := old.ultima_atividade;
  end if;
  return new;
end $$;

create or replace function public.comunidade_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.community_id is not null then
    update communities set ultima_atividade = now() where id = new.community_id;
  end if;
  return null;
end $$;
drop trigger if exists posts_atividade on public.posts;
create trigger posts_atividade after insert on public.posts for each row execute function public.comunidade_atividade();

-- Recontagem e atividade inicial (corrige os números atuais)
update public.communities c set members_count = (select count(*) from public.community_members m where m.community_id = c.id),
  ultima_atividade = coalesce(c.ultima_atividade, (select max(p.created_at) from public.posts p where p.community_id = c.id), c.created_at);

-- =====================================================================
-- OBSERVABILIDADE (fase 15) — mesmo conteúdo de supabase/migrations/20261019_06_observabilidade.sql
-- =====================================================================
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

-- =====================================================================
-- MÉTRICAS (fase 17) — mesmo conteúdo de supabase/migrations/20261019_07_metricas.sql
-- =====================================================================
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

-- ---------- 20261020_08: Instagram (histórico e medição) ----------
create table if not exists public.instagram_posts (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  modo              text not null,                     -- manha | entretenimento | diario | urgente
  horario           text,                              -- manha | meio | noite | urgente
  tipo              text not null,                     -- precos, antes-de-comprar, meme, versus, noticias...
  formato           text,                              -- imagem | carrossel | reels
  game_ids          integer[] not null default '{}',
  news_ids          bigint[] not null default '{}',
  refs              text[] not null default '{}',      -- ex.: review:12, post:5, versus:3-9, top:rpg (sem dado pessoal)
  hashtags          text[] not null default '{}',
  ig_media_id       text,
  permalink         text,
  erro              text,
  -- preenchidos à mão pela equipe, a partir do Instagram Insights
  salvamentos       integer check (salvamentos is null or salvamentos >= 0),
  compartilhamentos integer check (compartilhamentos is null or compartilhamentos >= 0),
  comentarios       integer check (comentarios is null or comentarios >= 0),
  alcance           integer check (alcance is null or alcance >= 0),
  medido_em         timestamptz
);
create index if not exists instagram_posts_data_idx on public.instagram_posts(created_at desc);
alter table public.instagram_posts enable row level security;
drop policy if exists igp_staff_le on public.instagram_posts;
create policy igp_staff_le on public.instagram_posts for select using (is_staff());
-- Sem política de insert/update: só o robô (service role) grava; a equipe anota os números pela função abaixo.

create or replace function public.instagram_medir(post_id bigint, salv integer, comp integer, coment integer, alc integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Só a equipe.'; end if;
  update instagram_posts set salvamentos = salv, compartilhamentos = comp, comentarios = coment, alcance = alc, medido_em = now() where id = post_id;
end $$;
revoke execute on function public.instagram_medir(bigint, integer, integer, integer, integer) from public;
grant execute on function public.instagram_medir(bigint, integer, integer, integer, integer) to authenticated;

-- ---------- 20261026_09: Discord social ----------

-- ---------- Conta do Discord ligada ao perfil ----------
-- Tabela própria (e não uma coluna em profiles, que é pública): só o dono vê a ligação; só a função abaixo grava.
create table if not exists public.discord_contas (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  discord_id   text not null unique check (discord_id ~ '^\d{17,20}$'),
  discord_nome text check (char_length(discord_nome) <= 40),
  ligado_em    timestamptz not null default now()
);
alter table public.discord_contas enable row level security;
drop policy if exists dc_dono_le on public.discord_contas;
create policy dc_dono_le on public.discord_contas for select using (user_id = auth.uid());

-- Códigos de 15 minutos gerados pelo /conectar no Discord
create table if not exists public.discord_link_codes (
  code         text primary key check (code ~ '^[A-Z0-9]{8}$'),
  discord_id   text not null check (discord_id ~ '^\d{17,20}$'),
  discord_name text check (char_length(discord_name) <= 40),
  guild_id     text check (guild_id is null or guild_id ~ '^\d{17,20}$'),
  expires_at   timestamptz not null default now() + interval '15 minutes'
);
alter table public.discord_link_codes enable row level security;   -- sem políticas: só o robô

create or replace function public.vincular_discord(codigo text) returns text
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select * into c from discord_link_codes where code = upper(trim(codigo)) and expires_at > now();
  if not found then raise exception 'Código inválido ou vencido. Use /conectar no Discord de novo.'; end if;
  delete from discord_contas where discord_id = c.discord_id or user_id = auth.uid();
  insert into discord_contas (user_id, discord_id, discord_nome) values (auth.uid(), c.discord_id, c.discord_name);
  if c.guild_id is not null then
    insert into discord_membros (guild_id, discord_id) values (c.guild_id, c.discord_id) on conflict do nothing;
  end if;
  delete from discord_link_codes where code = c.code or expires_at < now();
  return coalesce(c.discord_name, 'Discord');
end $$;
revoke execute on function public.vincular_discord(text) from public;
grant execute on function public.vincular_discord(text) to authenticated;

create or replace function public.desvincular_discord() returns void
language sql security definer set search_path = public as $$
  delete from discord_contas where user_id = auth.uid();
$$;
revoke execute on function public.desvincular_discord() from public;
grant execute on function public.desvincular_discord() to authenticated;

-- ---------- Servidores e membros (para avisos e ranking do servidor) ----------
create table if not exists public.discord_servidores (
  guild_id        text primary key check (guild_id ~ '^\d{17,20}$'),
  canal_avisos    text check (canal_avisos is null or canal_avisos ~ '^\d{17,20}$'),
  promocoes       boolean not null default true,
  enquetes        boolean not null default true,
  ao_vivo         boolean not null default true,
  ranking         boolean not null default true,
  ultima_promo    date,
  ultima_enquete  date,
  ultimo_ranking  date,
  configurado_por text,
  updated_at      timestamptz not null default now()
);
alter table public.discord_servidores enable row level security;

create table if not exists public.discord_membros (
  guild_id   text not null check (guild_id ~ '^\d{17,20}$'),
  discord_id text not null check (discord_id ~ '^\d{17,20}$'),
  visto_em   timestamptz not null default now(),
  primary key (guild_id, discord_id)
);
alter table public.discord_membros enable row level security;

-- ---------- Enquetes "este ou aquele" com botões ----------
create table if not exists public.discord_enquetes (
  message_id text primary key check (message_id ~ '^\d{17,20}$'),
  guild_id   text not null,
  channel_id text not null,
  a_id       integer references public.games(id) on delete cascade,
  b_id       integer references public.games(id) on delete cascade,
  fecha_em   timestamptz not null default now() + interval '24 hours',
  encerrada  boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.discord_enquetes enable row level security;
create table if not exists public.discord_votos (
  message_id text not null references public.discord_enquetes(message_id) on delete cascade,
  discord_id text not null,
  opcao      smallint not null check (opcao in (1, 2)),
  primary key (message_id, discord_id)
);
alter table public.discord_votos enable row level security;

-- ---------- Ao vivo: quem está transmitindo (Go Live) num canal de voz ----------
create table if not exists public.discord_ao_vivo (
  guild_id    text not null,
  discord_id  text not null,
  channel_id  text not null check (channel_id ~ '^\d{17,20}$'),
  canal_nome  text check (char_length(canal_nome) <= 100),
  user_id     uuid references public.profiles(id) on delete set null,   -- só quando a conta está ligada
  message_id  text,                                                       -- aviso postado no servidor
  desde       timestamptz not null default now(),
  primary key (guild_id, discord_id)
);
alter table public.discord_ao_vivo enable row level security;

-- Para o site: transmissões das comunidades públicas (ou de uma comunidade). Sem ID do Discord;
-- o nome só aparece se a pessoa ligou a conta ao site (o perfil já é público).
create or replace function public.ao_vivo_discord(cid bigint default null) returns table (community_id bigint, comunidade text, nome text, canal text, link text, desde timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, p.username, v.canal_nome, 'https://discord.com/channels/' || v.guild_id || '/' || v.channel_id, v.desde
  from discord_ao_vivo v
  join communities c on c.discord_guild_id = v.guild_id
  left join profiles p on p.id = v.user_id
  where (cid is null or c.id = cid)
    and (not coalesce(c.is_private, false) or exists (select 1 from community_members m where m.community_id = c.id and m.user_id = auth.uid()))
  order by v.desde desc limit 20;
$$;
grant execute on function public.ao_vivo_discord(bigint) to anon, authenticated;

-- ---------- 20261026_10: desafio premiado automaticamente (empate = todos ganham) ----------
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
