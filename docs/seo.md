# SEO e compartilhamento

- **Metadados no servidor** (`netlify/edge-functions/previa.js`):
  - para robôs de busca e de prévia (Google, WhatsApp, Discord...);
  - a página de jogo, perfil, comunidade, lista pública e post recebe `title`, `description`, `canonical`, Open Graph, Twitter Card e JSON-LD;
  - pessoas recebem a página normal, sem custo extra.
- **JSON-LD:**
  - `WebSite` e `Organization` na home;
  - `VideoGame` nas páginas de jogo, com `AggregateRating` **só quando há avaliações reais**;
  - `ProfilePage` nos perfis.
- **Comunidades privadas** recebem `noindex` e não expõem a descrição.
- **`noindex`** em entrar, admin, amigos, chamada, notificações, offline e 404.
- **Sitemap** (`/sitemap.xml`): páginas, jogos, comunidades públicas e listas públicas, com `lastmod` real.
  - Perfis ficam de fora até existir uma opção "perfil indexável" escolhida pela pessoa.
- **Links curtos:** `/jogo/<slug>`, `/u/<nome>` e `/c/<id>` redirecionam (301) para as páginas atuais. As URLs antigas continuam iguais.
- **Notícias:** não têm página própria (abrem em `novidades.html#n<id>`). `NewsArticle` fica para quando houver uma página por notícia.
