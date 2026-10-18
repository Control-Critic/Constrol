// "Jogando agora" da Steam para até 100 perfis de uma vez.
//   GET /.netlify/functions/steam-agora?ids=7656119...,7656119...
// Resposta: { "<steamid>": { "jogo": "Nome", "appid": 123, "online": true } }
// Só lê o status público da Steam (o perfil precisa estar público). Variável no Netlify: STEAM_API_KEY
import { metodo, limitar, buscar, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo, cache = 'no-store') => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache } });

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  const lim = await limitar(req, { nome: 'steam-agora', max: 60, segundos: 60 }); if (lim) return lim;
  if (!env('STEAM_API_KEY')) return json(200, {}); // sem chave: simplesmente não mostra nada
  const ids = [...new Set((new URL(req.url).searchParams.get('ids') || '').split(','))].filter((x) => /^\d{17}$/.test(x)).slice(0, 100);
  if (!ids.length) return json(200, {});
  try {
    const q = new URLSearchParams({ key: env('STEAM_API_KEY'), steamids: ids.join(',') });
    const r = await buscar(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?${q}`);
    if (!r.ok) return json(200, {});
    const out = {};
    for (const p of (await r.json()).response?.players || [])
      out[p.steamid] = { jogo: p.gameextrainfo || null, appid: p.gameid ? Number(p.gameid) : null, online: p.personastate > 0 };
    // Cache curto na CDN do Netlify: vários visitantes vendo o mesmo perfil não gastam a cota da Steam
    return json(200, out, 'public, max-age=60, s-maxage=60');
  } catch (e) { registrarErro('steam-agora', e); return json(200, {}); }
};
