// Publica no Instagram do Control Critic pela API oficial (Instagram API com login do Instagram).
//   node scripts/instagram/publicar.mjs manha           -> promoção do dia; sem promoção nova, enquete "Qual você prefere?"
//   node scripts/instagram/publicar.mjs diario          -> resumo do dia (carrossel) ou uma notícia; sem notícia, a promoção do dia
//   node scripts/instagram/publicar.mjs entretenimento   -> meme da comunidade aprovado pela equipe; sem meme, enquete "Qual você prefere?"
//   node scripts/instagram/publicar.mjs urgente [id]    -> notícias marcadas como urgentes no painel (ou a de id informado)
//   TESTE=1 ...                                        -> só gera as artes e a legenda (pasta saida-instagram/), sem publicar
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, IG_USER_ID, IG_TOKEN (o token é renovado sozinho e guardado no banco)
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { supabaseRest } from '../../lib/igdb.mjs';
import { escolherVersus } from './versus.mjs';
import { arteNoticia, arteResumo, artePromo, arteMeme, arteVersus, arteStory } from './arte.mjs';

const gh = !!process.env.GITHUB_ACTIONS;
const env = (k) => (process.env[k] || '').trim();
const log = (m) => console.log(m);
const aviso = (m) => console.log(gh ? `::notice::${m}` : m);
const falhar = (m) => { console.error(gh ? `::error::${m}` : m); process.exit(1); };
process.on('unhandledRejection', (e) => falhar(`Falha: ${e?.message || e}`));

const TESTE = env('TESTE') === '1';
const MODO = process.argv[2] || 'diario';
const ID_NOTICIA = Number(process.argv[3]) || null;
const faltam = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', ...(TESTE ? [] : ['IG_USER_ID'])].filter((k) => !env(k));
if (faltam.length) falhar(`Faltam variáveis: ${faltam.join(', ')}`);

const BASE = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, '');
const CHAVE = env('SUPABASE_SERVICE_KEY');
const api = supabaseRest(BASE, CHAVE);
const IG = 'https://graph.instagram.com/v23.0';
const SITE = 'control-critic.netlify.app';
const hoje = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const dataCurta = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------- Token: usa o guardado no banco (renovado a cada ~20 dias); na primeira vez, o do GitHub ----------
async function tokenInstagram() {
  const [salvo] = await api('app_secrets?key=eq.instagram_token&select=value');
  let token = salvo?.value?.token || env('IG_TOKEN');
  if (!token) falhar('Sem token do Instagram: coloque IG_TOKEN nos segredos do GitHub (veja scripts/instagram/LEIA-ME.md).');
  const renovado = salvo?.value?.renovado_em ? new Date(salvo.value.renovado_em) : new Date(0);
  if (Date.now() - renovado > 20 * 864e5) {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.access_token) {
      token = d.access_token;
      await api('app_secrets?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates',
        body: [{ key: 'instagram_token', value: { token, renovado_em: new Date().toISOString() }, updated_at: new Date().toISOString() }] });
      log('Token do Instagram renovado (vale por mais 60 dias).');
    } else if (!salvo) {
      log(`Aviso: não deu para renovar o token agora (${d.error?.message || r.status}). Seguindo com o atual.`);
    } else falhar(`O token do Instagram expirou ou foi revogado (${d.error?.message || r.status}). Gere outro e atualize IG_TOKEN (LEIA-ME, passo 4).`);
  }
  return token;
}

async function ig(caminho, params, token, metodo = 'POST') {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${IG}/${caminho}${metodo === 'GET' ? '?' + q : ''}`, metodo === 'GET' ? {} : { method: 'POST', body: q });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(`Instagram (${caminho}): ${d.error?.message || r.status}`);
  return d;
}

// O Instagram baixa a imagem de uma URL pública: guardamos no armazenamento do Supabase
async function hospedar(jpeg, nome, tipo = 'image/jpeg', ext = 'jpg') {
  const caminho = `instagram/${new Date().toISOString().slice(0, 10)}/${nome}-${Date.now()}.${ext}`;
  const auth = CHAVE.startsWith('eyJ') ? { Authorization: `Bearer ${CHAVE}` } : {};
  const r = await fetch(`${BASE}/storage/v1/object/media/${caminho}`, { method: 'POST', headers: { apikey: CHAVE, ...auth, 'Content-Type': tipo, 'x-upsert': 'true' }, body: jpeg });
  if (!r.ok) throw new Error(`Não consegui guardar a imagem (${r.status} ${(await r.text()).slice(0, 200)})`);
  return `${BASE}/storage/v1/object/public/media/${caminho}`;
}

async function aguardarPronto(id, token, tentativas = 30) {
  for (let i = 0; i < tentativas; i++) {
    const d = await ig(id, { fields: 'status_code' }, token, 'GET');
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') throw new Error(`Instagram recusou a imagem (${d.status_code}).`);
    await espera(3000);
  }
  throw new Error('Instagram demorou demais para processar a imagem.');
}

// ---------- Reels com música ----------
// Músicas livres de direitos ficam em scripts/instagram/musicas/*.mp3 (veja o LEIA-ME). Sem música ou sem ffmpeg, não faz Reels.
const PASTA_MUSICAS = new URL('./musicas/', import.meta.url);
function musicas() { try { return readdirSync(PASTA_MUSICAS).filter((f) => /\.mp3$/i.test(f)); } catch { return []; } }
function temFfmpeg() { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }
export const reelsDisponivel = () => env('REELS') !== '0' && musicas().length > 0 && temFfmpeg();

// Monta um vídeo vertical (1080x1920) com as artes (4 s cada, transição suave) e uma música sorteada com fade no fim
async function montarReel(imagens) {
  const dir = join(tmpdir(), `reel-${Date.now()}`); mkdirSync(dir, { recursive: true });
  const quadros = [];
  for (const [i, im] of imagens.entries()) { const f = join(dir, `q${i}.jpg`); writeFileSync(f, await arteStory(im.jpeg, chamadaDe(im.nome))); quadros.push(f); }
  const lista = musicas(); const musica = new URL(lista[Math.floor(Math.random() * lista.length)], PASTA_MUSICAS).pathname;
  const dur = 4, total = quadros.length * dur, saida = join(dir, 'reel.mp4');
  const entradas = quadros.flatMap((q) => ['-loop', '1', '-t', String(dur + 0.5), '-i', q]);
  // transição "fade" entre os quadros
  let filtro = '', anterior = '[0:v]';
  for (let i = 1; i < quadros.length; i++) { const rot = i === quadros.length - 1 ? '[v]' : `[x${i}]`; filtro += `${anterior}[${i}:v]xfade=transition=fade:duration=0.5:offset=${i * dur}${rot};`; anterior = rot; }
  if (quadros.length === 1) filtro = '[0:v]null[v];';
  execFileSync('ffmpeg', ['-y', ...entradas, '-i', musica, '-filter_complex', `${filtro}[${quadros.length}:a]afade=t=out:st=${Math.max(0, total - 2.5)}:d=2.5[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(total), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', saida], { stdio: 'ignore' });
  const mp4 = readFileSync(saida); rmSync(dir, { recursive: true, force: true });
  return mp4;
}

async function publicarReel(imagens, legenda) {
  const mp4 = await montarReel(imagens);
  if (TESTE) { mkdirSync('saida-instagram', { recursive: true }); writeFileSync('saida-instagram/reel.mp4', mp4); writeFileSync('saida-instagram/legenda.txt', legenda); aviso('TESTE: Reels salvo em saida-instagram/reel.mp4 (nada foi publicado).'); return { url: null }; }
  const token = await tokenInstagram();
  const url = await hospedar(mp4, 'reel', 'video/mp4', 'mp4');
  const c = await ig(`${env('IG_USER_ID')}/media`, { media_type: 'REELS', video_url: url, caption: legenda, share_to_feed: 'true' }, token);
  await aguardarPronto(c.id, token, 100);   // vídeo demora mais para processar (até ~5 min)
  const post = await ig(`${env('IG_USER_ID')}/media_publish`, { creation_id: c.id }, token);
  const info = await ig(post.id, { fields: 'permalink' }, token, 'GET').catch(() => ({}));
  await publicarStory(imagens[0].jpeg, imagens[0].nome, token);
  return { id: post.id, url: info.permalink || null };
}

// imagens: [{ jpeg, nome }]; uma imagem = post simples; várias = carrossel
// Todo post do feed também vira story (mais alcance: os stories aparecem no topo do app para os seguidores)
const CHAMADAS = { resumo: 'RESUMO DO DIA', noticia: 'NOTÍCIA NOVA', urgente: 'URGENTE', promo: 'PROMOÇÃO DO DIA', meme: 'MEME DO DIA', versus: 'VOTE NOS COMENTÁRIOS' };
const chamadaDe = (nome) => CHAMADAS[String(nome).split('-')[0]] || 'NOVO POST NO PERFIL';
async function publicarStory(jpeg, nome, token) {
  try {
    const url = await hospedar(await arteStory(jpeg, chamadaDe(nome)), `story-${nome}`);
    const c = await ig(`${env('IG_USER_ID')}/media`, { media_type: 'STORIES', image_url: url }, token);
    await aguardarPronto(c.id, token);
    await ig(`${env('IG_USER_ID')}/media_publish`, { creation_id: c.id }, token);
    log('Story publicado.');
  } catch (e) { aviso(`O post saiu, mas o story falhou: ${e.message}`); }   // story nunca derruba o post
}

async function publicar(imagens, legenda) {
  if (TESTE) {
    mkdirSync('saida-instagram', { recursive: true });
    imagens.forEach((im, i) => writeFileSync(`saida-instagram/${i + 1}-${im.nome}.jpg`, im.jpeg));
    writeFileSync('saida-instagram/story.jpg', await arteStory(imagens[0].jpeg, chamadaDe(imagens[0].nome)));
    writeFileSync('saida-instagram/legenda.txt', legenda);
    aviso(`TESTE: ${imagens.length} arte(s) e a legenda salvas em saida-instagram/ (nada foi publicado).`);
    return { url: null };
  }
  const token = await tokenInstagram();
  const usuario = env('IG_USER_ID');
  const urls = [];
  for (const im of imagens) urls.push(await hospedar(im.jpeg, im.nome));
  let container;
  if (urls.length === 1) {
    container = (await ig(`${usuario}/media`, { image_url: urls[0], caption: legenda }, token)).id;
  } else {
    const filhos = [];
    for (const u of urls) { const c = await ig(`${usuario}/media`, { image_url: u, is_carousel_item: 'true' }, token); filhos.push(c.id); }
    for (const f of filhos) await aguardarPronto(f, token);
    container = (await ig(`${usuario}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda }, token)).id;
  }
  await aguardarPronto(container, token);
  const post = await ig(`${usuario}/media_publish`, { creation_id: container }, token);
  const info = await ig(post.id, { fields: 'permalink' }, token, 'GET').catch(() => ({}));
  await publicarStory(imagens[0].jpeg, imagens[0].nome, token);
  return { id: post.id, url: info.permalink || null };
}

// ---------- Legendas (emojis e hashtags ficam aqui; a arte não usa emoji) ----------
const TAGS = '#games #videogames #noticiasgames #gamer #ControlCritic';
const corta = (t, n) => { const s = String(t || '').replace(/\s*The post .*? appeared first on .*$/i, '').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, '') + '…' : s; };
const legendaNoticia = (n, urgente) => [
  `${urgente ? '🚨 URGENTE | ' : '🎮 '}${n.title}`, '',
  corta(n.summary || n.body, 600), '',
  n.source ? `📰 Fonte: ${n.source}` : null,
  `🔗 Mais no site: link na bio (${SITE})`, '', TAGS,
].filter((x) => x !== null).join('\n');
const legendaResumo = (ns) => [
  `📅 Resumo do dia ${hoje()}: o que rolou no mundo dos games`, '',
  ...ns.map((n, i) => `${i + 1}️⃣ ${n.title}`), '',
  '👉 Arraste para ver cada notícia',
  `🔗 Notícias completas, promoções e comunidades: link na bio (${SITE})`, '', TAGS,
].join('\n');

const prioridade = (n) => (n.cover_url ? 4 : 0) + (n.lang === 'pt' ? 2 : 0) + (n.source ? 1 : 0);

async function marcar(ns, resultado) {
  for (const n of ns) await api(`news?id=eq.${n.id}`, { method: 'PATCH', body: { instagram_at: new Date().toISOString(), instagram_url: resultado.url, instagram_status: null } });
}
async function registrar(dados) {
  await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: 'instagram_ultimo', value: { ...dados, em: new Date().toISOString() } }] });
}

// ---------- Modos ----------
async function diario() {
  const desde = new Date(Date.now() - 26 * 3600e3).toISOString();
  const ns = (await api(`news?select=id,title,summary,body,source,cover_url,lang,created_at,games(categories(slug))&published=eq.true&instagram_at=is.null&created_at=gte.${desde}&order=created_at.desc&limit=30`))
    .sort((a, b) => prioridade(b) - prioridade(a)).slice(0, 5);
  if (ns.length >= 2) {
    const imagens = [{ jpeg: await arteResumo({ data: hoje(), titulos: ns.map((n) => n.title) }), nome: 'resumo' }];
    for (const [i, n] of ns.entries()) imagens.push({ jpeg: await arteNoticia({ titulo: n.title, fonte: n.source || 'Control Critic', data: dataCurta(n.created_at), capa: n.cover_url, numero: i + 1, tema: n.games?.categories?.slug }), nome: `noticia-${n.id}` });
    // Com música disponível, o resumo vira Reels (mais alcance); senão, carrossel
    const r = reelsDisponivel() ? await publicarReel(imagens, legendaResumo(ns).replace('👉 Arraste para ver cada notícia', '🎬 Assista até o fim')) : await publicar(imagens, legendaResumo(ns));
    if (!TESTE) { await marcar(ns, r); await registrar({ tipo: 'resumo', noticias: ns.length, url: r.url }); }
    return aviso(`Instagram: resumo do dia com ${ns.length} notícias ${TESTE ? 'gerado (teste)' : 'publicado'} ${r.url || ''}`);
  }
  if (ns.length === 1) {
    const n = ns[0];
    const r = await publicar([{ jpeg: await arteNoticia({ titulo: n.title, fonte: n.source || 'Control Critic', data: dataCurta(n.created_at), capa: n.cover_url, tema: n.games?.categories?.slug }), nome: `noticia-${n.id}` }], legendaNoticia(n, false));
    if (!TESTE) { await marcar(ns, r); await registrar({ tipo: 'noticia', noticias: 1, url: r.url }); }
    return aviso(`Instagram: notícia do dia ${TESTE ? 'gerada (teste)' : 'publicada'} ${r.url || ''}`);
  }
  // Sem notícia nova: promoção do dia (para a página não ficar parada)
  if (!(await promocao())) aviso('Instagram: nada novo para publicar hoje.');
}

// Promoção do dia, sem repetir jogo da última semana. Devolve false se não houver.
async function promocao() {
  const cfg = (await api('settings?key=eq.instagram_promos&select=value'))[0]?.value || {};
  const recentes = Object.entries(cfg).filter(([, d]) => Date.now() - new Date(d) < 7 * 864e5).map(([id]) => Number(id));
  // Jogos em destaque no site entram primeiro (a partir de 20% de desconto); depois, os maiores descontos (40%+)
  const [destaques, deals] = await Promise.all([
    api('deals?select=game_id,discount_pct,price_cents,store,games!inner(title,cover_url,featured,categories(slug))&games.featured=eq.true&discount_pct=gte.20&order=discount_pct.desc&limit=30'),
    api('deals?select=game_id,discount_pct,price_cents,store,games(title,cover_url,featured,categories(slug))&discount_pct=gte.40&order=discount_pct.desc&limit=30'),
  ]);
  const d = [...destaques, ...deals].find((x) => x.games && !recentes.includes(x.game_id));
  if (!d) return false;
  const preco = d.price_cents != null ? (d.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const loja = { steam: 'Steam', playstation: 'PlayStation Store', xbox: 'Xbox Store', nintendo: 'Nintendo eShop' }[d.store] || d.store;
  const legenda = [`💸 PROMOÇÃO DO DIA${d.games.featured ? ' ⭐ DESTAQUE' : ''}: ${d.games.title} com ${d.discount_pct}% de desconto${preco ? ` (${preco})` : ''} na ${loja}!`, '',
    '⏳ Corre que promoção acaba. Veja esta e outras ofertas no site.', `🔗 Link na bio (${SITE})`, '', '#promocao #jogosbaratos ' + TAGS].join('\n');
  const r = await publicar([{ jpeg: await artePromo({ jogo: d.games.title, desconto: d.discount_pct, preco, loja, capa: d.games.cover_url, tema: d.games.categories?.slug }), nome: `promo-${d.game_id}` }], legenda);
  if (!TESTE) {
    await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: 'instagram_promos', value: { ...Object.fromEntries(Object.entries(cfg).filter(([id]) => recentes.includes(Number(id)))), [d.game_id]: new Date().toISOString() } }] });
    await registrar({ tipo: 'promocao', url: r.url });
  }
  aviso(`Instagram: promoção do dia ${TESTE ? 'gerada (teste)' : 'publicada'} (${d.games.title}) ${r.url || ''}`);
  return true;
}

async function urgente() {
  const filtro = ID_NOTICIA ? `id=eq.${ID_NOTICIA}` : 'instagram_status=eq.urgente&instagram_at=is.null';
  const ns = await api(`news?select=id,title,summary,body,source,cover_url,lang,created_at,published,games(categories(slug))&${filtro}&order=created_at.asc&limit=3`);
  if (!ns.length) return aviso('Instagram: nenhuma notícia urgente pendente.');
  for (const n of ns) {
    try {
      const r = await publicar([{ jpeg: await arteNoticia({ titulo: n.title, fonte: n.source || 'Control Critic', data: dataCurta(n.created_at), capa: n.cover_url, urgente: true, tema: n.games?.categories?.slug }), nome: `urgente-${n.id}` }], legendaNoticia(n, true));
      if (!TESTE) { await marcar([n], r); await registrar({ tipo: 'urgente', noticias: 1, url: r.url }); }
      aviso(`Instagram: notícia urgente ${TESTE ? 'gerada (teste)' : 'publicada'} (${n.title}) ${r.url || ''}`);
    } catch (e) {
      if (!TESTE) await api(`news?id=eq.${n.id}`, { method: 'PATCH', body: { instagram_status: 'erro' } });
      throw e;
    }
  }
}

// ---------- Entretenimento (12h50): alcance e comentários ----------
async function entretenimento({ soEnquete = false } = {}) {
  const [m] = soEnquete ? [] : await api('posts?select=id,body,image_url,profiles!posts_user_id_fkey(username)&ig_ok=eq.true&ig_aprovado=eq.true&instagram_at=is.null&status=eq.published&image_url=not.is.null&order=created_at.asc&limit=1');
  if (m) {
    const autor = m.profiles?.username || 'membro';
    const texto = corta(m.body && m.body !== '📷' ? m.body : '', 300);
    const legenda = [`😂 ${texto || 'Meme do dia'}`, '', `🎨 Por @${autor} na comunidade do Control Critic`,
      '👇 Marca aquele amigo que é exatamente assim', `📲 Poste o seu meme no site e apareça aqui: link na bio (${SITE})`, '',
      '#memesgamer #memes #gamer #humorgamer #ControlCritic'].join('\n');
    const r = await publicar([{ jpeg: await arteMeme({ imagem: m.image_url, autor }), nome: `meme-${m.id}` }], legenda);
    if (!TESTE) { await api(`posts?id=eq.${m.id}`, { method: 'PATCH', body: { instagram_at: new Date().toISOString(), instagram_url: r.url } }); await registrar({ tipo: 'meme', url: r.url }); }
    return aviso(`Instagram: meme de @${autor} ${TESTE ? 'gerado (teste)' : 'publicado'} ${r.url || ''}`);
  }
  // Sem meme aprovado: enquete "Qual você prefere?" com dois jogos que FAZEM SENTIDO juntos, sem repetir pares.
  // Ordem de preferência: rivalidade clássica (lista abaixo) → dois jogos da mesma franquia → jogos parecidos
  // (pelo menos 2 categorias em comum e lançados em épocas próximas).
  const cfg = (await api('settings?key=eq.instagram_versus&select=value'))[0]?.value || { pares: [] };
  const usados = new Set(cfg.pares || []);
  // Uma enquete por dia e nenhum jogo repetido em enquetes dos últimos 14 dias
  const diaBR = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  if (cfg.ultima && diaBR(cfg.ultima) === diaBR(Date.now())) return aviso('Instagram: já teve enquete hoje; sem meme aprovado, nada a postar agora.');
  const jogosRecentes = Object.fromEntries(Object.entries(cfg.jogos || {}).filter(([, d]) => Date.now() - new Date(d) < 14 * 864e5));
  const [jogos, cats] = await Promise.all([
    api('games?select=id,title,cover_url,category_id,category_ids,release_year,categories(name,slug)&cover_url=not.is.null&category_id=not.is.null&order=igdb_rating_count.desc.nullslast&limit=200'),
    api('categories?select=id,name,slug'),
  ]);
  const p = escolherVersus(jogos.filter((j) => !jogosRecentes[j.id]), cats, usados);
  if (!p) return aviso('Instagram: sem meme aprovado e sem enquete nova hoje.');
  const categoria = p.rotulo;
  const legenda = [`🤔 QUAL VOCÊ PREFERE? ${p.a.title} ou ${p.b.title}?`, '',
    `🅰️ ${p.a.title}`, `🅱️ ${p.b.title}`, '', `🔗 ${p.motivo}`, '', '💬 Responda nos comentários com A ou B e defenda sua escolha!',
    `⭐ Avalie os dois no site: link na bio (${SITE})`, '', '#enquete #qualvoceprefere #games #gamer #ControlCritic'].join('\n');
  const r = await publicar([{ jpeg: await arteVersus({ a: { titulo: p.a.title, capa: p.a.cover_url }, b: { titulo: p.b.title, capa: p.b.cover_url }, categoria, tema: p.tema || p.a.categories?.slug }), nome: `versus-${p.chave}` }], legenda);
  if (!TESTE) {
    await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: 'instagram_versus', value: { pares: [...usados, p.chave].slice(-300), ultima: new Date().toISOString(),
      jogos: { ...jogosRecentes, [p.a.id]: new Date().toISOString(), [p.b.id]: new Date().toISOString() } } }] });
    await registrar({ tipo: 'versus', url: r.url });
  }
  aviso(`Instagram: enquete ${p.a.title} x ${p.b.title} ${TESTE ? 'gerada (teste)' : 'publicada'} ${r.url || ''}`);
}

// Manhã: promoção do dia; sem promoção nova, a enquete
if (MODO === 'manha') { if (!(await promocao())) await entretenimento({ soEnquete: true }); }
else if (MODO === 'urgente') await urgente(); else if (MODO === 'entretenimento') await entretenimento(); else await diario();

