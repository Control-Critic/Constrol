import { sb, $, esc, montarLayout, configurado, param, estrelas, plural, data, urlSegura, usuario, avatar, avatarHtml, toast, falha, denunciar, traduzirNoNavegador, carrossel, imgIgdb, srcCapa, urlCdn, perfil, reportarProblema } from './app.js';
import { COLUNAS_POST, postHtml, ligarPosts, compositorHtml, ligarCompositor, verImagem } from './posts.js';

await montarLayout();
const main = $('#conteudo');
const LOJAS = [['store_ps', 'iconepl', 'PlayStation'], ['store_xbox', 'iconexb', 'Xbox'], ['store_steam', 'iconest', 'Steam'], ['store_nintendo', 'iconenin', 'Nintendo']];
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

if (configurado) carregar();

// Opções de capa para a equipe: imagem oficial da Steam (quando o jogo está lá) e as capturas do IGDB
function ligarCapa(g) {
  $('#capa-errada').onclick = () => reportarProblema(`A capa de "${g.title}" está errada (mostra outro jogo ou versão).`);
  perfil().then((p) => {
    if (p?.role !== 'admin') return;
    const bt = $('#trocar-capa'); bt.classList.remove('hidden');
    bt.onclick = () => {
      const opcoes = [
        ...(g.steam_appid ? [`https://cdn.cloudflare.steamstatic.com/steam/apps/${Number(g.steam_appid)}/library_hero.jpg`, `https://cdn.cloudflare.steamstatic.com/steam/apps/${Number(g.steam_appid)}/header.jpg`] : []),
        ...(g.screenshots || []).map((x) => imgIgdb(x)).filter(Boolean),
      ];
      let dlg = $('#dlg-capa');
      if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-capa'; document.body.append(dlg); }
      dlg.innerHTML = `<h2 style="margin-top:0">Escolher capa</h2>
        ${opcoes.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;max-height:60vh;overflow:auto">
          ${opcoes.map((u) => `<button type="button" data-capa="${esc(u)}" style="padding:0;border:2px solid transparent;border-radius:10px;overflow:hidden;background:none;cursor:pointer">
            <img ${srcCapa(u, 400)} alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"></button>`).join('')}</div>`
        : '<p class="muted">Sem imagens alternativas para este jogo. Envie uma capa em Admin → Jogos → Editar.</p>'}
        <p class="muted" style="font-size:.82rem">Se nenhuma servir, envie a imagem certa em Admin → Jogos → Editar.</p>
        <div class="controles" style="margin-top:10px"><button class="btn sec" type="button" id="capa-fechar">Fechar</button></div>`;
      dlg.showModal();
      $('#capa-fechar').onclick = () => dlg.close();
      dlg.querySelectorAll('[data-capa]').forEach((b) => b.onclick = async () => {
        const { error } = await sb.from('games').update({ cover_url: b.dataset.capa }).eq('id', g.id);
        if (error) return falha(error);
        $('#capa-jogo').outerHTML = `<img id="capa-jogo" ${srcCapa(b.dataset.capa, 1000)} alt="" style="border-radius:14px;width:100%">`;
        dlg.close(); toast('Capa trocada.');
      });
      // Imagem que não existe (ex.: jogo sem "hero" na Steam) some da lista
      dlg.querySelectorAll('[data-capa] img').forEach((im) => im.addEventListener('error', () => im.closest('button').remove()));
    };
  });
}

// Melhor preço agora e menor preço histórico em todas as lojas (IsThereAnyDeal)
async function carregarPrecosLojas(g) {
  const qs = g.steam_appid ? `appid=${Number(g.steam_appid)}` : `titulo=${encodeURIComponent(g.title)}`;
  const d = await fetch(`/.netlify/functions/precos-lojas?${qs}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  if (!d.atual && !d.menor) return;
  const dinheiro = (x) => Number(x.preco).toLocaleString('pt-BR', { style: 'currency', currency: x.moeda || 'BRL' });
  $('#precos-lojas').innerHTML = `<div class="cartao" style="margin-top:14px"><h3>💸 Preço em todas as lojas</h3><div class="controles" style="gap:22px;align-items:flex-end">
    ${d.atual ? `<div><div class="nota-grande" style="font-size:1.8rem">${dinheiro(d.atual)}</div><span class="muted">melhor preço agora${d.atual.loja ? ` na ${esc(d.atual.loja)}` : ''}${d.atual.desconto ? ` (-${d.atual.desconto}%)` : ''}</span>
      ${d.atual.url ? `<br><a class="btn pequeno" href="${urlSegura(d.atual.url)}" target="_blank" rel="noopener sponsored" style="margin-top:6px">Ver oferta</a>` : ''}</div>` : ''}
    ${d.menor ? `<div><div class="nota-grande" style="font-size:1.8rem;color:var(--ok,#22c55e)">${dinheiro(d.menor)}</div><span class="muted">menor preço da história${d.menor.loja ? ` (${esc(d.menor.loja)}` : ''}${d.menor.quando ? `, ${new Date(d.menor.quando).toLocaleDateString('pt-BR')}` : ''}${d.menor.loja ? ')' : ''}</span></div>` : ''}
    ${d.atual && d.menor && Number(d.atual.preco) <= Number(d.menor.preco) ? '<p style="color:var(--ok,#22c55e);margin:0">✅ Está no menor preço da história agora!</p>' : ''}
    </div>${d.link ? `<p class="muted" style="font-size:.8rem;margin-top:8px">Dados: <a href="${urlSegura(d.link)}" target="_blank" rel="noopener noreferrer">IsThereAnyDeal</a></p>` : ''}</div>`;
}

async function carregar() {
  const [{ data: g }, { data: listaCats }] = await Promise.all([
    sb.from('games').select('*, categories(name,id)').eq('slug', param('slug')).maybeSingle(),
    sb.from('categories').select('id,name')]);
  const cats = Object.fromEntries((listaCats || []).map((c) => [c.id, c.name]));
  if (!g) { main.innerHTML += '<p class="vazio">Jogo não encontrado.</p>'; return; }
  document.title = `${g.title} | Control Critic`;
  // Dados estruturados (Google): avaliação agregada só quando há avaliações reais no site
  const ld = { '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, url: location.origin + '/jogo.html?slug=' + encodeURIComponent(g.slug),
    ...(g.cover_url ? { image: g.cover_url } : {}), ...(g.description ? { description: String(g.description).slice(0, 500) } : {}),
    ...(g.platforms?.length ? { gamePlatform: g.platforms } : {}), ...(g.release_year ? { datePublished: String(g.release_year) } : {}),
    ...(g.reviews_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(g.avg_rating).toFixed(1), bestRating: '5', worstRating: '1', ratingCount: g.reviews_count } } : {}) };
  const sld = document.createElement('script'); sld.type = 'application/ld+json'; sld.textContent = JSON.stringify(ld).replace(/</g, '\\u003c'); document.head.append(sld);
  const u = await usuario();
  // Outras versões do mesmo jogo (original x remake/remaster): mesmo nome sem "Remake", "HD", ano etc.
  const baseTitulo = (t) => String(t).toLowerCase().replace(/\(.*?\)/g, ' ')
    .replace(/\b(remake|remastered|remaster|hd|definitive edition|director'?s cut|classic|reimagined|enhanced edition|game of the year edition|goty)\b/g, ' ')
    .replace(/\b(19|20)\d\d\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const prefixo = baseTitulo(g.title).split(' ').slice(0, 4).join('%');
  const [{ data: reviews }, { data: deals }, { data: comms }, { data: parecidos }] = await Promise.all([
    sb.from('reviews').select('*, profiles!reviews_user_id_fkey(username,avatar_url,equipped_frame)').eq('game_id', g.id).eq('status', 'published')
      .order('helpful_count', { ascending: false }).order('created_at', { ascending: false }),
    sb.from('deals').select('*').eq('game_id', g.id).order('discount_pct', { ascending: false }),
    sb.from('communities').select('id,name,members_count').eq('game_id', g.id).limit(5),
    prefixo ? sb.from('games').select('id,slug,title,release_year').ilike('title', `${prefixo}%`).neq('id', g.id).order('igdb_rating_count', { ascending: false }).limit(20) : { data: [] },
  ]);
  const versoes = (parecidos || []).filter((x) => baseTitulo(x.title) === baseTitulo(g.title)).slice(0, 5);
  const [{ data: meusVotos }, { data: precos }, { data: minhasListas }] = await Promise.all([
    u ? sb.from('review_votes').select('review_id').eq('user_id', u.id).in('review_id', reviews.map((r) => r.id).slice(0, 200)) : Promise.resolve({ data: [] }),
    sb.rpc('price_summary', { gid: g.id }),
    u ? sb.from('user_lists').select('id,title').eq('user_id', u.id).order('updated_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const votei = new Set((meusVotos || []).map((v) => v.review_id));
  const { data: bib } = u ? await sb.from('user_games').select('*').eq('user_id', u.id).eq('game_id', g.id).maybeSingle() : { data: null };
  const { count: desejam } = await sb.from('user_games').select('user_id', { count: 'exact', head: true }).eq('game_id', g.id).eq('wishlist', true);
  const minha = u && reviews.find((r) => r.user_id === u.id);

  main.innerHTML = `
    <div class="detalhe">
      <div>
        <img id="capa-jogo" ${srcCapa(g.cover_url, 1000)} alt="" style="border-radius:14px;width:100%">
        <p style="text-align:right;margin-top:4px;font-size:.8rem"><button type="button" class="bt-link muted" id="capa-errada">📷 Capa errada?</button>
          <button type="button" class="bt-link hidden" id="trocar-capa">🖼️ Trocar capa</button></p>
        <h1 style="margin-top:16px">${esc(g.title)}${g.release_year ? ` <span class="muted ano-jogo">(${Number(g.release_year)})</span>` : ''}</h1>
        <p class="controles" style="margin:6px 0"><button type="button" class="btn sec pequeno" id="compartilhar">🔗 Compartilhar</button>
          <a class="btn sec pequeno" href="index.html#b-grupo">🎮 Procurar grupo</a></p>
        <div id="grupos-jogo"></div>
        <p>${(g.category_ids?.length ? g.category_ids : g.categories ? [g.categories.id] : []).map((id) => cats[id] ? `<a class="tag" href="jogos.html?cat=${id}">${esc(cats[id])}</a>` : '').join(' ')} ${g.release_year ? `<span class="tag">${g.release_year}</span>` : ''}
          ${(g.platforms || []).map((pl) => `<a class="tag" href="jogos.html?plat=${encodeURIComponent(pl)}">${esc(pl)}</a>`).join(' ')}</p>
        <p class="quebra" style="margin-top:12px" id="descricao">${esc(g.description || '')}</p>
        ${g.description_lang === 'en' ? '<p class="muted" id="desc-aviso" style="font-size:.82rem;margin-top:4px">🌐 Traduzindo a descrição (original em inglês)...</p>' : ''}
      </div>
      <aside class="lista">
        <div class="cartao">
          ${g.reviews_count ? `<div class="nota-grande">${Number(g.avg_rating).toFixed(1)}</div>
          ${estrelas(g.avg_rating)} <span class="muted">${plural(g.reviews_count, 'avaliação', 'avaliações')} no Control Critic</span>`
          : g.igdb_rating ? `<div class="nota-grande">${(g.igdb_rating / 20).toFixed(1)}</div>
          ${estrelas(g.igdb_rating / 20)} <span class="muted">nota inicial (IGDB)</span><br><a href="#form-review" class="muted">Seja o primeiro a avaliar no Control Critic →</a>`
          : '<div class="nota-grande" style="font-size:1.6rem">Sem notas ainda</div><a href="#form-review" class="muted">Seja o primeiro a avaliar no Control Critic →</a>'}
          ${g.igdb_rating ? `<p class="muted" style="margin-top:8px;font-size:.88rem">Nota da crítica e público (IGDB): <strong>${Math.round(g.igdb_rating)}/100</strong> · ${g.igdb_rating_count} votos</p>` : ''}
        </div>
        <div class="cartao"><h3>Onde comprar</h3><div class="lojas">
          ${LOJAS.filter(([k]) => g[k]).map(([k, ic, n]) => `<a href="${urlSegura(g[k])}" target="_blank" rel="noopener noreferrer" title="${n}"><img src="img/icones/${ic}.png" alt="${n}"></a>`).join('') || '<span class="muted">Sem links cadastrados.</span>'}
        </div>
        ${(deals || []).filter((d) => d.discount_pct > 0).map((d) => `<p style="margin-top:10px"><span class="tag amarela">-${d.discount_pct}%</span>
          ${esc(d.store)}: ${d.price_cents != null ? `<strong>${reais(d.price_cents)}</strong>` : ''}
          ${d.original_cents ? `<s class="muted">${reais(d.original_cents)}</s>` : ''}
          ${d.url ? ` · <a href="${urlSegura(d.url)}" target="_blank" rel="noopener noreferrer">ver oferta</a>` : ''}</p>`).join('')}
        ${(deals || []).some((d) => d.discount_pct > 0) ? `<p class="muted" style="font-size:.78rem;margin-top:8px">Preço atualizado ${data((deals || []).reduce((m, d) => (d.updated_at > m ? d.updated_at : m), ''))}. Confira na loja antes de comprar.</p>` : ''}
        </div>
        ${versoes.length ? `<div class="cartao"><h3>🔁 Outras versões</h3>${versoes.map((v) => `<p><a href="jogo.html?slug=${encodeURIComponent(v.slug)}">${esc(v.title)}</a>
          <span class="muted">${v.release_year ? `· ${v.release_year}` : ''}${v.release_year && g.release_year ? (v.release_year > g.release_year ? ' (mais nova)' : v.release_year < g.release_year ? ' (original)' : '') : ''}</span></p>`).join('')}</div>` : ''}
        ${comms?.length ? `<div class="cartao"><h3>Comunidades</h3>${comms.map((c) => `<p><a href="comunidade.html?id=${c.id}">${esc(c.name)}</a> <span class="muted">· ${c.members_count} membros</span></p>`).join('')}</div>` : ''}
      </aside>
    </div>

    ${(() => {
      // Carrossel de mídia: trailers primeiro, depois capturas de tela
      const vids = (g.videos || []).filter((v) => /^[A-Za-z0-9_-]{6,20}$/.test(v)).slice(0, 3);
      const fotos = (g.screenshots || []).map((x) => imgIgdb(x)).filter(Boolean).slice(0, 8);
      if (!vids.length && !fotos.length) return '';
      return `<h2>Trailers e imagens</h2>${carrossel(vids.map((v) => `<div class="trailer" data-video="${v}"><img ${srcCapa(`https://i.ytimg.com/vi/${v}/hqdefault.jpg`, 900)} alt="Trailer" loading="lazy"><span>▶</span></div>`).join('')
        + fotos.map((f) => `<img class="midia" ${srcCapa(f, 900)} data-grande="${esc(urlCdn(f.replace('t_screenshot_big', 't_1080p'), 1920))}" alt="Imagem de ${esc(g.title)}" loading="lazy">`).join(''))}`.replace('class="car-trilho"', 'class="car-trilho largo"');
    })()}

    ${(() => {
      // Links úteis: histórico longo de preços (SteamDB, IsThereAnyDeal), compatibilidade (ProtonDB) e tempo para zerar (HowLongToBeat)
      const q = encodeURIComponent(g.title);
      const links = [
        g.steam_appid && [`https://steamdb.info/app/${Number(g.steam_appid)}/`, '📈 Histórico de preço completo (SteamDB)'],
        [`https://isthereanydeal.com/search/?q=${q}`, '💸 Menor preço em todas as lojas (IsThereAnyDeal)'],
        [`https://howlongtobeat.com/?q=${q}`, '⏱️ Quanto tempo para zerar (HowLongToBeat)'],
        g.steam_appid && [`https://www.protondb.com/app/${Number(g.steam_appid)}`, '🐧 Roda no Steam Deck/Linux? (ProtonDB)'],
        [`https://www.youtube.com/results?search_query=${q}+gameplay+pt-br`, '▶️ Gameplay no YouTube'],
      ].filter(Boolean);
      return `<div id="precos-lojas"></div><div class="cartao links-uteis" style="margin-top:14px"><h3>🔗 Mais sobre o jogo</h3><div class="controles">${links.map(([u, t]) =>
        `<a class="btn sec pequeno" href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`).join('')}</div></div>`;
    })()}
    ${precos?.menor ? `<div class="cartao" style="margin-top:14px"><h3>📉 Histórico de preço</h3>
      <p>Menor preço já visto aqui: <strong>${reais(precos.menor.preco)}</strong> na ${esc(precos.menor.loja)} em ${new Date(precos.menor.quando).toLocaleDateString('pt-BR')}
      <span class="muted">(acompanhando desde ${new Date(precos.desde).toLocaleDateString('pt-BR')})</span></p>
      ${(deals || []).find((d) => d.store === precos.menor.loja && d.price_cents != null && d.price_cents <= precos.menor.preco) ? '<p style="color:var(--ok);margin-top:4px">✅ O preço atual é o menor que já registramos!</p>' : ''}
      <details style="margin-top:6px"><summary class="muted" style="cursor:pointer">Ver variações</summary>
        <div class="lista" style="margin-top:6px;font-size:.88rem">${precos.pontos.slice().reverse().slice(0, 15).map((x) => `<span>${new Date(x.quando).toLocaleDateString('pt-BR')} · ${esc(x.loja)} · ${reais(x.preco)}</span>`).join('')}</div></details></div>` : ''}

    <h2>Minha biblioteca</h2>
    <div class="cartao">
      ${u ? `<div class="biblioteca">
        <select id="b-status" aria-label="Status">
          <option value="">— Não está na biblioteca —</option>
          ${[['jogando', '🎮 Jogando'], ['zerado', '🏆 Zerado'], ['quero_jogar', '📌 Quero jogar'], ['abandonei', '💤 Abandonei']]
            .map(([v, t]) => `<option value="${v}" ${bib?.status === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <input id="b-horas" type="number" min="0" step="0.5" placeholder="Horas" value="${bib?.hours ?? ''}" style="max-width:110px" aria-label="Horas jogadas">
        <select id="b-lista" style="width:auto" aria-label="Adicionar a uma lista"><option value="">📋 Adicionar a uma lista…</option>
          ${(minhasListas || []).map((l) => `<option value="${l.id}">${esc(l.title)}</option>`).join('')}<option value="nova">+ Nova lista</option></select>
        <button class="btn sec desejo ${bib?.wishlist ? 'ativo' : ''}" id="b-desejo">${bib?.wishlist ? '💖 Na lista de desejos' : '🤍 Lista de desejos'}</button>
      </div>
      <div class="controles ${bib?.wishlist ? '' : 'hidden'}" id="alvo-box" style="margin-top:8px;align-items:center;gap:6px">
        <label for="b-alvo" style="margin:0;font-weight:400;font-size:.88rem">🎯 Avisar só abaixo de R$</label>
        <input id="b-alvo" type="number" min="1" max="2000" step="1" style="max-width:110px" placeholder="qualquer" value="${bib?.alvo_cents ? Math.round(bib.alvo_cents / 100) : ''}"></div>
      <p class="muted" style="font-size:.85rem;margin-top:8px">Na lista de desejos você recebe uma notificação quando o jogo entrar em promoção (ou só quando ficar abaixo do seu preço-alvo).
        ${desejam ? `${desejam === 1 ? '1 pessoa deseja' : `${desejam} pessoas desejam`} este jogo.` : ''}</p>`
      : `<p><a href="entrar.html?volta=${encodeURIComponent('jogo.html?slug=' + g.slug)}">Entre</a> para adicionar à sua biblioteca e receber alertas de promoção.</p>`}
    </div>

    <h2>${minha ? 'Sua avaliação' : 'Avalie este jogo'}</h2>
    <div class="cartao" id="form-area">
      ${u ? `
      <form id="form-review">
        <div class="estrelas-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="nota" id="n${n}" value="${n}" ${minha?.rating === n ? 'checked' : ''} required><label for="n${n}" title="${n}">★</label>`).join('')}</div>
        <label for="txt">Comentário (opcional)</label>
        <textarea id="txt" rows="3" maxlength="2000" placeholder="O que achou?">${esc(minha?.body || '')}</textarea>
        <div class="controles" style="margin-top:10px">
          <button class="btn">${minha ? 'Atualizar' : 'Publicar'} avaliação</button>
          ${minha ? '<button type="button" class="btn sec" id="apagar">Apagar</button>' : ''}
        </div>
      </form>` : `<p><a href="entrar.html?volta=${encodeURIComponent('jogo.html?slug=' + g.slug)}">Entre</a> para avaliar e ganhar XP.</p>`}
    </div>

    <h2>Avaliações da comunidade</h2>
    <div class="lista">${reviews.map((r) => `
      <article class="review" id="r${r.id}"><header>${avatarHtml(r.profiles)}
        <a class="usuario" href="perfil.html?u=${encodeURIComponent(r.profiles?.username || '')}">${esc(r.profiles?.username)}</a> ${estrelas(r.rating)} <span class="muted">${data(r.created_at)}</span>
        ${u && r.user_id !== u.id ? `<button class="bt-denunciar" data-den="${r.id}" title="Denunciar">🚩 Denunciar</button>` : ''}</header>
        ${r.body ? `<p class="quebra">${esc(r.body)}</p>` : ''}
        <div class="controles acoes-review">
          <button class="chip ${votei.has(r.id) ? 'ativo' : ''}" data-util="${r.id}" ${!u || r.user_id === u.id ? 'disabled title="' + (u ? 'Você não pode votar na própria avaliação' : 'Entre para votar') + '"' : ''}>👍 Útil · <span>${r.helpful_count || 0}</span></button>
          <button class="chip" data-coment="${r.id}">💬 ${plural(r.comments_count, 'comentário')}</button>
        </div>
        <div class="comentarios hidden" data-lista-coment="${r.id}"></div></article>`).join('') || '<p class="vazio">Seja o primeiro a avaliar!</p>'}
    </div>

    <h2>Posts sobre o jogo</h2>
    ${u ? compositorHtml(`Compartilhe um print, uma dica ou uma conquista de ${g.title}...`) : ''}
    <div class="lista" id="posts-jogo" style="margin-top:12px"></div>
`;

  // Imagens do carrossel abrem em tela cheia; posts do jogo
  main.querySelectorAll('img.midia').forEach((i) => i.onclick = () => verImagem(i.dataset.grande));
  const carregarPostsJogo = async () => {
    const { data: ps } = await sb.from('posts').select(COLUNAS_POST).eq('game_id', g.id).eq('status', 'published').order('created_at', { ascending: false }).limit(20);
    $('#posts-jogo').innerHTML = (ps || []).map((x) => postHtml(x, { u })).join('') || '<p class="muted">Nenhum post sobre este jogo ainda.</p>';
    ligarPosts($('#posts-jogo'), { u });
  };
  ligarCapa(g);
  $('#compartilhar').onclick = async () => {
    const dados = { title: `${g.title} no Control Critic`, text: `Veja notas, preços e grupos de ${g.title}`, url: location.href };
    try { if (navigator.share) await navigator.share(dados); else { await navigator.clipboard.writeText(location.href); toast('Link copiado!'); } } catch { /* cancelado */ }
  };
  // Grupos abertos para este jogo (o diferencial do site): aparece só se houver algum
  sb.from('lfg_posts').select('id,platform,starts_at,slots,lfg_interest(user_id)').eq('game_id', g.id).gt('expires_at', new Date().toISOString()).limit(5)
    .then(({ data: gs }) => {
      if (!gs?.length) return;
      $('#grupos-jogo').innerHTML = `<div class="cartao" style="margin:8px 0"><strong>🎮 ${gs.length === 1 ? '1 grupo aberto' : `${gs.length} grupos abertos`} para este jogo</strong>
        <p class="muted" style="margin:4px 0">${gs.map((x) => `${esc(x.platform || 'Qualquer plataforma')} · ${x.slots ? `${x.lfg_interest.length}/${x.slots} vagas` : 'vagas livres'}`).join(' — ')}</p>
        <a class="btn pequeno" href="index.html#b-grupo">Ver e entrar</a></div>`;
    }, () => {});
  carregarPrecosLojas(g);
  if ($('#compositor')) ligarCompositor($('#compositor'), { u, jogo: { id: g.id, title: g.title }, aoPublicar: carregarPostsJogo });
  carregarPostsJogo();

  main.querySelectorAll('[data-den]').forEach((b) => b.onclick = () => denunciar('review', b.dataset.den));
  // Trailers: carrega o player só ao clicar (mais leve e sem rastreamento antes do clique)
  main.querySelectorAll('[data-video]').forEach((t) => t.onclick = () => {
    t.outerHTML = `<iframe class="trailer" src="https://www.youtube-nocookie.com/embed/${t.dataset.video}?autoplay=1" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  });
  // Útil
  main.querySelectorAll('[data-util]').forEach((b) => b.onclick = async () => {
    const id = Number(b.dataset.util), ativo = b.classList.contains('ativo');
    const { error } = ativo ? await sb.from('review_votes').delete().eq('review_id', id).eq('user_id', u.id)
      : await sb.from('review_votes').insert({ review_id: id, user_id: u.id });
    if (error) return falha(error);
    b.classList.toggle('ativo', !ativo);
    const n = b.querySelector('span'); n.textContent = Number(n.textContent) + (ativo ? -1 : 1);
  });
  // Comentários
  main.querySelectorAll('[data-coment]').forEach((b) => b.onclick = () => abrirComentarios(Number(b.dataset.coment), u));
  if (/^#r\d+$/.test(location.hash)) { const id = Number(location.hash.slice(2)); document.getElementById('r' + id)?.scrollIntoView(); abrirComentarios(id, u); }
  // Listas
  $('#b-lista')?.addEventListener('change', async (e) => {
    let lista = e.target.value;
    if (!lista) return;
    if (lista === 'nova') {
      const titulo = prompt('Nome da nova lista (ex.: "Meus RPGs favoritos"):');
      if (!titulo?.trim()) { e.target.value = ''; return; }
      const { data: l, error } = await sb.from('user_lists').insert({ user_id: u.id, title: titulo.trim().slice(0, 80) }).select().single();
      if (error) return falha(error);
      lista = l.id;
    }
    const { error } = await sb.from('list_items').insert({ list_id: Number(lista), game_id: g.id, position: Date.now() % 1e9 });
    if (error && error.code !== '23505') return falha(error);
    toast(error ? 'Esse jogo já está na lista.' : 'Adicionado à lista!');
    e.target.value = '';
    if (!error) { await sb.from('user_lists').update({ updated_at: new Date().toISOString() }).eq('id', lista); }
  });
  if (g.description_lang === 'en') traduzirDescricao(g);

  // Biblioteca: salva ao mudar qualquer campo
  const salvarBib = async (mudanca) => {
    const atual = { status: $('#b-status').value || null, hours: $('#b-horas').value === '' ? null : Number($('#b-horas').value),
      wishlist: $('#b-desejo').classList.contains('ativo'), ...mudanca };
    const vazio = !atual.status && !atual.wishlist && atual.hours == null;
    const { error } = vazio
      ? await sb.from('user_games').delete().eq('user_id', u.id).eq('game_id', g.id)
      : await sb.from('user_games').upsert({ user_id: u.id, game_id: g.id, ...atual, updated_at: new Date().toISOString() });
    if (error) return falha(error);
    return true;
  };
  $('#b-status')?.addEventListener('change', async () => { if (await salvarBib()) toast('Biblioteca atualizada.'); });
  $('#b-alvo')?.addEventListener('change', async (e) => {
    const v = Number(e.target.value);
    if (await salvarBib({ alvo_cents: v > 0 ? Math.round(v * 100) : null })) toast(v > 0 ? `🎯 Avisaremos quando ficar abaixo de R$ ${v}.` : 'Aviso em qualquer promoção.');
  });
  $('#b-horas')?.addEventListener('change', async () => { if (await salvarBib()) toast('Horas salvas.'); });
  $('#b-desejo')?.addEventListener('click', async (e) => {
    const b = e.currentTarget, ativo = !b.classList.contains('ativo');
    if (!(await salvarBib({ wishlist: ativo }))) return;
    b.classList.toggle('ativo', ativo);
    b.textContent = ativo ? '💖 Na lista de desejos' : '🤍 Lista de desejos';
    $('#alvo-box')?.classList.toggle('hidden', !ativo);
    toast(ativo ? 'Adicionado à lista de desejos. Avisaremos quando entrar em promoção!' : 'Removido da lista de desejos.');
  });

  $('#form-review')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = Number(new FormData(e.target).get('nota'));
    const body = $('#txt').value.trim() || null;
    const { error } = minha
      ? await sb.from('reviews').update({ rating, body }).eq('id', minha.id)
      : await sb.from('reviews').insert({ game_id: g.id, user_id: u.id, rating, body });
    if (error) return falha(error);
    toast(minha ? 'Avaliação atualizada!' : 'Avaliação publicada! +10 XP');
    carregar();
  });
  $('#apagar')?.addEventListener('click', async () => {
    if (!confirm('Apagar sua avaliação?')) return;
    const { error } = await sb.from('reviews').delete().eq('id', minha.id);
    if (error) return falha(error);
    toast('Avaliação removida.'); carregar();
  });
}

// Descrição em inglês: traduz no servidor (fica salva para todos) ou, como reserva, no navegador
async function traduzirDescricao(g) {
  const aviso = $('#desc-aviso');
  try {
    const r = await fetch(`/.netlify/functions/traduzir?id=${g.id}`);
    if (r.ok) {
      const d = await r.json();
      $('#descricao').textContent = d.description;
      aviso?.remove();
      return;
    }
  } catch { /* sem função disponível: tenta no navegador */ }
  const t = await traduzirNoNavegador(g.description);
  if (t) { $('#descricao').textContent = t; if (aviso) aviso.textContent = '🌐 Tradução automática do navegador (original em inglês).'; }
  else if (aviso) aviso.textContent = '🌐 Descrição disponível apenas em inglês por enquanto.';
}

async function abrirComentarios(rid, u) {
  const box = document.querySelector(`[data-lista-coment="${rid}"]`);
  if (!box) return;
  box.classList.remove('hidden');
  const { data: cs } = await sb.from('review_comments').select('*, profiles(username,avatar_url,equipped_frame)').eq('review_id', rid).order('created_at').limit(100);
  box.innerHTML = `${(cs || []).map((c) => `<div class="comentario">${avatarHtml(c.profiles)}
      <div style="flex:1"><a class="usuario" href="perfil.html?u=${encodeURIComponent(c.profiles?.username || '')}">${esc(c.profiles?.username)}</a>
      <span class="muted" style="font-size:.8rem">${data(c.created_at)}</span>
      ${u && c.user_id === u.id ? `<button class="bt-denunciar" data-apagar-coment="${c.id}">Apagar</button>` : u ? `<button class="bt-denunciar" data-den-coment="${c.id}">🚩</button>` : ''}
      <p class="quebra">${esc(c.body)}</p></div></div>`).join('') || '<p class="muted">Nenhum comentário ainda.</p>'}
    ${u ? `<form class="controles" data-form-coment="${rid}" style="margin-top:8px"><input maxlength="1000" required placeholder="Escreva um comentário..." style="flex:1"><button class="btn pequeno">Comentar</button></form>`
      : '<p class="muted"><a href="entrar.html">Entre</a> para comentar.</p>'}`;
  box.querySelector('form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const txt = e.target.querySelector('input').value.trim();
    const { error } = await sb.from('review_comments').insert({ review_id: rid, user_id: u.id, body: txt });
    if (error) return falha(error);
    abrirComentarios(rid, u);
  });
  box.querySelectorAll('[data-apagar-coment]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('review_comments').delete().eq('id', b.dataset.apagarComent);
    error ? falha(error) : abrirComentarios(rid, u);
  });
  box.querySelectorAll('[data-den-coment]').forEach((b) => b.onclick = () => denunciar('comment', b.dataset.denComent));
}
