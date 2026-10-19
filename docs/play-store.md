# Publicar o Control Critic na Play Store (Android)

O app da loja é uma **TWA** (Trusted Web Activity): ele abre o site em tela cheia, sem a barra do navegador.
Cada deploy no Netlify atualiza o app sozinho. Só é preciso enviar uma versão nova à loja ao mudar o ícone, o nome ou as permissões.

## Antes de começar (checklist)
- [ ] PR de bloqueio e moderação mesclado e migração aplicada. É uma exigência para apps com conteúdo de usuários.
- [ ] Diretrizes, Termos e Privacidade revisados por um advogado (fase 16).
- [ ] Recomendado: **domínio próprio**, por exemplo `controlcritic.com.br`. Trocar de domínio depois exige publicar uma versão nova do app.
- [ ] Conta de desenvolvedor Google Play: taxa única de cerca de US$ 25, com verificação de identidade.

## Passo a passo
1. Acesse **https://www.pwabuilder.com**, cole o endereço do site e clique em **Start**. Ele lê o `manifest.webmanifest`, que já tem ícones normais e *maskable*, capturas de tela e atalhos.
2. Em **Package for stores → Android**, gere o pacote:
   - Package ID: `br.com.controlcritic.app`, ou o que você escolher. **Não muda depois.**
   - Signing key: escolha **"Create new"**.
3. **Guarde com cuidado** o arquivo de assinatura (`.keystore`) e as senhas que o PWABuilder mostrar. Sem eles, não dá para atualizar o app. **Nunca** coloque esses arquivos no GitHub nem cole as senhas no chat.
4. O PWABuilder entrega um `assetlinks.json`. Salve-o no repositório em `.well-known/assetlinks.json` e faça o deploy. É ele que tira a barra do navegador do app.
   - O arquivo só tem a impressão digital **pública** do certificado, sem nada secreto.
   - Se você usar a "Assinatura de apps do Google Play", troque a impressão digital pela que aparece em Play Console → Configuração → Integridade do app.
5. No **Play Console**:
   1. Crie o app.
   2. Envie o `.aab` em "Teste interno" e teste no seu celular.
   3. Preencha:
      - **Segurança dos dados:** e-mail, nome de usuário, fotos e vídeos enviados, mensagens, interações no app e diagnóstico de falhas. Nada é vendido, os dados vão criptografados e há como pedir exclusão (perfil → excluir conta);
      - **Classificação de conteúdo:** conteúdo gerado por usuários, interação entre usuários, chat;
      - **Público-alvo:** 13 anos ou mais;
      - política de privacidade: `https://control-critic.netlify.app/privacidade.html`.
   4. Mande para revisão.

## O que já está pronto no site
- Manifesto com `id`, ícones `any` e `maskable` separados, capturas de celular e PC e atalho **Encontrar grupo**.
- Página `offline.html` e service worker com estratégias por tipo de arquivo. A versão do cache muda sozinha a cada deploy.
- Denunciar, bloquear, diretrizes, moderação e apelação.
- Notificações push, que continuam funcionando dentro da TWA.

## iPhone
A App Store costuma recusar apps que só embrulham um site e cobra cerca de US$ 99 por ano. Por enquanto, no iPhone, use Safari → Compartilhar → **Adicionar à Tela de Início**.
