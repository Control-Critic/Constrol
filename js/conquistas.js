import { sb, $, esc, montarLayout, configurado, usuario, perfil, nivel, avatarHtml, toast, falha, param } from './app.js';

await montarLayout();
const main = $('#conteudo');
const RARIDADE = { comum: 'Comum', rara: 'Rara', epica: 'Épica', lendaria: 'Lendária', especial: 'Especial' };

if (configurado) carregar();

async function carregar() {
  const u = await usuario();
  const p = u ? await perfil() : null;
  const [{ data: todos }, { data: meus }, { data: ranking }] = await Promise.all([
    sb.from('cosmetics').select('*').order('kind').order('sort'),
    u ? sb.from('user_cosmetics').select('*').eq('user_id', u.id) : Promise.resolve({ data: [] }),
    sb.rpc('monthly_ranking', { lim: 20 }),
  ]);
  const itens = (todos || []).filter((i) => i.active !== false); // itens excluídos pelo admin somem
  const tenho = new Map((meus || []).filter((m) => !m.expires_at || new Date(m.expires_at) > new Date()).map((m) => [m.cosmetic_id, m]));
  // Progresso das metas automáticas (Steam/biblioteca) que a pessoa ainda não tem
  progresso.clear();
  if (u) await Promise.all(itens.filter((i) => i.regra && !tenho.has(i.id)).map(async (i) => {
    const { data: v } = await sb.rpc('regra_valor', { uid: u.id, r: i.regra });
    if (v != null) progresso.set(i.id, { v: Number(v), alvo: Number(i.regra.min ?? i.regra.pct), pct: !!i.regra.pct });
  }));
  const n = p ? nivel(p.xp) : null;
  const porTipo = (k) => itens.filter((i) => i.kind === k);
  const total = itens.length, desbloqueados = itens.filter((i) => tenho.has(i.id)).length;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });

  const destaques = itens.filter((i) => i.destaque);
  main.innerHTML = `
    <h1>Conquistas</h1>
    ${destaques.length ? `<h2>⭐ Em destaque</h2><p class="muted" style="margin-bottom:10px">Metas especiais escolhidas pela equipe. As de jogos conferem suas horas e conquistas da Steam (importe no seu perfil).</p>
      <div class="itens destaques-conq" style="margin-bottom:18px">${destaques.map((i) => cartaoItem(i, tenho, p, i.kind)).join('')}</div>` : ''}
    ${p ? `<div class="grade" style="margin-bottom:18px">
      <div class="cartao" style="text-align:center"><div class="sequencia">🔥 ${p.streak_current}</div>
        <p>${p.streak_current === 1 ? 'dia seguido' : 'dias seguidos'}</p><p class="muted" style="font-size:.85rem">Recorde: ${p.streak_best} · entre todo dia para ganhar mais XP e molduras de chama</p></div>
      <div class="cartao" style="text-align:center"><div class="sequencia" style="color:var(--amarelo)">Nv. ${n.lv}</div>
        <p>${n.titulo} · ${p.xp} XP</p><div class="barra-xp" style="margin-top:8px"><div style="width:${n.pct}%"></div></div>
        <p class="muted" style="font-size:.85rem;margin-top:4px">Próximo nível em ${n.prox} XP</p></div>
      <div class="cartao" style="text-align:center"><div class="sequencia" style="color:#ba68c8">${desbloqueados}/${total}</div>
        <p>itens desbloqueados</p><p class="muted" style="font-size:.85rem">Avalie, organize partidas e participe das comunidades</p></div>
    </div>` : `<div class="aviso"><a href="entrar.html?volta=conquistas.html">Entre</a> para ganhar XP, manter sua sequência de dias e desbloquear molduras, banners e selos.</div>`}

    <div class="abas">
      <button class="aba ativo" data-a="molduras">Molduras</button><button class="aba" data-a="banners">Banners</button>
      <button class="aba" data-a="selos">Selos</button><button class="aba" data-a="ranking">Ranking do mês</button><button class="aba" data-a="como">Como ganhar XP</button>
    </div>

    <section data-p="molduras"><div class="itens">${porTipo('frame').map((i) => cartaoItem(i, tenho, p, 'frame')).join('')}</div></section>
    <section data-p="banners" class="hidden"><div class="itens">${porTipo('banner').map((i) => cartaoItem(i, tenho, p, 'banner')).join('')}</div></section>
    <section data-p="selos" class="hidden"><p class="muted" style="margin-bottom:10px">Selos com ◆ sobem de nível: I Comum → II Rara → III Épica → IV Lendária. Continue jogando para evoluir.</p>
      <div class="itens">${selosAgrupados(porTipo('badge'), tenho).map((i) => cartaoItem(i, tenho, p, 'badge')).join('')}</div></section>

    <section data-p="ranking" class="hidden">
      <p class="muted" style="margin-bottom:12px">Quem mais ganhou XP em ${esc(mes)}. No fim do mês, o <strong>top 10</strong> ganha a moldura
        <strong>Destaque do Mês</strong> (válida por um mês) e o selo permanente <strong>Top 10 do Mês</strong>.</p>
      <div class="lista">${(ranking || []).map((r) => `
        <a class="cartao ranking-linha ${r.posicao <= 10 ? 'top' : ''}" href="perfil.html?u=${encodeURIComponent(r.username)}" style="color:var(--texto);text-decoration:none">
          <span class="pos">${r.posicao <= 3 ? ['🥇', '🥈', '🥉'][r.posicao - 1] : r.posicao}</span>
          ${avatarHtml(r)}
          <strong style="flex:1">${esc(r.username)}${p && r.user_id === p.id ? ' (você)' : ''}</strong>
          <span class="tag amarela">${Number(r.xp_mes).toLocaleString('pt-BR')} XP</span>
        </a>`).join('') || '<p class="vazio">Ninguém pontuou este mês ainda. Seja o primeiro!</p>'}</div>
    </section>

    <section data-p="como" class="hidden"><div class="cartao">
      <table><tbody>
        <tr><td>🔥 Login diário</td><td>5 XP, +2 por dia de sequência (até 25 XP/dia)</td></tr>
        <tr><td>📅 A cada 7 dias seguidos</td><td>+25 XP de bônus</td></tr>
        <tr><td>⭐ Avaliar um jogo</td><td>10 XP</td></tr>
        <tr><td>🏰 Criar uma comunidade</td><td>20 XP</td></tr>
        <tr><td>💬 Postar numa comunidade</td><td>5 XP</td></tr>
        <tr><td>🔎 Adicionar um jogo ao catálogo pela busca</td><td>5 XP</td></tr>
      </tbody></table>
      <p class="muted" style="margin-top:10px;font-size:.85rem">Molduras e banners são só visuais e não dão vantagem nenhuma. Tudo é conquistado jogando e participando.</p>
    </div></section>`;

  main.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
    main.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
    main.querySelectorAll('[data-p]').forEach((s) => s.classList.toggle('hidden', s.dataset.p !== b.dataset.a));
  });
  const abaInicial = main.querySelector(`.aba[data-a="${param('aba') || location.hash.slice(1)}"]`);
  if (abaInicial) abaInicial.click();

  main.querySelectorAll('[data-equipar]').forEach((b) => b.onclick = async () => {
    const [tipo, id] = b.dataset.equipar.split(':');
    const { error } = await sb.rpc('equip_cosmetic', { tipo, cid: id || null });
    if (error) return falha(error);
    toast(id ? 'Equipado! Já aparece no seu perfil.' : 'Removido.');
    setTimeout(() => location.reload(), 500);
  });
}

const progresso = new Map();
const ROMANO = ['', 'I', 'II', 'III', 'IV'];
// Uma carta por série: mostra o nível mais alto já liberado (ou o primeiro) e a meta do próximo
const series = new Map();
function selosAgrupados(lista, tenho) {
  series.clear();
  const soltos = [];
  for (const i of lista) {
    if (!i.serie) { soltos.push(i); continue; }
    if (!series.has(i.serie)) series.set(i.serie, []);
    series.get(i.serie).push(i);
  }
  const cartas = [...soltos];
  for (const niveis of series.values()) {
    niveis.sort((a, b) => a.tier - b.tier);
    const feitos = niveis.filter((n) => tenho.has(n.id));
    cartas.push(feitos.at(-1) || niveis[0]);
  }
  return cartas.sort((a, b) => a.sort - b.sort || (a.tier || 0) - (b.tier || 0));
}
function trilhaNiveis(i, tenho) {
  const niveis = series.get(i.serie);
  if (!niveis || niveis.length < 2) return '';
  const prox = niveis.find((n) => !tenho.has(n.id));
  const g = prox && progresso.get(prox.id);
  const pc = g ? Math.min(100, Math.round(g.v / g.alvo * 100)) : 100;
  return `<div class="niveis-selo">${niveis.map((n) => `<span class="nv r-${n.rarity} ${tenho.has(n.id) ? 'ok' : ''}" title="${esc(n.name)}: ${esc(n.description)}">◆</span>`).join('')}</div>
    ${tenho.has(i.id) && prox ? `<span class="muted" style="font-size:.78rem">Próximo: <strong>${ROMANO[prox.tier]}</strong> · ${esc(prox.description)}</span>
      ${g ? `<div class="barra-xp" style="width:100%;margin-top:4px"><div style="width:${pc}%"></div></div>
      <span class="muted" style="font-size:.75rem">${Math.floor(g.v).toLocaleString('pt-BR')}${g.pct ? '%' : ''} de ${g.alvo.toLocaleString('pt-BR')}${g.pct ? '%' : ''}</span>` : ''}`
    : tenho.has(i.id) ? '<span class="muted" style="font-size:.78rem">🏆 Nível máximo!</span>' : ''}`;
}
function cartaoItem(i, tenho, p, tipo) {
  const meu = tenho.get(i.id);
  const equipado = p && ((tipo === 'frame' && p.equipped_frame === i.id) || (tipo === 'banner' && p.equipped_banner === i.id));
  const visual = tipo === 'frame' ? avatarHtml({ ...(p || {}), equipped_frame: i.id }, 'grande')
    : tipo === 'banner' ? `<div class="amostra-banner bn-${esc(i.id)}" style="width:100%"></div>`
    : `<div class="selo">${esc(i.icon || '🏅')}</div>`;
  const acao = !p || !meu || tipo === 'badge' ? ''
    : equipado ? `<button class="btn sec pequeno" data-equipar="${tipo}:">Remover</button>`
    : `<button class="btn pequeno" data-equipar="${tipo}:${esc(i.id)}">Equipar</button>`;
  return `<div class="item ${meu ? '' : 'bloqueado'} ${equipado ? 'equipado' : ''}">
    ${visual}
    <strong>${esc(i.name)}</strong>
    <span class="raridade r-${i.rarity}">${RARIDADE[i.rarity] || ''}</span>
    <span class="muted" style="font-size:.82rem">${meu ? `✓ ${meu.expires_at ? `Válido até ${new Date(meu.expires_at).toLocaleDateString('pt-BR')}` : `Desbloqueado em ${new Date(meu.unlocked_at).toLocaleDateString('pt-BR')}`}<br><span class="como-ganhou">🎯 ${esc(i.description)}</span>` : '🔒 ' + esc(i.description)}</span>
    ${!meu && progresso.has(i.id) ? (() => { const g = progresso.get(i.id), pc = Math.min(100, Math.round(g.v / g.alvo * 100));
      return `<div class="barra-xp" style="width:100%;margin-top:4px" title="${pc}%"><div style="width:${pc}%"></div></div>
        <span class="muted" style="font-size:.75rem">${Math.floor(g.v).toLocaleString('pt-BR')}${g.pct ? '%' : ''} de ${g.alvo.toLocaleString('pt-BR')}${g.pct ? '%' : ''}</span>`; })() : ''}
    ${i.serie ? trilhaNiveis(i, tenho) : ''}
    ${acao}
  </div>`;
}
