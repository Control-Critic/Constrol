// Funções compartilhadas entre o robô (scripts/igdb.mjs) e a busca sob demanda
// (netlify/functions/buscar-jogo.mjs). Dados de jogos: IGDB.com (Twitch).

let cache = { token: null, expira: 0 };

export async function tokenTwitch(clientId, secret) {
  if (cache.token && Date.now() < cache.expira) return cache.token;
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: 'POST', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Twitch recusou as credenciais do IGDB (HTTP ${r.status}). Confira IGDB_CLIENT_ID e IGDB_CLIENT_SECRET.`);
  const j = await r.json();
  cache = { token: j.access_token, expira: Date.now() + (j.expires_in - 300) * 1000 };
  return cache.token;
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

export async function igdb(endpoint, corpo, { clientId, secret }) {
  const token = await tokenTwitch(clientId, secret);
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const r = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST', headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: corpo, signal: AbortSignal.timeout(30000),
    });
    if (r.status === 429 || r.status >= 500) { await esperar(1000 * 2 ** tentativa); continue; } // limite (4 req/s) ou falha passageira
    if (!r.ok) throw new Error(`IGDB ${endpoint}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    return r.json();
  }
  throw new Error('IGDB: limite de requisições excedido.');
}

// Só jogos "principais": sem DLC/expansão (parent_game) e sem versões/edições (version_parent)
export const FILTRO_BASE = 'version_parent = null & parent_game = null';
export const CAMPOS = `fields name,slug,summary,first_release_date,total_rating,total_rating_count,
  cover.image_id,artworks.image_id,screenshots.image_id,videos.video_id,genres.name,themes.name,keywords.name,player_perspectives.name,platforms.abbreviation,platforms.name,
  websites.url,external_games.url,external_games.uid,external_games.category,external_games.external_game_source;`;

const PLATAFORMAS = [
  [/^PS[1-5]$|^PSV(ita)?$|^PSP$/i, 'PlayStation'], [/^(XONE|XBOX|X360|Series X\|S|XSX)/i, 'Xbox'],
  [/^(PC|Win|Linux|Mac)/i, 'PC'], [/^(Switch|Switch 2|NS|Wii|WiiU|3DS|NDS)/i, 'Nintendo'], [/^(iOS|Android)$/i, 'Mobile'],
];
export function plataformas(g) {
  const s = new Set();
  for (const p of g.platforms || []) {
    const ab = p.abbreviation || p.name || '';
    const achou = PLATAFORMAS.find(([re]) => re.test(ab)) || (/playstation/i.test(p.name) && [, 'PlayStation']) || (/xbox/i.test(p.name) && [, 'Xbox']);
    if (achou) s.add(achou[1]);
  }
  return [...s];
}

// Gêneros/temas do IGDB -> categorias do site (a primeira regra que bater vence)
const TERROR = /^(survival horror|psychological horror|horror game|cosmic horror|lovecraftian horror|body horror|jump ?scares?)$/i;
const REGRAS = [
  // O IGDB põe o tema "Horror" em qualquer jogo com clima sombrio (Batman, Undertale, Call of Duty).
  // Só é terror quando as palavras-chave dizem que o jogo É de terror (survival/psychological horror...),
  // ou, sem palavras-chave, quando é terror + sobrevivência e não é de tiro.
  ['terror', (G, T, P, K) => K.size ? [...K].some((k) => TERROR.test(k)) : T.has('Horror') && T.has('Survival') && !G.has('Shooter')],
  ['mobile', (G, T, P) => P.length > 0 && P.every((p) => p === 'Mobile')],
  ['luta', (G) => G.has('Fighting')],
  // "Shooter" do IGDB inclui tiro em terceira pessoa (GTA, Gears): FPS só com visão em primeira pessoa
  ['fps', (G, T, P, K, V) => G.has('Shooter') && (!V.size || (V.has('First person') && !V.has('Third person')))],
  ['esportes', (G) => G.has('Sport') || (G.has('Racing') && !G.has('Adventure') && !G.has('Shooter'))],  // GTA tem "Racing", mas não é jogo de corrida
  ['musica', (G) => G.has('Music')],
  ['simulacao', (G) => G.has('Simulator')],
  ['estrategia', (G) => ['Strategy', 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Tactical', 'MOBA'].some((x) => G.has(x))],
  ['rpg', (G) => G.has('Role-playing (RPG)')],
  ['arcade', (G) => G.has('Arcade') || G.has('Pinball')],
  ['indies', (G) => G.has('Indie')],
  ['aventura', (G) => G.has('Adventure') || G.has('Point-and-click')],
  ['acao', (G, T) => T.has('Action') || G.has('Shooter') || G.has("Hack and slash/Beat 'em up") || G.has('Platform')],
];
// Até 3 categorias, da principal para a secundária (a ordem das regras define a prioridade)
export function categorias(g, plats) {
  const G = new Set((g.genres || []).map((x) => x.name)), T = new Set((g.themes || []).map((x) => x.name));
  const K = new Set((g.keywords || []).map((x) => String(x.name).trim().toLowerCase()));
  const V = new Set((g.player_perspectives || []).map((x) => x.name));
  const lista = REGRAS.filter(([, f]) => f(G, T, plats, K, V)).map(([c]) => c).slice(0, 3);
  return lista.length ? lista : ['acao'];
}
export const categoria = (g, plats) => categorias(g, plats)[0];

const img = (id, tam = 't_screenshot_big') => id ? `https://images.igdb.com/igdb/image/upload/${tam}/${id}.jpg` : null;

// Converte links das lojas para a versão brasileira
function lojas(g) {
  const urls = [...(g.websites || []).map((w) => w.url), ...(g.external_games || []).map((e) => e.url)].filter(Boolean);
  const out = {};
  for (const u of urls) {
    if (!out.store_steam && /store\.steampowered\.com\/app\/\d+/.test(u)) out.store_steam = u.split('?')[0];
    else if (!out.store_ps && /store\.playstation\.com\//.test(u)) out.store_ps = u.replace(/\/[a-z]{2}-[a-z]{2}\//i, '/pt-br/');
    else if (!out.store_xbox && /(xbox\.com|microsoft\.com)\//.test(u)) out.store_xbox = u.replace(/\/[a-z]{2}-[a-z]{2}\//i, '/pt-BR/');
    else if (!out.store_nintendo && /nintendo\.com\//.test(u)) out.store_nintendo = u;
  }
  // ID da Steam: pelo link ou pelo "uid" da fonte Steam (código 1)
  let appid = out.store_steam?.match(/\/app\/(\d+)/)?.[1];
  if (!appid) {
    const st = (g.external_games || []).find((e) => (e.external_game_source ?? e.category) === 1 && /^\d+$/.test(e.uid || ''));
    if (st) appid = st.uid;
  }
  if (appid) { out.steam_appid = Number(appid); out.store_steam ||= `https://store.steampowered.com/app/${appid}/`; }
  return out;
}

// Jogo do IGDB -> linha da tabela games
export function paraLinha(g, idsCategorias) {
  const plats = plataformas(g);
  const l = lojas(g);
  return {
    igdb_id: g.id,
    slug: g.slug,
    title: g.name,
    description: g.summary ? g.summary.slice(0, 1500) : null,
    description_lang: g.summary ? 'en' : null, // IGDB só tem textos em inglês
    cover_url: img(g.artworks?.[0]?.image_id) || img(g.screenshots?.[0]?.image_id) || img(g.cover?.image_id, 't_cover_big'),
    release_year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    category_id: idsCategorias[categoria(g, plats)] ?? null,
    category_ids: categorias(g, plats).map((c) => idsCategorias[c]).filter((x) => x != null),
    platforms: plats,
    igdb_rating: g.total_rating != null ? Math.round(g.total_rating * 100) / 100 : null,
    igdb_rating_count: g.total_rating_count || 0,
    store_ps: l.store_ps ?? null, store_xbox: l.store_xbox ?? null, store_steam: l.store_steam ?? null, store_nintendo: l.store_nintendo ?? null,
    steam_appid: l.steam_appid ?? null,
    videos: (g.videos || []).map((v) => v.video_id).filter((v) => /^[A-Za-z0-9_-]{6,20}$/.test(v || '')).slice(0, 3),
    // Só o código da imagem do IGDB (a URL é montada no site): ocupa pouco espaço no banco
    screenshots: [...(g.screenshots || []), ...(g.artworks || [])].map((x) => x.image_id).filter((x) => /^[a-z0-9]{4,40}$/.test(x || '')).slice(0, 8),
  };
}

// Cliente REST mínimo do Supabase (chave secreta só no servidor)
export function supabaseRest(url, key) {
  const base = url.trim().replace(/\/+(rest\/v1)?\/*$/, '');
  const auth = key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {};
  // Falhas passageiras (502/503/504, limite 429 ou queda de rede) são tentadas de novo com espera crescente
  // (2, 4, 8, 16 s): antes, um único 502 do Supabase derrubava uma importação de milhares de jogos.
  return async function api(caminho, { method = 'GET', body, prefer } = {}) {
    for (let tentativa = 0; ; tentativa++) {
      let r, txt;
      try {
        r = await fetch(`${base}/rest/v1/${caminho}`, {
          method, headers: { apikey: key, ...auth, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
        });
        txt = await r.text();
      } catch (e) {
        if (tentativa < 4) { await esperar(2000 * 2 ** tentativa); continue; }
        throw new Error(`${method} ${caminho.split('?')[0]}: falha de rede (${e.message})`);
      }
      if ((r.status === 429 || r.status >= 500) && tentativa < 4) { await esperar(2000 * 2 ** tentativa); continue; }
      if (!r.ok) throw new Error(`${method} ${caminho.split('?')[0]}: ${r.status} ${txt.slice(0, 300)}`);
      return txt ? JSON.parse(txt) : null;
    }
  };
}

// Confirma quem está logado a partir do token enviado pelo site.
// Usa a chave pública (a mesma do navegador) no serviço de login do Supabase: com as chaves
// novas (sb_secret_...) o serviço de login pode recusar a chave secreta nesse pedido.
export async function usuarioLogado(req, url, chaveReserva) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { erro: 'sem token' };
  const base = url.trim().replace(/\/+(rest\/v1)?\/*$/, '');
  const chaves = [req.headers.get('apikey'), chaveReserva].filter((k, i, a) => k && a.indexOf(k) === i);
  let ultimo = 0;
  for (const apikey of chaves) {
    const r = await fetch(`${base}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (r.ok) return { usuario: await r.json() };
    ultimo = r.status;
  }
  return { erro: `código ${ultimo || 'sem chave'}` };
}
