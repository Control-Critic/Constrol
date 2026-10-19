// Backup semanal das tabelas do Control Critic (GitHub Actions guarda por 90 dias).
// O repositório é PÚBLICO: artefatos podem ser baixados por qualquer pessoa logada no GitHub. Por isso cada
// tabela é CIFRADA (AES-256-GCM) com a senha BACKUP_SENHA; sem a senha, o backup não roda.
// Não inclui senhas, e-mails, inscrições de push nem segredos do app.
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY e BACKUP_SENHA (mínimo 16 caracteres).
// Restaurar/verificar: node scripts/restaurar-backup.mjs <pasta> [--verificar]
import { mkdirSync, writeFileSync } from 'node:fs';
import { supabaseRest } from '../lib/igdb.mjs';
import { cifrar, sha256 } from '../lib/cofre.mjs';

const env = (k) => (process.env[k] || '').trim();
if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) { console.error('::error::Segredos SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes.'); process.exit(1); }
if (env('BACKUP_SENHA').length < 16) { console.error('::error::Crie o segredo BACKUP_SENHA (16+ caracteres) no GitHub. Sem ele o backup não é gerado, para não publicar dados.'); process.exit(1); }
const api = supabaseRest(env('SUPABASE_URL'), env('SUPABASE_SERVICE_KEY'));

// Ordem pensada para restaurar (tabelas "pai" primeiro)
const TABELAS = ['categories', 'settings', 'site_titles', 'cosmetics', 'profiles', 'games', 'deals', 'price_history', 'news', 'reviews', 'review_votes', 'review_comments',
  'communities', 'community_secrets', 'community_members', 'community_requests', 'posts', 'events', 'event_attendees', 'user_games', 'user_lists', 'list_items',
  'follows', 'friendships', 'direct_messages', 'lfg_posts', 'lfg_interest', 'user_cosmetics', 'notifications', 'reports', 'contact_messages', 'xp_log', 'admin_log',
  // tabelas que surgiram depois (antes ficavam fora do backup)
  'post_comments', 'post_likes', 'stories', 'story_views', 'story_votes', 'story_reactions', 'close_friends', 'challenges', 'user_blocks', 'appeals', 'app_feedback', 'review_vote_xp', 'discord_bridges'];
const manifesto = {};

const pasta = `backup-${new Date().toISOString().slice(0, 10)}`;
mkdirSync(pasta, { recursive: true });
const resumo = [];
for (const t of TABELAS) {
  const linhas = [];
  try {
    for (let de = 0; ; de += 1000) {
      const lote = await api(`${t}?select=*&limit=1000&offset=${de}`);
      linhas.push(...lote);
      if (lote.length < 1000) break;
    }
    const claro = Buffer.from(JSON.stringify(linhas));
    const cifrado = cifrar(claro, env('BACKUP_SENHA'));
    writeFileSync(`${pasta}/${t}.json.enc`, cifrado);
    manifesto[t] = { linhas: linhas.length, sha256_claro: sha256(claro), sha256_cifrado: sha256(cifrado) }; // integridade
    resumo.push(`${t}: ${linhas.length}`);
  } catch (e) {
    resumo.push(`${t}: não exportada (${String(e.message).replace(/https?:\/\/\S+/g, '[url]').slice(0, 80)})`);
  }
}
writeFileSync(`${pasta}/manifesto.json`, JSON.stringify({ criado: new Date().toISOString(), formato: 'CCB1 AES-256-GCM + scrypt', tabelas: manifesto }, null, 1));
writeFileSync(`${pasta}/LEIA-ME.txt`, `Backup CIFRADO do Control Critic em ${new Date().toISOString()}\nPara abrir: node scripts/restaurar-backup.mjs ${pasta} --verificar (com BACKUP_SENHA).\n\n${resumo.join('\n')}\n`);
console.log(`::notice::Backup concluído: ${resumo.join(' · ')}`);
