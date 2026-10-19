// Busca automática: procura o termo no IGDB (todas as plataformas) e
// adiciona ao catálogo, na hora, os jogos que ainda não estão no site.
//   GET /.netlify/functions/buscar-jogo?q=hollow  ->  { adicionados, jogos: [{ slug, titulo, ... }] }
// Variáveis no Netlify: IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { limitar, registrarErro, metodo } from '../../lib/http.mjs';
import { igdb, CAMPOS, FILTRO_BASE, paraLinha, supabaseRest } from '../../lib/igdb.mjs';

const MAX_RESULTADOS = 10;
const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
});

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  if (['IGDB_CLIENT_ID', 'IGDB_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'].some((k) => !env(k)))
    return json(503, { erro: 'Busca automática ainda não configurada no Netlify (variáveis de ambiente).' });
  const cred = { clientId: env('IGDB_CLIENT_ID'), secret: env('IGDB_CLIENT_SECRET') };
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

  // Sem aspas/ponto e vírgula para não alterar a consulta ao IGDB
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/["\\;]/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return json(400, { erro: 'Digite pelo menos 2 letras.' });
  // Cada busca pode gravar jogos novos no catálogo (com a chave de serviço): limite por IP
  const lim = await limitar(req, { nome: 'buscar-jogo', max: 15, segundos: 300 }); if (lim) return lim;

  try {
    const achados = await igdb('games', `search "${q}"; ${CAMPOS} where ${FILTRO_BASE}; limit ${MAX_RESULTADOS};`, cred);
    if (!achados.length) return json(200, { adicionados: 0, jogos: [] });

    const ids = achados.map((g) => g.id);
    const jaTem = await api(`games?select=igdb_id,slug&igdb_id=in.(${ids.join(',')})`);
    const slugs = new Map(jaTem.map((g) => [Number(g.igdb_id), g.slug]));

    const cats = Object.fromEntries((await api('categories?select=id,slug')).map((c) => [c.slug, c.id]));
    const novos = [];
    for (const g of achados) {
      if (slugs.has(g.id)) continue;
      const linha = paraLinha(g, cats);
      if (!linha.title || !linha.slug) continue;
      // Slug já usado por outro jogo (mesmo nome)? Acrescenta o id do IGDB
      const [mesmo] = await api(`games?select=id,igdb_id&slug=eq.${encodeURIComponent(linha.slug)}`);
      if (mesmo) {
        if (!mesmo.igdb_id) { // é o mesmo jogo cadastrado à mão: só liga ao IGDB
          await api(`games?id=eq.${mesmo.id}`, { method: 'PATCH', body: { igdb_id: g.id } });
          slugs.set(g.id, linha.slug); continue;
        }
        linha.slug = `${linha.slug}-${g.id}`;
      }
      novos.push(linha);
    }
    if (novos.length) {
      const r = await api('games?on_conflict=igdb_id', { method: 'POST', body: novos, prefer: 'resolution=ignore-duplicates,return=representation' });
      for (const g of r || []) slugs.set(Number(g.igdb_id), g.slug);
    }
    return json(200, {
      adicionados: novos.length,
      jogos: achados.filter((g) => slugs.has(g.id)).map((g) => ({ slug: slugs.get(g.id), titulo: g.name })),
    });
  } catch (e) {
    registrarErro('buscar-jogo', e);
    return json(502, { erro: 'Falha ao consultar o catálogo completo. Tente de novo em instantes.' });
  }
};
