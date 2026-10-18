// Melhor preço agora e menor preço histórico em TODAS as lojas (Steam, Epic, GOG, Nuuvem...), via IsThereAnyDeal.
//   GET /.netlify/functions/precos-lojas?appid=1091500   (jogo da Steam)  ou  ?titulo=Hollow%20Knight
// Resposta: { atual: { loja, preco, desconto, url }, menor: { loja, preco, desconto, quando }, link } ou {} se não achar
// Variável no Netlify: ITAD_API_KEY (crie grátis em isthereanydeal.com → Settings → API Keys)
import { metodo, limitar, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo, cache = 'no-store') => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });
const API = 'https://api.isthereanydeal.com';

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  const lim = await limitar(req, { nome: 'precos', max: 40, segundos: 60 }); if (lim) return lim;
  if (!env('ITAD_API_KEY')) return json(200, {});   // sem chave: o site só mostra os links
  const q = new URL(req.url).searchParams;
  const appid = q.get('appid'), titulo = (q.get('titulo') || '').slice(0, 120);
  if (!/^\d{1,9}$/.test(appid || '') && !titulo) return json(400, { erro: 'Informe appid ou titulo.' });
  try {
    const busca = new URLSearchParams({ key: env('ITAD_API_KEY'), ...(appid ? { appid } : { title: titulo }) });
    const achou = await (await fetch(`${API}/games/lookup/v1?${busca}`, { signal: AbortSignal.timeout(8000) })).json();
    if (!achou?.found || !achou.game?.id) return json(200, {}, 'public, max-age=3600, s-maxage=86400');
    const r = await fetch(`${API}/games/overview/v2?key=${encodeURIComponent(env('ITAD_API_KEY'))}&country=BR`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([achou.game.id]), signal: AbortSignal.timeout(8000) });
    const p = (await r.json())?.prices?.[0] || {};
    const fmt = (x) => (x?.price ? { loja: x.shop?.name || null, preco: x.price.amount, moeda: x.price.currency, desconto: x.cut ?? 0 } : null);
    const out = {
      atual: p.current ? { ...fmt(p.current), url: /^https:\/\//.test(p.current.url || '') ? p.current.url : null } : null,
      menor: p.lowest ? { ...fmt(p.lowest), quando: p.lowest.timestamp || null } : null,
      link: achou.game.slug ? `https://isthereanydeal.com/game/${encodeURIComponent(achou.game.slug)}/info/` : null,
    };
    // Cache de 6 h na CDN do Netlify: poupa a cota da API e deixa a página rápida
    return json(200, out, 'public, max-age=1800, s-maxage=21600');
  } catch (e) { registrarErro('precos-lojas', e); return json(200, {}); }
};
