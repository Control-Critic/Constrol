// Legendas do Instagram em 4 partes: gancho (a única linha antes do "ver mais"), contexto curto,
// um convite específico (pergunta ou ação) e 5 a 8 hashtags. Funções puras: dá para testar sem rede.

// Chamadas para o site: variam a cada post e só prometem o que o site faz
const CHAMADAS_SITE = {
  jogo: ['A nota completa e as avaliações estão no site: link na bio.', 'Opiniões de quem jogou: link na bio.', 'Adicione à sua biblioteca no Control Critic: link na bio.'],
  promo: ['Todas as promoções do dia estão no site: link na bio.', 'Coloque na lista de desejos e receba aviso quando baixar: link na bio.', 'Mais ofertas, separadas por loja: link na bio.'],
  noticia: ['Notícias de games o dia todo no site: link na bio.', 'A notícia completa está no site: link na bio.', 'Comente a notícia com a comunidade no site: link na bio.'],
  comunidade: ['Avalie também e apareça aqui: link na bio.', 'Crie seu perfil e dê a sua nota: link na bio.', 'Monte sua biblioteca e ache gente pra jogar: link na bio.'],
  meme: ['Poste o seu meme no site e apareça aqui: link na bio.', 'Tem um meme melhor? Manda no site: link na bio.'],
};

export function escolherChamada(tipo, semente = Date.now()) {
  const l = CHAMADAS_SITE[tipo] || CHAMADAS_SITE.jogo;
  return l[Math.abs(Math.floor(semente / 864e5)) % l.length];   // muda por dia
}

// "Elden Ring: Nightreign" -> "#eldenringnightreign" (sem acento e sem símbolo; nomes longos demais ficam de fora)
export function tagDoJogo(titulo) {
  const t = String(titulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return t.length >= 3 && t.length <= 24 && /[a-z]/.test(t) ? `#${t}` : null;
}

const TAG_PLATAFORMA = [
  [/playstation|ps[345]/i, '#playstationbr'],
  [/xbox/i, '#xboxbrasil'],
  [/nintendo|switch/i, '#nintendobr'],
  [/pc|windows|steam|linux|mac/i, '#pcgamerbr'],
];
const TAG_LOJA = { playstation: '#playstationbr', xbox: '#xboxbrasil', nintendo: '#nintendobr', steam: '#pcgamerbr' };

// Mistura: marca + volume alto + nicho brasileiro + plataforma + nome do jogo + extra do formato. Sempre de 5 a 8.
export function hashtags({ jogos = [], plataformas = [], lojas = [], indie = false, extras = [] } = {}) {
  const tags = ['#controlcritic', '#jogos', '#gamesbrasil'];
  for (const p of plataformas) for (const [re, t] of TAG_PLATAFORMA) if (re.test(p)) tags.push(t);
  for (const l of lojas) if (TAG_LOJA[l]) tags.push(TAG_LOJA[l]);
  if (indie) tags.push('#indiegamebr');
  for (const j of jogos) { const t = tagDoJogo(j); if (t) tags.push(t); }
  tags.push(...extras);
  const unicas = [...new Set(tags)];
  // corta em 8 mantendo as 3 da marca; completa até 5 com tags de nicho seguras
  const final = unicas.slice(0, 8);
  for (const t of ['#videogame', '#gamerbrasil', '#jogosdigitais']) if (final.length < 5 && !final.includes(t)) final.push(t);
  return final;
}

const EMOJI = /\p{Extended_Pictographic}/gu;
export const contarEmojis = (s) => (String(s).match(EMOJI) || []).length;

// Monta a legenda final. gancho: 1 linha; contexto: até 3 linhas; convite: a pergunta; chamada: o site.
export function montarLegenda({ gancho, contexto = [], convite, chamada, tags }) {
  const linhas = [String(gancho).replace(/\s+/g, ' ').trim().slice(0, 125), ''];
  const ctx = contexto.filter(Boolean).slice(0, 3);
  if (ctx.length) linhas.push(...ctx, '');
  linhas.push(convite, chamada, '', tags.join(' '));
  return linhas.join('\n').trim();
}

export const brl = (centavos) => centavos == null ? '' : (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const NOME_LOJA = { steam: 'Steam', playstation: 'PlayStation Store', xbox: 'Xbox Store', nintendo: 'Nintendo eShop', outra: 'loja' };
