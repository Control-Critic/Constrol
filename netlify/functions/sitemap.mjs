// Sitemap para o Google: páginas principais, jogos, comunidades públicas e listas públicas, com data real de alteração.
//   GET /sitemap.xml (redirecionado para cá no netlify.toml)
// Perfis não entram: não há uma opção de "perfil indexável" escolhida pela pessoa (privacidade).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/config.js';

const PAGINAS = ['index.html', 'jogos.html', 'novidades.html', 'promocoes.html', 'comunidades.html', 'conquistas.html', 'sobre.html', 'contato.html', 'privacidade.html', 'termos.html', 'diretrizes.html', 'feed.html'];
const rest = async (c) => { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${c}`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(15000) }); return r.ok ? r.json() : []; } catch { return []; } };
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export default async (req) => {
  if (!['GET', 'HEAD'].includes(req.method)) return new Response('Método não permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const base = new URL(req.url).origin;
  const [jogos, comms, listas, ultimaNoticia] = await Promise.all([
    rest('games?select=slug,created_at&order=igdb_rating_count.desc.nullslast&limit=5000'),
    rest('communities?select=id,created_at,ultima_atividade&is_private=eq.false&limit=1000'),
    rest('user_lists?select=id,updated_at&is_public=eq.true&order=updated_at.desc&limit=1000'),
    rest('news?select=created_at&published=eq.true&order=created_at.desc&limit=1'),
  ]);
  const urls = [
    ...PAGINAS.map((p) => ({ loc: `${base}/${p}`, mod: ['index.html', 'novidades.html'].includes(p) ? dia(ultimaNoticia[0]?.created_at) : null })),
    ...jogos.map((g) => ({ loc: `${base}/jogo.html?slug=${encodeURIComponent(g.slug)}`, mod: dia(g.created_at) })),
    ...comms.map((c) => ({ loc: `${base}/comunidade.html?id=${c.id}`, mod: dia(c.ultima_atividade || c.created_at) })),
    ...listas.map((l) => ({ loc: `${base}/lista.html?id=${l.id}`, mod: dia(l.updated_at) })),
  ];
  const corpo = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(corpo, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
};
