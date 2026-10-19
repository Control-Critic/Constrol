// Traduz para português a descrição de um jogo que está em inglês e salva no banco
// (cada jogo é traduzido uma única vez).   GET /.netlify/functions/traduzir?id=123
// Variáveis no Netlify: DEEPL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
import { supabaseRest } from '../../lib/igdb.mjs';
import { traduzir } from '../../lib/idioma.mjs';
import { metodo, resposta, erro, mesmaOrigem, limitar, buscar, lerJson, falhaSegura, segredoIgual, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  // Aceita só chamadas vindas do próprio site e limita por IP (evita gastar a cota do DeepL por terceiros)
  if (mesmaOrigem(req) === false) return erro(req, 403, 'Origem não permitida.', 'origem');
  const lim = await limitar(req, { nome: 'traduzir', max: 20, segundos: 600 }); if (lim) return lim;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return json(400, { erro: 'Jogo inválido.' });
  if (!env('DEEPL_API_KEY') || !env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) return json(503, { erro: 'Tradução automática não configurada.' });
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  try {
    const [g] = await api(`games?select=id,description,description_lang&id=eq.${id}`);
    if (!g?.description) return json(404, { erro: 'Jogo sem descrição.' });
    if (g.description_lang !== 'en') return json(200, { description: g.description });
    const [pt] = await traduzir([g.description], env('DEEPL_API_KEY'));
    // Só grava se ninguém traduziu/editou nesse meio tempo
    await api(`games?id=eq.${id}&description_lang=eq.en`, { method: 'PATCH', body: { description: pt, description_lang: 'pt', description_en: g.description } });
    return json(200, { description: pt, traduzido: true });
  } catch (e) {
    registrarErro('traduzir', e);
    return json(502, { erro: String(e.message).includes('Cota') ? 'Cota de tradução do mês esgotada.' : 'Falha ao traduzir.' });
  }
};
