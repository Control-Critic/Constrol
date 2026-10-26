-- Discord: o robô do Control Critic vira a ponte social entre o servidor e o site. Idempotente.
-- Conta ligada (/conectar), enquetes com botões, avisos do servidor e "ao vivo" (quem está transmitindo na call).
-- Só o robô (chave secreta) grava nas tabelas novas; o site lê o "ao vivo" por uma função que não expõe IDs do Discord.

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
