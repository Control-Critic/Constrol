// Proteções comuns das Netlify Functions: método, CORS, corpo JSON, timeout, rate limit e erro seguro.
// Nada aqui registra tokens, e-mails, corpo de requisições ou IPs em texto puro.
import { createHash, timingSafeEqual } from 'node:crypto';

const env = (k) => (process.env[k] || '').trim();

// Origens autorizadas: o site oficial, as prévias de deploy do Netlify e o netlify dev local.
// SITE_ORIGENS (opcional, separadas por vírgula) acrescenta outras, ex.: domínio próprio no futuro.
const ORIGENS_FIXAS = ['https://control-critic.netlify.app', 'http://localhost:8888'];
const PREVIA = /^https:\/\/[a-z0-9-]+--control-critic\.netlify\.app$/;
export function origemPermitida(origem) {
  if (!origem) return false;
  const extras = env('SITE_ORIGENS').split(',').map((s) => s.trim()).filter(Boolean);
  return ORIGENS_FIXAS.includes(origem) || extras.includes(origem) || PREVIA.test(origem);
}

// Mesma origem do pedido (o navegador manda Origin em POST/fetch; GET simples pode vir sem)
export function mesmaOrigem(req) {
  const o = req.headers.get('origin');
  if (!o) return null; // sem cabeçalho: não dá para afirmar nada
  try { return new URL(o).host === new URL(req.url).host || origemPermitida(o); } catch { return false; }
}

function cabecalhos(req, extra = {}) {
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra };
  const o = req?.headers?.get('origin');
  if (o && origemPermitida(o)) { h['Access-Control-Allow-Origin'] = o; h.Vary = 'Origin'; }
  return h;
}

export const resposta = (req, status, corpo, extra) => new Response(JSON.stringify(corpo), { status, headers: cabecalhos(req, extra) });

// Erro padronizado: { erro, codigo } — mensagem pensada para o usuário, nunca a exceção crua
export const erro = (req, status, mensagem, codigo = 'erro') => resposta(req, status, { erro: mensagem, codigo });

// Método HTTP: devolve Response (405 ou 204 do preflight) ou null quando está tudo certo
export function metodo(req, permitidos) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cabecalhos(req), 'Access-Control-Allow-Methods': permitidos.join(', '), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Max-Age': '600', Allow: permitidos.join(', ') } });
  }
  if (!permitidos.includes(req.method)) return erro(req, 405, 'Método não permitido.', 'metodo');
  return null;
}

// Corpo JSON com tipo e tamanho conferidos. Lança ErroHttp com status adequado.
export class ErroHttp extends Error { constructor(status, msg, codigo) { super(msg); this.status = status; this.codigo = codigo; } }
export async function lerJson(req, maxBytes = 4096) {
  const tipo = (req.headers.get('content-type') || '').toLowerCase();
  const texto = await req.text();
  if (!texto) return {};
  if (!tipo.startsWith('application/json')) throw new ErroHttp(415, 'Envie os dados como JSON.', 'tipo');
  if (Buffer.byteLength(texto) > maxBytes) throw new ErroHttp(413, 'Dados grandes demais.', 'tamanho');
  try {
    const v = JSON.parse(texto);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch { throw new ErroHttp(400, 'JSON inválido.', 'json'); }
}

// fetch com tempo limite (padrão 10 s)
export const buscar = (url, opcoes = {}, ms = 10000) => fetch(url, { ...opcoes, signal: opcoes.signal || AbortSignal.timeout(ms) });

// Comparação de segredos em tempo constante
export function segredoIgual(a, b) {
  if (!a || !b) return false;
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

// IP do cliente, só para virar uma chave de rate limit com hash (nunca é guardado em texto puro)
export function ipCliente(req) {
  return req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
}
const hashChave = (s) => createHash('sha256').update(`${env('RATE_SAL') || 'cc'}:${s}`).digest('base64url').slice(0, 22);

// Rate limit em janela fixa. Usa o banco (função rate_hit, compartilhada entre instâncias) quando há
// SUPABASE_URL/SUPABASE_SERVICE_KEY; se o banco falhar, cai para um contador em memória da instância
// (mais fraco, mas melhor que nada). Devolve Response 429 ou null.
const memoria = new Map();
export function limiteMemoria(chave, max, segundos, agora = Date.now()) {
  const janela = Math.floor(agora / (segundos * 1000));
  const k = `${chave}:${janela}`;
  const n = (memoria.get(k) || 0) + 1;
  memoria.set(k, n);
  if (memoria.size > 5000) for (const x of memoria.keys()) { if (!x.endsWith(`:${janela}`)) memoria.delete(x); }
  return n <= max;
}
export async function limitar(req, { nome, max, segundos = 60, quem = null }) {
  const chave = `${nome}:${hashChave(quem || ipCliente(req))}`;
  let ok;
  const url = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, ''), sk = env('SUPABASE_SERVICE_KEY');
  if (url && sk && !process.env.RATE_SO_MEMORIA) {
    try {
      const r = await buscar(`${url}/rest/v1/rpc/rate_hit`, { method: 'POST', headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ chave, maximo: max, segundos }) }, 3000);
      if (r.ok) ok = (await r.json()) === true;
    } catch { /* cai para a memória */ }
  }
  if (ok === undefined) ok = limiteMemoria(chave, max, segundos);
  return ok ? null : erro(req, 429, 'Muitas tentativas. Espere um pouco e tente de novo.', 'limite');
}

// Log sem dados sensíveis: só nome da função, código e uma mensagem curta sem tokens/e-mails/URLs com chave
export function registrarErro(funcao, e) {
  const msg = String(e?.message || e || '').replace(/(key|token|secret|apikey|authorization)=?[^\s&]*/gi, '$1=***')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***').replace(/Bearer\s+\S+/gi, 'Bearer ***').slice(0, 200);
  console.error(`[${funcao}] ${e?.name || 'Erro'}: ${msg}`);
}

// Trata ErroHttp lançado por lerJson etc.; o resto vira 500/502 genérico
export function falhaSegura(req, funcao, e, status = 502, mensagem = 'Falha temporária. Tente de novo em instantes.') {
  if (e instanceof ErroHttp) return erro(req, e.status, e.message, e.codigo);
  registrarErro(funcao, e);
  return erro(req, status, mensagem, 'interno');
}
