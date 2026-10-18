// Credenciais temporárias de TURN para as calls (retransmissão quando a conexão direta é bloqueada).
//   GET /.netlify/functions/turn  (Authorization: Bearer <token da sessão>)  ->  { iceServers, primarios, reserva }
// Só para quem está logado (as credenciais dão acesso ao retransmissor). A ponte do Discord, que não tem
// sessão de usuário, se identifica com um derivado (SHA-256) da chave de serviço, comparado em tempo constante.
// Aceita duas fontes (pode usar uma, outra ou as duas):
//  1) TURN próprio (coturn na Oracle, no seu PC via IPv6 etc.), gratuito. Vários separados por vírgula:
//       TURN_URL     ex.: turn:129.146.10.20:3478,turn:[2804:1eec:abcd::10]:3478
//       TURN_SECRET  o mesmo "static-auth-secret" em todos os servidores
//  2) TURN da Cloudflare: CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN
// Resposta: iceServers (todos) + primarios (os próprios) + reserva (Cloudflare). A call tenta primeiro só os
// próprios e acrescenta a reserva se não conectar em alguns segundos (economiza a cota da Cloudflare).
import { createHmac, createHash } from 'node:crypto';
import { usuarioLogado } from '../../lib/igdb.mjs';
import { metodo, resposta, erro, mesmaOrigem, limitar, buscar, segredoIgual, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const VALIDADE = 2 * 3600; // segundos (curta: uma call longa pede de novo, o cliente guarda por 1 h)

// Padrão "TURN REST API" do coturn: usuário = expiração:id, senha = HMAC-SHA1(segredo, usuário)
export function turnProprio(quem = 'controlcritic') {
  const urls = env('TURN_URL').split(',').map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (!urls.length || !env('TURN_SECRET')) return null;
  const username = `${Math.floor(Date.now() / 1000) + VALIDADE}:${quem}`;
  const credential = createHmac('sha1', env('TURN_SECRET')).update(username).digest('base64');
  // também via TCP, que passa por mais firewalls
  const todas = urls.flatMap((u) => (u.includes('transport=') ? [u] : [u, `${u}?transport=tcp`]));
  return { urls: todas, username, credential };
}

async function turnCloudflare() {
  if (!env('CLOUDFLARE_TURN_KEY_ID') || !env('CLOUDFLARE_TURN_API_TOKEN')) return [];
  const r = await buscar(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env('CLOUDFLARE_TURN_KEY_ID'))}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('CLOUDFLARE_TURN_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: VALIDADE }),
  }, 6000);
  if (!r.ok) throw new Error(`Cloudflare respondeu ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.iceServers) ? d.iceServers : d.iceServers ? [d.iceServers] : [];
}

export default async (req) => {
  const m = metodo(req, ['GET']); if (m) return m;
  if (mesmaOrigem(req) === false) return erro(req, 403, 'Origem não permitida.', 'origem');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return erro(req, 401, 'Entre na sua conta para usar as calls.', 'login');
  let quem;
  // A ponte manda um derivado da chave de serviço (a chave em si nunca sai do PC dela)
  if (env('SUPABASE_SERVICE_KEY') && segredoIgual(token, 'ponte.' + createHash('sha256').update('turn:' + env('SUPABASE_SERVICE_KEY')).digest('hex'))) quem = 'ponte';
  else {
    if (!env('SUPABASE_URL')) return erro(req, 503, 'Servidor sem configuração do Supabase.', 'config');
    const login = await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY')).catch(() => ({}));
    if (!login.usuario) return erro(req, 401, 'Entre na sua conta para usar as calls.', 'login');
    quem = String(login.usuario.id).slice(0, 8); // aparece no log do coturn sem identificar a pessoa
    const lim = await limitar(req, { nome: 'turn', max: 30, segundos: 600, quem: login.usuario.id }); if (lim) return lim;
  }
  const proprio = turnProprio(quem);
  const primarios = proprio ? [proprio] : [];
  let reserva = [];
  try { reserva = await turnCloudflare(); } catch (e) { registrarErro('turn', e); }
  if (!primarios.length && !reserva.length) return erro(req, 503, 'TURN não configurado.', 'config');
  return resposta(req, 200, { iceServers: [...primarios, ...reserva], primarios, reserva });
};
