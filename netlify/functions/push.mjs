// Notificações no celular (Web Push).
//   GET  /.netlify/functions/push              -> { publicKey }  (chave pública para o navegador assinar)
//   POST /.netlify/functions/push  (do banco)  -> envia a notificação para os aparelhos da pessoa
//   POST /.netlify/functions/push?teste=1 (usuário logado) -> diagnóstico: confere a configuração e manda um teste para os aparelhos dele
// Variáveis no Netlify: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), PUSH_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_KEY. O banco chama o POST com o cabeçalho x-push-secret.
import webpush from 'web-push';
import { supabaseRest, usuarioLogado } from '../../lib/igdb.mjs';
import { metodo, limitar, lerJson, falhaSegura, segredoIgual, registrarErro, mesmaOrigem, erro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const json = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return json(503, { erro: 'Notificações no celular não configuradas.' });
  const m = metodo(req, ['GET', 'POST']); if (m) return m;
  if (req.method === 'GET') return json(200, { publicKey: env('VAPID_PUBLIC_KEY') });
  if (new URL(req.url).searchParams.get('teste')) return diagnostico(req);
  if (!env('PUSH_SECRET') || !segredoIgual(req.headers.get('x-push-secret'), env('PUSH_SECRET'))) {
    const lim = await limitar(req, { nome: 'push-negado', max: 20, segundos: 600 }); if (lim) return lim;
    return json(401, { erro: 'Não autorizado.' });
  }
  let d;
  try { d = await lerJson(req, 4096); } catch (e) { return falhaSegura(req, 'push', e); }
  const { user_id, title, body, link, type } = d;
  if (!/^[0-9a-f-]{36}$/.test(user_id || '')) return json(400, { erro: 'Usuário inválido.' });
  if (type != null && !/^[a-z_]{1,30}$/.test(String(type))) return json(400, { erro: 'Tipo inválido.' });
  const { enviados } = await enviar(user_id, { title, body, link, type });
  return json(200, { enviados });
};

async function enviar(user_id, { title, body, link, type }) {
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:contato@controlcritic.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const subs = await api(`push_subscriptions?select=endpoint,p256dh,auth&user_id=eq.${user_id}`);
  const payload = JSON.stringify({ title: String(title || 'Control Critic').slice(0, 120), body: String(body || '').slice(0, 200), link: /^[a-z]+\.html[\w?=&#.%-]*$/i.test(link || '') ? link : 'notificacoes.html', type });
  let enviados = 0;
  const erros = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: type === 'call' ? 'high' : 'normal' });
      enviados++;
    } catch (e) {
      erros.push({ status: e.statusCode || null, servico: new URL(s.endpoint).host });
      registrarErro('push', new Error(`envio ${e.statusCode || 'falhou'} em ${new URL(s.endpoint).host}`));
      // aparelho desinstalou o app, bloqueou, ou se inscreveu com chaves antigas (403): remove a inscrição
      if ([403, 404, 410].includes(e.statusCode)) await api(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' }).catch(() => {});
    }
  }));
  return { aparelhos: subs.length, enviados, erros };
}

// Diagnóstico para o próprio usuário: mostra em que ponto a corrente quebra
async function diagnostico(req) {
  if (mesmaOrigem(req) === false) return erro(req, 403, 'Origem não permitida.', 'origem');
  const quem = (await usuarioLogado(req, env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY')).catch(() => ({}))).usuario;
  if (!quem?.id) return json(401, { erro: 'Entre na sua conta para testar.' });
  // Cada teste manda 2 notificações reais para os aparelhos da própria pessoa
  const lim = await limitar(req, { nome: 'push-teste', max: 5, segundos: 600, quem: quem.id }); if (lim) return lim;
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const cfg = (await api('settings?key=eq.push&select=value').catch(() => []))[0]?.value;
  const origem = new URL(req.url).origin;
  const checagens = {
    chaves_netlify: !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('PUSH_SECRET')),
    banco_configurado: !!cfg?.url,
    segredo_igual: !!cfg?.segredo && cfg.segredo === env('PUSH_SECRET'),
    endereco_certo: !!cfg?.url && cfg.url.startsWith(origem),
    endereco_banco: cfg?.url || null,
  };
  const direto = await enviar(quem.id, { title: '🔔 Teste 1 de 2 (direto)', body: 'Se chegou, o celular está inscrito certinho.', link: 'notificacoes.html', type: 'teste' });
  // Teste 2: pelo caminho real (notificação criada no banco -> gatilho -> esta função)
  await api('notifications', { method: 'POST', body: [{ user_id: quem.id, type: 'teste', title: '🔔 Teste 2 de 2 (pelo banco)', body: 'Se chegou, as notificações do site vão chegar no celular.', link: 'notificacoes.html' }] }).catch(() => {});
  return json(200, { ...checagens, ...direto });
}
