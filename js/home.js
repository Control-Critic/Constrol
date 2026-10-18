import { sb, $, esc, montarLayout, cardJogo, plural, configurado, usuario, data, urlSegura, COLUNAS_CARD, avatarHtml, toast, falha, carrossel, esqueletoCards, esqueletoLista, param, srcCapa, steamAgora } from './app.js';
import { barraStories } from './stories.js';
import { COLUNAS_POST_DESAFIO as COLUNAS_POST, postHtml, ligarPosts, compositorHtml, ligarCompositor } from './posts.js';

let compositor = null, paginaFeed = 0; // declarados antes do uso (o código abaixo roda já no carregamento)
await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `
  <section id="stories" aria-label="Stories"></section>
  <section class="hero">
    <div>
      <h1>Aqui, as novidades estão ao seu alcance!</h1>
      <p>Notícias, avaliações da comunidade, promoções e salas de voz para jogar junto, tudo em um só lugar.</p>
      <div class="controles">
        <a class="btn" href="jogos.html">Explorar jogos</a>
        <a class="btn sec" href="comunidades.html">Ver comunidades</a>
      </div>
    </div>
    <img src="img/Adelino.png" alt="Adelino, o mascote do Control Critic">
  </section>
  <section id="grupo" style="margin-top:8px">
    <div class="controles" style="justify-content:space-between;align-items:center"><h2 style="margin:0">🎮 Procurando grupo agora</h2>
      <button class="btn pequeno hidden" id="lfg-abrir">+ Quero jogar agora</button></div>
    <form class="cartao hidden" id="lfg-form" style="margin-top:10px">
      <div class="form-linha">
        <div class="busca-jogo"><label for="lfg-busca">Jogo</label><input id="lfg-busca" type="search" placeholder="Qual jogo?" autocomplete="off"><input type="hidden" id="lfg-jogo"><div class="sugestoes hidden" id="lfg-sug"></div></div>
        <div><label for="lfg-plat">Plataforma</label><select id="lfg-plat"><option value="">Qualquer</option>${['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile', 'Crossplay'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div><label for="lfg-vagas">Vagas</label><input id="lfg-vagas" type="number" min="1" max="20" value="3"></div>
        <div><label for="lfg-dur">Por quanto tempo</label><select id="lfg-dur"><option value="1">1 hora</option><option value="2">2 horas</option><option value="4">4 horas</option></select></div>
      </div>
      <label for="lfg-nota">Recado</label><input id="lfg-nota" maxlength="200" placeholder="Ex.: Raid no difícil, com call. Nível 50+.">
      <div class="controles" style="margin-top:10px"><button class="btn">Publicar e avisar meus amigos</button><button type="button" class="btn sec" id="lfg-cancelar">Cancelar</button></div>
    </form>
    <div class="lista" id="lfg-lista" style="margin-top:10px"></div>
  </section>
  <section id="sec-rec" class="hidden"><h2>Recomendados para você</h2><div id="rec"></div></section>
  <h2>Destaques</h2><div id="destaques">${carrossel(esqueletoCards(5))}</div>
  <h2>🔥 Em promoção <a href="promocoes.html" style="font-size:.9rem;font-family:Inter">ver todas →</a></h2><div id="promos">${carrossel(esqueletoCards(5))}</div>
  <h2>📰 Últimas notícias <a href="novidades.html" style="font-size:.9rem;font-family:Inter">ver todas →</a></h2><div id="noticias">${carrossel(esqueletoCards(4))}</div>
  <h2>🆕 Lançamentos</h2><div id="lancamentos">${carrossel(esqueletoCards(5))}</div>
  <div class="detalhe" style="margin-top:8px">
    <section><div id="desafio"></div><h2>📣 Feed da comunidade</h2><div id="compor"></div><div class="lista" id="feed" style="margin-top:12px">${esqueletoLista(3)}</div>
      <button class="btn sec hidden" id="mais-feed" style="margin-top:12px;width:100%">Carregar mais</button></section>
    <aside><div id="jogando-agora"></div><h2>👥 Atividade dos amigos</h2><div class="lista" id="atividade"><p class="muted">Entre e siga pessoas para ver o que elas estão jogando e avaliando.</p></div></aside>
  </div>`);

if (configurado) {
  const ano = new Date().getFullYear();
  const [dest, promos, news, lanc] = await Promise.all([
    sb.from('games').select(COLUNAS_CARD).eq('featured', true).order('avg_rating', { ascending: false }).order('igdb_rating', { ascending: false, nullsFirst: false }).limit(12),
    sb.from('deals').select('*, games(slug,title,cover_url)').gt('discount_pct', 0).order('discount_pct', { ascending: false }).limit(12),
    sb.from('news').select('id,title,summary,source,cover_url,created_at').eq('published', true).order('created_at', { ascending: false }).limit(10),
    sb.from('games').select(COLUNAS_CARD).gte('release_year', ano - 1).order('release_year', { ascending: false }).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(12),
  ]);
  $('#destaques').innerHTML = carrossel((dest.data || []).map(cardJogo).join(''), 'Nenhum destaque ainda.');
  $('#lancamentos').innerHTML = carrossel((lanc.data || []).map(cardJogo).join(''), 'Nenhum lançamento recente.');
  $('#promos').innerHTML = carrossel((promos.data || []).filter((d) => d.games).map((d) => `
    <a class="jogo-card" href="jogo.html?slug=${encodeURIComponent(d.games.slug)}">
      <img ${srcCapa(d.games.cover_url, 480)} alt="" loading="lazy">
      <div class="info"><span class="titulo" title="${esc(d.games.title)}">${esc(d.games.title)}</span>
      <span><span class="tag amarela">-${d.discount_pct}%</span> <span class="tag">${esc(d.store)}</span></span></div></a>`).join(''), 'Sem promoções no momento.');
  // Resumo sem a frase automática dos blogs ("The post ... appeared first on ...")
  const limpar = (t) => String(t || '').replace(/\s*The post .*? appeared first on .*$/i, '').trim();
  $('#noticias').innerHTML = carrossel((news.data || []).map((n) => { const r = limpar(n.summary); return `
    <a class="noticia-card" href="novidades.html#n${n.id}">
      <img class="noticia-img" src="${urlSegura(n.cover_url) || 'img/ControlHeader.png'}" alt="" loading="lazy" ${n.cover_url ? '' : 'style="object-fit:contain;padding:18px"'}>
      <span class="noticia-corpo"><span class="muted" style="font-size:.78rem">${data(n.created_at)}${n.source ? ' · ' + esc(n.source) : ''}</span>
      <strong>${esc(n.title)}</strong>${r ? `<span class="muted noticia-resumo">${esc(r)}</span>` : ''}</span></a>`; }).join(''), 'Nenhuma notícia ainda.').replace('class="car-trilho"', 'class="car-trilho medio"');

  const u = await usuario();
  if (u) {
    const { data: rec } = await sb.rpc('recommend_games', { lim: 12 }).select(COLUNAS_CARD);
    if (rec?.length) { $('#sec-rec').classList.remove('hidden'); $('#rec').innerHTML = carrossel(rec.map(cardJogo).join('')); }
    carregarAtividade();
    carregarJogandoAgora(u).catch(() => {});
    barraStories($('#stories'), u);
    $('#compor').innerHTML = compositorHtml();
    compositor = ligarCompositor($('#compositor'), { u, aoPublicar: () => { carregarFeed(true); carregarDesafio(); } });
  }
  carregarFeed(true);
  carregarDesafio();
}

// ---------- Desafio ativo (ou que acabou de terminar, com os vencedores) ----------
async function carregarDesafio() {
  const agora = new Date().toISOString();
  const { data: ch, error } = await sb.from('challenges').select('*, cosmetics(name)').lte('starts_at', agora).gte('ends_at', new Date(Date.now() - 7 * 864e5).toISOString())
    .order('ends_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !ch) return;
  const aberto = new Date(ch.ends_at) > new Date();
  const { data: ps } = await sb.from('posts').select('id,image_url,body,likes_count,user_id,profiles!posts_user_id_fkey(username)').eq('challenge_id', ch.id).eq('status', 'published')
    .order('likes_count', { ascending: false }).limit(10);
  const { data: venc } = ch.winners?.length ? await sb.from('profiles').select('username').in('id', ch.winners) : { data: [] };
  const dias = Math.ceil((new Date(ch.ends_at) - Date.now()) / 864e5);
  $('#desafio').innerHTML = `<div class="cartao" style="margin-bottom:16px;border-color:var(--amarelo)">
    <h2 style="margin:0">🏆 ${esc(ch.title)}</h2>
    <p class="muted" style="margin:6px 0">${aberto ? `Termina em ${plural(dias, 'dia')}` : 'Encerrado'} · Prêmio: ${ch.cosmetics ? `<strong>${esc(ch.cosmetics.name)}</strong> + ` : ''}${ch.reward_extras?.length ? `${ch.reward_extras.length === 1 ? '1 item extra' : `${ch.reward_extras.length} itens extras`} + ` : ''}${ch.reward_xp} XP</p>
    ${ch.description ? `<p class="quebra">${esc(ch.description)}</p>` : ''}
    ${venc?.length ? `<p style="margin-top:8px">🥇 ${venc.length === 1 ? 'Vencedor' : 'Vencedores'}: ${venc.map((v) => `<a href="perfil.html?u=${encodeURIComponent(v.username)}">${esc(v.username)}</a>`).join(', ')}</p>` : ''}
    ${(ps || []).length ? `<p style="margin:10px 0 6px"><strong>Mais curtidos até agora:</strong></p>${carrossel(ps.map((x) => `<a class="noticia-card" href="index.html?post=${x.id}">
      ${x.image_url ? `<img class="noticia-img" src="${urlSegura(x.image_url)}" alt="" loading="lazy">` : ''}
      <span class="noticia-corpo">${x.image_url ? '' : `<span class="quebra noticia-resumo">${esc(x.body.slice(0, 160))}</span>`}
      <span class="muted" style="font-size:.85rem">${esc(x.profiles?.username)} · ❤️ ${x.likes_count}</span></span></a>`).join(''))}` : ''}
    ${aberto ? (compositor ? '<button class="btn" id="participar-desafio" style="margin-top:8px">Participar</button>' : '<p class="muted"><a href="entrar.html">Entre</a> para participar.</p>') : ''}
  </div>`;
  $('#participar-desafio')?.addEventListener('click', () => { compositor.definirDesafio(ch); $('#compositor').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#cp-txt').focus(); });
}

// ---------- Feed: posts ordenados por relevância (amigos, quem você segue, suas comunidades e jogos) ----------
async function carregarFeed(reiniciar) {
  const u = await usuario(), box = $('#feed'), POR = 15;
  if (reiniciar) paginaFeed = 0;
  const { data: ps, error } = await sb.rpc('home_feed', { lim: POR, offs: paginaFeed * POR }).select(COLUNAS_POST);
  if (error) { box.innerHTML = '<p class="muted">O feed fica disponível depois que o administrador atualizar o banco (schema.sql).</p>'; return; }
  let html = (ps || []).map((x) => postHtml(x, { u })).join('');
  // Link direto para um post (?post=ID): mostra ele primeiro
  const alvo = Number(param('post'));
  if (reiniciar && alvo && !(ps || []).some((x) => x.id === alvo)) {
    const { data: um } = await sb.from('posts').select(COLUNAS_POST).eq('id', alvo).maybeSingle();
    if (um) html = postHtml(um, { u }) + html;
  }
  if (reiniciar) box.innerHTML = html || `<div class="cartao vazio" style="text-align:center">📸 <strong>O feed está esperando o primeiro post!</strong>
    <p class="muted" style="margin:6px 0 10px">Compartilhe um print, uma conquista ou o que você está jogando.</p>
    ${u ? '<button class="btn" id="primeiro-post">Publicar agora</button>' : '<a class="btn" href="entrar.html">Entrar para publicar</a>'}</div>`;
  else box.insertAdjacentHTML('beforeend', html);
  $('#primeiro-post')?.addEventListener('click', () => { $('#cp-txt')?.focus(); $('#compositor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  ligarPosts(box, { u });
  $('#mais-feed').classList.toggle('hidden', (ps || []).length < POR);
  $('#mais-feed').onclick = () => { paginaFeed++; carregarFeed(false); };
  if (reiniciar && alvo) box.querySelector(`[data-post="${alvo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Quem você segue e está jogando agora (status público da Steam)
async function carregarJogandoAgora(u) {
  const { data: seg } = await sb.from('follows').select('profiles!follows_followed_id_fkey(id,username,avatar_url,equipped_frame,steam_id)').eq('follower_id', u.id).limit(100);
  const pessoas = (seg || []).map((x) => x.profiles).filter((p) => p?.steam_id);
  if (!pessoas.length) return;
  const st = await steamAgora(pessoas.map((p) => p.steam_id));
  const ativos = pessoas.filter((p) => st[p.steam_id]?.jogo);
  $('#jogando-agora').innerHTML = ativos.length ? `<h2>🟢 Jogando agora</h2><div class="lista" style="margin-bottom:14px">${ativos.map((p) => `<a class="atividade" href="perfil.html?u=${encodeURIComponent(p.username)}" style="color:var(--texto);text-decoration:none">
    ${avatarHtml(p)}<span style="flex:1;min-width:0;font-size:.9rem"><strong>${esc(p.username)}</strong><br><span class="tag jogando-agora">🎮 ${esc(st[p.steam_id].jogo)}</span></span></a>`).join('')}</div>` : '';
}

async function carregarAtividade() {
  const { data: at, error } = await sb.rpc('friends_activity', { lim: 12 });
  if (error) return;
  const st = { jogando: 'está jogando', zerado: 'zerou' };
  $('#atividade').innerHTML = (at || []).map((a) => `<a class="atividade" href="jogo.html?slug=${encodeURIComponent(a.game_slug)}" style="color:var(--texto);text-decoration:none">
    ${avatarHtml(a)}<span style="flex:1;min-width:0;font-size:.9rem"><strong>${esc(a.username)}</strong> ${a.tipo === 'review' ? `avaliou com ${'★'.repeat(a.nota)}` : st[a.status] || 'jogou'}
      <br><span class="muted">${esc(a.game_title)} · ${data(a.quando)}</span></span>
    ${urlSegura(a.cover_url) ? `<img class="capa" src="${urlSegura(a.cover_url)}" alt="" loading="lazy">` : ''}</a>`).join('')
    || '<p class="muted">Nada por aqui ainda. <a href="amigos.html">Adicione amigos</a> ou siga pessoas para ver o que estão jogando.</p>';
}

// ---------- Procurando grupo agora ----------
if (configurado) carregarLfg();
async function carregarLfg() {
  const u = await usuario();
  const { data: ps } = await sb.from('lfg_posts').select('*, profiles!lfg_posts_user_id_fkey(username,avatar_url,equipped_frame,psn_id,xbox_gamertag,discord_user), games(slug,title,cover_url), lfg_interest(user_id)')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(20);
  $('#lfg-abrir').classList.toggle('hidden', !u);
  const resta = (d) => { const m = Math.max(0, Math.round((new Date(d) - Date.now()) / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };
  $('#lfg-lista').innerHTML = (ps || []).map((x) => {
    const meu = u && x.user_id === u.id, foi = u && x.lfg_interest.some((i) => i.user_id === u.id);
    const contas = [x.platform === 'PlayStation' && x.profiles?.psn_id && 'PSN: ' + x.profiles.psn_id, x.platform === 'Xbox' && x.profiles?.xbox_gamertag && 'Xbox: ' + x.profiles.xbox_gamertag, x.profiles?.discord_user && 'Discord: ' + x.profiles.discord_user].filter(Boolean);
    return `<div class="cartao controles lfg" style="align-items:center">
      ${avatarHtml(x.profiles)}
      <div style="flex:1;min-width:200px"><a class="usuario" href="perfil.html?u=${encodeURIComponent(x.profiles?.username || '')}">${esc(x.profiles?.username)}</a> quer jogar
        ${x.games ? `<a href="jogo.html?slug=${encodeURIComponent(x.games.slug)}"><strong>${esc(x.games.title)}</strong></a>` : '<strong>agora</strong>'}
        ${x.platform ? `<span class="tag">${esc(x.platform)}</span>` : ''} ${x.slots ? `<span class="tag">${x.lfg_interest.length}/${x.slots} interessados</span>` : ''}
        ${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}
        ${contas.length ? `<br><span class="muted" style="font-size:.82rem">${esc(contas.join(' · '))}</span>` : ''}
        <br><span class="muted" style="font-size:.8rem">⏱️ expira em ${resta(x.expires_at)}</span></div>
      ${meu ? `<button class="btn sec pequeno" data-lfg-fim="${x.id}">Encerrar</button>`
        : u ? `<button class="btn pequeno ${foi ? 'sec' : ''}" data-lfg-quero="${x.id}" ${foi ? 'disabled' : ''}>${foi ? '✓ Avisado' : '🙋 Quero jogar'}</button>` : ''}
    </div>`;
  }).join('') || '<p class="muted">Ninguém procurando grupo agora. Seja o primeiro!</p>';

  $('#lfg-lista').querySelectorAll('[data-lfg-quero]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('lfg_interest').insert({ lfg_id: Number(b.dataset.lfgQuero), user_id: u.id });
    if (error) return falha(error);
    toast('Avisamos que você quer jogar! Combinem pelo perfil, Amigos ou Discord.'); carregarLfg();
  });
  $('#lfg-lista').querySelectorAll('[data-lfg-fim]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('lfg_posts').delete().eq('id', b.dataset.lfgFim); error ? falha(error) : carregarLfg();
  });
  if (!u || $('#lfg-form').dataset.ok) return;
  $('#lfg-form').dataset.ok = '1';
  $('#lfg-abrir').onclick = () => $('#lfg-form').classList.toggle('hidden');
  $('#lfg-cancelar').onclick = () => $('#lfg-form').classList.add('hidden');
  let t;
  $('#lfg-busca').oninput = () => {
    $('#lfg-jogo').value = ''; clearTimeout(t);
    t = setTimeout(async () => {
      const termo = $('#lfg-busca').value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return $('#lfg-sug').classList.add('hidden');
      const { data } = await sb.from('games').select('id,title').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(6);
      $('#lfg-sug').innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">${esc(j.title)}</button>`).join('');
      $('#lfg-sug').classList.remove('hidden');
      $('#lfg-sug').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { $('#lfg-jogo').value = b.dataset.id; $('#lfg-busca').value = b.dataset.t; $('#lfg-sug').classList.add('hidden'); });
    }, 300);
  };
  $('#lfg-form').onsubmit = async (e) => {
    e.preventDefault();
    const horas = Number($('#lfg-dur').value);
    const { error } = await sb.from('lfg_posts').insert({ user_id: u.id, game_id: $('#lfg-jogo').value ? Number($('#lfg-jogo').value) : null,
      platform: $('#lfg-plat').value || null, slots: Number($('#lfg-vagas').value) || null, note: $('#lfg-nota').value.trim() || null,
      expires_at: new Date(Date.now() + horas * 3600e3).toISOString() });
    if (error) return falha(/row-level/.test(error.message) ? { message: 'Você já tem 3 pedidos ativos. Encerre um para criar outro.' } : error);
    toast('Publicado! Seus amigos foram avisados.'); e.target.reset(); e.target.classList.add('hidden'); carregarLfg();
  };
}
