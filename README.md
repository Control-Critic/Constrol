# Control Critic

**Rede social brasileira de games**: encontre grupo para jogar, avalie jogos, monte sua biblioteca,
entre em comunidades com call de voz e vídeo, acompanhe promoções e notícias. Site em HTML, CSS e JavaScript puro,
com Supabase, Netlify e GitHub Actions.

- Site: https://control-critic.netlify.app
- Documentação técnica: [`docs/`](docs/) · Plano de melhorias: [`PLANO-MELHORIAS.md`](PLANO-MELHORIAS.md) · Mudanças: [`CHANGELOG-MELHORIAS.md`](CHANGELOG-MELHORIAS.md)
- Segurança: [`SECURITY.md`](SECURITY.md) · Como contribuir: [`CONTRIBUTING.md`](CONTRIBUTING.md) · Variáveis: [`.env.example`](.env.example)

> Projeto da equipe Gustavo Barros Tenório, Giovanni Henrique de Lima Franco Matos, Adler Pereira de Lima e Danilo Silva Bernardino.

## Funcionalidades

| Área | O que faz |
|---|---|
| Jogos | Catálogo de milhares de jogos de todas as plataformas (via IGDB), com busca, filtros por categoria e plataforma, ordenação e paginação; busca ampliada adiciona qualquer jogo sob demanda |
| Avaliações | Nota de 1 a 5 estrelas e comentário; média recalculada automaticamente no banco |
| Perfil e XP | Cadastro/login, foto, banner, bio, contas de PSN/Xbox/Discord/Steam, categorias favoritas e perfil público com link para compartilhar; XP e níveis (+10 por avaliação, +5 por post, +20 por criar comunidade) |
| Recomendações | Sugestões por usuário com base nas categorias favoritas e nos jogos que ele avaliou bem |
| Comunidades | Criar/participar, mural em tempo real |
| Call | Voz, câmera e tela (720p/1080p, 30/60 fps, com som do jogo/aba) direto no navegador (WebRTC), até ~6 pessoas; grade ou destaque, tela cheia, janela flutuante, chat de texto e indicador de conexão; TURN opcional para redes restritas |
| Comunidades privadas | Mural, partidas e call só para membros; entrada por link de convite ou pedido aprovado pelo dono |
| Amigos | Pedidos de amizade, quem está online, call privada entre amigos e lista de amigos no perfil |
| Discord / PS5 | Convite do servidor e widget mostrando quem está online e em call. Pelo console, entra-se na call pelo Discord vinculado |
| Notícias | Escritas pela equipe + importadas automaticamente (PlayStation Blog, Xbox Wire, anúncios oficiais da Steam) |
| Promoções | Preços e descontos da Steam (BR) atualizados automaticamente; outras lojas cadastradas no painel |
| Biblioteca | Jogando / Zerado / Quero jogar / Abandonei, horas jogadas e importação automática da biblioteca da Steam |
| Lista de desejos | Notificação automática quando um jogo desejado entra em promoção ou fica mais barato |
| Social | Seguir pessoas, perfil público, notificações em tempo real (sino) |
| Partidas | Agendar partidas nas comunidades, confirmar presença com limite de vagas, lembrete 1h antes e exportar para a agenda (.ics) |
| Segurança e LGPD | Denúncias com fila de moderação, Política de Privacidade, Termos de Uso, aceite no cadastro, baixar meus dados e excluir conta |
| Gamificação | Login diário com sequência (🔥), XP e bônus semanal; molduras de avatar, banners e selos desbloqueados por nível, sequência e conquistas; ranking mensal com moldura temporária para o top 10. Tudo cosmético, sem vantagem paga |
| Críticas | Votos de "útil" (as melhores sobem), comentários, selos de crítico útil e XP para quem ajuda |
| Listas | Listas pessoais ordenáveis e compartilháveis ("Meus RPGs favoritos"), públicas ou privadas |
| Preços | Histórico automático e "menor preço já visto" em cada jogo |
| Procurando grupo | "Criar grupo agora": jogo, plataforma, crossplay, início agendado, duração, vagas, microfone, só amigos e aviso aos amigos; entrar no grupo com vagas controladas |
| Mensagens | Conversa privada entre amigos em tempo real |
| Ao vivo | Membros e amigos transmitindo na Twitch aparecem com 🔴 AO VIVO |
| Trailers | Trailers dos jogos (YouTube, carregados só ao clicar) |
| Notificações no celular | Web Push: chamadas, mensagens, partidas e promoções mesmo com o site fechado |
| Acessibilidade | Tema claro, foco visível no teclado, atalho "pular para o conteúdo", respeita "reduzir movimento" |
| Qualidade | Testes automáticos (funções e schema.sql num Postgres) a cada envio; backup semanal do banco |
| App instalável | PWA: instala no celular/computador e abre mesmo sem internet (última versão) |
| Fale Conosco | Mensagens com assunto (inclusive pedidos de privacidade), respondidas pelo painel |
| Painel de Admin | Visão geral (números e cadastros por dia), denúncias, jogos, notícias, promoções, moderação, mensagens; usuários com busca, filtros e ficha completa (permissão, suspensão temporária com motivo, cargos, XP, itens, histórico); cargos personalizados; registro de todas as ações da equipe; aviso global no topo do site; automação |

## Arquitetura

- **Front-end:** HTML, CSS e JavaScript puro (módulos ES). Sem build.
- **Back-end:** [Supabase](https://supabase.com) (login, Postgres, armazenamento de imagens e tempo real).
  Toda a segurança fica no banco, com Row Level Security (`supabase/schema.sql`).
- **Automação:** GitHub Actions roda `scripts/sync.mjs` a cada 6 horas (notícias e preços de todo o catálogo da Steam em lotes de 100 jogos por consulta) e `scripts/igdb.mjs` todo dia (amplia o catálogo e traz lançamentos).
- **Função no servidor:** `netlify/functions/buscar-jogo.mjs` busca no IGDB e adiciona automaticamente os jogos procurados, sem expor as chaves.
- **Hospedagem:** Netlify, com deploy automático a cada push na `main`.

```
├── *.html              páginas
├── css/style.css       estilos
├── js/                 lógica de cada página (app.js = base comum, voz.js = calls)
├── img/                imagens
├── supabase/           schema.sql (tabelas, regras, automações) e seed.sql (dados iniciais)
├── scripts/            robô de sincronização e verificador de links
└── .github/workflows/  CI e robô agendado
```

## Como colocar no ar (passo a passo)

### 1. Supabase
1. Crie um projeto gratuito em supabase.com.
2. Em **SQL Editor**, cole e rode o conteúdo de `supabase/schema.sql` e depois o de `supabase/seed.sql`.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key** para `js/config.js`.
   A anon key pode ficar pública. **Nunca** coloque a `service_role` key no site.
4. Em **Authentication → URL Configuration**, coloque o endereço do site (ex.: `https://controlcritic.netlify.app`) em *Site URL* e em *Redirect URLs*.

### 2. Primeiro administrador
Crie sua conta pelo site e rode no SQL Editor:
```sql
update profiles set role = 'admin' where username = 'SEU_USUARIO';
```
Depois disso, outros papéis podem ser dados pelo próprio painel (aba Usuários).

### 3. Netlify
1. **Add new site → Import from Git** e escolha este repositório.
2. Não há comando de build. O `netlify.toml` já está configurado.

### 4. Robô de notícias e promoções
No GitHub: **Settings → Secrets and variables → Actions**, crie:
- `SUPABASE_URL`: a Project URL
- `SUPABASE_SERVICE_KEY`: a **service_role** key (só aqui, nunca no código)

Para testar, vá em **Actions → Sincronizar notícias e promoções → Run workflow**.
O resultado aparece no painel de admin, na aba Automação.

### 5. Catálogo completo (IGDB)
1. Entre em **dev.twitch.tv/console** com uma conta da Twitch (ative a verificação em duas etapas, que é obrigatória).
2. **Register Your Application**: nome `Control Critic`, OAuth Redirect URL `http://localhost`, categoria *Website Integration*, tipo *Confidential*.
3. Abra o app, copie o **Client ID** e gere um **Client Secret**.
4. No **GitHub** (Settings → Secrets and variables → Actions), crie `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET`.
5. No **Netlify** (Site configuration → Environment variables), crie `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`,
   `SUPABASE_URL` e `SUPABASE_SERVICE_KEY`, e faça um novo deploy. Essas variáveis ficam só no servidor e não aparecem no site.
6. Pronto: **todo dia** o robô "Importar jogos (IGDB)" adiciona os próximos 2.000 jogos mais populares e os lançamentos
   recentes, e a busca do site importa na hora qualquer jogo que alguém procurar e ainda não esteja no catálogo.
   Para acelerar a carga inicial, rode **Actions → Importar jogos (IGDB) → Run workflow** com uma quantidade maior.
   O resultado de cada execução aparece no resumo da execução no GitHub e em **Admin → Automação**.

Os dados de jogos vêm do [IGDB](https://www.igdb.com) (Twitch), com crédito no rodapé do site. Para uso comercial, confira os termos de uso do IGDB.

### 6. Importação da biblioteca da Steam
1. Entre em **steamcommunity.com/dev/apikey** com uma conta Steam que já tenha feito compras (contas "limitadas" não
   podem criar chave) e com o **Steam Guard pelo celular** ativo. Em *Domain Name*, coloque `control-critic.netlify.app`,
   aceite os termos e clique em *Register*.
2. No **Netlify**, crie a variável `STEAM_API_KEY` com essa chave e faça um novo deploy.
3. Cada pessoa usa em **Perfil → Importar da Steam**. O perfil e os "Detalhes de jogos" precisam estar públicos na Steam.
   PlayStation e Xbox não oferecem API oficial para isso.

### 7. Lembretes de partida
O `schema.sql` agenda os lembretes no próprio banco (extensão `pg_cron`, a cada 10 minutos). Se o Supabase não permitir
ativar a extensão, o robô de sincronização envia os lembretes como reserva (com menos precisão).

### 8. Tradução automática (opcional, recomendado)
O IGDB e as notícias da Steam vêm em inglês. O robô troca pela descrição em português da Steam quando ela existe; o resto
é traduzido pelo **DeepL** (plano gratuito: 500 mil caracteres por mês).
1. Crie uma conta em **deepl.com/pro-api** (plano *DeepL API Free*) e copie a chave (termina com `:fx`).
2. Crie `DEEPL_API_KEY` nos **segredos do GitHub** (notícias) e nas **variáveis do Netlify** (descrições, traduzidas na primeira vez que alguém abre o jogo e salvas).
Sem a chave, quem usa o Chrome atualizado vê a tradução feita pelo próprio navegador.

### 9. Gamificação
Funciona sozinha depois de rodar o `schema.sql`. Os 100 primeiros membros ganham a moldura **Fundador**, e quem já tinha conta
recebe as recompensas retroativas. A premiação do top 10 do mês roda no dia 1 pelo `pg_cron` (ou pelo robô, como reserva).
Para criar novos itens use **Admin → Itens**: molduras (cores, giro, brilho, emoji ou imagem PNG), banners
(cores ou imagem) e selos (emoji), com desbloqueio manual, por nível ou por dias seguidos.

### 10. Servidor TURN para as calls (recomendado)
Sem TURN, a call funciona quando os navegadores conseguem se conectar direto, mas falha em muitas redes de celular e de provedores
(as pessoas aparecem na sala, mas sem áudio/vídeo). O site usa o TURN da Cloudflare, que tem uma cota gratuita.
1. Crie uma conta em **dash.cloudflare.com** → **Realtime** (ou *Calls*) → **TURN Server** → **Create**.
2. Copie o **Turn Token ID** e o **API Token**.
3. No **Netlify**, crie `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` e faça um novo deploy.
A função `netlify/functions/turn.mjs` gera credenciais temporárias; as chaves nunca vão para o navegador.

**Alternativa grátis: TURN no seu computador.** Veja `turn-caseiro/LEIA-ME.md` (coturn com Docker). Configure
`TURN_URL` e `TURN_SECRET` no Netlify. Pode usar junto com a Cloudflare: o navegador escolhe o que funcionar.

### 11. Notificações no celular
1. No site, vá em **Admin → Site → Notificações no celular → Gerar chaves e configurar**.
2. Copie as 4 variáveis mostradas para o **Netlify** e faça um novo deploy.
3. Cada pessoa ativa em **Perfil → Notificações no celular** (no iPhone, só pelo app instalado na tela de início).
O banco envia as notificações pela extensão `pg_net` do Supabase (ative em Database → Extensions se o SQL avisar).

### 12. Ao vivo na Twitch
Usa o mesmo app da Twitch do IGDB (as variáveis `IGDB_CLIENT_ID` e `IGDB_CLIENT_SECRET` precisam estar **também no Netlify**).
Cada pessoa informa o usuário da Twitch em **Editar perfil**.

### 13. Backup
Toda semana o GitHub Actions exporta as tabelas (sem senhas nem e-mails). Para baixar: **Actions → Backup do banco → execução
mais recente → Artifacts**. Também dá para rodar na hora com **Run workflow**.

### 14. Discord em uma comunidade
Na página da comunidade, o dono clica em **Configurar** e cola:
- o **convite** (`https://discord.gg/...`), de preferência sem expiração;
- opcionalmente o **ID do servidor**, depois de ativar *Configurações do servidor → Widget → Habilitar widget*.

## Atualizar um projeto que já está no ar
Quando este repositório trouxer mudanças no banco, rode de novo, no SQL Editor, `supabase/schema.sql` e depois
`supabase/seed.sql`. Os dois podem ser executados várias vezes sem apagar nada: só adicionam o que falta.
Depois rode o robô (Actions → Run workflow) para buscar capas, descrições, preços e notícias dos jogos novos.

## Checklist de lançamento

Antes de abrir para o público, confira:

- [ ] `supabase/schema.sql` rodado por inteiro depois da última atualização (sem erros).
- [ ] Extensões ativas no Supabase (Database → Extensions): **pg_cron** e **pg_net**.
- [ ] Variáveis no Netlify: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `STEAM_API_KEY`,
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SECRET` e, para as calls fora da rede local, o TURN (veja a seção do TURN).
- [ ] Novo deploy no Netlify depois de mexer nas variáveis.
- [ ] Segredos do GitHub (Settings → Secrets → Actions) iguais aos do Netlify, e as Actions `sync`, `igdb` e `backup` rodando verdes.
- [ ] Teste com 2 contas: cadastro, post com foto, curtida, comentário com @menção, pedido de amizade, mensagem, call com tela, notificação no celular.
- [ ] Admin → Visão geral → **Uso do Supabase** abaixo de 80%.
- [ ] Admin → **Problemas 🐞** sem erros novos depois dos testes.
- [ ] Textos de [Privacidade](privacidade.html) e [Termos](termos.html) revisados por vocês (e, se possível, por alguém da área jurídica).
- [ ] Testar a prévia de um link no WhatsApp ou no Discord (ex.: a página de um jogo).
- [ ] Enviar o sitemap no Google Search Console: `https://SEU-SITE/sitemap.xml` (o endereço no `robots.txt` está com control-critic.netlify.app; troque se mudar o domínio).

## Servidores TURN próprios (opcional, economizam a Cloudflare)

A call tenta primeiro os seus servidores TURN e só usa a Cloudflare se eles não responderem.

Guias na pasta `turn-proprio`:
- [`GUIA-ORACLE.md`](turn-proprio/GUIA-ORACLE.md): máquina grátis na Oracle Cloud, sempre ligada;
- [`GUIA-IPV6-CASA.md`](turn-proprio/GUIA-IPV6-CASA.md): o seu PC, por IPv6, para quem tem CGNAT.

Para testar se cada servidor está respondendo: **Admin → Site → 📡 Servidores de retransmissão**.

## Ponte de voz com o Discord (opcional)

Junta o canal de voz do Discord da comunidade com a call do site, para quem joga no console falar com quem está no site.
Roda no seu PC com o Docker Desktop. O passo a passo completo está em [`ponte-discord/LEIA-ME.md`](ponte-discord/LEIA-ME.md).

## Publicar na Play Store (opcional)

O site já é um app instalável (PWA). Para aparecer na Play Store sem reescrever nada, empacote com o **Bubblewrap** (Trusted Web Activity):

1. Instale o Node e rode `npx @bubblewrap/cli init --manifest https://SEU-SITE/manifest.webmanifest`.
2. `npx @bubblewrap/cli build` gera o `.aab` (envie na Play Console; a conta de desenvolvedor custa US$ 25, pagamento único).
3. O Bubblewrap mostra a impressão digital (SHA-256) da chave. Crie o arquivo `.well-known/assetlinks.json` neste repositório com ela
   (modelo na documentação do Bubblewrap) para o app abrir sem a barra do navegador.

No iPhone, a App Store não aceita PWAs empacotados com facilidade: lá o caminho é "Adicionar à Tela de Início" pelo Safari.

## Testes

```bash
npm ci
npm run check          # sintaxe, testes (node --test) e links
npm run check:html     # validação dos HTML
npm run check:a11y     # acessibilidade (precisa de Chromium: npx playwright-core install chromium)
```
O banco é testado com um Postgres 16 e um stub do Supabase. É o que o CI faz:
`tests/supabase-stub.sql`, depois `supabase/schema.sql` 2 vezes, depois `supabase/migrations/*.sql` 2 vezes, depois `tests/rls.sql`.

## Rodar localmente
Os módulos JS precisam de um servidor (abrir o arquivo direto não funciona):
```bash
npx serve .        # ou: python3 -m http.server 8000
```

## Textos legais
`privacidade.html` e `termos.html` são **modelos** escritos para o projeto. Revisem com a equipe/orientador e,
se o site crescer ou for monetizado, com um advogado.

## Limitações conhecidas
- **Calls** são ponto a ponto, então funcionam bem com até ~6 pessoas. Em redes muito restritas pode ser preciso
  configurar um servidor TURN em `js/config.js`. Consoles não abrem calls pelo navegador, por isso a integração com o Discord.
- **Promoções automáticas** só existem para a Steam (API pública). PlayStation e Xbox não têm API pública confiável,
  então essas ofertas são cadastradas no painel.
- Os **links das lojas** cadastrados no `seed.sql` devem ser conferidos. Alguns de Xbox apontam para a busca da loja.
