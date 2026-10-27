// Banco de memes ORIGINAIS do Control Critic (texto próprio + Adelino; nada copiado da internet).
// Cada meme tem duas partes (em cima / embaixo), uma skin do Adelino e, quando usa dados, de onde eles vêm:
//   promo   -> {jogo} {preco} {loja} {desconto}   (promoção real do dia)
//   popular -> {jogo} {nota}                      (jogo popular do catálogo, nota real da crítica/IGDB)
// Para acrescentar memes, é só seguir o formato. O robô não repete o mesmo meme por 90 dias.
export const MEMES = [
  { id: 'nao-compro-mais', topo: 'Eu: este mês não compro mais nenhum jogo', baixo: 'A {loja}: {jogo} por {preco}', skin: 'promocao', usa: 'promo' },
  { id: 'nunca-instalo', topo: 'Eu comprando {jogo} com {desconto}% de desconto', baixo: 'Eu sabendo que nunca vou instalar', skin: 'promocao', usa: 'promo' },
  { id: 'carrinho-2359', topo: 'Promoção acabando à meia-noite', baixo: 'Eu às 23:59 com {jogo} no carrinho', skin: 'urgente', usa: 'promo' },
  { id: 'biblioteca-300', topo: 'Minha biblioteca: 300 jogos', baixo: 'Eu: não tem nada pra jogar', skin: 'meme' },
  { id: 'so-mais-uma', topo: '"Só mais uma partida"', baixo: 'O sol nascendo lá fora:', skin: 'fps' },
  { id: 'tutorial-5min', topo: 'Ninguém:', baixo: 'Eu, depois de 5 minutos de tutorial: já sei tudo', skin: 'meme' },
  { id: 'call-rapidinho', topo: 'Amigo: "entra na call rapidinho"', baixo: 'Eu, 6 horas depois:', skin: 'enquete' },
  { id: 'zerei-modo-dificil', topo: 'Eu zerando {jogo}', baixo: 'O jogo: "agora tente no modo difícil"', skin: 'rpg', usa: 'popular' },
  { id: 'save-manual', topo: 'O jogo: "salvamento automático ativado"', baixo: 'Eu: salvo manual 47 vezes mesmo assim', skin: 'resumo' },
  { id: 'segunda-fase', topo: 'Quando o chefe tem segunda fase', baixo: 'Eu sem nenhuma poção:', skin: 'luta' },
  { id: 'download-150', topo: 'Download de 150 GB', baixo: 'Minha internet:', skin: 'urgente' },
  { id: 'capacete', topo: 'Eu criando o personagem por 2 horas', baixo: 'O jogo: capacete obrigatório o jogo inteiro', skin: 'rpg' },
  { id: 'critica-tutorial', topo: 'A crítica: {nota}/100 para {jogo}', baixo: 'Eu, que larguei no tutorial:', skin: 'enquete', usa: 'popular' },
  { id: 'npc-esperando', topo: 'NPC: "rápido, o mundo está acabando!"', baixo: 'Eu fazendo 80 missões secundárias', skin: 'rpg' },
  { id: 'curtinho', topo: '"Esse jogo é curtinho"', baixo: 'O jogo: 120 horas depois...', skin: 'meme' },
  { id: 'backlog', topo: 'Meu backlog gigante', baixo: 'Eu abrindo a loja de novo:', skin: 'promocao' },
  { id: 'pausar-online', topo: 'Mãe: "desliga esse jogo agora"', baixo: 'Eu: "não dá pra pausar, é online!"', skin: 'urgente' },
  { id: 'facil-historia', topo: 'Eu: vou jogar no fácil só pela história', baixo: 'Eu morrendo no fácil:', skin: 'luta' },
  { id: 'eu-carrego', topo: 'Amigo: "relaxa, eu te carrego"', baixo: 'O amigo, 2 minutos depois:', skin: 'fps' },
  { id: 'patch-2gb', topo: 'Atualização de 2 GB', baixo: 'O que mudou: "correções de bugs"', skin: 'resumo' },
  { id: 'pulei-cutscene', topo: 'Eu pulando a cena', baixo: 'Eu, 10 minutos depois, sem saber pra onde ir', skin: 'meme' },
  { id: 'melhor-de-todos', topo: 'Eu dizendo que {jogo} é o melhor jogo de todos', baixo: 'Meus amigos que nunca jogaram:', skin: 'enquete', usa: 'popular' },
  { id: 'escolha-cuidado', topo: 'O jogo: "escolha com cuidado"', baixo: 'Eu: aperto o primeiro botão', skin: 'meme' },
  { id: 'save-errado', topo: 'Carreguei o save errado', baixo: 'Adeus, 4 horas de progresso', skin: 'urgente' },
  { id: 'terror-luz', topo: 'Eu antes de jogar terror: "medo de quê?"', baixo: 'Eu depois: dormindo de luz acesa', skin: 'fps' },
  { id: 'lag-200', topo: 'Ping de 200 ms', baixo: 'Eu: "esse jogo tá roubando"', skin: 'luta' },
  { id: 'bau-monstro', topo: 'Quando acha um baú', baixo: 'Quando o baú é um monstro', skin: 'rpg' },
  { id: 'lobby-plano', topo: 'Eu no lobby: plano perfeito', baixo: 'Eu na partida: correndo sem rumo', skin: 'fps' },
  { id: 'dormir-cedo', topo: 'Eu: hoje vou dormir cedo', baixo: 'Notificação: "seus amigos estão jogando"', skin: 'enquete' },
  { id: 'nota-comunidade', topo: 'Ninguém:', baixo: 'Eu comparando a nota da crítica com a da comunidade', skin: 'resumo' },
  { id: 'mapa-icones', topo: 'Eu abrindo o mapa do mundo aberto', baixo: 'Os 400 pontos de interrogação:', skin: 'rpg' },
  { id: 'controle-pilha', topo: 'Controle com 1% de bateria', baixo: 'Eu no meio da luta final:', skin: 'urgente' },
  { id: 'reinstalar', topo: 'Eu desinstalando o jogo de raiva', baixo: 'Eu reinstalando no dia seguinte:', skin: 'luta' },
  { id: 'conquista-100', topo: 'Conquista: "termine o jogo 100%"', baixo: 'Eu, com 98% há 3 anos:', skin: 'resumo' },
  // ---------- Online e multiplayer ----------
  { id: 'mic-aberto', topo: 'Alguém com o microfone aberto na call', baixo: 'Todo mundo ouvindo o liquidificador da casa dele', skin: 'enquete' },
  { id: 'ultimo-vivo', topo: 'Quando você é o último vivo do time', baixo: 'Os 4 mortos assistindo e dando ordem:', skin: 'fps' },
  { id: 'culpa-lag', topo: 'Eu errando todos os tiros', baixo: 'Eu: "nossa, que lag hoje"', skin: 'fps' },
  { id: 'rank-perdi', topo: 'Eu: "só uma ranqueada antes de dormir"', baixo: 'Eu, 3 derrotas e 2 rebaixamentos depois:', skin: 'luta' },
  { id: 'servidor-caiu', topo: 'Finalmente vou ganhar a partida', baixo: 'O servidor: caiu', skin: 'urgente' },
  { id: 'amigo-noob', topo: 'Chamei meu amigo que nunca jogou', baixo: 'Ele de primeira: 20 abates', skin: 'fps' },
  { id: 'fila-40min', topo: 'Fila de 40 minutos', baixo: 'A partida: acaba em 3 minutos', skin: 'resumo' },
  { id: 'kick-afk', topo: 'Fui pegar água rapidinho', baixo: 'O jogo: "expulso por inatividade"', skin: 'urgente' },
  { id: 'gg-ez', topo: 'O time adversário: "gg ez"', baixo: 'Eu, que fui o pior do meu time:', skin: 'luta' },
  { id: 'dupla-perfeita', topo: 'Eu e meu duo no primeiro jogo: entrosados', baixo: 'Eu e meu duo no segundo: cada um pra um lado', skin: 'enquete' },
  { id: 'tem-vaga', topo: '"Tem vaga no time?"', baixo: 'O time: 5 pessoas e mais 3 esperando', skin: 'enquete' },
  { id: 'chat-toxico', topo: 'Eu no chat: "boa sorte, galera!"', baixo: 'O chat, 30 segundos depois:', skin: 'urgente' },
  { id: 'carregando-time', topo: 'Eu achando que estou carregando o time', baixo: 'O placar:', skin: 'resumo' },
  { id: 'spawn-kill', topo: 'Eu renascendo', baixo: 'Eu morrendo 1 segundo depois, no mesmo lugar', skin: 'fps' },
  { id: 'camper', topo: 'Eu reclamando de quem fica parado no canto', baixo: 'Eu, 5 minutos depois, parado no canto:', skin: 'fps' },
  { id: 'cross-amigo', topo: 'Eu no PC, ele no PS5, o outro no Xbox', baixo: 'Crossplay: "hoje não"', skin: 'resumo' },
  // ---------- Single player e progresso ----------
  { id: 'ultimo-checkpoint', topo: 'Morri logo antes do checkpoint', baixo: 'O checkpoint: lá no começo da fase', skin: 'luta' },
  { id: 'inventario-cheio', topo: 'Achei um item lendário', baixo: 'O inventário: cheio de pedra e graveto', skin: 'rpg' },
  { id: 'pocao-guardada', topo: 'Eu guardando a melhor poção para o momento certo', baixo: 'Eu zerando o jogo com 99 poções', skin: 'rpg' },
  { id: 'mapa-errado', topo: 'O objetivo: logo ali', baixo: 'Eu: 40 minutos explorando o lado oposto', skin: 'rpg' },
  { id: 'dialogo-pular', topo: 'O NPC explicando tudo', baixo: 'Eu apertando o botão de pular sem ler', skin: 'meme' },
  { id: 'chefe-1-vida', topo: 'O chefe com 1% de vida', baixo: 'Eu com 1% de vida', skin: 'luta' },
  { id: 'chefe-tentativa-50', topo: 'Tentativa 1 contra o chefe: "fácil"', baixo: 'Tentativa 50:', skin: 'luta' },
  { id: 'arvore-habilidade', topo: 'Árvore de habilidades com 200 opções', baixo: 'Eu: tudo em ataque', skin: 'rpg' },
  { id: 'side-quest', topo: 'A história principal esperando', baixo: 'Eu ajudando um fazendeiro a achar 10 galinhas', skin: 'rpg' },
  { id: 'nao-li-tutorial', topo: 'Eu sem ler o tutorial', baixo: 'Eu, 20 horas depois, descobrindo que dava pra correr', skin: 'meme' },
  { id: 'cair-penhasco', topo: 'Eu desviando de todos os inimigos com perfeição', baixo: 'Eu caindo do penhasco sozinho:', skin: 'urgente' },
  { id: 'loot-roxo', topo: 'Brilho roxo no chão', baixo: 'Eu atravessando o mapa inteiro para pegar', skin: 'rpg' },
  { id: 'jogo-calmo', topo: 'Jogo de fazendinha "relaxante"', baixo: 'Eu: planilha de colheita às 3 da manhã', skin: 'resumo' },
  { id: 'final-alternativo', topo: 'Descobri que tinha outro final', baixo: 'Eu começando tudo do zero de novo:', skin: 'rpg' },
  { id: 'segredo-parede', topo: 'Eu batendo em toda parede procurando segredo', baixo: 'O jogo: não tem segredo nenhum', skin: 'meme' },
  { id: 'escalada', topo: 'O jogo: "dá para escalar qualquer coisa"', baixo: 'Eu: escalando tudo em vez de seguir a história', skin: 'rpg' },
  { id: 'dificil-proposito', topo: 'Jogo difícil de propósito', baixo: 'Eu: comprei porque queria sofrer mesmo', skin: 'luta' },
  { id: 'morte-boba', topo: 'Morrer para o chefe final: aceitável', baixo: 'Morrer para um caranguejo no início: inaceitável', skin: 'luta' },
  // ---------- Compras, lojas e promoções ----------
  { id: 'lista-desejos', topo: 'Minha lista de desejos', baixo: 'Minha conta bancária:', skin: 'promocao' },
  { id: 'promo-ja-tenho', topo: 'Promoção de 90% no jogo que eu queria', baixo: 'Eu, que comprei pelo preço cheio ontem:', skin: 'promocao' },
  { id: 'pacote-dlc', topo: 'O jogo: R$ 100', baixo: 'As 14 DLCs: R$ 600', skin: 'promocao' },
  { id: 'reembolso-2h', topo: 'Eu testando o jogo para ver se pede reembolso', baixo: 'Eu com 1h59 de jogo:', skin: 'urgente' },
  { id: 'nao-preciso', topo: 'Eu: não preciso de mais um jogo', baixo: 'Também eu: {jogo} com {desconto}% de desconto?', skin: 'promocao', usa: 'promo' },
  { id: 'preco-cafe', topo: '{jogo} por {preco}', baixo: 'Mais barato que o lanche de domingo', skin: 'promocao', usa: 'promo' },
  { id: 'esposa-carrinho', topo: 'Alguém de casa: "comprou mais um jogo?"', baixo: 'Eu: "não, isso é da promoção, é economia"', skin: 'promocao' },
  { id: 'pre-venda', topo: 'Eu comprando na pré-venda', baixo: 'O jogo lançando quebrado:', skin: 'urgente' },
  { id: 'esperar-promo', topo: 'Eu: "vou esperar a promoção"', baixo: 'Eu, 3 anos depois, ainda esperando', skin: 'promocao' },
  { id: 'edicao-deluxe', topo: 'Edição normal ou deluxe?', baixo: 'Eu: deluxe, por causa de uma roupa', skin: 'promocao' },
  { id: 'jogo-gratis', topo: 'Jogo grátis na loja', baixo: 'Eu pegando, mesmo sabendo que não vou jogar:', skin: 'promocao' },
  { id: 'promo-relampago', topo: 'A {loja} lançando promoção de {desconto}% em {jogo}', baixo: 'Meu salário, que caiu ontem:', skin: 'promocao', usa: 'promo' },
  { id: 'microtransacao', topo: 'O jogo: "grátis para jogar"', baixo: 'A loja do jogo:', skin: 'promocao' },
  // ---------- Hardware, internet e vida real ----------
  { id: 'pc-ventoinha', topo: 'Abrindo um jogo novo', baixo: 'O PC decolando igual avião:', skin: 'urgente' },
  { id: 'grafico-ultra', topo: 'Eu colocando tudo no ultra', baixo: 'O jogo rodando a 9 quadros por segundo', skin: 'fps' },
  { id: 'cabo-controle', topo: 'O cabo do controle', baixo: 'A distância até o sofá:', skin: 'resumo' },
  { id: 'console-novo', topo: 'Eu comprando um console novo', baixo: 'Eu jogando os mesmos 3 jogos de sempre', skin: 'meme' },
  { id: 'espaco-disco', topo: 'O jogo novo: precisa de 200 GB', baixo: 'Eu desinstalando 6 jogos que "um dia volto a jogar"', skin: 'urgente' },
  { id: 'atualizacao-hora', topo: 'Finalmente tempo livre para jogar', baixo: 'O console: "atualização obrigatória"', skin: 'urgente' },
  { id: 'wifi-quarto', topo: 'Wi-Fi na sala: perfeito', baixo: 'Wi-Fi no meu quarto:', skin: 'urgente' },
  { id: 'segunda-feira', topo: 'Domingo, meia-noite', baixo: 'Eu: "só mais uma missão"', skin: 'resumo' },
  { id: 'adulto-tempo', topo: 'Eu criança: muito tempo, nenhum jogo', baixo: 'Eu adulto: muitos jogos, nenhum tempo', skin: 'resumo' },
  { id: 'trabalho-call', topo: 'Reunião do trabalho: câmera desligada', baixo: 'Eu: jogando no outro monitor', skin: 'meme' },
  { id: 'pausa-almoco', topo: 'Pausa de 1 hora para o almoço', baixo: 'Eu: 50 minutos de jogo e 10 de comida', skin: 'meme' },
  { id: 'janta-pronta', topo: '"A janta está pronta!"', baixo: 'Eu: "só um minuto, tô numa partida"', skin: 'urgente' },
  { id: 'bateria-celular', topo: 'Jogando no celular com 5% de bateria', baixo: 'Eu correndo atrás do carregador:', skin: 'urgente' },
  { id: 'fone-esquerdo', topo: 'O fone de ouvido', baixo: 'Só o lado esquerdo funcionando:', skin: 'resumo' },
  // ---------- Gêneros ----------
  { id: 'terror-pause', topo: 'Jogo de terror ficando tenso', baixo: 'Eu pausando para "beber água"', skin: 'fps' },
  { id: 'corrida-ultima', topo: 'Liderei a corrida inteira', baixo: 'A última curva:', skin: 'urgente' },
  { id: 'luta-botao', topo: 'O especialista em jogo de luta', baixo: 'Eu apertando todos os botões ao mesmo tempo e ganhando', skin: 'luta' },
  { id: 'futebol-juiz', topo: 'Eu perdendo no jogo de futebol', baixo: 'Eu: "esse juiz tá comprado"', skin: 'luta' },
  { id: 'estrategia-turno', topo: 'Jogo de estratégia: "só mais um turno"', baixo: 'O relógio: 4 da manhã', skin: 'resumo' },
  { id: 'battle-royale', topo: 'Eu caindo no lugar mais disputado do mapa', baixo: 'Eu, 10 segundos depois, assistindo os outros', skin: 'fps' },
  { id: 'construcao', topo: 'Jogo de construção: casa simples', baixo: 'Eu: um castelo de 3 andares para guardar baús', skin: 'rpg' },
  { id: 'soulslike', topo: 'Os amigos: "esse jogo é difícil"', baixo: 'Eu, que morri 300 vezes: "é justo, na verdade"', skin: 'luta' },
  { id: 'puzzle-solucao', topo: 'Eu travado no puzzle por 1 hora', baixo: 'A solução: era só girar a peça', skin: 'enquete' },
  { id: 'simulador', topo: 'Simulador de fazenda, caminhão, cabra...', baixo: 'Eu: jogando trabalho como diversão', skin: 'meme' },
  { id: 'indie-chorei', topo: 'Jogo indie de 5 horas', baixo: 'Eu chorando no final:', skin: 'meme' },
  // ---------- Jogos populares (dados reais do catálogo) ----------
  { id: 'jogo-dormir', topo: 'Eu: vou dormir cedo hoje', baixo: '{jogo}: "só mais uma missão"', skin: 'resumo', usa: 'popular' },
  { id: 'nota-concordo', topo: 'A crítica deu {nota}/100 para {jogo}', baixo: 'Eu, que joguei: "é pouco"', skin: 'enquete', usa: 'popular' },
  { id: 'amigo-recomenda', topo: 'Amigo: "joga {jogo}, você vai amar"', baixo: 'Eu, 200 horas depois:', skin: 'rpg', usa: 'popular' },
  { id: 'jogo-de-novo', topo: 'Eu: vou zerar {jogo} de novo', baixo: 'Meu backlog com 80 jogos novos:', skin: 'resumo', usa: 'popular' },
  { id: 'spoiler', topo: 'Eu ainda no começo de {jogo}', baixo: 'A internet inteira: spoiler do final', skin: 'urgente', usa: 'popular' },
  { id: 'nostalgia', topo: 'Eu lembrando da primeira vez que joguei {jogo}', baixo: 'Eu querendo apagar a memória pra jogar de novo', skin: 'meme', usa: 'popular' },
  { id: 'trilha-sonora', topo: 'A trilha sonora de {jogo}', baixo: 'Eu ouvindo no ônibus como se fosse filme', skin: 'meme', usa: 'popular' },
  { id: 'defender-jogo', topo: 'Alguém falando mal de {jogo}', baixo: 'Eu, pronto para um debate de 3 horas:', skin: 'luta', usa: 'popular' },
  // ---------- Control Critic e comunidade ----------
  { id: 'nota-5', topo: 'Eu dando nota 5 para o jogo que eu amo', baixo: 'Eu dando nota 2 para o mesmo jogo depois da DLC', skin: 'enquete' },
  { id: 'grupo-lfg', topo: 'Procurando grupo: "só gente tranquila"', baixo: 'O grupo, 10 minutos depois:', skin: 'enquete' },
  { id: 'biblioteca-site', topo: 'Eu organizando a biblioteca no Control Critic', baixo: 'Descobrindo que tenho 40 jogos "jogando"', skin: 'resumo' },
  { id: 'conquista-site', topo: 'Ganhei uma conquista no Control Critic', baixo: 'Eu mostrando o perfil para todo mundo:', skin: 'meme' },
  { id: 'avaliacao-longa', topo: 'Eu: "vou escrever uma avaliação rapidinho"', baixo: 'A avaliação: 3 parágrafos e um desabafo', skin: 'resumo' },
  { id: 'versus-amigo', topo: 'Enquete: "qual você prefere?"', baixo: 'Eu e meu amigo brigando nos comentários:', skin: 'luta' },
];

// Troca {jogo}, {preco}... pelos dados. Sem um dado necessário, devolve null (o meme não serve agora).
export function preencher(texto, dados) {
  let ok = true;
  const t = texto.replace(/\{(\w+)\}/g, (_, k) => { if (dados?.[k] == null || dados[k] === '') ok = false; return dados?.[k] ?? ''; });
  return ok ? t : null;
}

// Escolhe um meme que não saiu nos últimos 90 dias e que tem os dados de que precisa
export function escolherMeme({ usados = new Set(), dados = {}, rnd = Math.random } = {}) {
  const candidatos = MEMES.filter((m) => !usados.has(m.id) && (!m.usa || dados[m.usa]))
    .map((m) => ({ m, topo: preencher(m.topo, dados[m.usa]), baixo: preencher(m.baixo, dados[m.usa]) }))
    .filter((x) => x.topo && x.baixo);
  if (!candidatos.length) return null;
  // os que usam dados do dia (promoção, jogo) têm o dobro de chance: ficam mais atuais
  const peso = candidatos.flatMap((x) => (x.m.usa ? [x, x] : [x]));
  return peso[Math.floor(rnd() * peso.length)];
}
