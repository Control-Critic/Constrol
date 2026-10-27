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
  assert.ok(!['noticias', 'opiniao'].includes(ordem[0]));   // um que nunca saiu à noite vai primeiro
  assert.ok(ordem.indexOf('opiniao') < ordem.indexOf('noticias'));
});

test('rotação: formato que salva 1,5x mais passa na frente (com 3+ medições)', () => {
  const hist = [h('meme', 'meio', 2), ...[30, 54, 78].map((x) => h('zerou-largou', 'noite', x, { salvamentos: 30 })), ...[40, 64, 90].map((x) => h('versus', 'noite', x, { salvamentos: 5 })),
    ...['noticias', 'opiniao', 'critica-comunidade', 'superestimado', 'versus-resultado', 'top-genero'].map((t, i) => h(t, 'noite', 20 + i))];
  assert.equal(ordemDeFormatos('noite', hist).ordem[0], 'zerou-largou');
});

test('rotação: posts com erro não contam como "anterior"', () => {
  assert.equal(ordemDeFormatos('manha', [h('precos', 'manha', 1, { erro: 'limite' })]).anterior, undefined);
});

test('48 h sem repetir jogo e notícia', () => {
  const u = usadosRecentes([h('precos', 'manha', 10, { game_ids: [1, 2] }), h('noticias', 'noite', 60, { game_ids: [3], news_ids: [9] })]);
  assert.ok(u.jogos.has(1) && !u.jogos.has(3) && !u.noticias.has(9));
});

test('Reels: no máximo 1 por dia, e é o meme do meio-dia', () => {
  assert.equal(podeReels('noite', [], Date.now(), 'noticias'), false);
  assert.equal(podeReels('meio', [], Date.now(), 'meme-auto'), true);
  assert.equal(podeReels('meio', [], Date.now(), 'meme'), true);
  assert.equal(podeReels('meio', [h('meme-auto', 'meio', 0.1, { formato: 'reels' })], Date.now(), 'meme'), false);
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
  const primeiros = [0, 1, 2].map((i) => ordemDeFormatos('noite', [], base + i * dia).ordem[0]);
  assert.equal(new Set(primeiros).size, 3);
});

test('notícia sem jogo ligado: acha o jogo citado no título (o nome mais longo)', async () => {
  const { acharJogo } = await import('../scripts/instagram/formatos.mjs');
  const jogos = [{ id: 1, title: 'Elden Ring' }, { id: 2, title: 'Elden Ring: Nightreign' }, { id: 3, title: 'Ori' }, { id: 4, title: 'Hades' }];
  assert.equal(acharJogo('Elden Ring Nightreign ganha DLC', jogos)?.id, 2);
  assert.equal(acharJogo('Novo patch de Elden Ring corrige bugs', jogos)?.id, 1);
  assert.equal(acharJogo('Original da Nintendo volta', jogos), null);   // "Ori" curto não confunde
  assert.equal(acharJogo('Mercado de games cresce', jogos), null);
});

test('meio-dia: meme todo dia (o da comunidade na frente; sem ele, o automático)', () => {
  assert.deepEqual(ordemDeFormatos('meio', [h('meme-auto', 'meio', 24), h('noticias', 'noite', 18)]).ordem.slice(0, 2), ['meme', 'meme-auto']);
  assert.deepEqual(ordemDeFormatos('meio', []).ordem.slice(0, 2), ['meme', 'meme-auto']);
});

test('memes automáticos: originais, sem repetir e só com os dados de que precisam', async () => {
  const { MEMES, escolherMeme, preencher } = await import('../scripts/instagram/memes.mjs');
  assert.ok(MEMES.length >= 120);
  assert.equal(new Set(MEMES.map((m) => m.id)).size, MEMES.length);
  for (const m of MEMES) for (const t of [m.topo, m.baixo]) for (const [, k] of t.matchAll(/\{(\w+)\}/g)) assert.ok(m.usa, `${m.id} usa {${k}} sem dizer de onde vem`);
  assert.equal(preencher('A {loja}: {jogo}', { jogo: 'Hades' }), null);   // falta dado: não serve
  const semDados = escolherMeme({ dados: {} });
  assert.ok(!semDados.m.usa);
  const todos = new Set(MEMES.filter((m) => !m.usa).map((m) => m.id));
  todos.delete('backlog');
  assert.equal(escolherMeme({ usados: todos, dados: {} }).m.id, 'backlog');
  const p = escolherMeme({ usados: new Set(MEMES.filter((m) => m.id !== 'nao-compro-mais').map((m) => m.id)), dados: { promo: { jogo: 'Hades', preco: 'R$ 9,90', loja: 'Steam', desconto: 75 } } });
  assert.equal(p.baixo, 'A Steam: Hades por R$ 9,90');
});

test('memes: todo texto cabe inteiro nos dois layouts (nada cortado com "…")', async () => {
  const { MEMES, preencher } = await import('../scripts/instagram/memes.mjs');
  const { ajustarTitulo } = await import('../scripts/instagram/arte.mjs');
  const exemplo = { promo: { jogo: 'The Witcher 3: Wild Hunt', preco: 'R$ 199,90', loja: 'PlayStation Store', desconto: 85 }, popular: { jogo: 'Red Dead Redemption 2', nota: 93 } };
  for (const m of MEMES) for (const t of [m.topo, m.baixo]) {
    const texto = preencher(t, exemplo[m.usa]);
    for (const [larg, linhas, tams] of [[968, 3, [76, 66, 58, 50]], [968, 3, [80, 70, 60, 52]], [560, 4, [64, 56, 48, 42]]])
      assert.ok(!ajustarTitulo(texto, larg, linhas, tams).linhas.join(' ').endsWith('…'), `${m.id}: "${texto}" não cabe`);
  }
});

test('música dos Reels: WAV válido, com som, sem distorção e diferente a cada semente', async () => {
  const { comporMusica } = await import('../scripts/instagram/musica.mjs');
  const a = comporMusica({ segundos: 6, semente: 7 }), b = comporMusica({ segundos: 6, semente: 8 });
  assert.equal(a.wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(a.wav.length, 44 + 6 * 44100 * 4);
  let soma = 0, pico = 0;
  for (let i = 44; i < a.wav.length; i += 2) { const v = a.wav.readInt16LE(i); soma += v * v; pico = Math.max(pico, Math.abs(v)); }
  assert.ok(Math.sqrt(soma / ((a.wav.length - 44) / 2)) > 1000, 'muito baixa');
  assert.ok(pico < 32767, 'distorcida');
  assert.ok(!a.wav.equals(b.wav));
  assert.ok(comporMusica({ segundos: 2, semente: 7 }).wav.equals(comporMusica({ segundos: 2, semente: 7 }).wav));   // mesma semente, mesma música
});
