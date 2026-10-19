import { urlSegura } from './app.js';
import { sb, $, esc, montarLayout, configurado, usuario, falha, toast } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `
  <h1>Comunidades</h1>
  <p class="muted">Converse, marque partidas e entre em call com quem joga o mesmo que você.</p>
  <div class="controles" style="margin:16px 0" role="search">
    <label for="q" class="sr-only">Buscar comunidade</label><input id="q" type="search" placeholder="🔎 Buscar comunidade..." style="max-width:320px">
    <label for="ordem-c" class="sr-only">Ordenar</label><select id="ordem-c" style="max-width:200px"><option value="ultima_atividade">Mais ativas</option><option value="members_count">Mais membros</option><option value="created_at">Mais novas</option></select>
    <label class="check"><input type="checkbox" id="so-discord"> Com Discord</label>
    <button class="btn" id="nova">+ Criar comunidade</button></div>
  <p class="muted" id="contagem-c" role="status" aria-live="polite"></p>
  <div class="grade" id="lista" aria-busy="true"></div>
  <div style="text-align:center;margin:16px 0"><button class="btn sec hidden" id="mais-c">Carregar mais</button></div>
  <dialog id="dlg"><form id="form" method="dialog">
    <h2 style="margin-top:0">Nova comunidade</h2>
    <label for="nome">Nome</label><input id="nome" required minlength="3" maxlength="60">
    <label for="desc">Descrição</label><textarea id="desc" rows="3" maxlength="500"></textarea>
    <label for="busca-jogo">Jogo (opcional)</label>
    <div class="busca-jogo"><input id="busca-jogo" type="search" placeholder="Digite o nome do jogo..." autocomplete="off">
      <input type="hidden" id="jogo"><div class="sugestoes hidden" id="sugestoes"></div></div>
    <p class="muted" id="jogo-escolhido" style="font-size:.85rem;margin-top:4px"></p>
    <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="privada" style="width:auto"> 🔒 Privada (só entra quem você aprovar ou tiver o link de convite)</label>
    <label for="discord">Convite do Discord (opcional)</label><input id="discord" placeholder="https://discord.gg/...">
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Criar (+20 XP)</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div>
  </form></dialog>`);

if (configurado) {
  carregar();
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(() => carregar(), 300); };
  $('#ordem-c').onchange = () => carregar(); $('#so-discord').onchange = () => carregar(); $('#mais-c').onclick = () => carregar(true);
  // Busca de jogo com sugestões (o catálogo tem milhares de jogos)
  let tBusca;
  const escolher = (id, titulo) => {
    $('#jogo').value = id || '';
    $('#busca-jogo').value = titulo || '';
    $('#jogo-escolhido').innerHTML = id ? `✓ ${esc(titulo)} <a href="#" id="limpar-jogo">remover</a>` : '';
    $('#limpar-jogo')?.addEventListener('click', (e) => { e.preventDefault(); escolher(null, ''); });
    $('#sugestoes').classList.add('hidden');
  };
  $('#busca-jogo').oninput = () => {
    $('#jogo').value = ''; $('#jogo-escolhido').textContent = '';
    clearTimeout(tBusca);
    tBusca = setTimeout(async () => {
      const termo = $('#busca-jogo').value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return $('#sugestoes').classList.add('hidden');
      const { data } = await sb.from('games').select('id,title,release_year,cover_url').ilike('title', `%${termo}%`)
        .order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(8);
      $('#sugestoes').innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">
        ${urlSegura(j.cover_url) ? `<img src="${urlSegura(j.cover_url)}" alt="">` : ''}<span>${esc(j.title)}${j.release_year ? ` <span class="muted">(${j.release_year})</span>` : ''}</span></button>`).join('')
        || '<p class="muted" style="padding:8px">Nenhum jogo encontrado.</p>';
      $('#sugestoes').classList.remove('hidden');
      $('#sugestoes').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => escolher(b.dataset.id, b.dataset.t));
    }, 300);
  };

  $('#nova').onclick = async () => { if (!(await usuario())) return (location.href = 'entrar.html?volta=comunidades.html'); $('#dlg').showModal(); };
  $('#dlg').addEventListener('close', async () => {
    if ($('#dlg').returnValue !== 'ok') return;
    const { data, error } = await sb.from('communities').insert({
      name: $('#nome').value.trim(), description: $('#desc').value.trim() || null,
      game_id: $('#jogo').value || null, is_private: $('#privada').checked, discord_invite: $('#discord').value.trim() || null,
    }).select().single();
    if (error) return falha(error.message.includes('discord') ? { message: 'Convite do Discord inválido. Use https://discord.gg/xxxx' } : error);
    toast('Comunidade criada!');
    location.href = 'comunidade.html?id=' + data.id;
  });
}

const POR_PAG = 24;
let pag = 0, ctrlC = null;
const ha = (d) => { if (!d) return ''; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? 'ativa agora' : m < 1440 ? `ativa há ${Math.round(m / 60)} h` : m < 43200 ? `ativa há ${Math.round(m / 1440)} d` : ''; };
async function carregar(mais = false) {
  pag = mais ? pag + 1 : 0;
  ctrlC?.abort(); ctrlC = new AbortController();
  const ordem = $('#ordem-c').value;
  let q = sb.from('communities').select('*, games(title)', { count: 'exact' }).order('oficial', { ascending: false }).order(ordem, { ascending: false, nullsFirst: false })
    .range(pag * POR_PAG, pag * POR_PAG + POR_PAG - 1).abortSignal(ctrlC.signal);
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  if (termo) q = q.ilike('name', `%${termo}%`);
  if ($('#so-discord').checked) q = q.not('discord_invite', 'is', null);
  let { data, error, count } = await q;
  // Banco ainda sem a migração da fase 9: volta para a ordem antiga
  if (error?.code === '42703') ({ data, error, count } = await sb.from('communities').select('*, games(title)', { count: 'exact' }).order('members_count', { ascending: false }).range(pag * POR_PAG, pag * POR_PAG + POR_PAG - 1));
  if (/abort/i.test(error?.message || '')) return;
  $('#lista').setAttribute('aria-busy', 'false');
  if (error) { $('#lista').innerHTML = '<p class="vazio" role="alert">Não foi possível carregar. <button class="btn sec pequeno" id="tentar-c">Tentar de novo</button></p>'; $('#tentar-c').onclick = () => carregar(); return; }
  const html = (data || []).map((c) => `
    <a class="cartao" href="comunidade.html?id=${Number(c.id)}" style="color:var(--texto);text-decoration:none">
      <h3 style="display:flex;gap:10px;align-items:center">${urlSegura(c.icon_url) ? `<img src="${urlSegura(c.icon_url)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover">` : ''}${c.is_private ? '🔒 ' : ''}${esc(c.name)}${c.oficial ? ' <span class="tag amarela">✔ Oficial</span>' : ''}</h3>
      <p class="muted">${esc(c.description || '')}</p>
      <p style="margin-top:8px">${c.games ? `<span class="tag">${esc(c.games.title)}</span> ` : ''}<span class="tag">${Number(c.members_count) === 1 ? '1 membro' : `${Number(c.members_count || 0).toLocaleString('pt-BR')} membros`}</span>
      ${c.discord_invite ? ' <span class="tag" style="background:#5865F2;color:#fff">Discord</span>' : ''} ${ha(c.ultima_atividade) ? `<span class="muted" style="font-size:.8rem">· ${ha(c.ultima_atividade)}</span>` : ''}</p>
    </a>`).join('');
  if (mais) $('#lista').insertAdjacentHTML('beforeend', html);
  else $('#lista').innerHTML = html || `<p class="vazio">${termo ? `Nenhuma comunidade com “${esc(termo)}”.` : 'Nenhuma comunidade ainda.'} Que tal criar a primeira?</p>`;
  $('#contagem-c').textContent = count != null ? (count === 1 ? '1 comunidade' : `${count.toLocaleString('pt-BR')} comunidades`) : '';
  $('#mais-c').classList.toggle('hidden', (pag + 1) * POR_PAG >= (count ?? 0));
}
