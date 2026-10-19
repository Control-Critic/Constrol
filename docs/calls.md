# Calls (fase 14)

## O que mudou
- **Tela antes de entrar:**
  - confere o navegador e a permissão do microfone, com instrução quando está bloqueado;
  - deixa escolher o microfone, com medidor de volume ao vivo;
  - deixa escolher a saída de som, com o botão "Testar som";
  - avisa se o aparelho não compartilha tela.
  - Pode ser desligada em "Não mostrar de novo".
- **Indicador de qualidade:** bolinha 🟢 🟡 🔴 em cada pessoa, com tempo de resposta, perda de pacotes e se a conexão passa pelo servidor de retransmissão.
- **Reconexão limitada:** depois de 3 tentativas sem sucesso, aparece uma mensagem com o que fazer, em vez de tentar para sempre.
- **Troca de aparelho:** se o fone ou o microfone for desconectado, a call passa para o microfone padrão sem cair.
- **Diagnóstico copiável** (📋), **sem dados sensíveis**:
  - inclui navegador, se há TURN, o estado e a qualidade de cada conexão e as tentativas;
  - **não inclui** SDP, candidatos ICE, IPs nem nomes de aparelhos.
- **Saída limpa:** fechar a aba ou a janela encerra a call e avisa os outros.

## Segurança: o que já existia (verificado)
- **Salas de comunidade:**
  - usam a chave secreta da comunidade (`community_secrets.room_key`), que só membros conseguem ler (RLS);
  - comunidade privada: só membros veem a chave.
- **Salas privadas entre amigos:** usam `friendships.room_key`, visível só para os dois.
- **Credenciais TURN:**
  - curtas (2 h) e só para quem está logado (fase 2);
  - o rate limit é por usuário.
- **Payloads de sinalização:** são limitados pelo próprio Realtime. Os candidatos ICE vão em lote e **não são registrados** em lugar nenhum.

## Pendente (exige configuração externa, com aprovação)
- **Realtime privado:** ligar "Private channels only" no Supabase (Realtime → Settings) e criar políticas em `realtime.messages`. Só assim um banido ou removido também perde o acesso imediato à sinalização. Hoje, quem já sabia a chave da sala continua sabendo até ela ser trocada.
- **Desligamento de emergência:** remover `TURN_URL` e `TURN_SECRET` no Netlify desliga o retransmissor na hora. Desligar a ponte do Discord é parar o Docker.
- **Testes reais:** os testes em vários navegadores, celulares, redes (4G, CGNAT), 2 a 6 pessoas e com o Discord precisam ser feitos manualmente. Este ambiente não tem duas pessoas reais.

## Limite
A call é em **malha**: cada pessoa envia para todas as outras. O limite prático é de cerca de 6 pessoas. Crescer além disso exige um servidor de mídia (**SFU**), como LiveKit ou mediasoup. Não aumente o limite sem isso.
