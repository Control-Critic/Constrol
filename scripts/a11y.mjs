// Verificação automática de acessibilidade (axe-core, WCAG 2.2 A/AA) nas páginas públicas.
//   node scripts/a11y.mjs [url-base]   (padrão: sobe um servidor local na pasta do site)
// Não substitui o teste manual com teclado e leitor de tela; pega erros óbvios antes do merge.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PAGINAS = ['index.html', 'jogos.html', 'novidades.html', 'promocoes.html', 'comunidades.html', 'conquistas.html', 'entrar.html', 'sobre.html', 'contato.html', 'diretrizes.html', 'privacidade.html', 'termos.html', '404.html', 'offline.html'];

let base = process.argv[2], srv;
if (!base) {
  srv = spawn('python3', ['-m', 'http.server', '8790'], { stdio: 'ignore' });
  base = 'http://127.0.0.1:8790';
  await new Promise((r) => setTimeout(r, 1200));
}
const local = process.env.CHROMIUM_PATH; // ambiente com Chromium próprio (sem o headless antigo)
const b = await chromium.launch(local ? { executablePath: local, args: ['--no-sandbox', '--headless=new'], headless: false } : { args: ['--no-sandbox'] });
let falhas = 0;
try {
  for (const p of PAGINAS) {
    const pg = await b.newPage();
    await pg.goto(`${base}/${p}`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    await pg.addScriptTag({ content: axe });
    const vs = await pg.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations
      .filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`));
    if (vs.length) { falhas += vs.length; console.log(`✗ ${p}\n  ${vs.join('\n  ')}`); } else console.log(`✓ ${p}`);
    await pg.close();
  }
} finally { await b.close(); srv?.kill(); }
if (falhas) { console.error(`\n${falhas} problema(s) graves de acessibilidade.`); process.exit(1); }
