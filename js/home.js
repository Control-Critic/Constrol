import { sb, $, esc, montarLayout, cardJogo, plural, configurado, usuario, perfil, data, urlSegura, COLUNAS_CARD, avatarHtml, toast, falha, carrossel, esqueletoCards, esqueletoLista, param, srcCapa, steamAgora, urlCdn, contarEvento } from './app.js';
import { barraStories } from './stories.js';
import { COLUNAS_POST_DESAFIO as COLUNAS_POST, postHtml, ligarPosts, compositorHtml, ligarCompositor } from './posts.js';

// feed.html usa este mesmo módulo só com o feed completo e a atividade dos amigos
const PAGINA_FEED = location.pathname.endsWith('feed.html');
let compositor = null, paginaFeed = 0; // declarados antes do uso (o código abaixo roda já no carregamento)
// O cabeçalho monta em paralelo: o conteúdo da home não espera o perfil carregar
montarLayout().catch(() => {});
const main = $('#conteudo');
if (configurado) main.classList.add('montando');

// Cada bloco da home é uma <section> com id; a ordem muda conforme quem está vendo
// (visitante, conta nova ou usuário recorrente). Blocos sem conteúdo ficam escondidos.
const ver = (titulo, link) => link ? `<h2>${titulo} <a href="${link}" style="font-size:.9rem;font-family:Inter">ver todas →</a></h2>` : `<h2>${titulo}</h2>`;
main.insertAdjacentHTML('beforeend', `
  <section id="stories" aria-label="Stories"></section>
  <section class="hero" id="b-hero">
    <div>
      <span class="selo-br">🇧🇷 Rede social brasileira de games</span>
      <h1>Sua rede social para <em>jogar</em>, <em>avaliar</em> e encontrar sua <em>comunidade</em>.</h1>
      <p>Descubra jogos, acompanhe promoções, encontre companhia para jogar e compartilhe suas experiências com outros jogadores.</p>
      <div class="controles" id="hero-acoes">
        <a class="btn" href="entrar.html?modo=cadastro">Criar conta grátis</a>
        <a class="btn sec" href="jogos.html">Explorar jogos</a>
        <a class="btn sec" href="comunidades.html">Ver comunidades</a>
      </div>
    </div>
    <div class="adelino-hero">
      <span class="balao" id="balao-adelino" aria-live="off">Bora uma partida? 🎮</span>
      <img src="img/Adelino.png" alt="Adelino, o tucano mascote do Control Critic" width="260" height="260" fetchpriority="high">
    </div>
  </section>
  <section id="b-como" class="hidden" aria-labelledby="como-t">
    <h2 id="como-t">Como funciona</h2>
    <ol class="passos-home">
      <li><a class="passo-link" href="jogos.html"><img src="${urlCdn('img/adelino/rpg.png', 240)}" alt="" width="120" height="116" loading="lazy"><strong>Monte sua biblioteca</strong><span>Marque o que está jogando, zerou ou ainda vai começar. Tem Steam? Importa tudo num clique.</span></a></li>
      <li><a class="passo-link" href="jogos.html?ordem=avg_rating"><img src="${urlCdn('img/adelino/enquete.png', 240)}" alt="" width="120" height="105" loading="lazy"><strong>Dê sua nota</strong><span>Avalie, discorde da crítica e descubra jogos pela opinião de quem joga de verdade.</span></a></li>
      <li><a class="passo-link" href="comunidades.html"><img src="${urlCdn('img/adelino/fps.png', 240)}" alt="" width="120" height="108" loading="lazy"><strong>Ache seu squad</strong><span>Crie um grupo, entre numa comunidade e chame a galera pra call. Sem jogar sozinho.</span></a></li>
    </ol>
    <ul class="diferenciais" id="diferenciais"></ul>
  </section>
  <section id="b-checklist" class="hidden" aria-labelledby="ck-t"></section>
  <section id="b-grupo" style="margin-top:8px" aria-labelledby="grupo-t">
    <div class="controles" style="justify-content:space-between;align-items:center"><h2 id="grupo-t" style="margin:0">🎮 Procurando grupo agora</h2>
      <button class="btn pequeno" id="lfg-abrir" aria-expanded="false" aria-controls="lfg-form">+ Criar grupo agora</button></div>
    <form class="cartao hidden" id="lfg-form" style="margin-top:10px" novalidate>
      <div class="form-linha">
        <div class="busca-jogo"><label for="lfg-busca">Jogo</label><input id="lfg-busca" type="search" placeholder="Qual jogo?" autocomplete="off" required aria-describedby="lfg-erro"><input type="hidden" id="lfg-jogo"><div class="sugestoes hidden" id="lfg-sug" role="listbox" aria-label="Jogos encontrados"></div></div>
        <div><label for="lfg-plat">Plataforma</label><select id="lfg-plat"><option value="">Qualquer</option>${['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div><label for="lfg-inicio">Início</label><select id="lfg-inicio"><option value="0">Agora</option><option value="30">Em 30 min</option><option value="60">Em 1 hora</option><option value="120">Em 2 horas</option><option value="hora">Escolher horário</option></select>
          <input id="lfg-hora" type="datetime-local" class="hidden" aria-label="Horário de início"></div>
        <div><label for="lfg-dur">Duração</label><select id="lfg-dur"><option value="1">1 hora</option><option value="2" selected>2 horas</option><option value="4">4 horas</option><option value="6">6 horas</option></select></div>
        <div><label for="lfg-vagas">Vagas</label><input id="lfg-vagas" type="number" min="1" max="20" value="3" inputmode="numeric"></div>
        <div><label for="lfg-mic">Microfone</label><select id="lfg-mic"><option value="opcional">Opcional</option><option value="obrigatorio">Obrigatório</option><option value="sem">Sem call</option></select></div>
        <div><label for="lfg-vis">Quem vê</label><select id="lfg-vis"><option value="publico">Todo mundo</option><option value="amigos">Só amigos</option></select></div>
      </div>
      <div class="controles" style="margin-top:8px;gap:16px">
        <label class="check"><input type="checkbox" id="lfg-cross"> Crossplay</label>
        <label class="check"><input type="checkbox" id="lfg-avisar" checked> Avisar meus amigos</label>
      </div>
      <label for="lfg-nota">Recado</label><input id="lfg-nota" maxlength="200" placeholder="Ex.: Raid no difícil, nível 50+, só diversão.">
      <p class="erro-campo" id="lfg-erro" role="alert"></p>
      <div class="controles" style="margin-top:10px"><button class="btn" id="lfg-enviar">Criar grupo</button><button type="button" class="btn sec" id="lfg-cancelar">Cancelar</button></div>
    </form>
    <div class="lista" id="lfg-lista" style="margin-top:10px" aria-live="polite"></div>
  </section>
  <section id="b-comunidades" class="hidden">${ver('🏰 Comunidades', 'comunidades.html')}<div id="comunidades-home"></div></section>
  <section id="b-feed-wrap" class="detalhe hidden" style="margin-top:8px">
    <section><h2>📣 Feed da comunidade</h2><div id="compor"></div><div class="lista" id="feed" style="margin-top:12px">${esqueletoLista(3)}</div>
      <button class="btn sec hidden" id="mais-feed" style="margin-top:12px;width:100%">Carregar mais</button>
      <a class="btn sec hidden ver-tudo" id="ver-feed" href="feed.html">Ver o feed completo →</a></section>
    <aside><div id="desafio"></div><div id="jogando-agora"></div><h2>👥 Atividade dos amigos</h2><div class="lista" id="atividade"><p class="muted">Siga pessoas para ver o que elas estão jogando e avaliando.</p></div>
      <a class="btn sec hidden ver-tudo" id="ver-atividade" href="feed.html#atividade">Ver toda a atividade →</a></aside>
  </section>
  <section id="b-rec" class="hidden">${ver('🎯 Recomendados para você')}<div id="rec"></div></section>
  <section id="b-desejos" class="hidden">${ver('💸 Promoções da sua lista de desejos', 'promocoes.html')}<div id="desejos"></div></section>
  <section id="b-destaques">${ver('⭐ Jogos em destaque')}<div id="destaques">${carrossel(esqueletoCards(5))}</div></section>
  <section id="b-promos">${ver('🔥 Em promoção', 'promocoes.html')}<div id="promos">${carrossel(esqueletoCards(5))}</div></section>
  <section id="b-avaliacoes" class="hidden">${ver('⭐ Avaliações da comunidade')}<div class="lista" id="avaliacoes"></div></section>
  <section id="b-cadastro" class="hidden"><div class="cartao cta-cadastro"><img class="cta-adelino" src="${urlCdn('img/adelino/meme.png', 240)}" alt="" width="110" height="105" loading="lazy">
    <h2 style="margin-top:0">Partiu? O Adelino guardou um lugar pra você</h2>
    <p>Conta grátis: biblioteca, notas, alerta de promoção e gente pra jogar junto.</p>
    <div class="controles"><a class="btn" href="entrar.html?modo=cadastro">Criar conta grátis</a><a class="btn sec" href="entrar.html">Já tenho conta</a></div></div></section>
  <section id="b-noticias">${ver('📰 Últimas notícias', 'novidades.html')}<div id="noticias">${carrossel(esqueletoCards(4))}</div></section>
  <section id="b-lancamentos">${ver('🆕 Lançamentos')}<div id="lancamentos">${carrossel(esqueletoCards(5))}</div></section>`);

const ORDEM = {
  visitante: ['b-hero', 'b-como', 'b-destaques', 'b-grupo', 'b-comunidades', 'b-promos', 'b-avaliacoes', 'b-cadastro', 'b-noticias', 'b-lancamentos'],
  novo: ['b-hero', 'b-como', 'b-checklist', 'b-grupo', 'b-comunidades', 'b-destaques', 'b-rec', 'b-promos', 'b-noticias', 'b-lancamentos', 'b-feed-wrap'],
  recorrente: ['stories', 'b-hero', 'b-como', 'b-grupo', 'b-feed-wrap', 'b-rec', 'b-desejos', 'b-destaques', 'b-promos', 'b-noticias', 'b-lancamentos', 'b-comunidades'],
};
function ordenar(estado) {
  if (PAGINA_FEED) { for (const s of [...main.children]) if (s.id !== 'b-feed-wrap') s.remove(); return; }
  for (const id of ORDEM[estado]) { const el = document.getElementById(id); if (el) main.append(el); }
}

// Preenche um bloco; sem itens, esconde a seção inteira (não mostra espaço vazio)
function preencher(secao, alvo, html) {
  const s = document.getElementById(secao);
  if (!s) return; // seção que não existe nesta página (feed.html)
  if (!html) { s.classList.add('hidden'); return; }
  s.classList.remove('hidden');
  $(alvo).innerHTML = html;
}
// Erro com nova tentativa, só no bloco que falhou
function erroBloco(secao, alvo, tentar) {
  if (!document.getElementById(secao)) return;
  document.getElementById(secao).classList.remove('hidden');
  $(alvo).innerHTML = '<p class="vazio" role="alert">Não foi possível carregar agora. <button class="btn sec pequeno" type="button">Tentar de novo</button></p>';
  $(alvo).querySelector('button').onclick = () => { $(alvo).innerHTML = carrossel(esqueletoCards(4)); tentar(); };
}
async function bloco(secao, alvo, consulta, montar) {
  if (!document.getElementById(secao)) return;
  try {
    const { data: d, error } = await consulta();
    if (error) throw error;
    preencher(secao, alvo, montar(d || []));
  } catch { erroBloco(secao, alvo, () => bloco(secao, alvo, consulta, montar)); }
}

const limpar = (t) => String(t || '').replace(/\s*The post .*? appeared first on .*$/i, '').trim(); // frase automática dos blogs
const cardPromo = (d) => `
    <a class="jogo-card" href="jogo.html?slug=${encodeURIComponent(d.games.slug)}">
      <img ${srcCapa(d.games.cover_url, 480)} alt="" loading="lazy">
      <div class="info"><span class="titulo" title="${esc(d.games.title)}">${esc(d.games.title)}</span>
      <span><span class="tag amarela">-${Number(d.discount_pct)}%</span> <span class="tag">${esc(d.store)}</span></span></div></a>`;

if (configurado) {
  const ano = new Date().getFullYear();
  // Blocos públicos começam a carregar já, sem esperar saber quem está vendo
  if (!PAGINA_FEED) {
    bloco('b-destaques', '#destaques', () => sb.from('games').select(COLUNAS_CARD).eq('featured', true).order('avg_rating', { ascending: false }).order('igdb_rating', { ascending: false, nullsFirst: false }).limit(12),
      (l) => l.length ? carrossel(l.map(cardJogo).join('')) : '');
    bloco('b-lancamentos', '#lancamentos', () => sb.from('games').select(COLUNAS_CARD).gte('release_year', ano - 1).order('release_year', { ascending: false }).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(12),
      (l) => l.length ? carrossel(l.map(cardJogo).join('')) : '');
    bloco('b-promos', '#promos', () => sb.from('deals').select('*, games(slug,title,cover_url)').gt('discount_pct', 0).order('discount_pct', { ascending: false }).limit(12),
      (l) => { const v = l.filter((d) => d.games); return v.length ? carrossel(v.map(cardPromo).join('')) : ''; });
    bloco('b-noticias', '#noticias', () => sb.from('news').select('id,title,summary,source,cover_url,created_at').eq('published', true).order('created_at', { ascending: false }).limit(10),
      (l) => l.length ? carrossel(l.map((n) => { const r = limpar(n.summary); return `
      <a class="noticia-card" href="novidades.html#n${Number(n.id)}">
        <img class="noticia-img" src="${urlSegura(n.cover_url) || 'img/ControlHeader.png'}" alt="" loading="lazy" ${n.cover_url ? '' : 'style="object-fit:contain;padding:18px"'}>
        <span class="noticia-corpo"><span class="muted" style="font-size:.78rem">${data(n.created_at)}${n.source ? ' · ' + esc(n.source) : ''}</span>
        <strong>${esc(n.title)}</strong>${r ? `<span class="muted noticia-resumo">${esc(r)}</span>` : ''}</span></a>`; }).join('')).replace('class="car-trilho"', 'class="car-trilho medio"') : '');
    bloco('b-comunidades', '#comunidades-home', () => sb.from('communities').select('id,name,description,icon_url').eq('is_private', false).order('created_at', { ascending: true }).limit(6),
      (l) => l.length ? `<div class="grade">${l.map((c) => `<a class="cartao" href="comunidade.html?id=${Number(c.id)}" style="color:var(--texto);text-decoration:none">
        <strong>${esc(c.name)}</strong><p class="muted" style="font-size:.85rem;margin:4px 0">${esc(String(c.description || '').slice(0, 90))}</p>
  </a>`).join('')}</div>` : '');
  }
  const u = await usuario(); // sessão local (sem ir ao servidor)
  // Ordem provisória com o último estado conhecido neste aparelho (evita a página "pular" depois)
  let estado = !u ? 'visitante' : (() => { try { return localStorage.getItem('cc_estado_home') || 'recorrente'; } catch { return 'recorrente'; } })();
  ordenar(estado);
  const visualLogado = () => {
    if ($('#hero-acoes') && !$('#hero-grupo')) $('#hero-acoes').innerHTML = `<a class="btn" href="#b-grupo" id="hero-grupo">Encontrar grupo</a><a class="btn sec" href="#b-rec">Ver recomendações</a>`;
  };
  if (u) visualLogado();
  main.classList.remove('montando'); // ordem definida: mostra o conteúdo
  // Conta nova: ainda não terminou as boas-vindas ou não tem nada na biblioteca (perfil e biblioteca em paralelo)
  const [p, contagem] = u ? await Promise.all([perfil(), sb.from('user_games').select('game_id', { count: 'exact', head: true }).eq('user_id', u.id)]) : [null, {}];
  if (u) {
    const certo = !p?.onboarded || !contagem.count ? 'novo' : 'recorrente';
    try { localStorage.setItem('cc_estado_home', certo); } catch { /* ignora */ }
    if (certo !== estado) { estado = certo; ordenar(estado); visualLogado(); }
  }
  document.body.dataset.estadoHome = estado;
  if (PAGINA_FEED) main.insertAdjacentHTML('afterbegin', '<h1>Feed da comunidade</h1>');

  // Apresentação completa (hero + "Como funciona") para todo mundo na home, logado ou não
  if (!PAGINA_FEED) { $('#b-como').classList.remove('hidden'); diferenciais(); }
  if (PAGINA_FEED && estado === 'visitante') {
    // feed completo também para visitantes (só leitura)
    $('#b-feed-wrap').classList.remove('hidden');
    carregarFeed(true); carregarDesafio();
  } else if (estado === 'visitante') {
    $('#b-cadastro').classList.remove('hidden');
    // Avaliações reais com texto (nunca inventadas); sem nenhuma, o bloco não aparece
    bloco('b-avaliacoes', '#avaliacoes', () => sb.from('reviews').select('id,rating,body,created_at,games(slug,title),profiles!reviews_user_id_fkey(username)').eq('status', 'published').not('body', 'is', null).order('created_at', { ascending: false }).limit(4),
      (l) => l.filter((r) => r.body && r.games && r.profiles).map((r) => `<a class="cartao" href="jogo.html?slug=${encodeURIComponent(r.games.slug)}" style="color:var(--texto);text-decoration:none">
        <span class="muted" style="font-size:.85rem">${esc(r.profiles.username)} avaliou <strong>${esc(r.games.title)}</strong> com ${Number(r.rating)}/5</span>
        <p style="margin-top:4px">${esc(String(r.body).slice(0, 220))}</p></a>`).join(''));
  } else {
    $('#b-feed-wrap').classList.remove('hidden');
    if (estado === 'novo' && !PAGINA_FEED) checklist(u, p);
    // recomendações não seguram o feed: carregam em paralelo
    if (!PAGINA_FEED) sb.rpc('recommend_games', { lim: 12 }).select(COLUNAS_CARD).then(({ data: rec }) => preencher('b-rec', '#rec', rec?.length ? carrossel(rec.map(cardJogo).join('')) : ''), () => {});
    if (estado === 'recorrente') {
      // Promoções dos jogos que a pessoa marcou na lista de desejos
      bloco('b-desejos', '#desejos', async () => {
        const { data: lista, error } = await sb.from('user_games').select('game_id').eq('user_id', u.id).eq('wishlist', true).limit(200);
        if (error || !lista?.length) return { data: [], error };
        return sb.from('deals').select('*, games(slug,title,cover_url)').in('game_id', lista.map((x) => x.game_id)).gt('discount_pct', 0).order('discount_pct', { ascending: false }).limit(12);
      }, (l) => { const v = l.filter((d) => d.games); return v.length ? carrossel(v.map(cardPromo).join('')) : ''; });
    }
    carregarAtividade();
    carregarJogandoAgora(u).catch(() => {});
    if ($('#stories')) barraStories($('#stories'), u);
    $('#compor').innerHTML = compositorHtml();
    compositor = ligarCompositor($('#compositor'), { u, aoPublicar: () => { carregarFeed(true); carregarDesafio(); } });
    carregarFeed(true);
    carregarDesafio();
  }
}

// ---------- Balão do Adelino (frases curtas; para quem prefere menos movimento, fica parado) ----------
const FRASES = ['Bora uma partida? 🎮', 'Já zerou esse? 👀', 'GG, bem jogado! 🏆', 'Promoção boa hoje 💸', 'Chama o squad! 🎧', 'Qual sua nota? ⭐'];
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let i = 0;
  setInterval(() => { const b = $('#balao-adelino'); if (b && document.visibilityState === 'visible') b.textContent = FRASES[++i % FRASES.length]; }, 4000);
}

// ---------- Diferenciais (números reais do banco; sem dado, o item não mostra número) ----------
async function diferenciais() {
  const { count } = await sb.from('games').select('id', { count: 'exact', head: true });
  const mil = count ? Math.floor(count / 1000) : 0;
  const itens = [
    ['🎮', 'jogos.html', mil >= 1 ? `Catálogo com mais de ${mil.toLocaleString('pt-BR')} mil jogos` : 'Catálogo de jogos de todas as plataformas'],
    ['⭐', 'jogos.html?ordem=avg_rating', 'Avaliações da comunidade e sua biblioteca'],
    ['🎧', 'comunidades.html', 'Comunidades e calls de voz e vídeo'],
    ['💸', 'promocoes.html', 'Promoções e alertas da sua lista de desejos'],
    ['🏆', 'conquistas.html', 'Perfil, níveis e conquistas'],
  ];
  $('#diferenciais').innerHTML = itens.map(([i, href, t]) => `<li><a href="${href}"><span aria-hidden="true">${i}</span> ${esc(t)}</a></li>`).join('');
}

// ---------- Checklist da conta nova (cada item confere o que já foi feito de verdade) ----------
async function checklist(u, p) {
  const contar = (t, col) => sb.from(t).select(col, { count: 'exact', head: true }).eq('user_id', u.id).then((r) => r.count || 0);
  const [jogos, comms, seguindo] = await Promise.all([contar('user_games', 'game_id'), contar('community_members', 'community_id'),
    sb.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', u.id).then((r) => r.count || 0)]);
  const itens = [
    [!!p?.onboarded, 'Escolher plataformas e gêneros favoritos', 'perfil.html#editar'],
    [jogos >= 3, `Adicionar 3 jogos à biblioteca (${Math.min(jogos, 3)}/3)`, 'jogos.html'],
    [comms >= 1, 'Entrar numa comunidade', 'comunidades.html'],
    [seguindo >= 1, 'Seguir um jogador', 'comunidades.html'],
    [!!p?.steam_id, 'Importar sua Steam (opcional)', 'perfil.html#steam'],
  ];
  const feitos = itens.filter(([ok]) => ok).length;
  if (feitos === itens.length) return;
  const s = $('#b-checklist');
  s.classList.remove('hidden');
  s.innerHTML = `<div class="cartao checklist"><h2 id="ck-t" style="margin-top:0">Primeiros passos <span class="muted" style="font-size:.9rem;font-family:Inter">${feitos} de ${itens.length}</span></h2>
    <div class="barra-xp" role="progressbar" aria-valuemin="0" aria-valuemax="${itens.length}" aria-valuenow="${feitos}" aria-label="Primeiros passos"><div style="width:${Math.round(feitos / itens.length * 100)}%"></div></div>
    <ul>${itens.map(([ok, t, link]) => `<li class="${ok ? 'feito' : ''}">${ok ? '✅' : '⬜'} ${ok ? esc(t) : `<a href="${link}">${esc(t)}</a>`}</li>`).join('')}</ul></div>`;
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
  const u = await usuario(), box = $('#feed'), POR = PAGINA_FEED ? 15 : 3; // na home, só uma amostra
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
  $('#mais-feed').classList.toggle('hidden', !PAGINA_FEED || (ps || []).length < POR);
  $('#ver-feed').classList.toggle('hidden', PAGINA_FEED || (ps || []).length < POR);
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
  const lim = PAGINA_FEED ? 40 : 5; // na home, só as mais recentes
  const { data: at, error } = await sb.rpc('friends_activity', { lim: lim + 1 });
  if (error) return;
  const st = { jogando: 'está jogando', zerado: 'zerou' };
  $('#ver-atividade').classList.toggle('hidden', PAGINA_FEED || (at || []).length <= lim);
  $('#atividade').innerHTML = (at || []).slice(0, lim).map((a) => `<a class="atividade" href="jogo.html?slug=${encodeURIComponent(a.game_slug)}" style="color:var(--texto);text-decoration:none">
    ${avatarHtml(a)}<span style="flex:1;min-width:0;font-size:.9rem"><strong>${esc(a.username)}</strong> ${a.tipo === 'review' ? `avaliou com ${'★'.repeat(a.nota)}` : st[a.status] || 'jogou'}
      <br><span class="muted">${esc(a.game_title)} · ${data(a.quando)}</span></span>
    ${urlSegura(a.cover_url) ? `<img class="capa" src="${urlSegura(a.cover_url)}" alt="" loading="lazy">` : ''}</a>`).join('')
    || '<p class="muted">Nada por aqui ainda. <a href="amigos.html">Adicione amigos</a> ou siga pessoas para ver o que estão jogando.</p>';
}

// ---------- Procurando grupo agora ----------
if (configurado && !PAGINA_FEED) carregarLfg().then(() => { if (['#grupo', '#b-grupo'].includes(location.hash)) $('#b-grupo').scrollIntoView(); }); // #grupo: links de notificações antigas
const MIC = { obrigatorio: '🎙️ Microfone obrigatório', opcional: '🎧 Call opcional', sem: '🔇 Sem call' };
async function carregarLfg() {
  const u = await usuario();
  const consulta = (ordem) => sb.from('lfg_posts').select('*, profiles!lfg_posts_user_id_fkey(username,avatar_url,equipped_frame,psn_id,xbox_gamertag,discord_user), games(slug,title,cover_url), lfg_interest(user_id)')
    .gt('expires_at', new Date().toISOString()).order(ordem, { ascending: ordem === 'starts_at' }).limit(20);
  let { data: ps, error } = await consulta('starts_at');
  // Banco ainda sem a migração da fase 6 (coluna starts_at): continua funcionando com a ordem antiga
  if (error?.code === '42703') ({ data: ps, error } = await consulta('created_at'));
  if (error) {
    $('#lfg-lista').innerHTML = '<p class="vazio" role="alert">Não foi possível carregar os grupos. <button class="btn sec pequeno" type="button" id="lfg-retry">Tentar de novo</button></p>';
    $('#lfg-retry').onclick = carregarLfg;
    return;
  }
  const quando = (x) => {
    const ini = new Date(x.starts_at || x.created_at), agora = Date.now();
    if (ini - agora > 5 * 60000) return `🕒 começa ${ini.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
    const m = Math.max(0, Math.round((new Date(x.expires_at) - agora) / 60000));
    return `🟢 rolando agora · até ${m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`}`;
  };
  $('#lfg-lista').innerHTML = (ps || []).map((x) => {
    const meu = u && x.user_id === u.id, foi = u && x.lfg_interest.some((i) => i.user_id === u.id);
    const n = x.lfg_interest.length, cheio = x.slots && n >= x.slots;
    const contas = [x.platform === 'PlayStation' && x.profiles?.psn_id && 'PSN: ' + x.profiles.psn_id, x.platform === 'Xbox' && x.profiles?.xbox_gamertag && 'Xbox: ' + x.profiles.xbox_gamertag, x.profiles?.discord_user && 'Discord: ' + x.profiles.discord_user].filter(Boolean);
    const acao = meu ? `<button class="btn sec pequeno" data-lfg-fim="${Number(x.id)}">Encerrar grupo</button>`
      : !u ? `<a class="btn pequeno" href="entrar.html?volta=${encodeURIComponent('index.html#b-grupo')}">Entrar para participar</a>`
      : foi ? `<button class="btn sec pequeno" data-lfg-sair="${Number(x.id)}">✓ No grupo · sair</button>`
      : cheio ? '<button class="btn sec pequeno" disabled>Grupo cheio</button>'
      : `<button class="btn pequeno" data-lfg-quero="${Number(x.id)}">Entrar no grupo</button>`;
    return `<article class="cartao lfg-card" aria-label="Grupo de ${esc(x.games?.title || 'jogo')}">
      ${x.games ? `<a href="jogo.html?slug=${encodeURIComponent(x.games.slug)}" class="lfg-capa"><img ${srcCapa(x.games.cover_url, 160)} alt="" loading="lazy" width="64" height="86"></a>` : '<span class="lfg-capa lfg-sem-capa" aria-hidden="true">🎮</span>'}
      <div class="lfg-info">
        <strong class="lfg-jogo">${x.games ? `<a href="jogo.html?slug=${encodeURIComponent(x.games.slug)}">${esc(x.games.title)}</a>` : 'Qualquer jogo'}</strong>
        <span class="muted" style="font-size:.85rem">por <a class="usuario" href="perfil.html?u=${encodeURIComponent(x.profiles?.username || '')}">${esc(x.profiles?.username)}</a> · ${quando(x)}</span>
        <span class="lfg-tags">${x.platform ? `<span class="tag">${esc(x.platform)}</span>` : ''}${x.crossplay ? '<span class="tag">🔀 Crossplay</span>' : ''}
          <span class="tag">${MIC[x.mic] || MIC.opcional}</span>${x.visibility === 'amigos' ? '<span class="tag">👥 Só amigos</span>' : ''}
          ${x.slots ? `<span class="tag ${cheio ? '' : 'amarela'}">${n}/${x.slots} ${x.slots === 1 ? 'vaga' : 'vagas'}</span>` : ''}</span>
        ${x.note ? `<span class="quebra">${esc(x.note)}</span>` : ''}
        ${foi || meu ? (contas.length ? `<span class="muted" style="font-size:.82rem">${esc(contas.join(' · '))}</span>` : '') : ''}
      </div>
      <div class="lfg-acao">${acao}</div>
    </article>`;
  }).join('') || `<div class="vazio-adelino"><img src="${urlCdn('img/adelino/luta.png', 160)}" alt="" width="72" height="66" loading="lazy"><p class="muted">Nenhum grupo aberto agora. Crie o primeiro e avise seus amigos.</p></div>`;

  $('#lfg-lista').querySelectorAll('[data-lfg-quero]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const { error: e } = await sb.from('lfg_interest').insert({ lfg_id: Number(b.dataset.lfgQuero), user_id: u.id });
    if (e) { b.disabled = false; return falha(e); }
    toast('Você entrou no grupo! Quem criou foi avisado. Combinem pelo perfil, Amigos ou Discord.'); carregarLfg();
  });
  $('#lfg-lista').querySelectorAll('[data-lfg-sair]').forEach((b) => b.onclick = async () => {
    const { error: e } = await sb.from('lfg_interest').delete().eq('lfg_id', Number(b.dataset.lfgSair)).eq('user_id', u.id); e ? falha(e) : carregarLfg();
  });
  $('#lfg-lista').querySelectorAll('[data-lfg-fim]').forEach((b) => b.onclick = async () => {
    if (!confirm('Encerrar este grupo?')) return;
    const { error: e } = await sb.from('lfg_posts').delete().eq('id', Number(b.dataset.lfgFim)); e ? falha(e) : carregarLfg();
  });
  if ($('#lfg-form').dataset.ok) return;
  $('#lfg-form').dataset.ok = '1';
  const abrir = (sim) => { $('#lfg-form').classList.toggle('hidden', !sim); $('#lfg-abrir').setAttribute('aria-expanded', String(sim)); if (sim) $('#lfg-busca').focus(); };
  // Visitante vê os grupos, mas precisa entrar para criar
  $('#lfg-abrir').onclick = () => (u ? abrir($('#lfg-form').classList.contains('hidden')) : (location.href = `entrar.html?volta=${encodeURIComponent('index.html#b-grupo')}`));
  if (!u) $('#lfg-abrir').textContent = 'Entrar para criar grupo';
  $('#hero-grupo')?.addEventListener('click', () => setTimeout(() => u && abrir(true), 300));
  $('#lfg-cancelar').onclick = () => { abrir(false); $('#lfg-abrir').focus(); };
  $('#lfg-inicio').onchange = () => $('#lfg-hora').classList.toggle('hidden', $('#lfg-inicio').value !== 'hora');
  let t, ctrl;
  $('#lfg-busca').oninput = () => {
    $('#lfg-jogo').value = ''; clearTimeout(t);
    t = setTimeout(async () => {
      const termo = $('#lfg-busca').value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return $('#lfg-sug').classList.add('hidden');
      ctrl?.abort(); ctrl = new AbortController();
      const { data } = await sb.from('games').select('id,title').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(6).abortSignal(ctrl.signal);
      $('#lfg-sug').innerHTML = (data || []).map((j) => `<button type="button" role="option" data-id="${Number(j.id)}" data-t="${esc(j.title)}">${esc(j.title)}</button>`).join('') || '<span class="muted" style="padding:8px">Nenhum jogo encontrado.</span>';
      $('#lfg-sug').classList.remove('hidden');
      $('#lfg-sug').querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { $('#lfg-jogo').value = b.dataset.id; $('#lfg-busca').value = b.dataset.t; $('#lfg-sug').classList.add('hidden'); $('#lfg-erro').textContent = ''; });
    }, 300);
  };
  $('#lfg-form').onsubmit = async (e) => {
    e.preventDefault();
    const erro = (msg, campo) => { $('#lfg-erro').textContent = msg; campo?.focus(); };
    if (!$('#lfg-jogo').value) return erro('Escolha o jogo na lista de sugestões.', $('#lfg-busca'));
    let ini = Date.now();
    if ($('#lfg-inicio').value === 'hora') {
      ini = new Date($('#lfg-hora').value).getTime();
      if (!ini || ini < Date.now() - 5 * 60000 || ini > Date.now() + 24 * 3600e3) return erro('Escolha um horário nas próximas 24 horas.', $('#lfg-hora'));
    } else ini += Number($('#lfg-inicio').value) * 60000;
    const vagas = Number($('#lfg-vagas').value);
    if (!(vagas >= 1 && vagas <= 20)) return erro('As vagas vão de 1 a 20.', $('#lfg-vagas'));
    $('#lfg-erro').textContent = '';
    const bt = $('#lfg-enviar'); bt.disabled = true; bt.textContent = 'Criando...';
    const { error: e2 } = await sb.from('lfg_posts').insert({ user_id: u.id, game_id: Number($('#lfg-jogo').value),
      platform: $('#lfg-plat').value || null, slots: vagas, note: $('#lfg-nota').value.trim() || null,
      starts_at: new Date(ini).toISOString(), expires_at: new Date(ini + Number($('#lfg-dur').value) * 3600e3).toISOString(),
      mic: $('#lfg-mic').value, visibility: $('#lfg-vis').value, crossplay: $('#lfg-cross').checked, notify_friends: $('#lfg-avisar').checked });
    bt.disabled = false; bt.textContent = 'Criar grupo';
    if (e2) return erro(/row-level/.test(e2.message) ? 'Você já tem 3 grupos ativos. Encerre um para criar outro.' : e2.message);
    contarEvento('grupo_criado');
    toast($('#lfg-avisar').checked ? 'Grupo criado! Seus amigos foram avisados.' : 'Grupo criado!');
    e.target.reset(); $('#lfg-hora').classList.add('hidden'); abrir(false); carregarLfg();
  };
}
