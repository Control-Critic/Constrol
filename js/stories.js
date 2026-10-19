// Stories (24 h), inspirados no Instagram: foto/print com legenda, enquete, caixinha de perguntas,
// música do Spotify, "só melhores amigos" e destaques no perfil. Também mostra as Notas (status de 24 h).
import { aoMudarOnline, estadoOnline, bloqueados, carregarBloqueados } from './app.js';
import { sb, $, esc, urlSegura, avatar, toast, falha, enviarImagem, spotifyId, spotifyPlayer, notaAtiva, srcCapa, playerSpotify, somLigado, definirSom, pararMusica, tocarSo, enviarVideo, destruirPlayer } from './app.js';

const COLS = 'id,user_id,image_url,video_url,caption,poll,question,musica,close_friends,highlight,created_at,expires_at';
const tempo = (d) => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`; };

// Barra de bolinhas no topo da página inicial: você + quem você segue/amigos com story ativo
export async function barraStories(box, u) {
  if (!u) { box.innerHTML = ''; return; }
  const { data: seg } = await sb.from('follows').select('followed_id').eq('follower_id', u.id).limit(500);
  const ids = [u.id, ...(seg || []).map((x) => x.followed_id)];
  const [{ data: sts }, { data: perfis }, { data: vistos }] = await Promise.all([
    sb.from('stories').select(COLS).in('user_id', ids).gt('expires_at', new Date().toISOString()).order('created_at'),
    sb.from('profiles').select('id,username,avatar_url,equipped_frame,nota,nota_at').in('id', ids),
    sb.from('story_views').select('story_id').eq('user_id', u.id).limit(1000),
  ]);
  const visto = new Set((vistos || []).map((v) => v.story_id));
  const por = new Map();
  await carregarBloqueados();
  for (const s of (sts || []).filter((x) => !bloqueados.has(x.user_id))) (por.get(s.user_id) || por.set(s.user_id, []).get(s.user_id)).push(s);
  const P = Object.fromEntries((perfis || []).map((p) => [p.id, p]));
  const comNota = (perfis || []).filter((p) => p.id !== u.id && notaAtiva(p) && !por.has(p.id));
  const ordem = [u.id, ...[...por.keys()].filter((id) => id !== u.id).sort((a, b) =>
    Number(por.get(a).every((s) => visto.has(s.id))) - Number(por.get(b).every((s) => visto.has(s.id))))];
  const bolinha = (p, lista) => {
    const novo = lista?.some((s) => !visto.has(s.id));
    const nota = notaAtiva(p);
    return `<button type="button" class="story-bola ${lista?.length ? (novo ? 'novo' : 'visto') : ''} ${lista?.some((s) => s.close_friends) ? 'amigos' : ''}" data-dono="${p.id}">
      ${nota ? `<span class="nota-balao" title="${esc(nota)}">${esc(nota)}</span>` : ''}
      <img src="${avatar(p)}" alt=""><span class="story-nome">${p.id === u.id ? 'Seu story' : esc(p.username)}</span>
      ${p.id === u.id ? '<span class="story-mais">+</span>' : ''}</button>`;
  };
  box.innerHTML = `<div class="stories-barra">${ordem.filter((id) => P[id]).map((id) => bolinha(P[id], por.get(id))).join('')}
    ${comNota.slice(0, 12).map((p) => `<a class="story-bola so-nota" data-id="${p.id}" href="perfil.html?u=${encodeURIComponent(p.username)}"><span class="nota-balao">${esc(notaAtiva(p))}</span><img src="${avatar(p)}" alt=""><span class="story-nome">${esc(p.username)}</span></a>`).join('')}</div>`;
  // Quem está online agora: bolinha verde no avatar (🔊 se estiver em call) e contador de amigos online no começo da barra
  const { data: am } = await sb.from('friendships').select('user_a,user_b').eq('status', 'aceita').or(`user_a.eq.${u.id},user_b.eq.${u.id}`);
  const amigos = new Set((am || []).map((f) => (f.user_a === u.id ? f.user_b : f.user_a)));
  box.querySelector('.stories-barra').insertAdjacentHTML('afterbegin', '<a class="story-bola online-chip hidden" href="amigos.html" title="Amigos online agora"><span class="online-n">0</span><span class="story-nome">online</span></a>');
  aoMudarOnline((online) => {
    const est = estadoOnline();
    box.querySelectorAll('.story-bola[data-dono], .story-bola.so-nota').forEach((b) => {
      const id = b.dataset.dono || b.dataset.id; if (!id || id === u.id) return;
      b.classList.toggle('on', online.has(id)); b.classList.toggle('em-call', !!est.get(id)?.call);
    });
    const n = [...amigos].filter((id) => online.has(id)).length, chip = box.querySelector('.online-chip');
    if (chip) { chip.classList.toggle('hidden', !n); chip.querySelector('.online-n').textContent = n; chip.title = `${n} ${n === 1 ? 'amigo online' : 'amigos online'} agora`; }
  });

  box.querySelectorAll('[data-dono]').forEach((b) => b.onclick = () => {
    const dono = b.dataset.dono;
    if (dono === u.id && !por.get(dono)?.length) return criarStory(u, () => barraStories(box, u));
    if (dono === u.id) return menuMeu(u, por.get(dono), P[dono], () => barraStories(box, u));
    const fila = ordem.filter((id) => id !== u.id && por.get(id)?.length);
    verStories(u, fila.map((id) => ({ p: P[id], lista: por.get(id) })), fila.indexOf(dono), () => barraStories(box, u));
  });
}

function menuMeu(u, lista, p, depois) {
  const dlg = dialogo();
  dlg.innerHTML = `<h2 style="margin-top:0">Seu story</h2><div class="controles">
    <button class="btn" id="m-ver">👀 Ver meus stories (${lista.length})</button><button class="btn sec" id="m-novo">+ Novo story</button>
    <button class="btn sec" id="m-nota">💭 Nota</button><button class="btn sec" id="m-fechar">Fechar</button></div>`;
  dlg.showModal();
  $('#m-fechar').onclick = () => dlg.close();
  $('#m-ver').onclick = () => { dlg.close(); verStories(u, [{ p, lista }], 0, depois); };
  $('#m-novo').onclick = () => { dlg.close(); criarStory(u, depois); };
  $('#m-nota').onclick = () => { dlg.close(); editarNota(u, p, depois); };
}

// Nota: status de até 60 caracteres que some em 24 h (aparece em balão sobre a foto)
export async function editarNota(u, p, depois) {
  const atual = notaAtiva(p) || '';
  const t = prompt('💭 Sua nota (até 60 caracteres, some em 24 h). Ex.: "Jogando Zomboid, bora?"\nDeixe vazio para apagar.', atual);
  if (t === null) return;
  const nota = t.trim().slice(0, 60) || null;
  const { error } = await sb.from('profiles').update({ nota, nota_at: nota ? new Date().toISOString() : null }).eq('id', u.id);
  if (error) return falha(error);
  toast(nota ? '💭 Nota publicada por 24 h.' : 'Nota apagada.'); depois?.();
}

// A mesma janela serve para o menu, criar e ver stories. Ao reaproveitar, tira o "ao fechar" do uso anterior:
// o evento close chega depois (assíncrono) e apagava a janela que acabou de abrir (bug "não consigo ver meus stories").
function dialogo() {
  let dlg = document.getElementById('dlg-story');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-story'; dlg.className = 'dlg-story'; document.body.append(dlg); }
  dlg.onclose = null;
  return dlg;
}

// Criar story
export function criarStory(u, depois) {
  const dlg = dialogo();
  let arquivo = null;
  dlg.innerHTML = `<form method="dialog" id="st-form"><h2 style="margin-top:0">Novo story <span class="muted" style="font-size:.8rem">(some em 24 h)</span></h2>
    <label class="zona-upload" style="min-height:180px;background-size:contain;background-repeat:no-repeat;background-position:center" id="st-zona">
      <input type="file" id="st-img" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"><span class="dica">📷 Foto, print ou 🎬 vídeo (até 60 s)</span></label>
    <video id="st-vid" class="hidden" muted playsinline controls style="width:100%;max-height:260px;border-radius:10px"></video>
    <label for="st-leg">Legenda</label><input id="st-leg" maxlength="200" placeholder="Ex.: Finalmente zerei!">
    <details><summary style="cursor:pointer">📊 Enquete</summary>
      <input id="st-pq" maxlength="80" placeholder="Pergunta (ex.: Qual chefe é pior?)" style="margin-top:6px">
      <div class="form-linha"><input id="st-a" maxlength="30" placeholder="Opção A"><input id="st-b" maxlength="30" placeholder="Opção B"></div></details>
    <details><summary style="cursor:pointer">💬 Caixinha de perguntas</summary><input id="st-q" maxlength="100" placeholder="Ex.: Me indica um jogo de terror" style="margin-top:6px"></details>
    <details><summary style="cursor:pointer">🎵 Música (Spotify)</summary><input id="st-mus" type="url" placeholder="Cole o link da música no Spotify" style="margin-top:6px"></details>
    <label style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:8px"><input type="checkbox" id="st-cf" style="width:auto"> 💚 Só para melhores amigos</label>
    <div class="controles" style="margin-top:12px"><button class="btn" value="ok" id="st-ok">Publicar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  dlg.showModal();
  $('#st-img').onchange = async (e) => {
    arquivo = e.target.files[0] || null;
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    if (arquivo.type.startsWith('video/')) {
      const v = $('#st-vid'); v.src = url; v.classList.remove('hidden'); $('#st-zona').style.backgroundImage = '';
      await new Promise((ok) => { v.onloadedmetadata = ok; v.onerror = ok; });
      if (v.duration > 61) { arquivo = null; v.classList.add('hidden'); e.target.value = ''; return toast('O vídeo do story pode ter no máximo 60 segundos.', true); }
      if (arquivo.size > 30 * 1024 * 1024) { arquivo = null; v.classList.add('hidden'); e.target.value = ''; return toast('Vídeo de até 30 MB.', true); }
    } else { $('#st-vid').classList.add('hidden'); $('#st-zona').style.backgroundImage = `url('${url}')`; }
  };
  $('#st-ok').onclick = async (e) => {
    e.preventDefault();
    if (!arquivo) return toast('Escolha uma imagem.', true);
    const pq = $('#st-pq').value.trim(), a = $('#st-a').value.trim(), b = $('#st-b').value.trim();
    if (pq && (!a || !b)) return toast('Preencha as duas opções da enquete.', true);
    const mus = $('#st-mus').value.trim();
    if (mus && !spotifyId(mus)) return toast('Link do Spotify inválido. Use Compartilhar → Copiar link da música.', true);
    const bt = $('#st-ok'); bt.disabled = true; bt.textContent = 'Publicando...';
    try {
      const video = arquivo.type.startsWith('video/');
      const image_url = video ? null : await enviarImagem(u.id, 'story', arquivo, 25, 1440);
      const video_url = video ? await enviarVideo(u.id, 'story', arquivo, 30) : null;
      const { error } = await sb.from('stories').insert({ user_id: u.id, image_url, video_url, caption: $('#st-leg').value.trim() || null,
        poll: pq ? { pergunta: pq, a, b } : null, question: $('#st-q').value.trim() || null, musica: spotifyId(mus), close_friends: $('#st-cf').checked });
      if (error) throw error;
      dlg.close(); toast('Story publicado! 🎉'); depois?.();
    } catch (err) { falha(err); bt.disabled = false; bt.textContent = 'Publicar'; }
  };
}

// Visualizador: avança sozinho a cada 7 s (pausa ao interagir), toque à esquerda/direita para voltar/avançar
export function verStories(u, grupos, gi = 0, aoFechar) {
  const dlg = dialogo();
  let si = 0, timer = null, pausado = false;
  let ctrlAtual = null, geracao = 0;
  // Para tudo que toca: música do Spotify (destrói o player) e vídeo do story
  const silenciar = () => { geracao++; destruirPlayer(ctrlAtual); ctrlAtual = null; pararMusica(); dlg.querySelectorAll('video').forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); }); };
  const fechar = () => { clearTimeout(timer); silenciar(); dlg.close(); dlg.innerHTML = ''; aoFechar?.(); };
  const mostrar = async () => {
    clearTimeout(timer);
    silenciar();   // a música/vídeo do story anterior para antes de mostrar o próximo
    const g = grupos[gi]; if (!g) return fechar();
    const s = g.lista[si]; if (!s) { gi++; si = 0; return mostrar(); }
    const meu = s.user_id === u?.id;
    if (u && !meu) sb.from('story_views').insert({ story_id: s.id, user_id: u.id }).then(() => {});
    dlg.innerHTML = `<div class="story-ver">
      <div class="story-barras">${g.lista.map((_, k) => `<span class="${k < si ? 'cheia' : k === si ? 'atual' : ''}"></span>`).join('')}</div>
      <div class="story-topo"><img src="${avatar(g.p)}" alt=""><a href="perfil.html?u=${encodeURIComponent(g.p.username)}"><strong>${esc(g.p.username)}</strong></a>
        <span class="muted">${tempo(s.created_at)}</span>${s.close_friends ? '<span class="tag" style="background:#1db954;color:#000">💚 amigos</span>' : ''}
        <button type="button" class="story-x" aria-label="Fechar">✕</button></div>
      <div class="story-img">${s.video_url ? `<video src="${urlSegura(s.video_url)}" playsinline autoplay ${somLigado() && !s.musica ? '' : 'muted'}></video>` : `<img src="${urlSegura(s.image_url)}" alt="">`}<button type="button" class="story-ant" aria-label="Anterior"></button><button type="button" class="story-prox" aria-label="Próximo"></button></div>
      ${s.caption ? `<p class="story-leg">${esc(s.caption)}</p>` : ''}
      ${s.poll ? `<div class="story-poll" data-poll><strong>📊 ${esc(s.poll.pergunta)}</strong><div class="controles">
        <button type="button" class="btn sec" data-voto="a">${esc(s.poll.a)}</button><button type="button" class="btn sec" data-voto="b">${esc(s.poll.b)}</button></div></div>` : ''}
      ${!meu && u ? `<div class="story-reacoes">${['🔥', '😂', '😮', '😍', '👏', '💀'].map((e) => `<button type="button" data-reagir="${e}">${e}</button>`).join('')}</div>` : ''}
      ${s.question && !meu ? `<form class="story-q" data-q><strong>💬 ${esc(s.question)}</strong><div class="controles"><input maxlength="300" placeholder="Responder..." required style="flex:1"><button class="btn pequeno">Enviar</button></div></form>` : ''}
      ${s.question && meu ? `<p class="muted">💬 ${esc(s.question)}: as respostas chegam nas suas notificações.</p>` : ''}
      ${s.musica ? `<div class="controles" style="align-items:center;gap:6px"><div data-spotify="${esc(s.musica)}" style="flex:1"></div>
        <button type="button" class="btn sec pequeno" data-som title="Tocar a música sozinha ao abrir">${somLigado() ? '🔊' : '🔇'}</button></div>` : ''}
      ${meu ? `<div class="controles story-meu"><span class="muted" id="st-vistas">👀 ...</span>
        <button type="button" class="btn sec pequeno" data-destacar>${s.highlight ? `⭐ Em "${esc(s.highlight)}"` : '⭐ Destacar no perfil'}</button>
        <button type="button" class="btn perigo pequeno" data-apagar>Apagar</button></div>` : ''}</div>`;
    if (!dlg.open) dlg.showModal();
    const minha = geracao;
    if (s.musica) {
      const ctrl = await playerSpotify(dlg.querySelector('[data-spotify]'), true, () => minha === geracao && dlg.open);
      if (minha !== geracao || !dlg.open) { destruirPlayer(ctrl); return; }   // a pessoa já passou/fechou enquanto carregava
      ctrlAtual = ctrl;
      dlg.querySelector('[data-som]').onclick = (e) => {
        const on = !somLigado(); definirSom(on); e.target.textContent = on ? '🔊' : '🔇';
        on ? ctrl && tocarSo(ctrl) : pararMusica();
      };
    }
    const avancar = () => { si++; mostrar(); };
    dlg.querySelector('.story-x').onclick = fechar;
    dlg.querySelector('.story-prox').onclick = avancar;
    dlg.querySelector('.story-ant').onclick = () => { if (si > 0) si--; else if (gi > 0) { gi--; si = 0; } mostrar(); };
    const pausar = () => { pausado = true; clearTimeout(timer); };
    dlg.querySelectorAll('input, [data-voto], [data-destacar]').forEach((el) => el.addEventListener('focus', pausar));
    if (s.poll) {
      const mostrarRes = async (meuVoto) => {
        const { data: r } = await sb.rpc('story_poll', { sid: s.id });
        const tot = (r?.a || 0) + (r?.b || 0) || 1;
        dlg.querySelector('[data-poll] .controles').innerHTML = ['a', 'b'].map((k) => `<div class="poll-res ${meuVoto === k ? 'meu' : ''}"><span style="width:${Math.round((r?.[k] || 0) / tot * 100)}%"></span>
          <b>${esc(s.poll[k])}</b> ${Math.round((r?.[k] || 0) / tot * 100)}%</div>`).join('');
      };
      const { data: v } = u ? await sb.from('story_votes').select('choice').eq('story_id', s.id).eq('user_id', u.id).maybeSingle() : { data: null };
      if (v || meu) mostrarRes(v?.choice);
      dlg.querySelectorAll('[data-voto]').forEach((b) => b.onclick = async () => {
        pausar();
        if (!u) return toast('Entre para votar.', true);
        const { error } = await sb.from('story_votes').insert({ story_id: s.id, user_id: u.id, choice: b.dataset.voto });
        if (error && !/duplicate/.test(error.message)) return falha(error);
        mostrarRes(b.dataset.voto);
      });
    }
    dlg.querySelector('[data-q]')?.addEventListener('submit', async (e) => {
      e.preventDefault(); pausar();
      const inp = e.target.querySelector('input');
      const { error } = await sb.rpc('answer_story', { sid: s.id, texto: inp.value });
      if (error) return falha(error);
      inp.value = ''; toast('Resposta enviada! 💬');
    });
    if (meu) {
      sb.from('story_views').select('user_id', { count: 'exact', head: true }).eq('story_id', s.id).then(({ count }) => { const el = $('#st-vistas'); if (el) el.textContent = `👀 ${count ?? 0} visualizações`; });
      dlg.querySelector('[data-apagar]').onclick = async () => {
        if (!confirm('Apagar este story?')) return;
        const { error } = await sb.from('stories').delete().eq('id', s.id);
        if (error) return falha(error);
        g.lista.splice(si, 1); toast('Story apagado.'); mostrar();
      };
      dlg.querySelector('[data-destacar]').onclick = async () => {
        pausar();
        const pasta = prompt('Nome do destaque (pasta no seu perfil). Ex.: Zerados, Setup, Prints\nDeixe vazio para tirar dos destaques.', s.highlight || '');
        if (pasta === null) return;
        const highlight = pasta.trim().slice(0, 30) || null;
        const { error } = await sb.from('stories').update({ highlight }).eq('id', s.id);
        if (error) return falha(error);
        s.highlight = highlight; toast(highlight ? `⭐ Salvo em "${highlight}" no seu perfil.` : 'Removido dos destaques.'); mostrar();
      };
    }
    dlg.querySelectorAll('[data-reagir]').forEach((b) => b.onclick = async () => {
      const { error } = await sb.rpc('react_story', { sid: s.id, e: b.dataset.reagir });
      if (error) return falha(error);
      dlg.querySelectorAll('[data-reagir]').forEach((x) => x.classList.toggle('ativo', x === b));
      toast(`${b.dataset.reagir} Reação enviada!`);
    });
    const vid = dlg.querySelector('.story-img video');
    if (vid) {
      // vídeo: avança quando termina (som ligado se você não silenciou e o story não tem música)
      vid.onended = () => { if (!pausado) avancar(); };
      vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
      return;
    }
    if (!pausado) timer = setTimeout(avancar, s.musica || s.poll || s.question ? 12000 : 7000);
  };
  dlg.onclose = () => { if (dlg.open) return; clearTimeout(timer); silenciar(); dlg.innerHTML = ''; };
  mostrar();
}

// Destaques no perfil: bolinhas por pasta; ao clicar, abre os stories daquela pasta
export async function destaquesPerfil(box, p, u) {
  const { data } = await sb.from('stories').select(COLS).eq('user_id', p.id).not('highlight', 'is', null).order('created_at');
  const pastas = new Map();
  for (const s of data || []) (pastas.get(s.highlight) || pastas.set(s.highlight, []).get(s.highlight)).push(s);
  if (!pastas.size) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="stories-barra destaques">${[...pastas].map(([nome, l]) => `<button type="button" class="story-bola destaque" data-pasta="${esc(nome)}">
    ${l[l.length - 1].image_url ? `<img ${srcCapa(l[l.length - 1].image_url, 160)} alt="">` : `<video src="${urlSegura(l[l.length - 1].video_url)}#t=0.5" muted preload="metadata" class="story-mini"></video>`}<span class="story-nome">${esc(nome)}</span></button>`).join('')}</div>`;
  box.querySelectorAll('[data-pasta]').forEach((b) => b.onclick = () => verStories(u, [{ p, lista: pastas.get(b.dataset.pasta) }], 0));
}
