# Plano de melhorias do Control Critic

Este documento registra o diagnóstico **confirmado no código** (branch `main` em 18/10/2026), o que será alterado, a ordem das fases e os critérios de aceite.
Itens do plano original que já estão corretos ficam marcados como **verificado, sem alteração**.

Regras gerais de todas as fases:
- HTML, CSS e JavaScript puro. Sem framework.
- Cada fase tem a sua própria branch e o seu próprio PR. Nada é mesclado nem publicado sem aprovação humana.
- Toda mudança de banco é idempotente. Ela entra no `supabase/schema.sql` e em `supabase/migrations/`.
- Se arquivos públicos mudarem, a versão `cc-vNN` do `sw.js` sobe.
- Nenhum segredo aparece em código, log, PR ou documento.

## 1. Inventário da arquitetura

| Parte | Implementação real |
|---|---|
| Site | 22 páginas HTML na raiz. 26 módulos ES em `js/` (cerca de 5.900 linhas). Um CSS (`css/style.css`). Sem build |
| Back-end | Supabase: `supabase/schema.sql` com cerca de 3.400 linhas. Usa RLS, funções `security definer`, pg_cron, pg_net, Realtime e o bucket `media` |
| Functions (Netlify) | `ao-vivo`, `buscar-jogo`, `conquistas-steam`, `importar-steam`, `instagram-agora`, `precos-lojas`, `push`, `sitemap`, `steam-agora`, `traduzir`, `turn` |
| Robôs (Actions) | `sync` (6/6 h), `igdb` (diário), `instagram` (3x/dia), `semanal`, `backup`, `ci` |
| Calls | WebRTC em malha (`js/voz.js`) + TURN próprio (coturn/Oracle) + Cloudflare de reserva. Ponte Discord em `ponte-discord/` |
| PWA | `manifest.webmanifest` + `sw.js` (network-first com cópia em cache) + Web Push |
| Testes | `tests/funcoes.test.mjs`, `tests/versus.test.mjs`. O CI roda sintaxe, testes, links, HTML e o schema do zero duas vezes |

## 2. Contexto documentado × implementação

| Ponto | Situação |
|---|---|
| `CONTEXTO.md` diz "conquistas dos 12 jogos mais jogados" | **Desatualizado.** Hoje são lidas em lotes, em todos os jogos (`lib/steam.mjs`) |
| `CONTEXTO.md` lista a limpeza dos stories como "ideia futura" | **Desatualizado.** Já existe em `scripts/semanal.mjs` |
| Nome do repositório "Constrol" | Confirmado no GitHub (`Control-Critic/Constrol`). Renomear exige ação manual: Settings → Rename. A Netlify e as URLs do Actions dependem disso. **Não alterar sem aprovação** |
| Política de privacidade (`js/legal.js:27`) | Afirma que as chamadas "não passam pelos nossos servidores". **Incorreto quando o TURN é usado** (fase 16) |

## 3. Diagnóstico confirmado por fase

### Fase 1: correções críticas do front-end
- `esc()` (`js/app.js:20`) já escapa `& < > " '`, inclusive o apóstrofo (`&#39;`). **Verificado.** Faltam testes automatizados.
- Uso de `innerHTML` e `insertAdjacentHTML` em 26 módulos, com cerca de 160 ocorrências. A auditoria linha a linha está na seção 5.
- `404.html`:
  - tem script inline;
  - não tem `noindex`;
  - tem link relativo `index.html`, que quebra em `/pasta/inexistente` porque o Netlify serve a 404 em qualquer caminho;
  - a descrição é genérica.
- Plurais com "(s)" e "(ões)" visíveis ao usuário. Exemplos:
  - `js/jogo.js:105` "avaliação(ões)";
  - `js/promocoes.js:66` "promoção(ões) ativa(s)";
  - `js/app.js:458`, `js/chamada-ui.js:90`, `js/conquistas.js:37`, `js/home.js:97-99`, `js/jogo.js:171,197`;
  - cerca de 20 ocorrências no `admin.js`.
- `cardJogo` (`js/app.js:239`): um jogo sem avaliações e sem nota do IGDB mostra 5 estrelas vazias e "(0)", o que parece nota zero.

### Fase 2: Functions
- `turn.mjs`:
  - **sem autenticação**. Só confere a origem, e uma requisição sem `Origin`/`Referer` passa;
  - qualquer pessoa obtém credenciais de TURN válidas por 6 h;
  - a chamada à Cloudflare não tem timeout.
- `traduzir.mjs`: sem autenticação e sem rate limit. Cada jogo é traduzido só uma vez, o que limita o abuso, mas a cota do DeepL pode ser consumida varrendo IDs.
- `ao-vivo`, `sitemap`, `steam-agora` e `precos-lojas`: aceitam qualquer método HTTP.
- Nenhuma função tem rate limit.
- Algumas mensagens de erro repassam `e.message`.
- `instagram-agora`:
  - deriva o usuário do token e checa o papel no banco. **Correto**;
  - aceita moderador, o que fica documentado como decisão.
- `push`: valida o segredo e o usuário. A revisão detalhada fica na fase 2.

### Fase 4: headers e cadeia de fornecimento
- `netlify.toml` tem `nosniff`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`.
- **Faltam:** HSTS e CSP.
- Workflows:
  - nenhum declara `permissions:`;
  - Actions fixadas por tag (`@v4`), não por SHA;
  - só o `instagram` tem `concurrency`.
- Sem Dependabot, CodeQL, CODEOWNERS, SECURITY.md e CONTRIBUTING.md.
- `package.json` sem `engines` e sem scripts.

### Fase 10: PWA
- `sw.js`: **quando a rede falha, devolve `index.html` para qualquer requisição**, inclusive JS, CSS e imagens. Bug confirmado.
- `sw.js`: guarda em cache todas as páginas, inclusive as privadas.
- `manifest.webmanifest`:
  - sem `id`;
  - `purpose: "any maskable"` combinado, quando o recomendado é separar;
  - sem screenshots;
  - sem atalho "Encontrar grupo".
- `theme-color` vazio: **não encontrado**. Todas as páginas usam `#0b0b0d`. **Verificado.**

### Fase 12: SEO
- `noindex` não aparece em nenhuma página, inclusive admin, entrar, chamada, notificações e amigos.
- Não há JSON-LD.

### Fase 16: documentação
- Sem `.env.example`, sem LICENSE.
- O CONTEXTO precisa dos ajustes da seção 2.

## 4. Fases, dependências e riscos

| # | Fase | Branch | Depende de | Risco principal | Aprovação humana |
|---|---|---|---|---|---|
| 1 | Front-end crítico | `fase1/front-critico` | — | Regressão visual ao trocar templates | Merge |
| 2 | Functions | `fase2/functions` | — | Bloquear chamadas legítimas (CORS e rate limit) | Merge |
| 3 | RLS e Storage | `fase3/rls-storage` | — | Política nova travar uma função existente | **Migração em produção** |
| 4 | Headers, CSP, supply chain | `fase4/headers-ci` | 1 (scripts inline) | CSP quebrar Spotify, YouTube ou Supabase | **CSP bloqueante**, proteção da main |
| 5 | Nova home | `fase5/home` | 1 | Queda de conteúdo para visitantes | Merge |
| 6 | Procurando grupo e onboarding | `fase6/lfg` | 3, 5 | XP repetido | Migração |
| 7 | Login e cadastro | `fase7/login` | — | Travar o login | SMTP e Supabase Auth |
| 8 | Catálogo e jogo | `fase8/catalogo` | 1 | URLs de filtros antigas | Merge |
| 9 | Comunidades e moderação | `fase9/moderacao` | 3 | Permissões de cargos | Migração |
| 10 | PWA | `fase10/pwa` | 1 | Cache preso em versão velha | Merge |
| 11 | Acessibilidade | `fase11/a11y` | 5, 7, 8 | — | Merge |
| 12 | SEO | `fase12/seo` | 8 | Edge Function lenta | Merge |
| 13 | Desempenho | `fase13/perf` | 10, 12 | — | Merge |
| 14 | Calls | `fase14/calls` | 2 | Regressão de conexão | TURN em produção |
| 15 | Observabilidade e CI | `fase15/obs-ci` | 2, 3 | Log com dado sensível | Merge |
| 16 | LGPD e documentação | `fase16/docs-lgpd` | todas | Texto jurídico | **Revisão jurídica** |
| 17 | Métricas | `fase17/metricas` | 3, 15 | Coleta excessiva | Migração |

## 5. Critérios de aceite da fase 1
- [ ] Nenhum dado de usuário, banco ou API externa é interpolado em HTML sem `esc()`, `urlSegura()` ou conversão numérica.
- [ ] Testes de `esc` e `urlSegura` com payloads de XSS passam (`tests/front.test.mjs`).
- [ ] A 404:
  - não tem script inline;
  - tem `noindex, follow`;
  - usa links absolutos;
  - funciona em caminhos aninhados.
- [ ] `grep` não encontra mais `(ões)` nem `(s)` em texto visível ao usuário.
- [ ] O card de jogo sem nenhuma nota mostra "Sem notas", não estrelas vazias.
- [ ] CI verde, smoke test das páginas públicas sem erros de console.

## 6. Situação das fases
| Fase | Situação | PR |
|---|---|---|
| 1 | Mesclada | #75 |
| 2 | Mesclada (migração 01 aplicada) | #77 |
| 3 | Mesclada (migração 02 aplicada) | #79 |
| 4 | Mesclada | #78 |
| 5 | Mesclada (+ personalidade #87) | #80 |
| 6 | Mesclada (aplicar a migração 03) | #88 |
| 7 | PR aberto | #93 |
| 9 (bloqueio e moderação) | PR aberto | #90 |
| 10 | PR aberto | #92 |
| Compressão de vídeo | PR aberto | #91 |
| 8, 9 (comunidades), 11 a 17 | PR único, a pedido (inclui #90 a #93) | ver o `CHANGELOG-MELHORIAS.md` |

Resultados, ações manuais, riscos e o checklist de produção estão em `CHANGELOG-MELHORIAS.md`.
