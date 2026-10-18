import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escolherVersus, franquia } from '../scripts/instagram/versus.mjs';

const cats = [{ id: 1, name: 'Ação', slug: 'acao' }, { id: 2, name: 'Puzzle', slug: 'puzzle' }, { id: 3, name: 'Mundo aberto', slug: 'aberto' }, { id: 4, name: 'Terror', slug: 'terror' }];
const j = (id, title, ids, ano) => ({ id, title, category_id: ids[0], category_ids: ids, release_year: ano });

test('franquia reconhece séries', () => {
  assert.equal(franquia('Resident Evil 2'), franquia('Resident Evil Village'.replace(' Village', ' 4')));
  assert.notEqual(franquia('Portal 2'), franquia('Grand Theft Auto V'));
});

test('não junta jogos que só dividem uma categoria (Portal x GTA)', () => {
  const jogos = [j(1, 'Portal 2', [1, 2], 2011), j(2, 'Grand Theft Auto V', [1, 3], 2013)];
  for (let i = 0; i < 20; i++) assert.equal(escolherVersus(jogos, cats, new Set(), Math.random), null);
});

test('junta jogos parecidos e explica o motivo', () => {
  const jogos = [j(1, 'Outlast', [1, 4], 2013), j(2, 'Alien Isolation', [1, 4], 2014), j(3, 'Portal 2', [1, 2], 2011)];
  const p = escolherVersus(jogos, cats, new Set(), () => 0);
  assert.deepEqual([p.a.id, p.b.id].sort(), [1, 2]);
  assert.match(p.motivo, /terror/);
});

test('rivalidade clássica e pares já usados', () => {
  const jogos = [j(1, 'Dark Souls III', [1], 2016), j(2, 'Elden Ring', [3], 2022)];
  const p = escolherVersus(jogos, cats, new Set(), () => 0);
  assert.equal(p.rotulo, 'Rivalidade clássica');
  assert.equal(escolherVersus(jogos, cats, new Set(['1-2']), () => 0), null);
});
