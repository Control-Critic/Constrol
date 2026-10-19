// Abre um backup cifrado do Control Critic, confere a integridade e (opcionalmente) gera SQL para restaurar.
//   BACKUP_SENHA=... node scripts/restaurar-backup.mjs backup-2026-10-19 --verificar
//   BACKUP_SENHA=... node scripts/restaurar-backup.mjs backup-2026-10-19 --sql > restaurar.sql
// O SQL usa "on conflict do nothing" e deve ser rodado num banco de TESTE (staging) primeiro, com o schema.sql já aplicado.
// Nada é impresso em claro na tela além de contagens.
import { readFileSync, existsSync } from 'node:fs';
import { decifrar, sha256 } from '../lib/cofre.mjs';

const [pasta, modo = '--verificar'] = process.argv.slice(2);
const senha = (process.env.BACKUP_SENHA || '').trim();
if (!pasta || !existsSync(`${pasta}/manifesto.json`)) { console.error('Uso: node scripts/restaurar-backup.mjs <pasta-do-backup> [--verificar|--sql]'); process.exit(2); }
if (!senha) { console.error('Defina BACKUP_SENHA (a mesma do segredo do GitHub).'); process.exit(2); }

const man = JSON.parse(readFileSync(`${pasta}/manifesto.json`, 'utf8'));
let erros = 0;
const saida = [];
if (modo === '--sql') saida.push("-- Restauração gerada por scripts/restaurar-backup.mjs\nbegin;\nselect set_config('cc.sistema', 'on', true);");
for (const [tabela, info] of Object.entries(man.tabelas)) {
  const arq = `${pasta}/${tabela}.json.enc`;
  try {
    const cifrado = readFileSync(arq);
    if (sha256(cifrado) !== info.sha256_cifrado) throw new Error('arquivo alterado ou corrompido (hash do cifrado não confere)');
    const claro = decifrar(cifrado, senha);
    if (sha256(claro) !== info.sha256_claro) throw new Error('conteúdo não confere com o manifesto');
    const linhas = JSON.parse(claro);
    if (linhas.length !== info.linhas) throw new Error(`esperava ${info.linhas} linhas, achou ${linhas.length}`);
    if (modo === '--sql' && linhas.length) {
      const json = JSON.stringify(linhas).replace(/'/g, "''");
      saida.push(`insert into public.${tabela} select * from jsonb_populate_recordset(null::public.${tabela}, '${json}'::jsonb) on conflict do nothing;`);
    }
    console.error(`✓ ${tabela}: ${linhas.length} linhas`);
  } catch (e) { erros++; console.error(`✗ ${tabela}: ${e.message}`); }
}
if (modo === '--sql') { saida.push('commit;'); console.log(saida.join('\n')); }
if (erros) { console.error(`\n${erros} tabela(s) com problema.`); process.exit(1); }
console.error('\nBackup íntegro.');
