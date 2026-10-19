// Importa a biblioteca da Steam de um usuário logado para "Minha biblioteca".
//   POST /.netlify/functions/importar-steam  { perfil: "https://steamcommunity.com/id/fulano" }
// Usa a Steam Web API oficial (GetOwnedGames). O perfil e os "detalhes de jogos" precisam estar públicos.
// Variáveis no Netlify: STEAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { supabaseRest, usuarioLogado } from '../../lib/igdb.mjs';
import { steam, importarConquistas } from '../../lib/steam.mjs';
import { metodo, limitar, lerJson, falhaSegura, registrarErro, mesmaOrigem, erro as erroHttp, segredoIgual, buscar } from '../../lib/http.mjs';

const MAX_NOVOS_NO_CATALOGO = 3000;
const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'jogo';


async function steamId(perfil) {
  const s = perfil.trim();
  const num = s.match(/(?:profiles\/)?(\d{17})\/?$/);
  if (num) return num[1];
  const nome = s.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]+)/)?.[1] || (/^[A-Za-z0-9_-]{2,32}$/.test(s) ? s : null);
  if (!nome) return null;
  const r = await steam('ISteamUser/ResolveVanityURL/v1', { vanityurl: nome });
  return r.response?.success === 1 ? r.response.steamid : null;
}

export default async (req) => {
  const m = metodo(req, ['POST']); if (m) return m;
  if (mesmaOrigem(req) === false) return erroHttp(req, 403, 'Origem não permitida.', 'origem');
  if (['STEAM_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].some((k) => !env(k)))
    return json(503, { erro: 'Importação da Steam ainda não configurada no servidor (variável STEAM_API_KEY no Netlify).' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

  try {
    // Login
    const login = await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
    if (!login.usuario) {
      registrarErro('importar-steam', new Error(`login ${login.erro}`));
      return json(401, { erro: 'Não foi possível confirmar seu login. Saia e entre de novo na sua conta e tente outra vez.' });
    }
    const { id: uid } = login.usuario;
    // Importação pesada (Steam + catálogo): poucas por hora por pessoa
    const lim = await limitar(req, { nome: 'importar-steam', max: 6, segundos: 3600, quem: uid }); if (lim) return lim;

    const { perfil } = await lerJson(req, 1024);
    if (!perfil || String(perfil).length > 200) return json(400, { erro: 'Informe o link do seu perfil da Steam.' });
    const sid = await steamId(String(perfil));
    if (!sid) return json(404, { erro: 'Perfil da Steam não encontrado. Confira o link.' });

    const dono = await steam('IPlayerService/GetOwnedGames/v1', { steamid: sid, include_appinfo: '1', include_played_free_games: '1' });
    const jogos = (dono.response?.games || []).filter((g) => g.appid && g.name);
    if (!jogos.length) return json(422, { erro: 'Não conseguimos ver seus jogos. Na Steam, vá em Editar perfil → Privacidade e deixe "Detalhes de jogos" como Público.' });

    // Jogos que já existem no catálogo (pelo ID da Steam)
    const porAppid = new Map();
    for (let i = 0; i < jogos.length; i += 150) {
      const ids = jogos.slice(i, i + 150).map((g) => g.appid).join(',');
      for (const g of await api(`games?select=id,steam_appid&steam_appid=in.(${ids})`)) porAppid.set(g.steam_appid, g.id);
    }

    // Os que faltam entram no catálogo com os dados da Steam (o robô completa descrição e preço depois)
    const faltando = jogos.filter((g) => !porAppid.has(g.appid)).slice(0, MAX_NOVOS_NO_CATALOGO);
    let novos = 0;
    for (let i = 0; i < faltando.length; i += 200) {
      const lote = faltando.slice(i, i + 200);
      const slugs = lote.map((g) => slugify(g.name));
      const usados = new Set((await api(`games?select=slug&slug=in.(${slugs.map((x) => `"${x}"`).join(',')})`)).map((g) => g.slug));
      const linhas = lote.map((g, k) => ({
        slug: usados.has(slugs[k]) ? `${slugs[k]}-${g.appid}` : slugs[k],
        title: g.name.slice(0, 200), steam_appid: g.appid, platforms: ['PC'],
        store_steam: `https://store.steampowered.com/app/${g.appid}/`,
        cover_url: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
        added_by: uid,
      }));
      const r = await api('games?on_conflict=slug', { method: 'POST', body: linhas, prefer: 'resolution=ignore-duplicates,return=representation' });
      for (const g of r || []) porAppid.set(g.steam_appid, g.id);
      novos += r?.length ?? 0;
    }

    // Biblioteca: grava as horas; não mexe no status nem na lista de desejos que a pessoa já marcou
    const linhas = jogos.filter((g) => porAppid.has(g.appid)).map((g) => ({
      user_id: uid, game_id: porAppid.get(g.appid),
      hours: Math.round((g.playtime_forever || 0) / 6) / 10, updated_at: new Date().toISOString(),
      hours_2weeks: g.playtime_2weeks ? Math.round(g.playtime_2weeks / 6) / 10 : null,
      last_played: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
    }));
    for (let i = 0; i < linhas.length; i += 500)
      await api('user_games?on_conflict=user_id,game_id', { method: 'POST', body: linhas.slice(i, i + 500), prefer: 'resolution=merge-duplicates' });

    // Guarda o ID da Steam (usado no "jogando agora") e o link do perfil, se a pessoa ainda não tinha preenchido
    await api(`profiles?id=eq.${uid}`, { method: 'PATCH', body: { steam_id: sid } }).catch(() => {});
    await api(`profiles?id=eq.${uid}&steam_profile=is.null`, { method: 'PATCH', body: { steam_profile: `https://steamcommunity.com/profiles/${sid}` } }).catch(() => {});

    const conquistas = await importarConquistas(sid, jogos, porAppid, uid, api, { limite: 4 }).catch((e) => { registrarErro('importar-steam/conquistas', e); return { erros: ['Falha ao ler as conquistas.'] }; });

    return json(200, { importados: linhas.length, novos_no_catalogo: novos, ignorados: jogos.length - linhas.length, conquistas: conquistas?.total ?? null,
      conquistas_proximo: conquistas?.proximo ?? null, conquistas_jogos: conquistas?.jogos ?? 0,
      conquistas_info: conquistas ? { comConquistas: conquistas.comConquistas, gravados: conquistas.gravados, erros: conquistas.erros } : null });
  } catch (e) {
    return falhaSegura(req, 'importar-steam', e, 502, 'Falha ao falar com a Steam. Tente de novo em instantes.');
  }
};

