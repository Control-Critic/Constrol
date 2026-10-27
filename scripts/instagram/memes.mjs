// Banco de memes ORIGINAIS do Control Critic (texto próprio + Adelino; nada copiado da internet).
// Cada meme tem duas partes (em cima / embaixo), uma skin do Adelino e, quando usa dados, de onde eles vêm:
//   promo   -> {jogo} {preco} {loja} {desconto}   (promoção real do dia)
//   popular -> {jogo} {nota}                      (jogo popular do catálogo, nota real da crítica/IGDB)
// Para acrescentar memes, é só seguir o formato. O robô não repete o mesmo meme por 30 dias (o histórico do robô).
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
];

// Troca {jogo}, {preco}... pelos dados. Sem um dado necessário, devolve null (o meme não serve agora).
export function preencher(texto, dados) {
  let ok = true;
  const t = texto.replace(/\{(\w+)\}/g, (_, k) => { if (dados?.[k] == null || dados[k] === '') ok = false; return dados?.[k] ?? ''; });
  return ok ? t : null;
}

// Escolhe um meme que não saiu nos últimos 30 dias e que tem os dados de que precisa
export function escolherMeme({ usados = new Set(), dados = {}, rnd = Math.random } = {}) {
  const candidatos = MEMES.filter((m) => !usados.has(m.id) && (!m.usa || dados[m.usa]))
    .map((m) => ({ m, topo: preencher(m.topo, dados[m.usa]), baixo: preencher(m.baixo, dados[m.usa]) }))
    .filter((x) => x.topo && x.baixo);
  if (!candidatos.length) return null;
  // os que usam dados do dia (promoção, jogo) têm o dobro de chance: ficam mais atuais
  const peso = candidatos.flatMap((x) => (x.m.usa ? [x, x] : [x]));
  return peso[Math.floor(rnd() * peso.length)];
}
