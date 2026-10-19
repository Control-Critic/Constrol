// Posts com imagem, curtidas e comentários (usado na página inicial, nas comunidades e no perfil)
import { apagarArquivos } from './app.js';
import { sb, $, esc, avatarHtml, toast, falha, urlSegura, denunciar, enviarImagem, esqueletoLista, imagemAceitavel, spotifyId, spotifyPlayer, playerSpotify, somLigado, definirSom, tocarSo, pararMusica, enviarVideo } from './app.js';

export const COLUNAS_POST = '*, profiles!posts_user_id_fkey(username,avatar_url,equipped_frame), games(slug,title), communities(id,name)';
// Com desafio (só depois do schema novo): usado onde os desafios aparecem
export const COLUNAS_POST_DESAFIO = COLUNAS_POST + ', challenges(id,title)';

const tempo = (d) => {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
// Deixa links clicáveis (só http/https) depois de escapar o texto
// @usuario vira link para o perfil (e a pessoa é avisada pelo banco)
const comLinks = (t) => esc(t)
  .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`)
  .replace(/(^|[\s(])@([A-Za-z0-9_]{3,30})\b/g, (_, a, n) => `${a}<a href="perfil.html?u=${n}">@${n}</a>`);

export function postHtml(x, { u, moderar = false, mostrarComunidade = true } = {}) {
  const meu = u && x.user_id === u.id;
  return `<article class="post ${x.aviso ? 'post-aviso' : ''}" data-post="${x.id}">${x.aviso ? '<span class="tag amarela" style="margin-bottom:6px">📢 Aviso da comunidade</span>' : ''}
    <header>${avatarHtml(x.profiles)}
      <span style="flex:1;min-width:0"><a class="usuario" href="perfil.html?u=${encodeURIComponent(x.profiles?.username || '')}">${esc(x.profiles?.username)}</a>
        ${mostrarComunidade && x.communities ? `<span class="muted"> em <a href="comunidade.html?id=${x.communities.id}">${esc(x.communities.name)}</a></span>` : ''}
        ${x.challenges ? `<span class="tag amarela" style="margin-left:4px">🏆 ${esc(x.challenges.title)}</span>` : ''}
        ${x.instagram_url ? `<a class="tag amarela" style="margin-left:4px" href="${urlSegura(x.instagram_url)}" target="_blank" rel="noopener noreferrer">📸 no Instagram</a>` : x.ig_ok ? '<span class="tag" style="margin-left:4px">😂 meme</span>' : ''}
        <br><span class="muted" style="font-size:.8rem">${tempo(x.created_at)}${x.games ? ` · 🎮 <a href="jogo.html?slug=${encodeURIComponent(x.games.slug)}">${esc(x.games.title)}</a>` : ''}</span></span>
      ${meu || moderar ? `<button class="btn sec pequeno" data-p-del="${x.id}">Apagar</button>` : u ? `<button class="bt-denunciar" data-p-den="${x.id}" aria-label="Denunciar">🚩</button>` : ''}
    </header>
    ${x.body ? `<p class="quebra">${comLinks(x.body)}</p>` : ''}
    ${x.musica ? `<div class="controles post-musica" style="align-items:center;gap:6px"><div data-spotify="${esc(x.musica)}" style="flex:1"></div>
      <button type="button" class="btn sec pequeno" data-som title="Tocar a música sozinha ao ver o post">${somLigado() ? '🔊' : '🔇'}</button></div>` : ''}
    ${x.image_url ? `<img class="post-img" src="${urlSegura(x.image_url)}" alt="Imagem do post" loading="lazy">` : ''}
    ${x.video_url ? `<div class="post-video"><video src="${urlSegura(x.video_url)}" playsinline loop muted preload="metadata"></video>
      <button type="button" class="video-som" data-video-som title="Som">🔇</button></div>` : ''}
    <footer class="post-acoes">
      <button class="bt-acao" data-p-like="${x.id}" ${u ? '' : 'disabled'}>🤍 <span>${x.likes_count || 0}</span></button>
      <button class="bt-acao" data-p-com="${x.id}">💬 <span>${x.comments_count || 0}</span></button>
      <button class="bt-acao" data-p-link="${x.id}" aria-label="Copiar link">🔗</button>
    </footer>
    <div class="post-coments hidden"></div>
  </article>`;
}

// Liga os botões de uma lista de posts já desenhada. aoMudar: recarregar a lista (ex.: depois de apagar)
// Música dos posts: toca sozinha o post que está mais visível na tela (um por vez), como no Instagram
let observador = null;
function ligarMusicas(box) {
  const blocos = [...box.querySelectorAll('.post-musica')];
  if (!blocos.length) return;
  observador ||= new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const b = e.target;
      if (e.isIntersecting && e.intersectionRatio >= 0.7) { if (b._ctrl && somLigado()) tocarSo(b._ctrl); }
      else if (b._ctrl) b._ctrl.pause?.();
    }
  }, { threshold: [0, 0.7] });
  for (const b of blocos) {
    if (b._ligado) continue; b._ligado = true;
    playerSpotify(b.querySelector('[data-spotify]')).then((c) => { b._ctrl = c; observador.observe(b); });
    b.querySelector('[data-som]').onclick = (e) => {
      const on = !somLigado(); definirSom(on);
      document.querySelectorAll('.post-musica [data-som]').forEach((x) => { x.textContent = on ? '🔊' : '🔇'; });
      on ? b._ctrl && tocarSo(b._ctrl) : pararMusica();
    };
  }
}

// Vídeos dos posts: tocam sozinhos (sem som) quando aparecem na tela e pausam ao sair; 🔇/🔊 liga o som
let obsVideo = null;
function ligarVideos(box) {
  obsVideo ||= new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; e.isIntersecting && e.intersectionRatio >= 0.6 ? v.play().catch(() => {}) : v.pause(); }), { threshold: [0, 0.6] });
  box.querySelectorAll('.post-video').forEach((c) => {
    if (c._ligado) return; c._ligado = true;
    const v = c.querySelector('video'), b = c.querySelector('[data-video-som]');
    obsVideo.observe(v);
    v.onclick = () => (v.paused ? v.play() : v.pause());
    b.onclick = () => { v.muted = !v.muted; b.textContent = v.muted ? '🔇' : '🔊'; if (!v.muted) pararMusica(); };
  });
}

export async function ligarPosts(box, { u, aoMudar } = {}) {
  ligarMusicas(box);
  ligarVideos(box);
  const ids = [...box.querySelectorAll('[data-post]')].map((a) => Number(a.dataset.post));
  if (u && ids.length) {
    const { data: curti } = await sb.from('post_likes').select('post_id').eq('user_id', u.id).in('post_id', ids);
    for (const c of curti || []) { const b = box.querySelector(`[data-p-like="${c.post_id}"]`); if (b) { b.classList.add('ativo'); b.firstChild.textContent = '❤️ '; } }
  }
  box.querySelectorAll('[data-p-like]:not([data-ok])').forEach((b) => { b.dataset.ok = 1; b.onclick = async () => {
    const id = Number(b.dataset.pLike), on = !b.classList.contains('ativo'), n = b.querySelector('span');
    b.classList.toggle('ativo', on); b.firstChild.textContent = on ? '❤️ ' : '🤍 '; n.textContent = Number(n.textContent) + (on ? 1 : -1);
    const { error } = on ? await sb.from('post_likes').insert({ post_id: id, user_id: u.id }) : await sb.from('post_likes').delete().eq('post_id', id).eq('user_id', u.id);
    if (error && error.code !== '23505') falha(error);
  }; });
  box.querySelectorAll('[data-p-com]:not([data-ok])').forEach((b) => { b.dataset.ok = 1; b.onclick = () => abrirComentarios(b.closest('.post'), u); });
  box.querySelectorAll('[data-p-link]:not([data-ok])').forEach((b) => { b.dataset.ok = 1; b.onclick = async () => {
    const link = `${location.origin}/index.html?post=${b.dataset.pLink}`;
    try { await navigator.clipboard.writeText(link); toast('Link do post copiado!'); } catch { prompt('Copie o link:', link); }
  }; });
  box.querySelectorAll('[data-p-den]:not([data-ok])').forEach((b) => { b.dataset.ok = 1; b.onclick = () => denunciar('post', b.dataset.pDen); });
  box.querySelectorAll('[data-p-del]:not([data-ok])').forEach((b) => { b.dataset.ok = 1; b.onclick = async () => {
    if (!confirm('Apagar este post?')) return;
    const { data: antes } = await sb.from('posts').select('image_url,video_url').eq('id', b.dataset.pDel).maybeSingle();
    const { error } = await sb.from('posts').delete().eq('id', b.dataset.pDel);
    if (error) return falha(error);
    apagarArquivos(antes?.image_url, antes?.video_url); // libera espaço no armazenamento
    b.closest('.post').remove(); aoMudar?.();
  }; });
  // Clique na imagem: abre grande
  box.querySelectorAll('.post-img:not([data-ok])').forEach((img) => { img.dataset.ok = 1; img.onclick = () => verImagem(img.src); });
}

export function verImagem(src) {
  const d = document.createElement('dialog');
  d.className = 'visor';
  d.innerHTML = `<img src="${urlSegura(src)}" alt=""><button class="btn sec pequeno" aria-label="Fechar">✕</button>`;
  d.onclick = () => d.close(); d.onclose = () => d.remove();
  document.body.append(d); d.showModal();
}

async function abrirComentarios(art, u) {
  const box = art.querySelector('.post-coments'), id = Number(art.dataset.post);
  if (!box.classList.contains('hidden') && box.dataset.ok) return box.classList.add('hidden');
  box.classList.remove('hidden'); box.dataset.ok = 1;
  box.innerHTML = esqueletoLista(1);
  const { data: cs } = await sb.from('post_comments').select('*, profiles(username,avatar_url,equipped_frame)').eq('post_id', id).order('created_at').limit(100);
  box.innerHTML = `${(cs || []).map((c) => `<div class="comentario">${avatarHtml(c.profiles)}<div style="flex:1">
      <a class="usuario" href="perfil.html?u=${encodeURIComponent(c.profiles?.username || '')}">${esc(c.profiles?.username)}</a> <span class="muted" style="font-size:.78rem">${tempo(c.created_at)}</span>
      <p class="quebra">${comLinks(c.body)}</p></div>
      ${u && c.user_id === u.id ? `<button class="bt-denunciar" data-c-del="${c.id}" aria-label="Apagar">✕</button>` : u ? `<button class="bt-denunciar" data-c-den="${c.id}" aria-label="Denunciar">🚩</button>` : ''}</div>`).join('') || '<p class="muted" style="font-size:.85rem">Nenhum comentário ainda.</p>'}
    ${u ? '<form class="controles" style="margin-top:8px"><input maxlength="1000" placeholder="Escreva um comentário..." required style="flex:1"><button class="btn pequeno">Enviar</button></form>'
      : '<p class="muted" style="font-size:.85rem"><a href="entrar.html">Entre</a> para comentar.</p>'}`;
  const contar = (d) => { const n = art.querySelector('[data-p-com] span'); n.textContent = Math.max(0, Number(n.textContent) + d); };
  box.querySelector('form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input');
    const { error } = await sb.from('post_comments').insert({ post_id: id, user_id: u.id, body: inp.value.trim() });
    if (error) return falha(error);
    contar(1); box.dataset.ok = ''; abrirComentarios(art, u);
  });
  box.querySelectorAll('[data-c-del]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('post_comments').delete().eq('id', b.dataset.cDel);
    if (error) return falha(error);
    contar(-1); b.closest('.comentario').remove();
  });
  box.querySelectorAll('[data-c-den]').forEach((b) => b.onclick = () => denunciar('post_comment', b.dataset.cDen));
}

// Caixa de criar post (texto + imagem + jogo opcional). comunidade: id ou null (post no perfil/feed)
export function compositorHtml(placeholder = 'O que você está jogando? Compartilhe um print, uma conquista, uma dica... (use @nome para marcar alguém)') {
  return `<form class="cartao compositor" id="compositor">
    <textarea id="cp-txt" rows="2" maxlength="2000" placeholder="${esc(placeholder)}"></textarea>
    <div class="cp-desafio hidden" id="cp-desafio"></div>
    <input id="cp-musica" class="hidden" type="url" placeholder="🎵 Cole o link de uma música do Spotify (opcional)" style="margin-top:6px">
    <div class="cp-previa hidden" id="cp-previa"><img alt=""><video class="hidden" muted playsinline controls style="max-width:100%;max-height:240px;border-radius:10px"></video><button type="button" class="btn sec pequeno" id="cp-tirar">✕ Remover imagem</button></div>
    <div class="controles" style="margin-top:8px;align-items:center">
      <label class="btn sec pequeno" style="cursor:pointer">🖼️ Imagem / GIF / 🎬 Vídeo<input type="file" id="cp-img" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" hidden></label>
      <span class="busca-jogo" style="flex:1;min-width:160px;max-width:280px"><input id="cp-busca" type="search" placeholder="🎮 Marcar jogo (opcional)" autocomplete="off"><input type="hidden" id="cp-jogo"><span class="sugestoes hidden" id="cp-sug"></span></span>
      <label class="muted cp-meme hidden" style="font-size:.85rem;display:flex;gap:6px;align-items:center" title="A equipe escolhe os melhores e posta no @control.critic com crédito para você"><input type="checkbox" id="cp-meme"> 😂 É meme: pode ir para o Instagram do Control Critic (com seu @)</label>
      <button type="button" class="btn sec pequeno" id="cp-bt-musica" title="Adicionar música do Spotify">🎵 Música</button>
      <label class="muted cp-aviso hidden" style="font-size:.85rem;display:flex;gap:6px;align-items:center"><input type="checkbox" id="cp-aviso" style="width:auto"> 📢 Fixar como aviso</label>
      <button class="btn" id="cp-enviar" style="margin-left:auto">Publicar</button>
    </div></form>`;
}

export function ligarCompositor(form, { u, comunidade = null, jogo = null, aoPublicar, moderador = false }) {
  let arquivo = null, t, desafio = null;
  if (moderador && comunidade) $('.cp-aviso', form).classList.remove('hidden');
  $('#cp-bt-musica', form).onclick = () => { $('#cp-musica', form).classList.toggle('hidden'); $('#cp-musica', form).focus(); };
  const boxDesafio = $('#cp-desafio', form);
  const definirDesafio = (ch) => {
    desafio = ch;
    boxDesafio.classList.toggle('hidden', !ch);
    boxDesafio.innerHTML = ch ? `<span class="tag amarela">🏆 Participando: ${esc(ch.title)}</span> <button type="button" class="btn sec pequeno">✕</button>` : '';
    boxDesafio.querySelector('button')?.addEventListener('click', () => definirDesafio(null));
  };
  const previa = $('#cp-previa', form);
  if (jogo) { $('#cp-jogo', form).value = jogo.id; $('#cp-busca', form).value = jogo.title; }
  $('#cp-img', form).onchange = (e) => {
    const a = e.target.files[0];
    if (!a) return;
    if (a.type.startsWith('video/')) {
      if (a.size > 50 * 1024 * 1024) { e.target.value = ''; return toast('O vídeo deve ter no máximo 50 MB.', true); }
      arquivo = a; previa.querySelector('img').classList.add('hidden');
      const v = previa.querySelector('video'); v.src = URL.createObjectURL(a); v.classList.remove('hidden'); previa.classList.remove('hidden');
      $('.cp-meme', form).classList.add('hidden');
      return;
    }
    previa.querySelector('video').classList.add('hidden'); previa.querySelector('img').classList.remove('hidden');
    const problema = imagemAceitavel(a, 3);
    if (problema) { e.target.value = ''; return toast(problema, true); }
    arquivo = a; previa.querySelector('img').src = URL.createObjectURL(a); previa.classList.remove('hidden');
    $('.cp-meme', form).classList.remove('hidden');
  };
  const semImagem = () => { arquivo = null; $('#cp-img', form).value = ''; previa.classList.add('hidden'); $('.cp-meme', form).classList.add('hidden'); $('#cp-meme', form).checked = false; };
  $('#cp-tirar', form).onclick = semImagem;
  $('#cp-busca', form).oninput = () => {
    $('#cp-jogo', form).value = ''; clearTimeout(t);
    t = setTimeout(async () => {
      const termo = $('#cp-busca', form).value.trim().replace(/[%,()]/g, ''), sug = $('#cp-sug', form);
      if (termo.length < 2) return sug.classList.add('hidden');
      const { data } = await sb.from('games').select('id,title').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(6);
      sug.innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">${esc(j.title)}</button>`).join('');
      sug.classList.remove('hidden');
      sug.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { $('#cp-jogo', form).value = b.dataset.id; $('#cp-busca', form).value = b.dataset.t; sug.classList.add('hidden'); });
    }, 300);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const texto = $('#cp-txt', form).value.trim();
    if (!texto && !arquivo) return toast('Escreva algo ou escolha uma imagem ou vídeo.', true);
    const linkMus = $('#cp-musica', form).value.trim();
    if (linkMus && !spotifyId(linkMus)) return toast('Link do Spotify inválido. No Spotify: Compartilhar → Copiar link.', true);
    const bt = $('#cp-enviar', form); bt.disabled = true; bt.textContent = 'Publicando...';
    try {
      const ehVideo = arquivo?.type.startsWith('video/');
      if (ehVideo) bt.textContent = 'Enviando vídeo...';
      const image_url = arquivo && !ehVideo ? await enviarImagem(u.id, 'post', arquivo) : null;
      const video_url = ehVideo ? await enviarVideo(u.id, 'video', arquivo, 50, { maxSegundos: 180, aoProgresso: (p) => { bt.textContent = `Otimizando vídeo... ${Math.round(p * 100)}%`; } }) : null;
      if (ehVideo) bt.textContent = 'Publicando...';
      const { error } = await sb.from('posts').insert({ user_id: u.id, community_id: comunidade, body: texto || '📷',
        image_url, ...(video_url ? { video_url } : {}), game_id: $('#cp-jogo', form).value ? Number($('#cp-jogo', form).value) : null, ...(desafio ? { challenge_id: desafio.id } : {}), ...(arquivo && $('#cp-meme', form).checked ? { ig_ok: true } : {}),
        ...(linkMus ? { musica: spotifyId(linkMus) } : {}), ...($('#cp-aviso', form).checked ? { aviso: true } : {}) });
      if (error) throw /row-level/.test(error.message) ? new Error('Você precisa participar da comunidade para publicar.') : error;
      const meme = arquivo && $('#cp-meme', form).checked;
      form.reset(); semImagem();
      if (meme) toast('😂 Meme enviado! Se a equipe aprovar, ele vai para o @control.critic com o seu nome.');
      toast(desafio ? 'Participação enviada! Boa sorte 🏆' : 'Publicado!'); definirDesafio(null); aoPublicar?.();
    } catch (err) { falha(err); } finally { bt.disabled = false; bt.textContent = 'Publicar'; }
  };
  return { definirDesafio };
}
