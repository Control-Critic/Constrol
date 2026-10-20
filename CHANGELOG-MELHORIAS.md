# Registro das melhorias (outubro de 2026)

Plano completo e diagnóstico em `PLANO-MELHORIAS.md`. Detalhes técnicos em `docs/`.

## PRs
| PR | Conteúdo |
|---|---|
| #75 | Fase 1: XSS, 404 e plurais |
| #76 | Plano de melhorias |
| #77 | Fase 2: segurança das Netlify Functions |
| #78 | Fase 4: headers, CSP (relatório) e cadeia de fornecimento |
| #79 | Fase 3: RLS, Storage e privilégios |
| #80 | Fase 5: nova home |
| #87 | Personalidade da home |
| #88 | Fase 6: Procurando grupo e onboarding |
| #89 | Hotfix: calls e admin |
| #90 | Bloqueio, moderação e diretrizes |
| #91 | Compressão de vídeo |
| #92 | Fase 10: PWA |
| #93 | Fase 7: login |
| (este) | Fases 8, 9, 11 a 17, num PR só, a pedido |

## Fases 8 a 17 (um commit por fase)
- **8. Catálogo e página de jogo:**
  - filtros na URL;
  - busca cancelável;
  - chips de filtros ativos e "limpar";
  - erro com nova tentativa;
  - posição preservada ao voltar;
  - ano, compartilhar e grupos abertos do jogo;
  - data do preço;
  - JSON-LD com nota agregada só quando há avaliações reais.
- **9. Comunidades:**
  - o **contador de membros estava zerado** (o gatilho de proteção barrava a recontagem), corrigido;
  - ordenar por atividade, filtro Discord e paginação;
  - selo oficial, regras e confirmação ao sair.
- **11. Acessibilidade:**
  - axe-core sem violações em 14 páginas;
  - pular para o conteúdo, `aria-current`, foco visível, links sublinhados no texto, ordem dos títulos, carrosséis focáveis, iframes com título, contraste, movimento reduzido e alto contraste;
  - checagem automática no CI.
- **12. SEO:**
  - metadados no servidor para jogo, perfil, comunidade e lista;
  - `noindex` em páginas privadas e comunidades privadas;
  - sitemap com `lastmod`;
  - links curtos `/jogo`, `/u` e `/c`.
- **13. Desempenho:**
  - CLS de 0,31/0,38/0,47 para **0,04/0,02/0,006**;
  - fontes com `preconnect`.
- **14. Calls:**
  - pré-entrada, indicador de qualidade e reconexão limitada;
  - troca de microfone sem cair;
  - diagnóstico sem dados sensíveis e saída limpa.
- **15. Observabilidade, CI e backup:**
  - erros agregados e limpos, status dos robôs;
  - gitleaks, `npm audit` e limite de tamanho no CI;
  - **backup cifrado** (o repositório é público), com teste de restauração.
- **16. LGPD e documentação:**
  - política corrigida (TURN), serviços e retenção listados;
  - aviso de revisão jurídica;
  - "Baixar meus dados" completo;
  - README, `.env.example`, LICENSE e CONTEXTO atualizados.
- **17. Métricas:**
  - contadores agregados sem identificar ninguém, respeitando "Não rastrear";
  - conversão, ativação, retenção e a métrica principal (usuários semanais com interação significativa).

## Resultados mensuráveis
| Item | Antes | Depois |
|---|---|---|
| CLS (Início / Jogos / Jogo) | 0,31 / 0,38 / 0,47 | 0,04 / 0,02 / 0,006 |
| Violações axe (14 páginas) | 26 tipos, várias graves | 0 |
| Testes Node | 7 | 34 |
| Testes de permissão do banco | 0 | ~90 asserções em `tests/rls.sql` |
| Vídeo de teste (1080p, 8 s) | 7,4 MB | 0,99 MB |
| Functions com rate limit | 0 de 11 | 11 de 11 |
| Backups | em claro, em repositório público | cifrados, com integridade verificada |

## Migrações (rodar em ordem, com backup, depois de aprovar)
1. `20261018_01_rate_limit.sql` (aplicada)
2. `20261018_02_rls_correcoes.sql` (aplicada)
3. `20261019_03_lfg_onboarding.sql`
4. `20261019_04_bloqueio_moderacao.sql`
5. `20261019_05_comunidades.sql`
6. `20261019_06_observabilidade.sql`
7. `20261019_07_metricas.sql`

O rollback por parte está em `supabase/migrations/ROLLBACK.md`. O site funciona antes e depois das migrações.

## Ações manuais restantes
- **Segredo `BACKUP_SENHA`** no GitHub: sem ele, o backup para.
- **Apagar os backups antigos não cifrados** dos Artifacts. Exige aprovação: é exclusão de dados.
- **Atualizar a ponte do Discord** (`git pull` e reiniciar o Docker). Depois, testar o áudio, por causa do opusscript 0.1.1.
- **Revisão jurídica:** privacidade, termos, diretrizes e LICENSE.
- **GitHub:**
  - proteção da `main`;
  - secret scanning;
  - CODEOWNERS;
  - avaliar repositório privado.
- **Supabase:** canais Realtime privados para a sinalização das calls (`docs/calls.md`).
- **CSP:** passar para o modo bloqueante depois de observar o console.
- **Play Store:** gerar a chave no PWABuilder, publicar o `assetlinks.json` e preencher o formulário (`docs/play-store.md`).
- **Testes manuais:**
  - e-mails reais;
  - calls com 2 a 6 pessoas em redes diferentes;
  - instalação no celular;
  - fluxos com login (bloquear, grupos, onboarding).

## Riscos residuais
- **Mídia de stories só para melhores amigos:** abre para quem tiver a URL. A solução é um bucket privado.
- **Comunidades privadas:** o convite do Discord é visível para todos.
- **`profiles`:** é público por completo (ex.: motivo de banimento).
- **Chave da sala:** banidos que já sabiam a chave da sala continuam entrando na sinalização até o Realtime privado ser ligado.
- **Métricas:** os contadores anônimos podem ser inflados. Servem para tendência.
- **Calls:** acima de cerca de 6 pessoas precisam de um SFU.

## Checklist final de produção
- [ ] Mesclar este PR, que contém #90 a #93.
- [ ] Backup e depois as migrações 03 a 07.
- [ ] Criar o `BACKUP_SENHA` e rodar o backup manualmente uma vez.
- [ ] Ctrl+F5 e testar: home, grupo, login e cadastro, call, bloquear, admin (Status e Métricas).
- [ ] Conferir no log do deploy que o `sw.js` e o `app.js` saíram com o commit (sem `__BUILD__`).
- [ ] Atualizar a ponte do Discord.
- [ ] Revisão jurídica antes de publicar na Play Store.

## Instagram: conteúdo para atrair público novo (20/10/2026)
- Diagnóstico em `docs/instagram-conteudo.md` e formatos em `scripts/instagram/LEIA-ME.md`.
- **Legendas:** gancho, contexto, convite, chamada que varia e 5 a 8 hashtags.
- **Formatos novos, em carrossel:** jogo bom por menos de R$ X, antes de você comprar, opinião da comunidade, crítica × comunidade, superestimado ou subestimado?, zerou ou largou?, top 5 por gênero e resultado do este ou aquele.
- **Rotação por horário:** sem repetir o tipo em sequência e sem repetir jogo ou notícia em 48 h. Notícia só com até 48 h.
- **Reels:** no máximo 1 por dia, com zoom. Antes de publicar, o robô consulta a cota da API; no limite, registra e pula.
- **Medição:** tabela `instagram_posts` e aba **Admin → Instagram 📸**.
- **Ação manual:** aplicar `supabase/migrations/20261020_08_instagram_posts.sql`. Sem ela, o robô funciona sem histórico.
