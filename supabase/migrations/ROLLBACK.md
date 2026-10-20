# Migrações: como aplicar e como desfazer

## Processo seguro de aplicação (produção)
1. **Aprovação humana obrigatória** antes de rodar qualquer migração em produção.
2. Faça um backup antes: Actions → "Backup do banco" → Run workflow, ou Supabase → Database → Backups.
3. Teste antes num projeto de **staging** do Supabase, ou localmente com o CI:
   - stub;
   - `schema.sql` duas vezes;
   - migrações duas vezes;
   - `tests/rls.sql`.
4. Rode as migrações **em ordem de nome**, no SQL Editor. Todas são idempotentes, então rodar de novo não causa problema.
5. Logo depois, teste no site:
   - entrar;
   - postar;
   - comentar;
   - mandar DM;
   - enviar foto ou story;
   - entrar numa comunidade;
   - avaliar um jogo;
   - importar a Steam.
6. Se algo quebrar, use o rollback específico abaixo e abra uma issue com o erro. **Não cole dados pessoais na issue.**

O `supabase/schema.sql` continua sendo o estado consolidado. Num projeto novo, basta ele.

## 20261018_01_rate_limit.sql (fase 2)
```sql
drop function if exists public.rate_hit(text, integer, integer);
drop table if exists public.rate_limits;
```
As Functions continuam funcionando, com o limite em memória.

## 20261018_02_rls_correcoes.sql (fase 3)
Desfaça só a parte que causou o problema.

| Parte | Rollback |
|---|---|
| DMs | `drop trigger if exists direct_messages_protect on public.direct_messages;` |
| Storage (limites do bucket) | `update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'media';` |
| Storage (listagem) | `create policy media_read on storage.objects for select using (bucket_id = 'media');` |
| Comunidades (membros) | `drop policy members_read on public.community_members; create policy members_read on public.community_members for select using (true);` |
| Eventos | `drop trigger if exists events_protect on public.events;` |
| Colunas protegidas | `drop trigger if exists posts_protect_cols on public.posts; drop trigger if exists reviews_protect_cols on public.reviews; drop trigger if exists user_games_protect_cols on public.user_games; drop trigger if exists profiles_protect_extra on public.profiles;` |
| Limites contra spam | `do $$ declare t text; begin foreach t in array array['posts','post_comments','review_comments','direct_messages','reports','follows','lfg_interest','story_reactions'] loop execute format('drop trigger if exists %I on public.%I', t || '_limite', t); end loop; end $$;` |
| Instagram (histórico) | `drop function if exists public.instagram_medir(bigint, integer, integer, integer, integer); drop table if exists public.instagram_posts;` (apaga só o histórico do robô) |

Para as funções de XP (`posts_after_insert`, `communities_after_insert` e `review_votes_changed`), `answer_join_request`, `react_story` e `answer_story`, rode de novo o trecho correspondente do `schema.sql` da versão anterior (`git show <commit>:supabase/schema.sql`).
