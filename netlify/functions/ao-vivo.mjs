// Quem está transmitindo na Twitch agora.   GET /.netlify/functions/ao-vivo?logins=fulano,ciclano
// Usa o mesmo app da Twitch do IGDB (IGDB_CLIENT_ID e IGDB_CLIENT_SECRET).
import { tokenTwitch } from '../../lib/igdb.mjs';
import { metodo, resposta, erro, mesmaOrigem, limitar, buscar, lerJson, falhaSegura, segredoIgual, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo, cache = 60) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${cache}` },
});

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  const lim = await limitar(req, { nome: 'ao-vivo', max: 60, segundos: 60 }); if (lim) return lim;
  if (!env('IGDB_CLIENT_ID') || !env('IGDB_CLIENT_SECRET')) return json(503, { erro: 'Twitch não configurada.' }, 0);
  const logins = [...new Set((new URL(req.url).searchParams.get('logins') || '').toLowerCase().split(','))]
    .map((x) => x.trim()).filter((x) => /^[a-z0-9_]{3,25}$/.test(x)).slice(0, 100);
  if (!logins.length) return json(200, { ao_vivo: [] });
  try {
    const token = await tokenTwitch(env('IGDB_CLIENT_ID'), env('IGDB_CLIENT_SECRET'));
    const r = await buscar(`https://api.twitch.tv/helix/streams?${logins.map((l) => 'user_login=' + l).join('&')}&first=100`, {
      headers: { 'Client-ID': env('IGDB_CLIENT_ID'), Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Twitch respondeu ${r.status}`);
    const d = await r.json();
    return json(200, { ao_vivo: (d.data || []).map((s) => ({ login: s.user_login, jogo: s.game_name, titulo: s.title, espectadores: s.viewer_count })) });
  } catch (e) {
    registrarErro('ao-vivo', e);
    return json(502, { erro: 'Falha ao consultar a Twitch.' }, 0);
  }
};
