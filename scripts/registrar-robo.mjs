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
  const agora = new Date().toISOString();
  if (fase === 'inicio') {
    await api('robot_runs?on_conflict=robo', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ robo, inicio: agora, fim: null, ok: null, resumo: `rodando (${execucao})` }] });
  } else {
    // No fim, só atualiza a linha do início (um "upsert" sem a coluna inicio é recusado pelo banco: ela é obrigatória)
    const fim = { fim: agora, ok: status === 'success', resumo: `${status === 'success' ? 'concluído' : status === 'cancelled' ? 'cancelado' : 'falhou'} (${execucao})` };
    const atualizadas = await api(`robot_runs?robo=eq.${robo}`, { method: 'PATCH', prefer: 'return=representation', body: fim });
    if (!atualizadas?.length) await api('robot_runs', { method: 'POST', body: [{ robo, inicio: agora, ...fim }] });   // o início não foi registrado
  }
  console.log(`robô ${robo}: ${fase} registrado`);
} catch (e) { console.log(`::warning::Não foi possível registrar o robô: ${String(e.message).slice(0, 120)}`); }
