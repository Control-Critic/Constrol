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
