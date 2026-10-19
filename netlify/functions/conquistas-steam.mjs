// Continua a leitura das conquistas da Steam, de 12 em 12 jogos (o site chama até acabar).
//   POST /.netlify/functions/conquistas-steam  { offset: 12 }  (usuário logado; usa o steam_id já vinculado)
// Resposta: { total, proximo (null = terminou), lidos, jogos }
import { supabaseRest, usuarioLogado } from '../../lib/igdb.mjs';
import { steam, importarConquistas } from '../../lib/steam.mjs';
import { metodo, limitar, lerJson, falhaSegura, registrarErro, mesmaOrigem, erro as erroHttp, segredoIgual, buscar } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const m = metodo(req, ['POST']); if (m) return m;
  if (mesmaOrigem(req) === false) return erroHttp(req, 403, 'Origem não permitida.', 'origem');
  if (['STEAM_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].some((k) => !env(k))) return json(503, { erro: 'Steam não configurada no servidor.' });
  const login = await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  if (!login.usuario) return json(401, { erro: 'Entre na sua conta de novo.' });
  const uid = login.usuario.id;
  const lim = await limitar(req, { nome: 'conquistas-steam', max: 300, segundos: 3600, quem: uid }); if (lim) return lim;
  let offset;
  try { ({ offset = 0 } = await lerJson(req, 256)); } catch (e) { return falhaSegura(req, 'conquistas-steam', e); }
  offset = Number(offset);
  if (!Number.isInteger(offset) || offset < 0 || offset > 20000) return json(400, { erro: 'Posição inválida.' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  try {
    const sid = (await api(`profiles?id=eq.${uid}&select=steam_id`))[0]?.steam_id;
    if (!sid) return json(400, { erro: 'Importe sua Steam primeiro.' });
    const jogos = (await steam('IPlayerService/GetOwnedGames/v1', { steamid: sid, include_appinfo: '1', include_played_free_games: '1' })).response?.games || [];
    const porAppid = new Map();
    for (let i = 0; i < jogos.length; i += 150)
      for (const g of await api(`games?select=id,steam_appid&steam_appid=in.(${jogos.slice(i, i + 150).map((g) => g.appid).join(',')})`)) porAppid.set(g.steam_appid, g.id);
    return json(200, await importarConquistas(sid, jogos, porAppid, uid, api, { offset, limite: 8 }));
  } catch (e) {
    return falhaSegura(req, 'conquistas-steam', e, 502, 'Falha ao falar com a Steam. Tente de novo em instantes.');
  }
};
