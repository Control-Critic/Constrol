// Garante que todo nome importado de um módulo do site existe como export nele
// (um merge que apaga um export quebra páginas inteiras sem erro de sintaxe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const exportsDe = (arq) => {
  const s = readFileSync(arq, 'utf8'), nomes = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) nomes.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]+)\}/g)) for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) nomes.add(n); }
  return nomes;
};

test('todo import entre módulos de js/ aponta para um export que existe', () => {
  const faltando = [];
  for (const f of readdirSync('js').filter((x) => x.endsWith('.js'))) {
    const s = readFileSync(`js/${f}`, 'utf8');
    for (const m of s.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+\.js)'/g)) {
      const disponiveis = exportsDe(`js/${m[2]}`);
      for (const p of m[1].split(',')) {
        const nome = p.trim().split(/\s+as\s+/)[0].trim();
        if (nome && !disponiveis.has(nome)) faltando.push(`${f}: ${nome} (de ${m[2]})`);
      }
    }
  }
  assert.deepEqual(faltando, []);
});
