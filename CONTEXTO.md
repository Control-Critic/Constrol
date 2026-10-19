# Control Critic: contexto completo do projeto

Este é o documento de passagem do projeto: o que é, como está montado, o que já foi feito, como operar e o que ainda falta.
**Não há senhas nem chaves neste arquivo.** Elas ficam só no Netlify, nos segredos do GitHub e no Supabase.

- Site: https://control-critic.netlify.app
- Repositório: https://github.com/Control-Critic/Constrol (o nome "Constrol" é o do repositório no GitHub; renomear é uma ação manual em Settings → Rename e exige atualizar Netlify e links)
- Instagram: @control.critic
- Situação em: 19/10/2026 (ver também `PLANO-MELHORIAS.md`, `CHANGELOG-MELHORIAS.md` e `docs/`)

---

## 1. O que é

O Control Critic é uma **rede social brasileira de games**. Nele as pessoas:
- avaliam jogos e montam a biblioteca;
- leem notícias e acompanham promoções;
- entram em comunidades e conversam em **calls de voz e vídeo com ponte para o Discord**;
- postam memes, prints e stories;
- ganham conquistas (molduras, banners e selos).

O mascote é o **Adelino**, um tucano de jaqueta. A identidade visual usa fundo escuro, amarelo `#FFD33C` e títulos em Anton.

## 2. Arquitetura

| Parte | Tecnologia | Onde está |
|---|---|---|
| Site (front-end) | HTML + JavaScript puro (módulos ES) + CSS, sem framework | raiz, `js/`, `css/` |
| Hospedagem | Netlify (site estático, Functions, Edge Function e Image CDN) | `netlify.toml`, `netlify/` |
| Banco, login e arquivos | Supabase: Postgres com RLS, Auth, Storage (bucket `media`), Realtime, pg_cron e pg_net | `supabase/schema.sql` |
| Robôs | GitHub Actions + scripts Node 22 | `.github/workflows/`, `scripts/` |
| Calls | WebRTC em malha (perfect negotiation) + TURN próprio + Cloudflare como reserva | `js/voz.js`, `js/chamada-ui.js` |
| Ponte Discord ↔ call | Robô em Docker (discord.js + @roamhq/wrtc) | `ponte-discord/` |
| TURN | coturn numa VM Always Free da Oracle (São Paulo) e, opcionalmente, IPv6 em casa | `turn-proprio/` |
| E-mails de login | SMTP do Brevo configurado no Supabase | `supabase/emails/` |
| Instagram | API oficial do Instagram (login do Instagram) + artes geradas em SVG → PNG (resvg + sharp) | `scripts/instagram/` |
| Dados de jogos | IGDB (Twitch) e Steam Web API | `lib/igdb.mjs`, `lib/steam.mjs` |

O **`supabase/schema.sql`** é idempotente: pode ser rodado de novo quantas vezes quiser e sempre leva o banco para a versão atual. Rode-o depois de mesclar mudanças que mexem no banco.

## 3. Páginas

| Página | Conteúdo |
|---|---|
| `index.html` | Stories, destaques, promoções, notícias, lançamentos, "procurando grupo", desafio da semana, feed e atividade dos amigos |
| `jogos.html` | Catálogo (mais de 14 mil jogos) com filtros de plataforma e categoria (até 3 por jogo) |
| `jogo.html` | Notas (da comunidade e nota inicial do IGDB), avaliações, onde comprar, histórico de preço, trailers e imagens, **outras versões** (original/remake), trocar capa (admin) e "capa errada?" |
| `novidades.html`, `promocoes.html` | Notícias e promoções (robô a cada 6 horas) |
| `comunidades.html`, `comunidade.html` | Comunidades com posts, avisos fixados, partidas, call com ponte para o Discord, banner, ícone e cargos |
| `perfil.html` | Nível/XP, conquistas, nota de 24 h, música do Spotify, destaques de stories, biblioteca, resumo de horas e conquistas da Steam, vitrine, posts, listas e amigos |
| `amigos.html` | Amigos, pedidos, mensagens e calls privadas |
| `chamada.html` | Call em janela separada |
| `conquistas.html` | Molduras, banners, selos, sequência de dias e ranking |
| `notificacoes.html` | Notificações (também chegam no celular por push) |
| `admin.html` | Painel: problemas, denúncias, jogos, notícias (botão de postar no Instagram), **memes**, promoções, posts, usuários, cargos, itens (editor de moldura com tamanho e posição), desafios (vários prêmios), site (TURN, push, robô do Discord) e automação |

## 4. Funcionalidades principais

- **Social:**
  - posts com imagem ou GIF, música do Spotify e marcação de jogo;
  - curtidas e comentários, menções com @;
  - seguir, amizades, mensagens diretas;
  - **stories de 24 h** com enquete, caixinha de perguntas, música, "melhores amigos", destaques no perfil e contagem de visualizações;
  - **notas** de 24 h.
- **Gamificação:**
  - XP e níveis, sequência de login diário;
  - molduras, banners e selos, com desbloqueio automático por regras: nível, dias seguidos, avaliações, biblioteca, zerados, lista de desejos, categorias avaliadas e curtidas;
  - desafios semanais com prêmio múltiplo e ranking mensal.
- **Jogos:**
  - catálogo do IGDB com nota inicial;
  - importação da Steam: biblioteca, horas e conquistas de todos os jogos (lidas em lotes), com as mais raras em destaque;
  - desfazer importação;
  - lista de desejos com aviso de promoção (no site e no celular).
- **Calls:**
  - voz, câmera e compartilhamento de tela até 1080p/60;
  - supressão de ruído por IA (RNNoise), sensibilidade, apertar para falar;
  - volume por pessoa e grade livre;
  - **🎵 tocar música de uma aba** (ex.: Spotify Web) junto com a tela do jogo;
  - ponte para o canal de voz do Discord.
- **Notificações no celular** (Web Push), com botão "Enviar teste" de diagnóstico no perfil.
- **Memes da comunidade:** o autor marca "😂 É meme" ao postar, a equipe aprova em Admin → Memes e o robô publica no Instagram com crédito.

## 5. Robôs (GitHub Actions)

| Robô | Quando | O que faz |
|---|---|---|
| Sincronizar notícias e promoções (`sync.yml`) | a cada 6 h | Notícias por RSS, promoções e preços da Steam, tradução |
| Importar jogos IGDB (`igdb.yml`) | todo dia 01h41 | Amplia o catálogo e traz lançamentos. Modo manual **recategorizar** refaz as categorias |
| Instagram (`instagram.yml`) | 12h50 e 18h50 | 12h50: meme aprovado ou enquete "Qual você prefere?". 18h50: resumo do dia (como **Reels com música**, se houver músicas em `scripts/instagram/musicas/`; senão, carrossel), notícia ou promoção. Todo post também vira **story**. O botão "📸 Postar agora" no admin publica notícia urgente na hora |
| Robô semanal (`semanal.yml`) | segunda 08h07 | Atualiza horas e conquistas da Steam de todos e abre o desafio da semana |
| Backup do banco (`backup.yml`) | domingo | Cópia do banco (artifact por 90 dias) |
| Verificações (`ci.yml`) | a cada mudança | Sintaxe, testes, HTML, links e o `schema.sql` rodando do zero e de novo |

No banco (pg_cron), rodam também a limpeza diária, o resumo semanal e os gatilhos de conquistas, notificações e push.

Horários em Brasília; nos arquivos `.yml` os horários estão em UTC.

## 6. Configuração e segredos (só os nomes)

- **Netlify (Environment variables):**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
  - `STEAM_API_KEY`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SECRET`
  - TURN: segredos da Oracle e da Cloudflare
  - `GITHUB_DISPARO_TOKEN`
  - chaves do IGDB/Twitch
- **GitHub (Settings → Secrets → Actions):**
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
  - `IG_USER_ID`, `IG_TOKEN` (o token do Instagram se renova sozinho e fica no banco, na tabela `app_secrets`)
  - `STEAM_API_KEY`
  - chaves do IGDB
- **Supabase:**
  - SMTP do Brevo (`smtp-relay.brevo.com:587`);
  - Redirect URLs com `https://control-critic.netlify.app/**`;
  - extensões pg_cron e pg_net.
- **Brevo:** o bloqueio de IP para chaves SMTP precisa ficar **desativado**, porque o Supabase envia de IPs variáveis.
- **Oracle:** VM E2.1.Micro com coturn. O plano Always Free tem 200 GB de disco, 10 TB de tráfego por mês e até 24 GB de RAM em ARM (A1).

Guias detalhados: `scripts/instagram/LEIA-ME.md`, `ponte-discord/LEIA-ME`, `turn-proprio/GUIA-ORACLE.md`, `turn-proprio/GUIA-IPV6-CASA.md`, `supabase/emails/LEIA-ME`, `img/adelino/LEIA-ME.md` e `scripts/instagram/musicas/LEIA-ME.md`.

## 7. Como trabalhar no projeto

1. Cada mudança vai numa **branch** e num PR. Mesclar na `main` publica sozinho no Netlify.
2. Se a mudança mexe no banco, rode o `supabase/schema.sql` no SQL Editor do Supabase.
3. Ao mudar arquivos do site, aumente a versão do cache em `sw.js` (`cc-vNN`). Isso garante que todos recebam a versão nova.
   - Vários PRs abertos ao mesmo tempo geram **conflito nessa linha**. A solução é manter o número maior.
4. Testes locais: `node --test tests/*.test.mjs` e `node scripts/checar-links.mjs`.
5. O Instagram tem modo de teste: Actions → Instagram → "Só gerar as artes". As imagens e o Reels saem nos Artifacts.

## 8. Pendências

**Para mesclar ou aplicar:**
- PR **`feat/social`**: stories, notas, música, destaques, melhores amigos, avisos, robô semanal e Reels. Depois de mesclar:
  - rodar o `schema.sql`;
  - criar o segredo `STEAM_API_KEY` no GitHub.
- Rodar **recategorizar** no robô do IGDB, se ainda não foi feito.
- Colocar músicas **livres de direitos** em `scripts/instagram/musicas/`, para ativar os Reels.

**Conteúdo:**
- Skins do Adelino:
  - **aventura** e **estratégia**: enviar os arquivos, porque só chegaram como prévia no chat;
  - **terror**: refazer no estilo 2D, sem névoa;
  - **esportes**: refazer sem o capacete do Senna e sem logos de marcas.
- O amigo **Penumbra** precisa liberar o tempo de jogo na privacidade da Steam e importar de novo.
- Testar a **ponte do Discord** de verdade no PC (Docker).

**Ideias futuras:**
- Domínio próprio, por exemplo `controlcritic.com.br`. Ajuda na entrega de e-mails e no SEO.
- "Onde jogar": assinaturas como Game Pass e PS Plus.
- Tempo para zerar (IGDB).
- Calendário de lançamentos.
- Chamado de cadastro mais forte na página inicial para visitantes.

## 9. Limites conhecidos

- O navegador não separa o som de aplicativos no compartilhamento de tela: "Tela inteira" leva o som de tudo, inclusive do Discord. A saída é usar "Janela" (Chrome atualizado) ou o botão 🎵 com o Spotify Web.
- A Steam não informa jogos zerados. As conquistas dependem do perfil e dos "detalhes de jogos" estarem públicos na Steam.
- Pela API do Instagram não dá para usar as músicas em alta, figurinhas interativas, Lives nem Notas. Isso é feito à mão no app.
- Jogos em tela cheia exclusiva (ex.: Project Zomboid) precisam estar em janela ou sem bordas para serem compartilhados sozinhos.

## 10. Melhorias de outubro de 2026 (fases 1 a 17)
Resumo em `CHANGELOG-MELHORIAS.md`. Documentos técnicos em `docs/`:
- `seguranca-functions.md`: proteções das Netlify Functions;
- `banco-seguranca.md`: RLS, Storage e privilégios;
- `play-store.md`: publicação na Play Store;
- `seo.md`;
- `desempenho.md`;
- `calls.md`;
- `observabilidade-backup.md`;
- `metricas.md`;
- `configuracoes-github.md`: ações manuais no GitHub.

**Segredos novos:**
- `BACKUP_SENHA` no GitHub (obrigatório para o backup);
- `RATE_SAL` e `SITE_ORIGENS` no Netlify (opcionais).
