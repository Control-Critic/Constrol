import { sb, $, esc, montarLayout, configurado, param, usuario, avatarHtml, urlSegura, toast, falha, srcCapa, plural } from './app.js';

await montarLayout();
const main = $('#conteudo');
const id = Number(param('id'));

if (configurado) carregar();

async function carregar() {
  const u = await usuario();
  const { data: l } = await sb.from('user_lists').select('*, profiles(username,avatar_url,equipped_frame)').eq('id', id).maybeSingle();
  if (!l) { main.innerHTML = '<p class="vazio">Lista não encontrada (ou é privada).</p>'; return; }
  document.title = `${l.title} | Control Critic`;
  const meu = u && l.user_id === u.id;
  const { data: itens } = await sb.from('list_items').select('*, games(id,slug,title,cover_url,avg_rating,release_year)').eq('list_id', id).order('position');

  main.innerHTML = `
    <div class="cartao" style="margin-bottom:16px">
      <p class="muted">${l.is_public ? '🌐 Lista pública' : '🔒 Lista privada (só você vê)'}</p>
      <h1 style="margin:4px 0">${esc(l.title)}</h1>
      ${l.description ? `<p class="quebra">${esc(l.description)}</p>` : ''}
      <p class="controles" style="align-items:center;margin-top:8px">${avatarHtml(l.profiles)} por <a class="usuario" href="perfil.html?u=${encodeURIComponent(l.profiles?.username || '')}">${esc(l.profiles?.username)}</a>
        <span class="muted">· ${plural((itens || []).length, 'jogo')}</span></p>
      <div class="controles" style="margin-top:10px">
        ${l.is_public ? '<button class="btn sec pequeno" id="compartilhar">🔗 Copiar link</button>' : ''}
        ${meu ? '<button class="btn sec pequeno" id="editar">✏️ Editar</button><button class="btn perigo pequeno" id="excluir">Excluir lista</button>' : ''}
      </div>
    </div>
    <ol class="lista lista-jogos">${(itens || []).map((it, i) => `
      <li class="cartao controles" style="align-items:center">
        <span class="pos">${i + 1}</span>
        <a href="jogo.html?slug=${encodeURIComponent(it.games.slug)}"><img ${srcCapa(it.games.cover_url, 480)} alt="" style="width:110px;height:64px;object-fit:cover;border-radius:8px"></a>
        <div style="flex:1;min-width:160px"><a href="jogo.html?slug=${encodeURIComponent(it.games.slug)}"><strong>${esc(it.games.title)}</strong></a>
          ${it.games.release_year ? `<span class="muted"> (${it.games.release_year})</span>` : ''}
          ${it.note ? `<p class="muted quebra">${esc(it.note)}</p>` : ''}</div>
        ${meu ? `<span class="controles">
          <button class="btn sec pequeno" data-sobe="${i}" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
          <button class="btn sec pequeno" data-desce="${i}" ${i === itens.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
          <button class="btn sec pequeno" data-nota="${it.game_id}" title="Comentário">📝</button>
          <button class="btn perigo pequeno" data-tirar="${it.game_id}" title="Remover">✕</button></span>` : ''}
      </li>`).join('') || `<p class="vazio">Lista vazia.${meu ? ' Abra a página de um jogo e use "📋 Adicionar a uma lista".' : ''}</p>`}</ol>
    <dialog id="dlg"></dialog>`;

  $('#compartilhar')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copiado!'); } catch { prompt('Copie o link:', location.href); }
  });
  if (!meu) return;
  const recarregar = () => carregar();
  $('#excluir').onclick = async () => {
    if (!confirm('Excluir esta lista?')) return;
    const { error } = await sb.from('user_lists').delete().eq('id', id); if (error) return falha(error);
    location.href = 'perfil.html';
  };
  $('#editar').onclick = () => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">Editar lista</h2>
      <label for="l-t">Título</label><input id="l-t" required maxlength="80" value="${esc(l.title)}">
      <label for="l-d">Descrição</label><textarea id="l-d" rows="3" maxlength="500">${esc(l.description || '')}</textarea>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="l-p" style="width:auto" ${l.is_public ? 'checked' : ''}> Pública (aparece no seu perfil e pode ser compartilhada)</label>
      <div class="controles" style="margin-top:14px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
    dlg.showModal();
    dlg.addEventListener('close', async () => {
      if (dlg.returnValue !== 'ok') return;
      const { error } = await sb.from('user_lists').update({ title: $('#l-t').value.trim(), description: $('#l-d').value.trim() || null, is_public: $('#l-p').checked, updated_at: new Date().toISOString() }).eq('id', id);
      error ? falha(error) : recarregar();
    }, { once: true });
  };
  // Reordenar: troca a posição com o vizinho
  const trocar = async (a, b) => {
    const [x, y] = [itens[a], itens[b]];
    await sb.from('list_items').update({ position: y.position }).eq('list_id', id).eq('game_id', x.game_id);
    await sb.from('list_items').update({ position: x.position === y.position ? y.position + 1 : x.position }).eq('list_id', id).eq('game_id', y.game_id);
    recarregar();
  };
  main.querySelectorAll('[data-sobe]').forEach((b) => b.onclick = () => trocar(Number(b.dataset.sobe), Number(b.dataset.sobe) - 1));
  main.querySelectorAll('[data-desce]').forEach((b) => b.onclick = () => trocar(Number(b.dataset.desce), Number(b.dataset.desce) + 1));
  main.querySelectorAll('[data-tirar]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('list_items').delete().eq('list_id', id).eq('game_id', b.dataset.tirar); error ? falha(error) : recarregar();
  });
  main.querySelectorAll('[data-nota]').forEach((b) => b.onclick = async () => {
    const it = itens.find((x) => x.game_id == b.dataset.nota);
    const nota = prompt('Comentário sobre este jogo na lista (opcional):', it.note || '');
    if (nota === null) return;
    const { error } = await sb.from('list_items').update({ note: nota.trim().slice(0, 200) || null }).eq('list_id', id).eq('game_id', it.game_id);
    error ? falha(error) : recarregar();
  });
}
