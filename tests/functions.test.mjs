// Fase 2: segurança das Netlify Functions (método, origem, autenticação, entrada, rate limit e erro seguro).
// As chamadas externas (Supabase Auth, Steam, GitHub) são substituídas por um fetch falso só onde a função
// precisaria da internet; a lógica de autorização testada é a real.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { origemPermitida, limiteMemoria, lerJson, registrarErro, segredoIgual, metodo } from '../lib/http.mjs';

const SITE = 'https://control-critic.netlify.app';
const fetchReal = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = fetchReal;
  Object.assign(process.env, { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_KEY: 'service-chave-teste', RATE_SO_MEMORIA: '1' });
});
// Supabase Auth falso: "token-ana" é a Ana (usuária comum), "token-adm" é admin; o resto é recusado
function fakeSupabase({ papel = { ana: 'user', adm: 'admin' } } = {}) {
  const chamadas = [];
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url); chamadas.push(u);
    if (u.includes('/auth/v1/user')) {
      const t = (op.headers?.Authorization || '').replace('Bearer ', '');
      if (t === 'token-ana') return Response.json({ id: '11111111-1111-1111-1111-111111111111' });
      if (t === 'token-adm') return Response.json({ id: '22222222-2222-2222-2222-222222222222' });
      return new Response('{}', { status: 401 });
    }
    if (u.includes('/rest/v1/profiles') && u.includes('select=role')) return Response.json([{ role: u.includes('2222') ? papel.adm : papel.ana }]);
    if (u.includes('/rest/v1/news')) return Response.json([{ id: 5, instagram_at: null }]);
    return Response.json([]);
  };
  return chamadas;
}
const req = (caminho, op = {}) => new Request(SITE + caminho, op);

test('origens: oficial, prévias e localhost; recusa outras', () => {
  assert.ok(origemPermitida(SITE));
  assert.ok(origemPermitida('https://deploy-preview-75--control-critic.netlify.app'));
  assert.ok(!origemPermitida('https://control-critic.netlify.app.evil.com'));
  assert.ok(!origemPermitida('https://evil--control-critic.netlify.app.evil.com'));
  assert.ok(!origemPermitida(null));
});

test('método inválido devolve 405 com Allow; OPTIONS devolve 204', async () => {
  const r = metodo(req('/x', { method: 'DELETE' }), ['GET']);
  assert.equal(r.status, 405);
  assert.equal(metodo(req('/x', { method: 'OPTIONS', headers: { origin: SITE } }), ['POST']).status, 204);
  for (const nome of ['turn', 'traduzir', 'ao-vivo', 'steam-agora', 'precos-lojas', 'buscar-jogo']) {
    const fn = (await import(`../netlify/functions/${nome}.mjs`)).default;
    assert.equal((await fn(req('/f', { method: 'PUT', body: '{}' }))).status, 405, nome);
  }
  for (const nome of ['importar-steam', 'conquistas-steam', 'instagram-agora']) {
    const fn = (await import(`../netlify/functions/${nome}.mjs`)).default;
    assert.equal((await fn(req('/f'))).status, 405, nome);
  }
  const sitemap = (await import('../netlify/functions/sitemap.mjs')).default;
  assert.equal((await sitemap(req('/sitemap.xml', { method: 'POST' }))).status, 405);
});

test('corpo: exige JSON, limita tamanho e recusa JSON inválido', async () => {
  await assert.rejects(lerJson(req('/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"a":1}' })), { status: 415 });
  await assert.rejects(lerJson(req('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'x'.repeat(5000) }) }), 1024), { status: 413 });
  await assert.rejects(lerJson(req('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{a' })), { status: 400 });
  await assert.rejects(lerJson(req('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[1]' })), { status: 400 });
  assert.deepEqual(await lerJson(req('/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' })), { a: 1 });
});

test('rate limit: bloqueia acima do máximo e libera na janela seguinte', () => {
  const t = 1_000_000_000_000;
  assert.ok(limiteMemoria('k', 2, 60, t)); assert.ok(limiteMemoria('k', 2, 60, t)); assert.ok(!limiteMemoria('k', 2, 60, t));
  assert.ok(limiteMemoria('k', 2, 60, t + 60_000));
});

test('rate limit na função: a 16ª busca em 5 min recebe 429', async () => {
  Object.assign(process.env, { IGDB_CLIENT_ID: 'c', IGDB_CLIENT_SECRET: 's' });
  globalThis.fetch = async () => Response.json([]); // IGDB e Supabase vazios
  const fn = (await import('../netlify/functions/buscar-jogo.mjs')).default;
  const h = { 'x-nf-client-connection-ip': '203.0.113.9' };
  const st = [];
  for (let i = 0; i < 16; i++) st.push((await fn(req('/f?q=zelda', { headers: h }))).status);
  assert.deepEqual(st.slice(0, 15).filter((s) => s !== 200), []);
  assert.equal(st[15], 429);
  // outro IP não é afetado
  assert.equal((await fn(req('/f?q=zelda', { headers: { 'x-nf-client-connection-ip': '203.0.113.10' } }))).status, 200);
});

test('TURN: sem login 401; usuário logado recebe credencial; ponte com derivado da chave; origem estranha 403', async () => {
  Object.assign(process.env, { TURN_URL: 'turn:turn.exemplo:3478', TURN_SECRET: 'segredo' });
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  fakeSupabase();
  const fn = (await import('../netlify/functions/turn.mjs')).default;
  assert.equal((await fn(req('/f'))).status, 401);
  assert.equal((await fn(req('/f', { headers: { authorization: 'Bearer token-falso' } }))).status, 401);
  const ok = await fn(req('/f', { headers: { authorization: 'Bearer token-ana', origin: SITE } }));
  assert.equal(ok.status, 200);
  const d = await ok.json();
  assert.match(d.iceServers[0].username, /^\d+:11111111$/);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  const ponte = 'ponte.' + createHash('sha256').update('turn:service-chave-teste').digest('hex');
  assert.equal((await fn(req('/f', { headers: { authorization: `Bearer ${ponte}` } }))).status, 200);
  assert.equal((await fn(req('/f', { headers: { authorization: 'Bearer service-chave-teste' } }))).status, 401, 'a chave crua não serve');
  assert.equal((await fn(req('/f', { headers: { authorization: 'Bearer token-ana', origin: 'https://evil.com' } }))).status, 403);
});

test('Instagram agora: usuário comum 403, sem login 401, admin passa; id e JSON validados', async () => {
  delete process.env.GITHUB_DISPARO_TOKEN;
  fakeSupabase();
  const fn = (await import('../netlify/functions/instagram-agora.mjs')).default;
  const post = (token, body, tipo = 'application/json') => fn(req('/f', { method: 'POST', headers: { 'content-type': tipo, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body }));
  assert.equal((await post(null, '{"noticia":5}')).status, 401);
  assert.equal((await post('token-ana', '{"noticia":5}')).status, 403);
  assert.equal((await post('token-adm', '{"noticia":"5; drop"}')).status, 400);
  assert.equal((await post('token-adm', '{"noticia":5}', 'text/plain')).status, 415);
  assert.equal((await post('token-adm', '{"noticia":5}')).status, 200);
});

test('Importar Steam: sem login 401 sem detalhes internos; corpo validado', async () => {
  process.env.STEAM_API_KEY = 'k';
  fakeSupabase();
  const fn = (await import('../netlify/functions/importar-steam.mjs')).default;
  const r = await fn(req('/f', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(r.status, 401);
  assert.doesNotMatch(JSON.stringify(await r.json()), /código|token|401/);
  const r2 = await fn(req('/f', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token-ana' }, body: '{"perfil":' }));
  assert.equal(r2.status, 400);
});

test('Conquistas: posição inválida recusada', async () => {
  process.env.STEAM_API_KEY = 'k';
  fakeSupabase();
  const fn = (await import('../netlify/functions/conquistas-steam.mjs')).default;
  const r = await fn(req('/f', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token-ana' }, body: '{"offset":-5}' }));
  assert.equal(r.status, 400);
});

test('Push: segredo em tempo constante, tipo validado, teste exige login', async () => {
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', PUSH_SECRET: 's3' });
  fakeSupabase();
  const fn = (await import('../netlify/functions/push.mjs')).default;
  assert.ok(segredoIgual('abc', 'abc')); assert.ok(!segredoIgual('abc', 'abd')); assert.ok(!segredoIgual('', ''));
  const post = (h, body) => fn(req('/f', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body }));
  assert.equal((await post({ 'x-push-secret': 's3' }, JSON.stringify({ user_id: '11111111-1111-1111-1111-111111111111', type: '<script>' }))).status, 400);
  assert.equal((await fn(req('/f?teste=1', { method: 'POST' }))).status, 401);
  assert.equal((await fn(req('/f', { method: 'DELETE' }))).status, 405);
});

test('Logs não vazam segredos, tokens nem e-mails', () => {
  const linhas = [];
  const orig = console.error; console.error = (l) => linhas.push(l);
  try { registrarErro('x', new Error('falhou https://api?key=ABC123 Bearer eyJhbGci fulano@email.com token=zzz')); } finally { console.error = orig; }
  assert.doesNotMatch(linhas[0], /ABC123|eyJhbGci|fulano@|zzz/);
});
