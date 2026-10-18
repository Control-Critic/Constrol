import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, urlSegura, paginaInterna, corSegura, cssUrl, plural } from '../js/seguro.js';

const XSS = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "' onmouseover='alert(1)", '<svg/onload=alert(1)>', '&lt;b&gt;'];

test('esc neutraliza os 5 caracteres especiais, inclusive o apóstrofo', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  for (const p of XSS) assert.doesNotMatch(esc(p), /[<>"']/);
  assert.equal(esc(null), ''); assert.equal(esc(undefined), ''); assert.equal(esc(0), '0');
});

test('urlSegura só aceita http(s) e caminhos relativos', () => {
  for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com/x?<'])
    assert.equal(urlSegura(u), '', u);
  assert.equal(urlSegura('https://exemplo.com/a.png?x=1&y="2"'), 'https://exemplo.com/a.png?x=1&amp;y=&quot;2&quot;');
  assert.equal(urlSegura('img/perfil.png'), 'img/perfil.png');
});

test('paginaInterna recusa esquemas e domínios externos', () => {
  for (const u of ['javascript:alert(1)', 'https://evil.com', '//evil.com', 'data:x', '/a"><script>']) assert.equal(paginaInterna(u), '#', u);
  assert.equal(paginaInterna('/jogo.html?slug=gta-v'), '/jogo.html?slug=gta-v');
  assert.equal(paginaInterna('perfil.html?u=ana&aba=posts'), 'perfil.html?u=ana&amp;aba=posts');
});

test('corSegura aceita só hexadecimal', () => {
  assert.equal(corSegura('#ffd33c'), '#ffd33c');
  for (const c of ['red;background:url(https://evil)', 'expression(alert(1))', '#ff"', '']) assert.equal(corSegura(c), '#888', c);
});

test('cssUrl não deixa sair de url(\'...\')', () => {
  assert.equal(cssUrl("https://x.com/a');background:url('https://evil/t"), '');
  assert.equal(cssUrl('https://x.com/a b.png'), '');
  assert.equal(cssUrl('javascript:alert(1)'), '');
  assert.equal(cssUrl('https://x.supabase.co/storage/v1/object/public/media/a.webp'), 'https://x.supabase.co/storage/v1/object/public/media/a.webp');
});

test('plural em português', () => {
  assert.equal(plural(1, 'jogo'), '1 jogo');
  assert.equal(plural(2, 'jogo'), '2 jogos');
  assert.equal(plural(0, 'avaliação', 'avaliações'), '0 avaliações');
  assert.equal(plural(1, 'avaliação', 'avaliações'), '1 avaliação');
  assert.equal(plural(2, 'comentário'), '2 comentários');
  assert.equal(plural(14000, 'jogo'), '14.000 jogos');
  assert.equal(plural(undefined, 'jogo'), '0 jogos');
});

test('nenhum texto com (s)/(ões)/(ns) visível nos módulos', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) {
    const achados = readFileSync(`js/${f}`, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l))
      .flatMap((l) => l.match(/[a-zà-ú]+\((s|es|ões|ns)\)/gi) || []).filter((m) => !/^(https?|esc|test|append|push|\w*seguro)\(/i.test(m));
    assert.deepEqual(achados, [], f);
  }
});
