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
