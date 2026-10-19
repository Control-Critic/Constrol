# Segurança do banco (RLS, Storage e privilégios)

Auditoria da fase 3. Tudo abaixo é coberto por `tests/rls.sql`, que roda no CI.

**Papéis testados:**
- visitante;
- usuária A × usuária B;
- melhor amigo;
- moderador;
- admin;
- banido.

## Corrigido nesta fase
| # | Problema | Correção |
|---|---|---|
| H1 | Qualquer pessoa podia entrar numa comunidade pública já como `mod` | Inserção só como `member` |
| H2 | Quem recebia uma DM podia reescrever o texto e o remetente | Gatilho: só `read` muda |
| H3 | Curtidas, votos úteis, conquistas e "jogado recentemente" da Steam podiam ser inventados (e liberavam selos lendários). Críticas podiam mudar de jogo | Gatilhos que zeram ou mantêm os campos do servidor. As horas continuam editáveis, com teto de 30.000 |
| H4 | Farm de XP: postar e apagar, criar e apagar comunidade, votar e desvotar | O limite conta o `xp_log`. Comunidade dá XP 1x por semana. O voto útil dá XP uma vez por pessoa |
| H5 | O bucket `media` podia ser **listado** por qualquer pessoa, inclusive mídia de stories de melhores amigos | Política de listagem removida. Cada um lista só a própria pasta. Os arquivos continuam abrindo pela URL |
| M1 | Membros de comunidades privadas eram visíveis | `can_see_community` |
| M2 | Era possível entrar em evento de comunidade privada | Só membros |
| M3 | Um visitante podia aceitar pedidos em comunidade sem dono | Exige login e dono real |
| M4 | Data de cadastro, aceite dos termos e vitrine com itens que a pessoa não tem | Protegidos |
| M8 | Sem limite contra spam | Limite por minuto em posts, comentários, DMs, denúncias, follows, interesse em grupo e reações |
| M9 | O bucket não tinha limite de tamanho e tipo | 50 MB, imagens e MP4/WebM/MOV |
| L1 | `cleanup_lfg` e `refresh_game_rating` podiam ser chamadas pelo site | Revogadas |
| L2 | Era possível reagir ou responder a story de melhores amigos sem estar na lista | Conferido |
| L3 | O evento podia ser movido para outra comunidade | Bloqueado |
| — | Cada pessoa não podia apagar os próprios arquivos | Política de exclusão na própria pasta |

## Verificado, sem alteração
- As 45 tabelas têm RLS.
- `app_secrets` não tem nenhum acesso pelo site.
- `settings` é só para admin.
- Todas as funções `security definer` têm `search_path`. O CI confere isso.
- Funções internas, como `add_xp`, `grant_cosmetic` e `check_regras`, estão revogadas.
- As RPCs de admin conferem `is_admin()`.
- Realtime: `posts`, `notifications` e `direct_messages` respeitam as políticas de leitura. **Não use `REPLICA IDENTITY FULL` nessas tabelas.**

## Pendências (exigem decisão ou mudança maior)
- **Mídia de stories de melhores amigos:** o arquivo continua acessível para quem tiver a URL. A correção completa é um bucket privado com URLs assinadas. Isso muda o envio e a exibição dos stories e fica para uma fase própria.
- **Comunidades privadas:** o nome, a descrição e o convite do Discord aparecem para todos (`communities_read using (true)`). Esconder o convite exige mover o campo para `community_secrets` e ajustar a página.
- **`profiles` é público por completo**, inclusive `ban_reason`, `call_visto` e `last_checkin`. A correção é uma view pública ou permissões por coluna, com revisão das páginas que leem o perfil.
- **`user_games` é público**, inclusive o preço-alvo. Hoje isso é decisão de produto (biblioteca pública).
- **Banidos ainda conseguem** fazer check-in diário e chamar amigos. O impacto é baixo.
