// Falha se algum arquivo publicado pelo site passar do limite (evita deixar o app pesado sem perceber).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const LIMITE = 1.5 * 1024 * 1024;
const IGNORAR = /^(node_modules|scripts|supabase|lib|netlify|tests|ponte-discord|turn-proprio|turn-caseiro|docs|\.git|\.github)$/;
const grandes = [];
(function andar(dir) {
  for (const n of readdirSync(dir)) {
    if (dir === '.' && IGNORAR.test(n)) continue;
    const c = join(dir, n), s = statSync(c);
    if (s.isDirectory()) andar(c); else if (s.size > LIMITE) grandes.push(`${c} (${(s.size / 1048576).toFixed(1)} MB)`);
  }
})('.');
if (grandes.length) { console.error('Arquivos públicos grandes demais:\n  ' + grandes.join('\n  ')); process.exit(1); }
console.log('OK: nenhum arquivo público acima de 1,5 MB.');
