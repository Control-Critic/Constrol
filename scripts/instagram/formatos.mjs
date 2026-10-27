// Formatos de conteúdo do Instagram. Cada um consulta o banco, monta as artes e a legenda e devolve
//   { tipo, imagens: [{ jpeg, nome }], legenda, tags, game_ids, news_ids, refs, depois? }
// ou null quando não há conteúdo bom o suficiente (o robô tenta o próximo formato da rotação).
// Regra geral: só dados reais do site; nenhuma identificação pessoal; capas = as do catálogo do site.
import { arteNoticia, arteResumo, arteMeme, arteMemeAuto, arteVersus, arteCapaLista, artePreco, arteFatos, arteOpiniao, artePergunta, arteTexto, arteChamada, arteResultado } from './arte.mjs';
import { escolherVersus } from './versus.mjs';
import { escolherMeme } from './memes.mjs';
import { montarLegenda, hashtags, escolherChamada, brl, NOME_LOJA } from './legenda.mjs';

const dataCurta = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const corta = (t, n) => { const s = String(t || '').replace(/\s*The post .*? appeared first on .*$/i, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : s; };
const notaIgdb = (j) => j.igdb_rating && j.igdb_rating_count >= 5 ? `${Math.round(j.igdb_rating)}/100 na crítica (IGDB)` : null;
const notaSite = (j) => j.reviews_count > 0 ? `${Number(j.avg_rating).toFixed(1).replace('.', ',')}/5 no Control Critic (${j.reviews_count} ${j.reviews_count === 1 ? 'avaliação' : 'avaliações'})` : null;
const ehIndie = (j) => (j.categories?.slug === 'indie') || /indie/i.test(j.categories?.name || '');
const plataformas = (j) => (j.platforms || []).slice(0, 4).join(', ');
const diasAtras = (n) => new Date(Date.now() - n * 864e5).toISOString();
const SEM_PESSOAL = /(https?:\/\/|www\.|@\w|[\w.+-]+@[\w-]+\.\w|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|discord\.gg)/i;
const JOGO_COLS = 'id,title,slug,cover_url,release_year,platforms,avg_rating,reviews_count,igdb_rating,igdb_rating_count,category_ids,categories(name,slug)';

// Fecha o carrossel: capa(s) + slides + chamada final para o site (sempre o último)
async function comChamada(imagens, linhas) {
  const total = imagens.length + 1;
  return [...imagens, { jpeg: await arteChamada({ linhas, numero: total, total }), nome: 'chamada' }];
}

// ---------- Manhã: útil, para salvar ----------
const FAIXAS = [3000, 5000, 2000, 10000];
async function buscarPromos(ctx, { teto, minDesconto = 30, bons = true }) {
  const agora = new Date().toISOString();
  const deals = await ctx.api(`deals?select=game_id,store,price_cents,original_cents,discount_pct,ends_at,games!inner(${JOGO_COLS})&price_cents=gt.0${teto ? `&price_cents=lte.${teto}` : ''}&discount_pct=gte.${minDesconto}&original_cents=not.is.null&games.cover_url=not.is.null&updated_at=gte.${diasAtras(2)}&or=(ends_at.is.null,ends_at.gt.${agora})&order=discount_pct.desc&limit=80`);
  const vistos = new Set();
  return deals.filter((d) => {
    if (vistos.has(d.game_id) || ctx.evitarJogos.has(d.game_id) || !d.games) return false;
    if ((teto && d.price_cents > teto) || d.discount_pct < minDesconto || !(d.original_cents > d.price_cents)) return false;   // confere de novo: o título promete o preço
    if (bons && !((d.games.igdb_rating >= 70 && d.games.igdb_rating_count >= 20) || (d.games.avg_rating >= 3.5 && d.games.reviews_count >= 3))) return false;
    vistos.add(d.game_id); return true;
  });
}
const slidePreco = async (d, i, total) => ({ jpeg: await artePreco({ jogo: d.games.title, capaUrl: d.games.cover_url, original: brl(d.original_cents), preco: brl(d.price_cents),
  desconto: d.discount_pct, loja: NOME_LOJA[d.store] || d.store, fim: d.ends_at ? `Promoção até ${dataCurta(d.ends_at)}` : '', numero: i, total, tema: d.games.categories?.slug }), nome: `preco-${d.game_id}` });

// "Jogo bom por menos de R$ X": a faixa muda por dia; só entra jogo bem avaliado (crítica 70+ ou comunidade 3,5+)
export async function precos(ctx) {
  const dia = Math.floor(Date.now() / 864e5);
  for (let k = 0; k < FAIXAS.length; k++) {
    const teto = FAIXAS[(dia + k) % FAIXAS.length];
    const l = (await buscarPromos(ctx, { teto })).slice(0, 4);
    if (l.length < 2) continue;
    const valor = `R$ ${teto / 100}`;
    const total = l.length + 2;
    const imagens = [{ jpeg: await arteCapaLista({ etiqueta: 'SALVE ESTE POST', linha1: 'Jogo bom por', destaque: `menos de ${valor}`, subtitulo: 'Bem avaliados (crítica 70+ ou comunidade 3,5+) e em promoção hoje.', tema: 'promocao' }), nome: 'precos-capa' }];
    for (const [i, d] of l.entries()) imagens.push(await slidePreco(d, i + 2, total));
    const tags = hashtags({ jogos: l.slice(0, 2).map((d) => d.games.title), lojas: l.map((d) => d.store), extras: ['#promocaodejogos'] });
    return { tipo: 'precos', imagens: await comChamada(imagens, ['Todas as promoções do dia', 'separadas por loja', 'e alerta da lista de desejos']), tags, game_ids: l.map((d) => d.game_id),
      legenda: montarLegenda({ gancho: `Jogo bom por menos de ${valor} hoje. Salva pra não perder 💸`,
        contexto: [l.map((d) => `• ${d.games.title}: ${brl(d.price_cents)} (-${d.discount_pct}%) na ${NOME_LOJA[d.store] || d.store}`).join('\n'), 'Preços conferidos hoje. Promoção acaba sem aviso.'],
        convite: 'Vale a pena? Comenta aí qual você pegaria.', chamada: escolherChamada('promo'), tags }) };
  }
  return null;
}

// Promoção dos jogos em destaque no site (o formato antigo, agora com preço riscado e em carrossel quando há mais de um)
export async function promo(ctx) {
  const l = (await buscarPromos(ctx, { minDesconto: 20, bons: false })).filter((d) => d.games && (d.discount_pct >= 40 || d.games.igdb_rating_count >= 50)).slice(0, 3);
  if (!l.length) return null;
  const imagens = [];
  for (const [i, d] of l.entries()) imagens.push(await slidePreco(d, i + 1, l.length + (l.length > 1 ? 1 : 0)));
  const tags = hashtags({ jogos: l.slice(0, 2).map((d) => d.games.title), lojas: l.map((d) => d.store), extras: ['#promocaodejogos'] });
  const p = l[0];
  return { tipo: 'promo', imagens: l.length > 1 ? await comChamada(imagens, ['Mais promoções no site', 'com o histórico de cada jogo']) : imagens, tags, game_ids: l.map((d) => d.game_id),
    legenda: montarLegenda({ gancho: `${p.games.title} de ${brl(p.original_cents)} por ${brl(p.price_cents)} (-${p.discount_pct}%)`,
      contexto: [l.length > 1 ? l.slice(1).map((d) => `• ${d.games.title}: ${brl(d.price_cents)} (-${d.discount_pct}%)`).join('\n') : `Na ${NOME_LOJA[p.store] || p.store}${p.ends_at ? `, até ${dataCurta(p.ends_at)}` : ''}.`],
      convite: 'Já jogou? Diz nos comentários se vale o preço.', chamada: escolherChamada('promo'), tags }) };
}

// "Antes de você comprar": um jogo em promoção com os fatos que o site tem (notas, plataformas, preço, gênero)
export async function antesDeComprar(ctx) {
  const cand = (await buscarPromos(ctx, { minDesconto: 20, bons: false })).filter((d) => notaIgdb(d.games) || notaSite(d.games));
  const d = cand.sort((a, b) => (b.games.igdb_rating_count || 0) - (a.games.igdb_rating_count || 0))[0];
  if (!d) return null;
  const j = d.games;
  const [rev] = await ctx.api(`reviews?select=id,rating,body&game_id=eq.${j.id}&status=eq.published&body=not.is.null&order=helpful_count.desc,created_at.desc&limit=5`)
    .then((l) => l.filter((r) => r.body.length >= 60 && r.body.length <= 450 && !SEM_PESSOAL.test(r.body)));
  const fatos1 = [notaIgdb(j) && { rotulo: 'Crítica (IGDB)', valor: `${Math.round(j.igdb_rating)}/100, com ${j.igdb_rating_count.toLocaleString('pt-BR')} notas` }, { rotulo: 'Comunidade', valor: notaSite(j) || 'Ainda sem avaliações no Control Critic. Seja o primeiro.' },
    j.release_year && { rotulo: 'Lançamento', valor: String(j.release_year) }].filter(Boolean);
  const fatos2 = [{ rotulo: 'Preço hoje', valor: `${brl(d.price_cents)} (era ${brl(d.original_cents)}) na ${NOME_LOJA[d.store] || d.store}` },
    d.ends_at && { rotulo: 'Promoção até', valor: dataCurta(d.ends_at) }, plataformas(j) && { rotulo: 'Plataformas', valor: plataformas(j) },
    j.categories?.name && { rotulo: 'Gênero', valor: j.categories.name }].filter(Boolean);
  const total = 3 + (rev ? 1 : 0) + 1;
  const imagens = [
    { jpeg: await arteCapaLista({ etiqueta: 'SALVE ESTE POST', linha1: 'Antes de', destaque: 'você comprar', subtitulo: j.title, tema: j.categories?.slug }), nome: 'antes-capa' },
    { jpeg: await arteFatos({ etiqueta: 'AS NOTAS', jogo: j.title, capaUrl: j.cover_url, fatos: fatos1, numero: 2, total, tema: j.categories?.slug }), nome: `antes-notas-${j.id}` },
    { jpeg: await arteFatos({ etiqueta: 'O PREÇO', jogo: j.title, capaUrl: j.cover_url, fatos: fatos2, rodape: 'Preço conferido hoje no site', numero: 3, total, tema: j.categories?.slug }), nome: `antes-preco-${j.id}` },
  ];
  if (rev) imagens.push({ jpeg: await arteOpiniao({ jogo: j.title, capaUrl: j.cover_url, nota: rev.rating, texto: rev.body, numero: 4, total, tema: j.categories?.slug }), nome: `antes-opiniao-${rev.id}` });
  const tags = hashtags({ jogos: [j.title], plataformas: j.platforms || [], lojas: [d.store], indie: ehIndie(j), extras: ['#dicasdejogos'] });
  return { tipo: 'antes-de-comprar', imagens: await comChamada(imagens, ['Nota da comunidade,', 'avaliações e preço', 'de cada jogo']), tags, game_ids: [j.id], refs: rev ? [`review:${rev.id}`] : [],
    legenda: montarLegenda({ gancho: `Pensando em comprar ${j.title}? Veja isto antes 👇`,
      contexto: [[notaIgdb(j), notaSite(j)].filter(Boolean).join(' · '), `Hoje: ${brl(d.price_cents)} (-${d.discount_pct}%) na ${NOME_LOJA[d.store] || d.store}.`],
      convite: 'Já jogou? Conta nos comentários se vale o preço.', chamada: escolherChamada('jogo'), tags }) };
}

// ---------- Meio do dia: opinião e comentário ----------
export async function meme(ctx) {
  const ms = await ctx.api('posts?select=id,body,image_url,profiles!posts_user_id_fkey(username)&ig_ok=eq.true&ig_aprovado=eq.true&instagram_at=is.null&status=eq.published&image_url=not.is.null&order=created_at.asc&limit=3');
  if (!ms.length) return null;
  const imagens = [];
  for (const m of ms) imagens.push({ jpeg: await arteMeme({ imagem: m.image_url, autor: m.profiles?.username || 'membro' }), nome: `meme-${m.id}` });
  const autores = [...new Set(ms.map((m) => m.profiles?.username || 'membro'))];
  const texto = corta(ms[0].body && ms[0].body !== '📷' ? ms[0].body : '', 120);
  const tags = hashtags({ extras: ['#memesgamer', '#humorgamer'] });
  return { tipo: 'meme', imagens, tags, refs: ms.map((m) => `post:${m.id}`),
    legenda: montarLegenda({ gancho: `${texto || (ms.length > 1 ? 'Os memes da comunidade de hoje' : 'Meme do dia, feito pela comunidade')} 😂`,
      contexto: [`Feito por ${autores.join(', ')}, da comunidade Control Critic. ${autores.length > 1 ? 'Seus memes estão' : 'Seu meme está'} no nosso perfil!`],
      convite: 'Marca aquele amigo que é exatamente assim.', chamada: escolherChamada('meme'), tags }),
    depois: async (r) => { for (const m of ms) await ctx.api(`posts?id=eq.${m.id}`, { method: 'PATCH', body: { instagram_at: new Date().toISOString(), instagram_url: r.url } }); } };
}

// Meme automático: piada original do banco (memes.mjs) com o Adelino e, quando cabe, dados reais do dia
export async function memeAuto(ctx) {
  const usados = new Set([...ctx.refsUsadas].filter((r) => r.startsWith('memeauto:')).map((r) => r.slice(9)));   // 90 dias
  const [promo] = await buscarPromos(ctx, { minDesconto: 40, bons: true }).catch(() => []);
  const pops = (await jogosPopulares(ctx, 60).catch(() => [])).filter((j) => j.igdb_rating >= 75);
  const pop = pops[Math.floor(Math.random() * Math.min(pops.length, 30))];
  const dados = {
    promo: promo && { jogo: promo.games.title, preco: brl(promo.price_cents), loja: NOME_LOJA[promo.store] || promo.store, desconto: promo.discount_pct, capa: promo.games.cover_url, id: promo.game_id, plats: promo.games.platforms },
    popular: pop && { jogo: pop.title, nota: Math.round(pop.igdb_rating), capa: pop.cover_url, id: pop.id, plats: pop.platforms },
  };
  const e = escolherMeme({ usados, dados });
  if (!e) return null;
  const d = e.m.usa ? dados[e.m.usa] : null;
  const tags = hashtags({ jogos: d ? [d.jogo] : [], plataformas: d?.plats || [], extras: ['#memesgamer', '#humorgamer'] });
  return { tipo: 'meme-auto', game_ids: d ? [d.id] : [], refs: [`memeauto:${e.m.id}`], tags,
    imagens: [{ jpeg: await arteMemeAuto({ topo: e.topo, baixo: e.baixo, skin: e.m.skin, capaUrl: d?.capa, layout: Math.floor(Date.now() / 864e5) % 2 }), nome: `meme-auto-${e.m.id}` }],
    legenda: montarLegenda({ gancho: `${e.topo} 😂`, contexto: [e.m.usa === 'promo' ? `(E a promoção é real: ${d.jogo} por ${d.preco} na ${d.loja}.)` : null, 'Meme original do Control Critic.'],
      convite: 'Marca aquele amigo que é exatamente assim.', chamada: escolherChamada('meme'), tags }) };
}

async function jogosPopulares(ctx, limite = 200) {
  return (await ctx.api(`games?select=${JOGO_COLS},category_id&cover_url=not.is.null&category_id=not.is.null&order=igdb_rating_count.desc.nullslast&limit=${limite}`))
    .filter((j) => !ctx.evitarJogos.has(j.id));
}

export async function versus(ctx) {
  const cfg = (await ctx.api('settings?key=eq.instagram_versus&select=value'))[0]?.value || { pares: [] };
  const usados = new Set(cfg.pares || []);
  const jogosRecentes = Object.fromEntries(Object.entries(cfg.jogos || {}).filter(([, d]) => Date.now() - new Date(d) < 14 * 864e5));
  const [jogos, cats] = await Promise.all([jogosPopulares(ctx), ctx.api('categories?select=id,name,slug')]);
  const p = escolherVersus(jogos.filter((j) => !jogosRecentes[j.id]), cats, usados);
  if (!p) return null;
  const tags = hashtags({ jogos: [p.a.title, p.b.title], extras: ['#qualvoceprefere'] });
  return { tipo: 'versus', imagens: [{ jpeg: await arteVersus({ a: { titulo: p.a.title, capa: p.a.cover_url }, b: { titulo: p.b.title, capa: p.b.cover_url }, categoria: p.rotulo, tema: p.tema || p.a.categories?.slug }), nome: `versus-${p.chave}` }],
    tags, game_ids: [p.a.id, p.b.id], refs: [`versus:${p.chave}`],
    legenda: montarLegenda({ gancho: `${p.a.title} ou ${p.b.title}? Só pode escolher um 🤔`, contexto: [p.motivo, `A = ${p.a.title}`, `B = ${p.b.title}`],
      convite: 'Vota aí: comenta A ou B e defende sua escolha. Amanhã a gente mostra o resultado.', chamada: escolherChamada('jogo'), tags }),
    depois: async () => {
      await ctx.api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: 'instagram_versus', value: { pares: [...usados, p.chave].slice(-300), ultima: new Date().toISOString(),
        jogos: { ...jogosRecentes, [p.a.id]: new Date().toISOString(), [p.b.id]: new Date().toISOString() } } }] });
    } };
}

// Resultado do "este ou aquele" anterior: conta os comentários A/B (precisa da permissão de ler comentários; sem ela, pula)
export function contarVotos(textos) {
  let a = 0, b = 0;
  for (const t of textos) { const m = String(t).trim().match(/^(?:letra\s+)?([ab])(?![a-z])/i); if (m) (m[1].toLowerCase() === 'a' ? a++ : b++); }
  return { a, b };
}
export async function versusResultado(ctx) {
  if (!ctx.lerComentarios) return null;
  const v = ctx.historico.find((h) => !h.erro && h.tipo === 'versus' && h.ig_media_id && Date.now() - new Date(h.created_at) > 18 * 3600e3 && Date.now() - new Date(h.created_at) < 7 * 864e5);
  if (!v || ctx.historico.some((h) => !h.erro && (h.refs || []).includes(`resultado:${v.ig_media_id}`))) return null;
  const textos = await ctx.lerComentarios(v.ig_media_id).catch(() => null);
  if (!textos) return null;
  const { a, b } = contarVotos(textos);
  if (a + b < 3) return null;   // poucos votos: não vale um post
  const [ja, jb] = await Promise.all(v.game_ids.map((id) => ctx.api(`games?select=id,title,cover_url,platforms&id=eq.${id}`).then((l) => l[0])));
  if (!ja || !jb) return null;
  const venc = a >= b ? ja : jb;
  const tags = hashtags({ jogos: [ja.title, jb.title], extras: ['#qualvoceprefere'] });
  return { tipo: 'versus-resultado', imagens: [{ jpeg: await arteResultado({ a: { titulo: ja.title, capa: ja.cover_url }, b: { titulo: jb.title, capa: jb.cover_url }, va: a, vb: b }), nome: 'resultado' }],
    tags, game_ids: [], refs: [`resultado:${v.ig_media_id}`],
    legenda: montarLegenda({ gancho: a === b ? `Empate entre ${ja.title} e ${jb.title}! 😱` : `Vocês escolheram: ${venc.title} 🏆`,
      contexto: [`${ja.title}: ${a} ${a === 1 ? 'voto' : 'votos'} · ${jb.title}: ${b} ${b === 1 ? 'voto' : 'votos'}`, 'Contamos os comentários com A ou B do post anterior.'],
      convite: 'Faltou o seu voto? Comenta aqui quem ganhava pra você.', chamada: escolherChamada('jogo'), tags }) };
}

// Crítica × comunidade: só quando a diferença é real e a comunidade tem pelo menos 3 avaliações
export async function criticaComunidade(ctx) {
  const l = (await ctx.api(`games?select=${JOGO_COLS}&reviews_count=gte.3&igdb_rating_count=gte.20&cover_url=not.is.null&order=reviews_count.desc&limit=200`))
    .filter((j) => !ctx.evitarJogos.has(j.id) && !ctx.refsRecentes.has(`opiniao-jogo:${j.id}`) && Math.abs(j.avg_rating * 20 - j.igdb_rating) >= 15);
  const j = l[0];
  if (!j) return null;
  const site = Number(j.avg_rating).toFixed(1).replace('.', ',');
  const tags = hashtags({ jogos: [j.title], plataformas: j.platforms || [], indie: ehIndie(j), extras: ['#opiniao'] });
  return { tipo: 'critica-comunidade', game_ids: [j.id], refs: [`opiniao-jogo:${j.id}`], tags,
    imagens: [{ jpeg: await artePergunta({ etiqueta: 'CRÍTICA X COMUNIDADE', pergunta: 'Quem está certo?', jogo: j.title, capaUrl: j.cover_url,
      dados: [`Crítica (IGDB): ${Math.round(j.igdb_rating)}/100`, `Comunidade Control Critic: ${site}/5 (${j.reviews_count} avaliações)`], opcoes: ['CRÍTICA', 'COMUNIDADE'], tema: j.categories?.slug }), nome: `critica-${j.id}` }],
    legenda: montarLegenda({ gancho: `A crítica e a comunidade discordam sobre ${j.title} 👀`,
      contexto: [`Crítica (IGDB): ${Math.round(j.igdb_rating)}/100.`, `Comunidade Control Critic: ${site}/5 em ${j.reviews_count} avaliações.`],
      convite: 'Quem está certo? Comenta CRÍTICA ou COMUNIDADE.', chamada: escolherChamada('comunidade'), tags }) };
}

// Superestimado ou subestimado? Um jogo muito conhecido e bem avaliado pela crítica
export async function superestimado(ctx) {
  const l = (await jogosPopulares(ctx, 120)).filter((j) => j.igdb_rating >= 80 && j.igdb_rating_count >= 100 && !ctx.refsRecentes.has(`opiniao-jogo:${j.id}`));
  const j = l[Math.floor(Math.random() * Math.min(l.length, 40))];
  if (!j) return null;
  const tags = hashtags({ jogos: [j.title], plataformas: j.platforms || [], indie: ehIndie(j), extras: ['#opiniao'] });
  return { tipo: 'superestimado', game_ids: [j.id], refs: [`opiniao-jogo:${j.id}`], tags,
    imagens: [{ jpeg: await artePergunta({ etiqueta: 'OPINIÃO', pergunta: 'Superestimado ou subestimado?', jogo: j.title, capaUrl: j.cover_url,
      dados: [`Crítica (IGDB): ${Math.round(j.igdb_rating)}/100`, `${j.igdb_rating_count.toLocaleString('pt-BR')} notas na IGDB`], opcoes: ['SUPER', 'SUB'], tema: j.categories?.slug }), nome: `super-${j.id}` }],
    legenda: montarLegenda({ gancho: `${j.title}: superestimado ou subestimado? 🤔`, contexto: [`A crítica deu ${Math.round(j.igdb_rating)}/100 (IGDB).`, 'Sem meio-termo: escolhe um lado.'],
      convite: 'Comenta SUPER ou SUB e explica o porquê.', chamada: escolherChamada('jogo'), tags }) };
}

// Zerou ou largou? Com a contagem real do site quando houver dados suficientes (só números, sem nomes)
export async function zerouLargou(ctx) {
  const l = (await jogosPopulares(ctx, 150)).filter((j) => !ctx.refsRecentes.has(`opiniao-jogo:${j.id}`));
  const j = l[Math.floor(Math.random() * Math.min(l.length, 50))];
  if (!j) return null;
  const conta = (st) => ctx.contar(`user_games?select=game_id&game_id=eq.${j.id}&status=eq.${st}`);
  const [zer, aban] = await Promise.all([conta('zerado'), conta('abandonei')]).catch(() => [0, 0]);
  const dado = zer + aban >= 3 ? `No Control Critic: ${zer} zeraram e ${aban} largaram` : [j.release_year, plataformas(j)].filter(Boolean).join(' · ');
  const tags = hashtags({ jogos: [j.title], plataformas: j.platforms || [], indie: ehIndie(j), extras: ['#zerei'] });
  return { tipo: 'zerou-largou', game_ids: [j.id], refs: [`opiniao-jogo:${j.id}`], tags,
    imagens: [{ jpeg: await artePergunta({ etiqueta: 'CONFESSA', pergunta: 'Zerou ou largou?', jogo: j.title, capaUrl: j.cover_url, dados: [dado], opcoes: ['ZEREI', 'LARGUEI'], tema: j.categories?.slug }), nome: `zerou-${j.id}` }],
    legenda: montarLegenda({ gancho: `${j.title}: você zerou ou largou no meio? 🎮`, contexto: [zer + aban >= 3 ? `${dado}.` : 'Sem julgamento. (Talvez um pouco.)'],
      convite: 'Comenta ZEREI ou LARGUEI. Se largou, conta onde parou.', chamada: escolherChamada('comunidade'), tags }) };
}

// Top 5 da crítica por gênero (salvável): o gênero muda e não repete em 30 dias
export async function topGenero(ctx) {
  const cats = (await ctx.api('categories?select=id,name,slug&order=name')).filter((c) => !ctx.refsRecentes.has(`top:${c.slug}`));
  for (const c of cats.sort(() => Math.random() - 0.5)) {
    const l = (await ctx.api(`games?select=${JOGO_COLS}&category_ids=cs.{${c.id}}&igdb_rating_count=gte.50&cover_url=not.is.null&order=igdb_rating.desc.nullslast&limit=5`));
    if (l.length < 5) continue;
    const total = 7;
    const imagens = [{ jpeg: await arteCapaLista({ etiqueta: 'SALVE ESTE POST', linha1: 'Top 5', destaque: c.name, linha2: 'segundo a crítica', subtitulo: 'Maiores notas na IGDB (50+ avaliações).', tema: c.slug }), nome: `top-${c.slug}` }];
    for (const [i, j] of l.entries()) imagens.push({ jpeg: await arteFatos({ etiqueta: `#${i + 1}`, jogo: j.title, capaUrl: j.cover_url, numero: i + 2, total, tema: c.slug,
      fatos: [{ rotulo: 'Crítica (IGDB)', valor: `${Math.round(j.igdb_rating)}/100` }, notaSite(j) && { rotulo: 'Comunidade', valor: notaSite(j) }, j.release_year && { rotulo: 'Lançamento', valor: String(j.release_year) }, plataformas(j) && { rotulo: 'Plataformas', valor: plataformas(j) }].filter(Boolean) }), nome: `top-${j.id}` });
    const tags = hashtags({ jogos: [l[0].title], plataformas: l.flatMap((j) => j.platforms || []).slice(0, 6), indie: c.slug === 'indie', extras: ['#dicasdejogos'] });
    return { tipo: 'top-genero', imagens: await comChamada(imagens, [`Todos os jogos de ${c.name}`, 'com nota da crítica', 'e da comunidade']), tags, game_ids: l.map((j) => j.id), refs: [`top:${c.slug}`],
      legenda: montarLegenda({ gancho: `Top 5 de ${c.name} segundo a crítica. Salva pra jogar depois 📌`, contexto: [l.map((j, i) => `${i + 1}. ${j.title} (${Math.round(j.igdb_rating)}/100)`).join('\n'), 'Notas da IGDB, com 50+ avaliações cada.'],
        convite: 'Qual faltou nessa lista? Comenta aí.', chamada: escolherChamada('jogo'), tags }) };
  }
  return null;
}

// ---------- Noite: comunidade e notícias ----------
// Opinião da comunidade: avaliações públicas reais, sem nome nem foto (o texto é público no site)
export async function opiniao(ctx) {
  const rs = (await ctx.api(`reviews?select=id,rating,body,game_id,games!inner(${JOGO_COLS})&status=eq.published&body=not.is.null&games.cover_url=not.is.null&created_at=gte.${diasAtras(90)}&order=helpful_count.desc,created_at.desc&limit=60`))
    .filter((r) => r.body.length >= 60 && r.body.length <= 450 && !SEM_PESSOAL.test(r.body) && !ctx.evitarJogos.has(r.game_id) && !ctx.refsUsadas.has(`review:${r.id}`));
  const escolhidas = [];
  for (const r of rs) if (!escolhidas.some((x) => x.game_id === r.game_id) && escolhidas.length < 3) escolhidas.push(r);
  if (!escolhidas.length) return null;
  const total = escolhidas.length + 1;
  const imagens = [];
  for (const [i, r] of escolhidas.entries()) imagens.push({ jpeg: await arteOpiniao({ jogo: r.games.title, capaUrl: r.games.cover_url, nota: r.rating, texto: r.body, numero: i + 1, total, tema: r.games.categories?.slug }), nome: `opiniao-${r.id}` });
  const tags = hashtags({ jogos: escolhidas.slice(0, 2).map((r) => r.games.title), plataformas: escolhidas[0].games.platforms || [], extras: ['#reviewdejogos'] });
  const nomes = escolhidas.map((r) => r.games.title);
  return { tipo: 'opiniao', imagens: await comChamada(imagens, ['Dê a sua nota', 'e apareça aqui']), tags, game_ids: escolhidas.map((r) => r.game_id), refs: escolhidas.map((r) => `review:${r.id}`),
    legenda: montarLegenda({ gancho: `O que a comunidade está dizendo sobre ${nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]} 💬`,
      contexto: ['Avaliações públicas de jogadores no Control Critic.', escolhidas.map((r) => `• ${r.games.title}: ${r.rating}/5`).join('\n')],
      convite: 'Concorda com essas notas? Dá a sua nos comentários.', chamada: escolherChamada('comunidade'), tags }) };
}

// Notícia sem jogo ligado: acha no catálogo o jogo citado no título (o nome mais longo que aparece inteiro)
const normalizar = (t) => ` ${String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
export function acharJogo(titulo, jogos) {
  const alvo = normalizar(titulo);
  let melhor = null;
  for (const j of jogos) {
    const n = normalizar(j.title);
    if (n.trim().length < 4 || (n.trim().split(' ').length === 1 && n.trim().length < 6)) continue;   // nomes curtos demais confundem ("Ori", "Inside")
    if (alvo.includes(n) && (!melhor || n.length > normalizar(melhor.title).length)) melhor = j;
  }
  return melhor;
}
let catalogo = null;
const jogosConhecidos = async (ctx) => (catalogo ||= ctx.api(`games?select=${JOGO_COLS}&cover_url=not.is.null&order=igdb_rating_count.desc.nullslast&limit=3000`).catch(() => []));

// Notícias em carrossel: só das últimas 48 h, a mais recente primeiro. Fundo = capa do jogo do catálogo (nunca a imagem da imprensa)
export async function noticias(ctx, { ids = null, urgente = false } = {}) {
  const filtro = ids ? `id=in.(${ids.join(',')})` : `published=eq.true&instagram_at=is.null&created_at=gte.${diasAtras(2)}`;
  const ns = (await ctx.api(`news?select=id,title,summary,body,source,lang,created_at,game_id,games(${JOGO_COLS})&${filtro}&order=created_at.desc&limit=20`))
    .filter((n) => Date.now() - new Date(n.created_at) <= 48 * 3600e3 && !ctx.evitarNoticias.has(n.id)).slice(0, 3);
  if (!ns.length) return null;
  for (const n of ns) if (!n.games) { n.games = acharJogo(n.title, await jogosConhecidos(ctx)); if (n.games) n.game_id = n.games.id; }
  const imagens = [];
  if (ns.length > 1) imagens.push({ jpeg: await arteResumo({ data: dataCurta(Date.now()), titulos: ns.map((n) => n.title) }), nome: 'resumo' });
  for (const [i, n] of ns.entries()) {
    const capaJogo = n.games?.cover_url || null;
    imagens.push({ jpeg: await arteNoticia({ titulo: n.title, fonte: n.source || 'Control Critic', data: dataCurta(n.created_at), capa: capaJogo, urgente, numero: ns.length > 1 ? i + 1 : null, tema: n.games?.categories?.slug }), nome: `${urgente ? 'urgente' : 'noticia'}-${n.id}` });
    const resumo = corta(n.summary || n.body, 420);
    if (resumo) imagens.push({ jpeg: await arteTexto({ etiqueta: 'O QUE ACONTECEU', titulo: n.title, texto: resumo + (n.source ? ` (Fonte: ${n.source})` : ''), tema: n.games?.categories?.slug }), nome: `noticia-texto-${n.id}` });
    // Um jogo só: o que o site sabe sobre ele (dados reais)
    if (ns.length === 1 && n.games) {
      const j = n.games, fatos = [notaIgdb(j), notaSite(j), plataformas(j) && `Plataformas: ${plataformas(j)}`].filter(Boolean);
      if (fatos.length) imagens.push({ jpeg: await arteTexto({ etiqueta: 'NO CONTROL CRITIC', titulo: j.title, texto: fatos.join('. ') + '.', capaUrl: j.cover_url, tema: j.categories?.slug }), nome: `noticia-jogo-${j.id}` });
    }
  }
  const finais = await comChamada(imagens.slice(0, 9), ['Notícias de games', 'o dia todo, em português']);
  const tags = hashtags({ jogos: ns.map((n) => n.games?.title).filter(Boolean).slice(0, 2), plataformas: ns.flatMap((n) => n.games?.platforms || []).slice(0, 4), extras: ['#noticiasgames'] });
  const n0 = ns[0];
  return { tipo: urgente ? 'urgente' : 'noticias', imagens: finais, tags, news_ids: ns.map((n) => n.id), game_ids: ns.map((n) => n.game_id).filter(Boolean),
    legenda: montarLegenda({ gancho: `${urgente ? '🚨 ' : ''}${n0.title}`,
      contexto: ns.length > 1 ? [ns.slice(1).map((n) => `• ${n.title}`).join('\n'), 'Arrasta pro lado pra ler cada uma.'] : [corta(n0.summary || n0.body, 220), n0.source ? `Fonte: ${n0.source}` : null],
      convite: ns.length > 1 ? 'Qual dessas te pegou mais? Comenta o número.' : 'O que você achou? Comenta aí.', chamada: escolherChamada('noticia'), tags }),
    depois: async (r) => { for (const n of ns) await ctx.api(`news?id=eq.${n.id}`, { method: 'PATCH', body: { instagram_at: new Date().toISOString(), instagram_url: r.url, instagram_status: null } }); } };
}

export const FORMATOS = {
  precos, promo, 'antes-de-comprar': antesDeComprar, meme, 'meme-auto': memeAuto, versus, 'versus-resultado': versusResultado,
  'critica-comunidade': criticaComunidade, superestimado, 'zerou-largou': zerouLargou, 'top-genero': topGenero, opiniao, noticias,
};
