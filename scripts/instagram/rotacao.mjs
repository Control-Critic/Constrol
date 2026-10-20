// Rotação de conteúdo por horário. Função pura: recebe o histórico (tabela instagram_posts) e devolve
// a ordem em que os formatos devem ser tentados. O primeiro formato que tiver conteúdo é publicado.

export const HORARIOS = {
  manha: ['precos', 'antes-de-comprar', 'promo'],                       // útil, para salvar
  meio: ['meme', 'versus', 'critica-comunidade', 'superestimado', 'zerou-largou', 'versus-resultado', 'top-genero'], // opinião e comentário
  noite: ['noticias', 'opiniao', 'top-genero'],                          // comunidade, notícia em carrossel (ou Reels)
};
// O modo do workflow continua o mesmo de antes
export const HORARIO_DO_MODO = { manha: 'manha', entretenimento: 'meio', diario: 'noite' };

const ok = (h) => !h.erro;

// historico: [{ tipo, horario, created_at, salvamentos }], mais recente primeiro ou em qualquer ordem
export function ordemDeFormatos(horario, historico = [], agora = Date.now()) {
  const lista = HORARIOS[horario] || HORARIOS.noite;
  const validos = historico.filter(ok).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const anterior = validos[0]?.tipo;
  // quando cada formato saiu pela última vez NESTE horário (nunca = -Infinity, vai primeiro)
  const ultimo = (t) => { const h = validos.find((x) => x.tipo === t && x.horario === horario); return h ? new Date(h.created_at).getTime() : -Infinity; };
  // desempenho: média de salvamentos dos últimos 30 dias (só com 3+ posts medidos)
  const medidos = validos.filter((h) => h.salvamentos != null && agora - new Date(h.created_at) < 30 * 864e5);
  const media = (l) => l.reduce((s, h) => s + h.salvamentos, 0) / (l.length || 1);
  const doHorario = medidos.filter((h) => lista.includes(h.tipo));
  const base = media(doHorario);
  const destaque = (t) => { const l = medidos.filter((h) => h.tipo === t); return l.length >= 3 && base > 0 && media(l) >= 1.5 * base; };

  const ordenados = lista.map((t, i) => ({ t, i })).sort((a, b) =>
    (destaque(b.t) - destaque(a.t)) || (ultimo(a.t) - ultimo(b.t)) || (a.i - b.i)).map((x) => x.t);
  // nunca repete o tipo do post anterior; ele só volta como último recurso de outro horário
  const principal = ordenados.filter((t) => t !== anterior);
  const reserva = Object.values(HORARIOS).flat().filter((t, i, l) => l.indexOf(t) === i && !lista.includes(t) && t !== anterior);
  return { ordem: [...principal, ...reserva], anterior };
}

// IDs de jogos e notícias usados nas últimas 48 h (para não repetir)
export function usadosRecentes(historico, agora = Date.now(), horas = 48) {
  const rec = historico.filter((h) => ok(h) && agora - new Date(h.created_at) < horas * 3600e3);
  return { jogos: new Set(rec.flatMap((h) => h.game_ids || [])), noticias: new Set(rec.flatMap((h) => h.news_ids || [])) };
}

// Reels: no máximo 1 por dia (dia de Brasília), só no horário da noite
export function podeReels(horario, historico, agora = Date.now()) {
  if (horario !== 'noite') return false;
  const dia = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return !historico.some((h) => ok(h) && h.formato === 'reels' && dia(h.created_at) === dia(agora));
}
