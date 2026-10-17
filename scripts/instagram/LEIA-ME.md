# Robô do Instagram do Control Critic

O que ele faz (2 posts por dia):
- **Todo dia às 12h50** (entretenimento): publica o **meme da comunidade** aprovado mais antigo, com crédito ao autor. Quando alguém posta uma imagem no site, pode marcar **"😂 É meme"**, e a equipe aprova ou recusa em **Admin → Memes 😂**. Sem meme aprovado, o robô publica uma enquete **"Qual você prefere?"** com dois jogos populares da mesma categoria, sem repetir a dupla.
- **Todo dia às 18h50** publica o **"Resumo do dia"**: um carrossel com uma capa e até 5 notícias. Se houver só 1 notícia, publica ela sozinha.
- **Dia sem notícia:** publica a **promoção do dia** (o maior desconto, sem repetir jogo na mesma semana), para a página não ficar parada.
- **Notícia urgente:** no painel, em **Admin → Notícias**, clique em **📸 Postar agora**. O post sai em 1 a 2 minutos, com a etiqueta vermelha "URGENTE".

O Adelino muda de skin conforme o tema do post (terror, RPG, meme, promoção...): veja `img/adelino/LEIA-ME.md`.

As artes seguem a identidade do site: fundo escuro, amarelo, títulos em Anton, logo e o Adelino. As legendas levam emojis, fonte, "link na bio" e hashtags.

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
Rode o `supabase/schema.sql` de novo no Supabase. Ele cria o controle de "já publicado" e o cofre do token.

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
- O Instagram permite até 50 posts por dia pela API. O robô faz 2 por dia, mais os urgentes.
- Links na legenda não são clicáveis no Instagram, por isso a legenda diz "link na bio".
- Para mudar o horário, edite o `cron` em `.github/workflows/instagram.yml` (está em UTC: `50 15` = 12h50 e `50 21` = 18h50 de Brasília). Se mudar o das 12h50, troque também o `50 15 * * *` na linha do `run`.
- Só aprove memes originais ou de uso livre, sem ofensas e sem dados pessoais: quem posta no Instagram é a conta do Control Critic.
- Post publicado só pode ser apagado pelo próprio app do Instagram.
