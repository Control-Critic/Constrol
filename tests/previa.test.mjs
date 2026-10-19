// Fase 12: metadados para robôs (prévia de links e Google)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import previa from '../netlify/edge-functions/previa.js';

const html = readFileSync('jogo.html', 'utf8');
const ctx = { next: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) };
const robo = { 'user-agent': 'Googlebot/2.1' };
const fetchReal = globalThis.fetch;

test('jogo: título, descrição, canonical, og e JSON-LD sem nota quando não há avaliações', async () => {
  globalThis.fetch = async () => Response.json([{ title: 'Jogo <X>', slug: 'jogo-x', description: 'Descrição', cover_url: 'https://img/x.jpg', avg_rating: 0, reviews_count: 0, platforms: ['PC'] }]);
  try {
    const r = await previa(new Request('https://control-critic.netlify.app/jogo.html?slug=jogo-x&utm=1', { headers: robo }), ctx);
    const h = await r.text();
    assert.match(h, /<title>Jogo &lt;X&gt; \| Control Critic<\/title>/);
    assert.match(h, /<link rel="canonical" href="https:\/\/control-critic.netlify.app\/jogo.html\?slug=jogo-x">/);
    assert.equal((h.match(/property="og:title"/g) || []).length, 1, 'og:title duplicado');
    assert.equal((h.match(/name="description"/g) || []).length, 1, 'description duplicada');
    const ld = JSON.parse(h.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(ld['@type'], 'VideoGame');
    assert.equal(ld.aggregateRating, undefined, 'nota inventada sem avaliações');
  } finally { globalThis.fetch = fetchReal; }
});

test('jogo com avaliações reais ganha AggregateRating; plural correto', async () => {
  globalThis.fetch = async () => Response.json([{ title: 'Y', slug: 'y', avg_rating: 4.5, reviews_count: 1 }]);
  try {
    const h = await (await previa(new Request('https://s/jogo.html?slug=y', { headers: robo }), ctx)).text();
    assert.match(h, /1 avaliação\./);
    assert.match(h, /"ratingCount":1/);
  } finally { globalThis.fetch = fetchReal; }
});

test('comunidade privada: noindex e sem descrição', async () => {
  globalThis.fetch = async () => Response.json([{ name: 'Secreta', description: 'não pode vazar', members_count: 3, is_private: true }]);
  try {
    const h = await (await previa(new Request('https://s/comunidade.html?id=5', { headers: robo }), ctx)).text();
    assert.match(h, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(h, /não pode vazar/);
  } finally { globalThis.fetch = fetchReal; }
});

test('pessoas recebem a página sem alteração', async () => {
  const r = await previa(new Request('https://s/jogo.html?slug=x', { headers: { 'user-agent': 'Mozilla/5.0 Chrome/130' } }), ctx);
  assert.equal(await r.text(), html);
});
