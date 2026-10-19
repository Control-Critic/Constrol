// Registra início e fim de um robô do GitHub Actions na tabela robot_runs (painel Admin → Status).
//   node scripts/registrar-robo.mjs <robo> inicio
//   node scripts/registrar-robo.mjs <robo> fim <success|failure|cancelled>
// Nunca derruba o robô: se o registro falhar, só avisa no log.
import { supabaseRest } from '../lib/igdb.mjs';

const [robo, fase, status] = process.argv.slice(2);
const env = (k) => (process.env[k] || '').trim();
try {
  if (!/^[a-z-]{2,40}$/.test(robo || '') || !['inicio', 'fim'].includes(fase)) throw new Error('uso: <robo> inicio|fim [status]');
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) throw new Error('sem segredos do Supabase');
  const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));
  const execucao = env('GITHUB_RUN_ID') ? `execução ${env('GITHUB_RUN_ID')}` : 'manual';
  const linha = fase === 'inicio'
    ? { robo, inicio: new Date().toISOString(), fim: null, ok: null, resumo: `rodando (${execucao})` }
    : { robo, fim: new Date().toISOString(), ok: status === 'success', resumo: `${status === 'success' ? 'concluído' : status === 'cancelled' ? 'cancelado' : 'falhou'} (${execucao})` };
  await api('robot_runs?on_conflict=robo', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [linha] });
  console.log(`robô ${robo}: ${fase} registrado`);
} catch (e) { console.log(`::warning::Não foi possível registrar o robô: ${String(e.message).slice(0, 120)}`); }
