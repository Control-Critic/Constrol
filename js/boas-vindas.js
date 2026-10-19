// Boas-vindas para contas novas: 3 passos rápidos (gostos, comunidades e próximos passos).
// Só aparece uma vez (profiles.onboarded).
import { sb, esc, toast } from './app.js';

export async function boasVindas(p) {
  if (location.pathname.endsWith('entrar.html') || document.querySelector('#dlg-boas-vindas')) return;
  const [{ data: cats }, { data: comms }] = await Promise.all([
    sb.from('categories').select('id,name').order('name'),
    sb.from('communities').select('id,name,members_count,is_private').eq('is_private', false).order('members_count', { ascending: false }).limit(8),
  ]);
  const favs = new Set(p.fav_categories || []), entrar = new Set(), plats = new Set(p.plataformas || []), jogos = new Map();
  const dlg = document.createElement('dialog');
  dlg.id = 'dlg-boas-vindas';
  dlg.style.width = 'min(620px, 96vw)';
  dlg.setAttribute('aria-labelledby', 'bv-titulo');
  document.body.append(dlg);
  let passo = 0;
  const PLATS = [['PlayStation', '🎮'], ['Xbox', '🟩'], ['PC', '🖥️'], ['Nintendo', '🍄'], ['Mobile', '📱']];

  // Progressivo: plataformas → gêneros → 3 jogos → comunidades. Dá para pular a qualquer momento.
  const passos = [
    () => `<h2 id="bv-titulo" style="margin-top:0">👋 Bem-vindo ao Control Critic, ${esc(p.username)}!</h2>
      <p class="muted">Onde você joga? Usamos isso para achar grupos e promoções para você.</p>
      <div class="chips" style="margin-top:12px" role="group" aria-label="Plataformas">${PLATS.map(([n, i]) => `<button type="button" class="chip ${plats.has(n) ? 'ativo' : ''}" aria-pressed="${plats.has(n)}" data-plat="${n}">${i} ${n}</button>`).join('')}</div>`,
    () => `<h2 id="bv-titulo" style="margin-top:0">🎯 Do que você gosta de jogar?</h2>
      <p class="muted">Escolha alguns gêneros. Eles ajustam suas recomendações (dá para mudar depois no perfil).</p>
      <div class="chips" style="margin-top:12px" role="group" aria-label="Gêneros">${(cats || []).map((c) => `<button type="button" class="chip ${favs.has(c.id) ? 'ativo' : ''}" aria-pressed="${favs.has(c.id)}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>`,
    () => `<h2 id="bv-titulo" style="margin-top:0">🕹️ Três jogos que você curte</h2>
      <p class="muted">Eles entram na sua biblioteca como "jogando". Faltam ${Math.max(0, 3 - jogos.size)}.</p>
      <label for="bv-busca" class="sr-only">Buscar jogo</label>
      <input id="bv-busca" type="search" placeholder="Buscar jogo..." autocomplete="off" style="margin-top:8px">
      <div class="chips" id="bv-sug" style="margin-top:8px" aria-live="polite"></div>
      <div class="chips" style="margin-top:8px">${[...jogos].map(([id, t]) => `<button type="button" class="chip ativo" data-tira="${id}" aria-label="Remover ${esc(t)}">✓ ${esc(t)} ✕</button>`).join('')}</div>`,
    () => `<h2 id="bv-titulo" style="margin-top:0">👥 Entre em algumas comunidades</h2>
      <p class="muted">É onde rolam o mural, os grupos e as calls com tela compartilhada.</p>
      <div class="chips" style="margin-top:12px" role="group" aria-label="Comunidades">${(comms || []).map((c) => `<button type="button" class="chip ${entrar.has(c.id) ? 'ativo' : ''}" aria-pressed="${entrar.has(c.id)}" data-com="${c.id}">${esc(c.name)}</button>`).join('') || '<span class="muted">Ainda não há comunidades públicas.</span>'}</div>
      <p class="muted" style="margin-top:14px;font-size:.88rem">Depois, na página inicial, um checklist mostra o que falta: seguir jogadores, criar um grupo e importar a Steam (opcional).</p>`,
  ];

  const desenhar = () => {
    dlg.innerHTML = `${passos[passo]()}
      <div class="controles" style="margin-top:18px;align-items:center">
        <span class="muted" style="flex:1">Passo ${passo + 1} de ${passos.length}</span>
        ${passo ? '<button type="button" class="btn sec" data-ir="-1">Voltar</button>' : '<button type="button" class="btn sec" data-pular>Pular</button>'}
        <button type="button" class="btn" data-ir="1">${passo === passos.length - 1 ? 'Começar' : 'Continuar'}</button>
      </div>`;
    const alterna = (attr, conj, conv) => dlg.querySelectorAll(`[data-${attr}]`).forEach((b) => b.onclick = () => {
      const id = conv(b.dataset[attr]); conj.has(id) ? conj.delete(id) : conj.add(id);
      b.classList.toggle('ativo'); b.setAttribute('aria-pressed', String(conj.has(id)));
    });
    alterna('cat', favs, Number); alterna('com', entrar, Number); alterna('plat', plats, String);
    dlg.querySelectorAll('[data-tira]').forEach((b) => b.onclick = () => { jogos.delete(Number(b.dataset.tira)); desenhar(); });
    const busca = dlg.querySelector('#bv-busca');
    if (busca) {
      let t, ctrl;
      busca.focus();
      busca.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const termo = busca.value.trim().replace(/[%,()]/g, '');
        const sug = dlg.querySelector('#bv-sug');
        if (termo.length < 2) { sug.innerHTML = ''; return; }
        ctrl?.abort(); ctrl = new AbortController();
        const { data } = await sb.from('games').select('id,title').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(6).abortSignal(ctrl.signal);
        sug.innerHTML = (data || []).map((j) => `<button type="button" class="chip" data-add="${Number(j.id)}" data-t="${esc(j.title)}">+ ${esc(j.title)}</button>`).join('') || '<span class="muted">Nenhum jogo encontrado.</span>';
        sug.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { if (jogos.size < 10) jogos.set(Number(b.dataset.add), b.dataset.t); desenhar(); });
      }, 300); };
    }
    dlg.querySelector('[data-pular]')?.addEventListener('click', () => concluir());
    dlg.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => {
      passo += Number(b.dataset.ir);
      if (passo >= passos.length) return concluir();
      desenhar();
    });
  };

  async function concluir() {
    dlg.close(); dlg.remove();
    await sb.from('profiles').update({ fav_categories: [...favs], plataformas: [...plats] }).eq('id', p.id);
    if (jogos.size) await sb.from('user_games').upsert([...jogos.keys()].map((game_id) => ({ user_id: p.id, game_id, status: 'jogando' })), { onConflict: 'user_id,game_id', ignoreDuplicates: true });
    for (const cid of entrar) await sb.rpc('join_community', { cid, codigo: null, mensagem: null });
    // Marca como concluído e dá o XP de boas-vindas (uma única vez, conferido no banco)
    const { data: xp } = await sb.rpc('concluir_onboarding');
    toast(xp ? `Perfil configurado! +${xp} XP de boas-vindas 🎉` : 'Perfil configurado!');
    if (location.pathname.endsWith('/') || location.pathname.endsWith('index.html')) setTimeout(() => location.reload(), 900);
  }

  desenhar();
  dlg.showModal();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); concluir(); });
}
