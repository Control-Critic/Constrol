# Robô do Instagram do Control Critic

São **3 posts por dia**, e cada horário tem uma **lista de formatos que se revezam**. O robô escolhe o formato que está há mais tempo sem sair naquele horário. Ele **nunca repete o tipo do post anterior** e não repete jogo nem notícia por 48 h.

| Horário (Brasília) | Modo | Objetivo | Formatos que se revezam |
|---|---|---|---|
| 09h20 | `manha` | Útil, para **salvar** | Jogo bom por menos de R$ X · Antes de você comprar · Promoção |
| 12h50 | `entretenimento` | **Meme todo dia** (é o que mais traz e segura gente) | Meme da comunidade aprovado no admin; sem ele, **meme automático** |
| 18h50 | `diario` | Notícia, opinião e comentário (**o Reels do dia sai aqui**) | Notícias em carrossel · Opinião da comunidade · Este ou aquele · Zerou ou largou? · Crítica × comunidade · Superestimado? · Resultado do este ou aquele · Top 5 por gênero |
| Botão **📸 Postar agora** | `urgente` | Notícia urgente | Carrossel com a etiqueta vermelha "URGENTE" |

**Horários reserva:** o GitHub às vezes atrasa ou pula um agendamento. Por isso cada horário tem uma reserva 40 minutos depois (10h00, 13h30 e 19h30).
- A reserva só publica se aquele horário ainda não saiu no dia.
- O agendamento principal, se rodar atrasado, também confere antes, então nunca sai post repetido.
- A reserva precisa da tabela `instagram_posts` (migração 08). Sem ela, a reserva não faz nada.

Se um formato não tem conteúdo bom no momento (por exemplo, nenhum meme aprovado), o robô tenta o próximo da lista.

## Formatos
Quase todos saem em **carrossel**, como as notícias: uma capa, os itens e, no fim, um slide de chamada para o site. Só as perguntas de opinião saem em imagem única.

- **Jogo bom por menos de R$ X:** até 4 jogos em promoção, cada um com a capa, o preço antigo riscado, o preço novo e o desconto.
  - A faixa muda por dia: R$ 30, R$ 50, R$ 20 ou R$ 100.
  - Só entram jogos com nota 70+ na crítica (IGDB, com 20+ notas) ou 3,5+ na comunidade (3+ avaliações).
- **Antes de você comprar:** um jogo em promoção, com os dados que o site tem:
  - nota da crítica e nota da comunidade;
  - preço atual e o anterior, e até quando vai a promoção;
  - plataformas e gênero;
  - uma avaliação pública, quando houver.
  - O site **não tem** tempo de jogo nem compatibilidade com o Steam Deck, então isso **não aparece**.
- **Promoção:** os maiores descontos de jogos conhecidos, com preço riscado.
- **Meme automático:** piadas **originais** do Control Critic, escritas para a marca, com o Adelino. Nada é copiado da internet.
  - São 120 piadas em `scripts/instagram/memes.mjs`, e nenhuma se repete por 90 dias. Para acrescentar mais, é só seguir o formato do arquivo.
  - Algumas usam dados reais do dia: a promoção do dia ("A Steam: {jogo} por {preço}") ou um jogo popular com a nota da crítica.
  - Dois layouts que alternam por dia: o clássico (texto em cima, Adelino, resposta embaixo) e o de tirinha (dois painéis).
- **Meme da comunidade:** até 3 memes aprovados no admin, com o **nome do autor no site** na arte e na legenda. Não usa @, porque o nome no site não é o @ do Instagram.
- **Este ou aquele:** dois jogos do catálogo, com as capas do catálogo. A legenda pede o voto: "comenta A ou B".
- **Resultado do este ou aquele:** um dia depois, conta os comentários "A" e "B" do post anterior e mostra o resultado.
  - Só sai com pelo menos 3 votos.
  - Precisa da permissão de ler comentários no app da Meta. Sem ela, o formato é pulado sozinho.
- **Crítica × comunidade:** sai quando a nota da comunidade (3+ avaliações) e a da crítica diferem em 15 pontos ou mais. Pergunta "quem está certo?".
- **Superestimado ou subestimado?** e **Zerou ou largou?:** um jogo muito conhecido.
  - O "zerou ou largou" mostra quantos marcaram "zerei" e "abandonei" no site, só a contagem e sem nomes, quando há 3 ou mais.
- **Top 5 por gênero:** as maiores notas da crítica em um gênero (50+ notas na IGDB). O gênero não repete por 30 dias.
- **Opinião da comunidade:** até 3 avaliações públicas reais, de jogos diferentes.
  - **Sem nome nem foto do autor:** o slide diz "Avaliação pública de um jogador no Control Critic".
  - Textos com link, @, e-mail ou telefone são descartados.
- **Notícias em carrossel:** até 3 notícias das **últimas 48 h**, da mais recente para a mais antiga. Cada uma tem dois slides: a capa e "O que aconteceu", com o resumo real e a fonte.
  - Com uma notícia só, entra também um slide "No Control Critic" com as notas do jogo.
  - **Notícia com mais de 48 h nunca sai**, nem pelo botão de urgente.

**Imagens:** as artes usam só a capa dos jogos que o próprio site serve (catálogo/IGDB), tipografia, fundo liso e o Adelino. **A imagem que vem com a notícia (do site de origem) não é mais usada.**

**Legendas:** sempre na mesma ordem:
1. gancho na primeira linha;
2. contexto curto;
3. uma pergunta ou convite específico;
4. a chamada para o site, que varia entre algumas frases;
5. de 5 a 8 hashtags:
   - as da marca: `#controlcritic #jogos #gamesbrasil`;
   - plataforma: `#playstationbr`, `#xboxbrasil`, `#nintendobr`, `#pcgamerbr`;
   - `#indiegamebr` quando for o caso;
   - o nome do jogo;
   - uma do formato.

No máximo 5 emojis.

**Stories:** todo post do feed também sai como story (1080×1920), com a arte no centro. Se o story falhar, o post continua valendo.

**Reels:**
- no máximo **1 por dia**, no horário das 18h50, quando o post tem 3 ou mais artes;
- cada arte aparece com um zoom lento, com transição suave entre elas e uma música de `scripts/instagram/musicas/`;
- sem música na pasta, sai carrossel.

**Limite da API:**
- antes de publicar, o robô consulta a cota do Instagram (`content_publishing_limit`);
- se a cota acabou, ou se o Instagram recusar por limite, ele **registra e pula**, sem quebrar.

**Histórico e medição:** tudo fica na tabela `instagram_posts` (migração `supabase/migrations/20261020_08_instagram_posts.sql`).
- A aba **Admin → Instagram 📸** mostra os últimos 30 posts, onde a equipe anota os números do Insights.
- Detalhes em `docs/instagram-conteudo.md`.

## Testar sem publicar
- **Um horário:** em **Actions → Instagram → Run workflow**, escolha o modo e marque **"Só gerar as artes"**.
- **Todos os formatos de uma vez:** escolha o modo **`amostra`** e marque **"Só gerar as artes"**. Cada formato sai na sua pasta.
- **Um formato específico:** escolha em **"Forçar um formato"**.
- No fim, baixe **artes-instagram** em "Artifacts" e veja as artes, o story, a legenda e o Reels (quando houver música).

O Adelino muda de skin conforme o tema do post: veja `img/adelino/LEIA-ME.md`.

Tempo de configuração: uns 30 minutos, uma vez só.

---

## 1. Transformar o Instagram em conta profissional (grátis)
1. No app do Instagram, entre na conta **@control.critic**.
2. Abra **Configurações → Tipo de conta e ferramentas → Mudar para conta profissional**.
3. Escolha **Criador de conteúdo** ou **Empresa** (qualquer um serve). Não precisa ligar a uma página do Facebook.
4. Já que está ali, coloque o site no **link da bio**: `https://control-critic.netlify.app`.

## 2. Criar o aplicativo na Meta
1. Entre em https://developers.facebook.com com a sua conta do Facebook e cadastre-se como desenvolvedor, se pedir.
2. Clique em **Meus apps → Criar app**.
   - Caso de uso: **"Gerenciar mensagens e conteúdo no Instagram"**, que é a API do Instagram.
   - Tipo: **Empresa**. Nome: `Control Critic Robo`.
3. No painel do app, abra **Instagram → Configuração da API com login do Instagram**.

O app pode ficar em **modo de desenvolvimento**. Ele vai publicar só na conta de vocês, e para isso não precisa passar pela análise da Meta.

## 3. Gerar o token
1. Na seção **"Gerar tokens de acesso"**, clique em **Adicionar conta** e entre com o **@control.critic**.
2. Aceite as permissões, incluindo **publicar conteúdo**.
3. Clique em **Gerar token**, ao lado da conta, e **copie o token**. Ele vale 60 dias, mas o robô o **renova sozinho**.
4. Anote também o **ID da conta do Instagram**, o número que aparece ao lado do nome. Se não aparecer, abra no navegador o endereço abaixo, trocando `SEU_TOKEN`, e copie o `user_id`:
   `https://graph.instagram.com/me?fields=user_id,username&access_token=SEU_TOKEN`

O token dá acesso para publicar na conta: **não mande no chat nem coloque no código**.

## 4. Guardar no GitHub
No repositório, abra **Settings → Secrets and variables → Actions → New repository secret** e crie:
- `IG_USER_ID`: o ID da conta (passo 3).
- `IG_TOKEN`: o token (passo 3).

`SUPABASE_URL` e `SUPABASE_SERVICE_KEY` já existem, porque são os mesmos dos outros robôs.

## 5. Botão "Postar agora" (Netlify)
Para o botão disparar o robô na hora, o site precisa de um token do GitHub com permissão **só** para rodar os robôs:
1. No GitHub, abra **foto → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Preencha assim:
   - **Nome:** `control-critic-disparo`
   - **Validade:** 1 ano
   - **Resource owner:** `Control-Critic`
   - **Repository access:** *Only select repositories* → **Constrol**
   - **Permissions → Repository → Actions:** **Read and write**. Nenhuma outra permissão.
3. Gere e copie o token.
4. No **Netlify → Environment variables**, crie a variável `GITHUB_DISPARO_TOKEN` com esse token e faça um novo deploy.

Sem esse token o botão continua funcionando: a notícia fica marcada e sai na próxima execução do robô, ou quando você rodar o robô manualmente.

## 6. Atualizar o banco
Rode o `supabase/schema.sql` de novo no Supabase. Ele cria o controle de "já publicado", o cofre do token e a tabela `instagram_posts`. Também dá para rodar só a migração `supabase/migrations/20261020_08_instagram_posts.sql`.
Sem essa tabela o robô continua funcionando, mas sem o histórico, sem a rotação por horário e sem o painel.

## 7. Testar sem publicar
1. No GitHub, abra **Actions → Instagram → Run workflow**.
2. Marque **"Só gerar as artes"** e clique em **Run**.
3. No fim da execução, baixe **artes-instagram** em "Artifacts" e veja as imagens e a legenda.
4. Se estiver tudo certo, rode de novo **sem** marcar o teste. Esse é o primeiro post de verdade.

---

## Problemas comuns
| Mensagem | O que fazer |
|---|---|
| `Sem token do Instagram` | Falta o segredo `IG_TOKEN` no GitHub (passo 4). |
| `O token do Instagram expirou ou foi revogado` | Gere outro token (passo 3) e atualize o `IG_TOKEN`. Isso acontece se o robô ficar mais de 60 dias sem rodar ou se a senha do Instagram for trocada. |
| `Instagram (…/media): …permission…` | A conta não é profissional (passo 1) ou faltou aceitar a permissão de publicar (passo 3). |
| `Não consegui guardar a imagem` | Confira o `SUPABASE_SERVICE_KEY` nos segredos do GitHub. |
| Botão diz "o GitHub recusou o disparo" | O `GITHUB_DISPARO_TOKEN` está errado, vencido ou sem a permissão Actions: Read and write. |

## Limites e cuidados
- O Instagram tem um limite de posts por dia pela API (a cota aparece no log de cada execução). O robô faz 3 por dia, mais os urgentes. Se o limite for atingido, ele registra e pula.
- Links na legenda não são clicáveis no Instagram, por isso a legenda diz "link na bio".
- Para mudar o horário, edite o `cron` em `.github/workflows/instagram.yml`. Ele está em UTC: `20 12` = 09h20, `50 15` = 12h50 e `50 21` = 18h50 de Brasília. Se mudar um deles, troque também o mesmo texto na linha do `run`.
- Para mudar os formatos de cada horário, edite `HORARIOS` em `scripts/instagram/rotacao.mjs`.
- Só aprove memes originais ou de uso livre, sem ofensas e sem dados pessoais: quem posta no Instagram é a conta do Control Critic.
- Post publicado só pode ser apagado pelo próprio app do Instagram.
