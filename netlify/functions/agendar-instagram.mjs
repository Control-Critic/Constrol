// Relógio do robô do Instagram. O agendamento do GitHub Actions atrasa horas (ou pula) em repositórios gratuitos,
// então quem dispara o robô no horário certo é esta função agendada da Netlify, que é pontual.
// Roda nos minutos 20 e 50 de cada hora (UTC) e só age nos horários do robô; os agendamentos do GitHub ficam de reserva.
// Toda execução vai com "só se faltar": se o post daquele horário já saiu, o robô não publica de novo.
// Usa o mesmo GITHUB_DISPARO_TOKEN do botão "Postar agora" (Netlify → Environment variables).
import { buscar, registrarErro } from '../../lib/http.mjs';

const env = (k) => (process.env[k] || '').trim();
const REPO = 'Control-Critic/Constrol';
// hora:minuto em UTC -> modo do robô (Brasília = UTC-3)
export const HORARIOS = {
  '12:20': 'manha', '12:50': 'manha',                    // 09h20 e reserva 09h50
  '15:50': 'entretenimento', '16:20': 'entretenimento',  // 12h50 e reserva 13h20
  '21:50': 'diario', '22:20': 'diario',                  // 18h50 e reserva 19h20
};
export const modoDaHora = (d = new Date()) => HORARIOS[`${String(d.getUTCHours()).padStart(2, '0')}:${String(Math.round(d.getUTCMinutes() / 10) * 10 % 60).padStart(2, '0')}`] || null;

export default async () => {
  const modo = modoDaHora();
  if (!modo) return new Response('fora do horário');
  if (!env('GITHUB_DISPARO_TOKEN')) { console.log('Sem GITHUB_DISPARO_TOKEN: o robô fica só com o agendamento do GitHub.'); return new Response('sem token'); }
  const r = await buscar(`https://api.github.com/repos/${REPO}/actions/workflows/instagram.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('GITHUB_DISPARO_TOKEN')}`, Accept: 'application/vnd.github+json', 'User-Agent': 'control-critic', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { modo, so_se_faltar: true } }),
  }).catch((e) => { registrarErro('agendar-instagram', e); return { ok: false, status: 0 }; });
  console.log(`Instagram: disparo do modo ${modo} -> ${r.ok ? 'ok' : `falhou (${r.status})`}`);
  return new Response(r.ok ? 'ok' : 'falhou', { status: r.ok ? 200 : 502 });
};

export const config = { schedule: '20,50 * * * *' };
