// Steam Web API compartilhada pela importação (site) e pelo robô semanal.
const chave = () => (process.env.STEAM_API_KEY || '').trim();

export async function steam(metodo, params, ms = 15000) {
  const q = new URLSearchParams({ key: chave(), format: 'json', ...params });
  const r = await fetch(`https://api.steampowered.com/${metodo}/?${q}`, { signal: AbortSignal.timeout(ms) });
  if (r.status === 403) throw Object.assign(new Error('Chave da Steam inválida no servidor.'), { status: 503 });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);
  return r.json();
}

// Conquistas da Steam, em lotes: a Steam exige uma consulta por jogo. O site pede de 12 em 12 (offset) até acabar;
// o robô semanal percorre todos. Grava conquistas por jogo, o total da pessoa e as 6 mais raras (vitrine do perfil).
const ICONE_OK = /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net)\//;
export async function importarConquistas(sid, jogos, porAppid, uid, api, { offset = 0, limite = 12 } = {}) {
  const jogados = jogos.filter((g) => g.playtime_forever > 0 && porAppid.has(g.appid)).sort((a, b) => b.playtime_forever - a.playtime_forever);
  const lote = jogados.slice(offset, offset + limite);
  // 4 jogos por vez (36 consultas simultâneas fazia a Steam recusar com "muitas requisições")
  const lerJogo = async (g) => {
    const [eu, glob, esq] = await Promise.all([
      steam('ISteamUserStats/GetPlayerAchievements/v1', { steamid: sid, appid: g.appid }, 10000),
      steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2', { gameid: g.appid }, 10000).catch(() => ({})),
      steam('ISteamUserStats/GetSchemaForGame/v2', { appid: g.appid, l: 'brazilian' }, 10000).catch(() => ({})),
    ]);
    const lista = eu.playerstats?.achievements || [];
    const pct = Object.fromEntries((glob.achievementpercentages?.achievements || []).map((a) => [a.name, Number(a.percent)]));
    const info = Object.fromEntries((esq.game?.availableGameStats?.achievements || []).map((a) => [a.name, a]));
    const feitas = lista.filter((a) => a.achieved === 1);
    return { g, total: lista.length, feitas: feitas.length,
      raras: feitas.map((a) => ({ jogo: g.name, nome: info[a.apiname]?.displayName || a.apiname, icone: info[a.apiname]?.icon || null, pct: pct[a.apiname] ?? 100 })) };
  };
  const res = [];
  for (let i = 0; i < lote.length; i += 4) res.push(...await Promise.allSettled(lote.slice(i, i + 4).map(lerJogo)));
  const erros = res.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason).slice(0, 120));
  const ok = res.filter((r) => r.status === 'fulfilled' && r.value.total).map((r) => r.value);
  let gravados = 0;
  for (const r of ok) {
    try { await api(`user_games?user_id=eq.${uid}&game_id=eq.${porAppid.get(r.g.appid)}`, { method: 'PATCH', body: { ach_done: r.feitas, ach_total: r.total } }); gravados++; }
    catch (e) { erros.push('gravar: ' + String(e.message).slice(0, 160)); }
  }
  // Total = soma de todos os jogos já lidos; raras = junta com as dos lotes anteriores (no 1º lote começa do zero)
  const anteriores = offset > 0 ? ((await api(`profiles?id=eq.${uid}&select=steam_conquistas`))[0]?.steam_conquistas?.raras || []) : [];
  const linhas = await api(`user_games?user_id=eq.${uid}&ach_total=gt.0&select=ach_done`);
  const total = linhas.reduce((t, l) => t + (l.ach_done || 0), 0);
  const vistas = new Set();
  const raras = [...anteriores, ...ok.flatMap((r) => r.raras).filter((a) => a.pct < 100).map((a) => ({ ...a, pct: Math.round(a.pct * 10) / 10, icone: ICONE_OK.test(a.icone || '') ? a.icone : null }))]
    .sort((a, b) => a.pct - b.pct).filter((a) => { const k = a.jogo + '|' + a.nome; if (vistas.has(k)) return false; vistas.add(k); return true; }).slice(0, 6);
  await api(`profiles?id=eq.${uid}`, { method: 'PATCH', body: { steam_conquistas: { total, jogos: linhas.length, raras, em: new Date().toISOString() } } });
  const proximo = offset + limite < jogados.length ? offset + limite : null;
  if (erros.length) console.error('conquistas:', erros.slice(0, 5));
  return { total, proximo, lidos: Math.min(offset + limite, jogados.length), jogos: jogados.length, comConquistas: ok.length, gravados, erros: erros.slice(0, 3) };
}
