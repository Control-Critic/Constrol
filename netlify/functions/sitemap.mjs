// Sitemap para o Google: páginas principais + os jogos mais populares e as comunidades públicas.
//   GET /sitemap.xml (redirecionado para cá no netlify.toml)
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../js/config.js';

const PAGINAS = ['index.html', 'jogos.html', 'novidades.html', 'promocoes.html', 'comunidades.html', 'conquistas.html', 'sobre.html', 'contato.html', 'privacidade.html', 'termos.html', 'diretrizes.html'];
const rest = async (c) => { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${c}`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(15000) }); return r.ok ? r.json() : []; } catch { return []; } };
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export default async (req) => {
  if (!['GET', 'HEAD'].includes(req.method)) return new Response('Método não permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const base = new URL(req.url).origin;
  const [jogos, comms] = await Promise.all([
    rest('games?select=slug&order=igdb_rating_count.desc.nullslast&limit=5000'),
    rest('communities?select=id&is_private=eq.false&limit=1000'),
  ]);
  const urls = [...PAGINAS.map((p) => `${base}/${p}`), ...jogos.map((g) => `${base}/jogo.html?slug=${encodeURIComponent(g.slug)}`), ...comms.map((c) => `${base}/comunidade.html?id=${c.id}`)];
  const corpo = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xml(u)}</loc></url>`).join('\n')}\n</urlset>`;
  return new Response(corpo, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
};
