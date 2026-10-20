-- Instagram: histórico de tudo que o robô publicou (ou tentou), para a rotação não repetir conteúdo
-- e para a equipe anotar os números do Insights (salvamentos etc.). Idempotente.
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
