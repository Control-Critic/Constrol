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
