// Testes das funções do servidor e bibliotecas (sem rede: o fetch é simulado).
// Rodar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { paraLinha, categoria, plataformas, usuarioLogado } from '../lib/igdb.mjs';
import { idioma } from '../lib/idioma.mjs';

const CATS = Object.fromEntries(['acao','arcade','aventura','estrategia','fps','esportes','luta','simulacao','terror','musica','indies','mobile','rpg'].map((s, i) => [s, i + 1]));

test('IGDB: converte jogo com lojas em links brasileiros, ID da Steam, trailer e categoria', () => {
  const l = paraLinha({
    id: 1, name: 'Elden Ring', slug: 'elden-ring', summary: 'EN', total_rating: 94.33, total_rating_count: 900,
    genres: [{ name: 'Role-playing (RPG)' }], platforms: [{ abbreviation: 'PS5' }, { abbreviation: 'PC' }, { abbreviation: 'XSX', name: 'Xbox Series X|S' }],
    artworks: [{ image_id: 'ar1' }], videos: [{ video_id: 'E3Huy2cdih0' }, { video_id: 'x"><script>' }],
    websites: [{ url: 'https://store.steampowered.com/app/1245620/ELDEN_RING/' }, { url: 'https://www.xbox.com/en-US/games/store/elden-ring/9P3J' }],
    external_games: [{ url: 'https://store.playstation.com/en-us/product/UP0700-PPSA04609_00' }],
  }, CATS);
  assert.equal(l.steam_appid, 1245620);
  assert.match(l.store_ps, /\/pt-br\//);
  assert.match(l.store_xbox, /\/pt-BR\//);
  assert.equal(l.category_id, CATS.rpg);
  assert.deepEqual(l.platforms.sort(), ['PC', 'PlayStation', 'Xbox']);
  assert.deepEqual(l.videos, ['E3Huy2cdih0']);            // id malicioso descartado
  assert.equal(l.description_lang, 'en');
});

test('IGDB: terror vence ação; jogo só de celular é Mobile', () => {
  assert.equal(categoria({ genres: [{ name: 'Shooter' }], themes: [{ name: 'Horror' }] }, ['PC']), 'fps'); // Half-Life, BioShock
  assert.equal(categoria({ genres: [{ name: 'Shooter' }], themes: [{ name: 'Horror' }, { name: 'Survival' }], keywords: [{ name: 'Survival Horror' }] }, ['PC']), 'terror'); // Resident Evil
  assert.equal(categoria({ genres: [{ name: 'Adventure' }], themes: [{ name: 'Horror' }, { name: 'Survival' }] }, ['PC']), 'terror'); // sem palavras-chave: terror + sobrevivência
  assert.equal(categoria({ genres: [{ name: 'Adventure' }], themes: [{ name: 'Horror' }], keywords: [{ name: 'superhero' }] }, ['PC']), 'aventura'); // Batman: só clima sombrio
  assert.equal(categoria({ genres: [{ name: 'Adventure' }], themes: [{ name: 'Horror' }] }, ['PC']), 'aventura');
  assert.equal(categoria({ genres: [{ name: 'Strategy' }] }, plataformas({ platforms: [{ abbreviation: 'iOS' }, { abbreviation: 'Android' }] })), 'mobile');
});

test('Idioma: detecta português e inglês', () => {
  assert.equal(idioma('Uma aventura de ação em que você explora um vasto mundo aberto.'), 'pt');
  assert.equal(idioma('An action adventure where you explore a vast open world.'), 'en');
});

test('Login: confirma com a chave pública quando a secreta é recusada (bug "Entre na sua conta")', async () => {
  const antigo = globalThis.fetch;
  globalThis.fetch = async (_u, o) => o.headers.apikey.startsWith('sb_publishable_') && o.headers.Authorization === 'Bearer bom'
    ? new Response(JSON.stringify({ id: 'u1' })) : new Response('{}', { status: 401 });
  try {
    const req = (tok, apikey) => new Request('https://s/f', { headers: { Authorization: 'Bearer ' + tok, ...(apikey ? { apikey } : {}) } });
    assert.equal((await usuarioLogado(req('bom', 'sb_publishable_x'), 'https://x.supabase.co/rest/v1/', 'sb_secret_x')).usuario.id, 'u1');
    assert.ok((await usuarioLogado(req('ruim', 'sb_publishable_x'), 'https://x.supabase.co', 'sb_secret_x')).erro);
    assert.ok((await usuarioLogado(req('bom'), 'https://x.supabase.co', 'sb_secret_x')).erro);
  } finally { globalThis.fetch = antigo; }
});

test('TURN próprio: credencial no padrão do coturn e recusa de outros sites', async () => {
  process.env.TURN_URL = 'turn:casa.duckdns.org:3478'; process.env.TURN_SECRET = 'segredo';
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  const fn = (await import('../netlify/functions/turn.mjs')).default;
  const r = await fn(new Request('https://site.netlify.app/.netlify/functions/turn', { headers: { origin: 'https://site.netlify.app' } }));
  const s = (await r.json()).iceServers[0];
  assert.equal(s.credential, createHmac('sha1', 'segredo').update(s.username).digest('base64'));
  assert.ok(s.urls.includes('turn:casa.duckdns.org:3478?transport=tcp'));
  const r2 = await fn(new Request('https://site.netlify.app/.netlify/functions/turn', { headers: { origin: 'https://outro.com' } }));
  assert.equal(r2.status, 403);
});

test('Push: só aceita envio com o segredo e devolve a chave pública', async () => {
  Object.assign(process.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', PUSH_SECRET: 's3' });
  const fn = (await import('../netlify/functions/push.mjs')).default;
  assert.equal((await (await fn(new Request('https://s/f'))).json()).publicKey, 'pub');
  assert.equal((await fn(new Request('https://s/f', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal((await fn(new Request('https://s/f', { method: 'POST', headers: { 'x-push-secret': 'errado' }, body: '{}' }))).status, 401);
});

test('Ao vivo: ignora nomes inválidos sem chamar a Twitch', async () => {
  process.env.IGDB_CLIENT_ID = 'c'; process.env.IGDB_CLIENT_SECRET = 's';
  const fn = (await import('../netlify/functions/ao-vivo.mjs')).default;
  const r = await fn(new Request('https://s/f?logins=<script>,a'));
  assert.deepEqual((await r.json()).ao_vivo, []);
});
