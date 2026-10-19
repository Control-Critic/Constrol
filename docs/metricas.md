# Métricas de produto com privacidade (fase 17)

**Métrica principal:** **usuários semanais que fazem uma interação significativa**. Conta quem, nos últimos 7 dias:
- avaliou;
- postou ou comentou;
- criou ou entrou em grupo;
- mandou mensagem;
- postou story;
- mexeu na biblioteca.

## Como é coletado
- **Eventos agregados (`metric_daily`):** apenas o **total por dia e por tipo**. Os tipos são:
  - visita;
  - clique em criar conta;
  - abriu o cadastro;
  - enviou o cadastro;
  - concluiu as boas-vindas;
  - criou grupo;
  - entrou em call;
  - instalou o app.
- **Nada disso é registrado:**
  - usuário;
  - IP;
  - página com parâmetros;
  - conteúdo.
- "Visita" conta no máximo 1 vez por dia por navegador. A marca fica só no próprio navegador.
- Navegadores com **"Não rastrear" ou Global Privacy Control** não entram na contagem.
- **Ativação e retenção:** são calculadas na hora (`metricas_produto`, só para a equipe) a partir dos dados que o site já guarda (avaliações, biblioteca, comunidades, grupos, minutos de call e login diário). A função devolve **apenas números agregados**.
- Os contadores ficam 400 dias.
- Sem fingerprinting, sem cookies de rastreamento e sem ferramentas de terceiros.

## Painel
Admin → **Métricas 📊**, com períodos de 7, 28 ou 90 dias. Mostra:
- conversão do cadastro;
- ativação de quem chegou no período (boas-vindas, primeiro jogo, avaliação, comunidade, grupo e call);
- retenção D1, D7 e D30;
- uso por funcionalidade;
- erros por página.

## Limitações
- A retenção usa o **login diário**. Quem usa o site sem abrir a página que registra o login conta como não retornado.
- `contar_evento` aceita chamadas anônimas: dá para inflar contadores de propósito. Os números servem para tendência, não para auditoria.
