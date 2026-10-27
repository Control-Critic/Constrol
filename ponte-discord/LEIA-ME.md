# Ponte de voz: Discord ↔ call do site

Com a ponte ligada, **quem está no canal de voz do Discord (inclusive pelo PS5/Xbox) e quem está na call da comunidade no site se ouvem**.

**Um robô só atende todas as comunidades.** Você (equipe do site) instala uma vez no seu PC. Depois disso, qualquer dono de comunidade liga a ponte sozinho, pela aba **Discord / PS5** da comunidade:
1. Ele adiciona o robô ao servidor dele.
2. Cola o ID do canal de voz.
3. Um administrador do servidor confirma digitando `/vincular 123456` no Discord.

Ninguém além de você precisa de Docker, token ou chave.

## Como funciona

- Um robô do Control Critic entra no canal de voz do Discord.
- Na call do site, ele aparece como um participante chamado **🎮 Discord**.
- O áudio vai e volta entre as duas salas.
- A ponte **liga sozinha** quando tem gente nos dois lados e **desliga sozinha** 30 segundos depois que um lado esvazia.

**Limitações:**
- **Só voz.** O Discord não permite que robôs transmitam tela ou câmera, então o compartilhamento de tela continua só no site.
- No Discord, todo mundo do site aparece como **uma pessoa só** (o robô).
- No site, todo mundo do Discord aparece como **um quadro só** ("🎮 Discord").
- **Só funciona com o seu PC ligado** e o Docker Desktop aberto.

## Recursos sociais (o Control Critic dentro do Discord)

O mesmo robô também leva o site para dentro do servidor. Assim a galera usa o Control Critic sem sair do Discord, e tudo fica guardado no perfil de cada um no site.

| Comando | O que faz |
|---|---|
| `/conectar` | Liga a conta do Discord ao perfil do site. O robô manda um link que vale 15 minutos e só funciona para quem pediu. Basta fazer uma vez. |
| `/grupo` | Cria um "procurando grupo", que aparece no site e no canal. O botão **🙋 Tô dentro** registra quem quer jogar. |
| `/nota` | Avalia um jogo de 1 a 5, com texto opcional. Vira uma avaliação no perfil do site. |
| `/enquete` | "Este ou aquele?" com dois jogos parecidos e botões para votar. O resultado sai em 24 h. |
| `/ranking` | Ranking da semana do servidor: quem mais zerou, avaliou e criou grupo. Só entra quem ligou a conta. |
| `/avisos` | (Só quem pode **Gerenciar servidor**.) Escolhe o canal de avisos e o que vai nele: promoção do dia (10h), enquete do dia (19h), ranking (segunda, 12h) e "ao vivo". |
| `/site` | Mostra o que é o Control Critic e a lista de comandos. |

**🔊 Call do site:** quando alguém entra na call de uma comunidade no site, o robô avisa no canal de avisos com o botão **🔊 Entrar na call**.
- A mensagem é atualizada com quem está na call e vira "a call terminou" quando todos saem.
- Quando alguém **compartilha a tela na call do site**, sai uma mensagem nova (que notifica o servidor): "📺 fulano começou a transmitir a tela", com o botão **📺 Assistir na call**.
- Precisa do **ID do servidor do Discord** preenchido na comunidade (em **Configurar**) e da opção "ao vivo" ligada no `/avisos`.
- O robô só observa: ele não entra na call nem aparece para quem está nela.
- Depois que uma call termina, ele espera 10 minutos antes de avisar de novo, para não encher o canal.

**🔴 Ao vivo:** quando alguém liga a transmissão (**Go Live**) numa call do servidor, o robô faz o seguinte:
- Posta no canal de avisos uma mensagem com o botão **▶️ Assistir no Discord**. O link abre direto o canal de voz, e lá é só clicar na transmissão.
- No site, mostra a mesma faixa 🔴 no topo da comunidade e no início do site, para comunidades com o **ID do servidor** preenchido.
  - No site, o nome só aparece se a pessoa ligou a conta. Senão, aparece "Alguém".
- Quando a transmissão termina, o aviso some sozinho.

**O que não dá para fazer:**
- O Discord não deixa link direto para "assistir à transmissão". O link abre o canal de voz, e a transmissão fica a um clique.
- Para assistir, a pessoa precisa estar no servidor.

**Privacidade:**
- O ID do Discord de cada pessoa fica numa tabela que só ela vê no site (`discord_contas`).
- Para desligar a conta: **Editar perfil → Contas de jogo → Desligar**.
- A ligação entra na exportação de dados do perfil.

### Para ativar (quem já usa a ponte)
1. No Supabase, aplique `supabase/migrations/20261026_09_discord_social.sql` (pede a sua aprovação: é mudança no banco de produção).
2. Atualize os arquivos da ponte: baixe o ZIP de novo (Parte 2) ou rode `git pull` na pasta.
3. Recrie o robô com a versão nova. Na pasta `ponte-discord`, rode `docker compose up -d --build`.
4. No log deve aparecer `recursos sociais ligados`. Os comandos podem levar alguns minutos para aparecer no Discord.
5. **Permissões:** o robô agora também precisa **Enviar mensagens**, **Inserir links** e **Ver histórico de mensagens**.
   - Servidores que adicionaram o robô antes: use de novo o botão **➕ Adicionar o robô ao meu servidor**, na aba **Discord / PS5** da comunidade, que já pede as permissões novas.
   - Também dá para liberar essas permissões no canal de avisos.
6. No servidor, rode **/avisos** e escolha o canal.

**Nenhuma "intent privilegiada" é necessária.** O robô não lê as mensagens do chat, só os comandos, os botões e quem está em call.
Para desligar só os recursos sociais, coloque `SOCIAL=0` no `.env`.

Tempo total da primeira instalação: uns 30 a 40 minutos. Depois, ela liga sozinha.

---

## Parte 1: Instalar o Docker Desktop (uma vez só)

O Docker é o programa que roda a ponte (e o TURN caseiro, se você quiser) sem você precisar instalar Node, bibliotecas etc.

1. Confira se o Windows é 10 ou 11, 64 bits. Em **Configurações → Sistema → Sobre**, deve aparecer "Sistema operacional de 64 bits".
2. Baixe o **Docker Desktop for Windows** em https://www.docker.com/products/docker-desktop/ e instale. Deixe marcada a opção **"Use WSL 2 instead of Hyper-V"**.
3. Se o instalador pedir para atualizar ou instalar o **WSL**, aceite. Se ele não fizer sozinho:
   - abra o **PowerShell como administrador** (botão direito no menu Iniciar → "Terminal (Admin)");
   - rode `wsl --install`;
   - reinicie o PC.
4. Reinicie o PC quando pedir.
5. Abra o **Docker Desktop**. Pode pular o login ("Continue without signing in"). Espere aparecer **"Engine running"** com a bolinha verde, no canto inferior esquerdo.
6. Para a ponte voltar sozinha quando o PC ligar: no Docker Desktop, vá na engrenagem ⚙️ → **General** → marque **"Start Docker Desktop when you sign in to your computer"**.

> **Erro de "virtualização" ou "WSL 2 installation is incomplete"?** A virtualização precisa estar ligada na BIOS. Procure no Google "ativar virtualização BIOS" junto com a marca da sua placa-mãe ou notebook. Normalmente a opção se chama **Intel VT-x**, **Intel Virtualization Technology** ou **AMD SVM**.

---

## Parte 2: Baixar os arquivos da ponte

1. Abra https://github.com/Control-Critic/Constrol
2. Clique no botão verde **Code → Download ZIP**.
3. Extraia o ZIP numa pasta fácil, por exemplo `C:\ControlCritic`.
4. A pasta que você vai usar é `C:\ControlCritic\Constrol-main\ponte-discord`.

---

## Parte 3: Criar o robô no Discord (uma vez só)

1. Entre em https://discord.com/developers/applications e faça login.
2. **New Application** → nome `Control Critic` → aceite os termos → **Create**.
3. No menu da esquerda, abra **Bot**:
   - Se quiser, troque a foto do robô pela do Adelino.
   - Em **Token**, clique em **Reset Token** e copie o código que aparecer. **Esse token é a senha do robô:** não mande para ninguém, não cole no chat nem no GitHub. Se vazar, volte aqui e clique em Reset Token de novo.
   - Deixe **Public Bot ligado**, para os donos de comunidade conseguirem adicionar o robô ao servidor deles. A confirmação com `/vincular` garante que só um administrador do servidor ativa a ponte.
   - As opções de "Privileged Gateway Intents" **não** precisam ser ligadas.
4. Convide o robô para o seu servidor:
   1. No menu da esquerda, abra **OAuth2 → URL Generator**.
   2. Em **Scopes**, marque **bot**.
   3. Em **Bot Permissions**, marque **View Channels**, **Connect**, **Speak** e **Use Voice Activity**. Marque também o escopo **applications.commands**, que é o que faz o `/vincular` aparecer.
   4. Copie a URL gerada lá embaixo, abra no navegador, escolha o servidor da comunidade e clique em **Autorizar**.
5. Se o canal de voz for restrito, dê ao cargo do robô permissão de **Ver canal**, **Conectar** e **Falar** nesse canal.
6. Em **General Information**, copie o **Application ID** (é público, não é o token). No site, cole em **Admin → Site → 🔗 Robô da ponte de voz** e salve. A partir daí os donos de comunidade passam a ver o botão "Adicionar o robô ao meu servidor".

---

## Parte 4: Preencher o arquivo de configuração

1. Na pasta `ponte-discord`, copie o arquivo `.env.exemplo` e renomeie a cópia para **`.env`** (só isso, sem "exemplo" e sem ".txt").
   - Se o Windows esconder as extensões, ligue no Explorador de Arquivos: **Exibir → Mostrar → Extensões de nomes de arquivos**.
2. Abra o `.env` com o Bloco de Notas e preencha:
   - `DISCORD_TOKEN=` o token do robô (Parte 3).
   - `PONTES=` deixe **vazio**. As pontes vêm do site (Parte 6).
   - `SUPABASE_CHAVE_PUBLICA=` a **Publishable key**. Ela está no Supabase em Project Settings → API Keys, e é a mesma que está no `js/config.js` do site.
   - `SUPABASE_SERVICE_KEY=` a **Secret key** do Supabase (obrigatória). Com ela a ponte lê a lista de pontes e a chave secreta de cada sala de call. Ela fica só no seu PC.
3. Salve. No Bloco de Notas, em "Tipo", escolha **Todos os arquivos**, para ele não salvar como `.env.txt`.

---

## Parte 5: Ligar a ponte

1. Abra o Docker Desktop e espere ficar verde.
2. Na pasta `ponte-discord`, dê dois cliques em **`ligar.bat`**. Na primeira vez ele baixa e monta tudo, o que leva de 2 a 5 minutos.
3. Dê dois cliques em **`ver-registro.bat`**. Deve aparecer algo assim:
   ```
   discord: conectado como Control Critic#1234 (em 1 servidor(es))
   discord: comando /vincular registrado
   TURN do site obtido.
   ponte "Nome da Comunidade" pronta: call do site <-> #nome-do-canal (Nome do servidor)
   ```
4. **Teste com outra pessoa** (depois de ligar a ponte numa comunidade, na Parte 6):
   1. Alguém entra no canal de voz do Discord.
   2. Você entra na call da comunidade no site.
   3. Em até 15 segundos, o robô entra no Discord e aparece **🎮 Discord** na call do site. No chat da call chega o aviso "Ponte ligada".
   4. Falem dos dois lados.

**Para desligar:** dê dois cliques em `desligar.bat`.

**Para atualizar** (quando houver versão nova): baixe o ZIP de novo, copie o seu `.env` para a pasta nova e rode `ligar.bat`.

---

## Parte 6: Ligar a ponte numa comunidade (pelo site)

Isto é o que **qualquer dono de comunidade** faz, inclusive você nas suas:
1. Na comunidade, clique em **Configurar** e preencha o **ID do servidor do Discord**. Com o modo desenvolvedor ligado, clique com o botão direito no ícone do servidor → **Copiar ID do servidor**.
2. Abra a aba **Discord / PS5**. O quadro **🔗 Ponte de voz** aparece só para o dono.
3. Clique em **Adicionar o robô ao meu servidor**.
4. Ligue o modo desenvolvedor no Discord (**Configurações → Avançado → Modo desenvolvedor**). Clique com o botão direito no canal de voz → **Copiar ID do canal**, cole no site e clique em **Salvar canal**.
5. O site mostra um código de 6 números. No servidor do Discord, alguém com a permissão **Gerenciar servidor** digita `/vincular` e o código.
6. Pronto. Em até 30 segundos a ponte fica disponível. Na comunidade dá para desligar ou remover a ponte quando quiser.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| `ligar.bat` diz que não encontrou o docker | Abra o Docker Desktop e espere ficar verde. Se acabou de instalar, reinicie o PC. |
| `Faltam variáveis no .env` | O arquivo não se chama exatamente `.env` (talvez `.env.txt`), ou falta preencher algum campo. |
| `An invalid token was provided` | O token está errado ou foi trocado. Gere outro em Bot → Reset Token. |
| `Canal de voz ... não encontrado` | O robô não foi convidado para o servidor (Parte 3, item 4), o ID não é de um canal de **voz**, ou o robô não tem permissão de ver o canal. |
| `Comunidade X não encontrada` | Confira o número da comunidade no endereço do site. |
| `Faltam variáveis no .env: SUPABASE_SERVICE_KEY` | Preencha a Secret key no `.env` (só no seu PC; nunca no GitHub). |
| `/vincular` não aparece no Discord | O robô foi adicionado sem o escopo `applications.commands`. Adicione de novo pelo botão do site, que já inclui esse escopo. Pode levar alguns minutos para aparecer. |
| `Código não encontrado para este servidor` | O código foi digitado em outro servidor, ou o ID do servidor em "Configurar" está errado. Trocar o canal gera um código novo. |
| `Nenhuma ponte ainda` | Normal antes de algum dono confirmar com `/vincular`. |
| O robô entra no Discord, mas no site ninguém ouve | Provavelmente é a rede. Veja se o registro mostra `TURN do site obtido`. Se mostrar `Sem TURN`, configure a Cloudflare ou o TURN caseiro no Netlify (README do site). |
| A voz do site picota no Discord | Feche programas pesados ou downloads. A ponte mistura o áudio em tempo real e precisa de um pouco de CPU. |
| Ouço minha própria voz de volta | Alguém está **nas duas calls ao mesmo tempo** (no Discord e no site). Cada pessoa deve ficar em uma só. |

Depois de corrigir o `.env`, rode `ligar.bat` de novo.

---

## (Opcional) TURN caseiro no mesmo Docker

Se quiser usar o seu PC também como servidor TURN (para as calls do site funcionarem em redes difíceis), siga a pasta `turn-caseiro`. Com o Docker Desktop já instalado, falta só:
- verificar o CGNAT;
- preencher o `turnserver.conf`;
- liberar as portas no roteador;
- rodar `docker compose up -d` naquela pasta.

O passo a passo está em `turn-caseiro/LEIA-ME.md`.

## Segurança

- O `.env` fica só no seu PC. Ele já está no `.gitignore` e nunca deve ir para o GitHub.
- O robô só ouve e fala no canal configurado. Ele não lê mensagens de texto, nem grava ou guarda áudio.
- Quem estiver no canal com a ponte ligada está sendo transmitido para a call do site, e vice-versa. Vale avisar a galera do servidor, por exemplo na descrição do canal: "🔗 Este canal está ligado à call do Control Critic".
