# Segurança das Netlify Functions

Todas as funções usam `lib/http.mjs`. O arquivo cuida de:
- método HTTP;
- CORS;
- corpo JSON;
- timeout;
- rate limit;
- comparação de segredos em tempo constante;
- log sem dados sensíveis;
- erro padronizado `{ erro, codigo }`.

## Matriz por função

| Função | Métodos | Autenticação | Autorização | Rate limit | Observações |
|---|---|---|---|---|---|
| `turn` | GET | Token do Supabase **obrigatório**. A ponte do Discord usa um derivado SHA-256 da chave de serviço | Qualquer usuário logado | 30 a cada 10 min, por usuário | Credencial válida por 2 h, identificada pelo prefixo do id do usuário. Cloudflare com timeout de 6 s |
| `push` (envio) | POST | Cabeçalho `x-push-secret`, comparado em tempo constante | Só o banco (pg_net) | 20 tentativas negadas a cada 10 min, por IP | Corpo até 4 KB. `type` validado. Link só interno |
| `push?teste=1` | POST | Token do usuário | O próprio usuário | 5 a cada 10 min | Envia só para os aparelhos da própria pessoa |
| `push` (chave pública) | GET | — | — | — | Devolve só a chave VAPID **pública** |
| `importar-steam` | POST | Token do usuário (o id vem do token, nunca do corpo) | O próprio usuário | 6 por hora | Corpo até 1 KB. A mensagem de erro de login não expõe detalhes |
| `conquistas-steam` | POST | Token do usuário | O próprio usuário | 300 por hora | `offset` inteiro entre 0 e 20.000 |
| `instagram-agora` | POST | Token do usuário | `admin` ou `moderator`, conferido no banco | 10 por hora | `noticia` inteiro positivo. Repetição bloqueada: notícia já publicada devolve 409. GitHub com timeout |
| `buscar-jogo` | GET | Pública | — | 15 a cada 5 min, por IP | Grava jogos novos do IGDB no catálogo com a chave de serviço. Termo limitado a 60 caracteres, sem aspas |
| `traduzir` | GET | Pública | — | 20 a cada 10 min, por IP | Cada jogo é traduzido uma única vez |
| `ao-vivo`, `steam-agora`, `precos-lojas` | GET | Pública | — | 40 a 60 por minuto, por IP | Entradas validadas por regex. Cache curto na CDN |
| `sitemap` | GET, HEAD | Pública | — | — | Usa só a chave pública. Timeout de 15 s |

## Rate limit
- A função `public.rate_hit(chave, maximo, segundos)` do banco é compartilhada entre as instâncias. Ela vem da migração `supabase/migrations/20261018_01_rate_limit.sql` e só o `service_role` executa.
- A chave é `nome:hash(IP ou id)`. **O IP nunca é gravado em texto puro.** A variável opcional `RATE_SAL` no Netlify muda o sal do hash.
- Se o banco não responder (ou a migração ainda não tiver sido aplicada), cada instância usa um contador próprio em memória. Ele é mais fraco, mas não bloqueia ninguém por engano.

## CORS
- Origens aceitas:
  - `https://control-critic.netlify.app`;
  - as prévias `https://<algo>--control-critic.netlify.app`;
  - `http://localhost:8888`;
  - as extras listadas em `SITE_ORIGENS`.
- Requisições de navegador vindas de outra origem recebem 403 nas funções sensíveis.

## Limitações conhecidas
- `buscar-jogo` continua público, porque a busca do catálogo funciona sem login. O abuso fica limitado pelo rate limit e pela própria API do IGDB.
- O rate limit por IP pode juntar várias pessoas atrás do mesmo IP, como em CGNAT. Os limites foram dimensionados com folga.
