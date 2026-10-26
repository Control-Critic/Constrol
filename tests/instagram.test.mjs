import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarLegenda, hashtags, tagDoJogo, contarEmojis, escolherChamada } from '../scripts/instagram/legenda.mjs';
import { ordemDeFormatos, usadosRecentes, podeReels, HORARIOS } from '../scripts/instagram/rotacao.mjs';
import { contarVotos } from '../scripts/instagram/formatos.mjs';

const h = (tipo, horario, horasAtras, extra = {}) => ({ tipo, horario, created_at: new Date(Date.now() - horasAtras * 3600e3).toISOString(), ...extra });

test('hashtags: sempre entre 5 e 8, sem genéricas inúteis, com marca', () => {
  for (const args of [{}, { jogos: ['Elden Ring'] }, { jogos: ['A', 'Hollow Knight', 'Celeste'], plataformas: ['PC', 'PlayStation 5', 'Xbox', 'Nintendo Switch'], lojas: ['steam'], indie: true, extras: ['#a', '#b'] }]) {
    const t = hashtags(args);
    assert.ok(t.length >= 5 && t.length <= 8, `${t.length}: ${t}`);
    assert.ok(t.includes('#controlcritic'));
    assert.ok(!t.some((x) => /instagood|viral|follow/i.test(x)));
    assert.equal(new Set(t).size, t.length);
  }
  assert.ok(hashtags({ plataformas: ['PlayStation 5'] }).includes('#playstationbr'));
});

test('tag do jogo: sem acento e sem símbolo', () => {
  assert.equal(tagDoJogo('Elden Ring: Nightreign'), '#eldenringnightreign');
  assert.equal(tagDoJogo('Pokémon'), '#pokemon');
  assert.equal(tagDoJogo('A'), null);
});

test('legenda: gancho na 1ª linha, convite e hashtags no fim, poucos emojis', () => {
  const tags = hashtags({ jogos: ['Hades'] });
  const l = montarLegenda({ gancho: 'Jogo bom por menos de R$ 30 hoje 💸', contexto: ['• Hades: R$ 20'], convite: 'Vale a pena? Comenta aí.', chamada: escolherChamada('promo'), tags });
  const linhas = l.split('\n');
  assert.match(linhas[0], /^Jogo bom/);
  assert.equal(linhas.at(-1), tags.join(' '));
  assert.ok(l.includes('Comenta aí'));
  assert.ok(contarEmojis(l) <= 5);
});

test('rotação: nunca repete o tipo anterior', () => {
  const { ordem } = ordemDeFormatos('manha', [h('precos', 'noite', 2)]);
  assert.notEqual(ordem[0], 'precos');
  assert.ok(!ordem.includes('precos'));
});

test('rotação: o formato há mais tempo sem sair naquele horário vai primeiro', () => {
  const hist = [h('noticias', 'noite', 24), h('opiniao', 'noite', 48), h('meme', 'meio', 20)];
  const { ordem } = ordemDeFormatos('noite', hist);
  assert.equal(ordem[0], 'top-genero');   // nunca saiu à noite
  assert.ok(ordem.indexOf('opiniao') < ordem.indexOf('noticias'));
});

test('rotação: formato que salva 1,5x mais passa na frente (com 3+ medições)', () => {
  const hist = [h('meme', 'meio', 2), ...[30, 54, 78].map((x) => h('zerou-largou', 'meio', x, { salvamentos: 30 })), ...[40, 64, 90].map((x) => h('versus', 'meio', x, { salvamentos: 5 }))];
  assert.equal(ordemDeFormatos('meio', hist).ordem[0], 'zerou-largou');
});

test('rotação: posts com erro não contam como "anterior"', () => {
  assert.equal(ordemDeFormatos('manha', [h('precos', 'manha', 1, { erro: 'limite' })]).anterior, undefined);
});

test('48 h sem repetir jogo e notícia', () => {
  const u = usadosRecentes([h('precos', 'manha', 10, { game_ids: [1, 2] }), h('noticias', 'noite', 60, { game_ids: [3], news_ids: [9] })]);
  assert.ok(u.jogos.has(1) && !u.jogos.has(3) && !u.noticias.has(9));
});

test('Reels: no máximo 1 por dia e só à noite', () => {
  assert.equal(podeReels('manha', []), false);
  assert.equal(podeReels('noite', []), true);
  assert.equal(podeReels('noite', [h('noticias', 'noite', 0.1, { formato: 'reels' })]), false);
});

test('todos os formatos da rotação existem', async () => {
  const { FORMATOS } = await import('../scripts/instagram/formatos.mjs');
  for (const t of Object.values(HORARIOS).flat()) assert.ok(FORMATOS[t], t);
});

test('votos do versus: só conta A ou B no começo do comentário', () => {
  assert.deepEqual(contarVotos(['A', 'b!', 'Letra A', 'acho que B', 'Amo os dois', 'B com certeza', 'a)']), { a: 3, b: 2 });
});

test('rotação: sem histórico, o primeiro formato muda a cada dia', () => {
  const dia = 864e5, base = Date.UTC(2026, 9, 26, 15);
  const primeiros = [0, 1, 2].map((i) => ordemDeFormatos('meio', [], base + i * dia).ordem[0]);
  assert.equal(new Set(primeiros).size, 3);
});
