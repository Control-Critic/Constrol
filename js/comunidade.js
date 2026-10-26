import { sb, $, esc, montarLayout, configurado, param, usuario, perfil, avatarHtml, toast, falha, urlSegura, cssUrl, denunciar, aoVivo, aoVivoDiscord, seloAoVivo, enviarImagem, esqueletoLista } from './app.js';
import { COLUNAS_POST, postHtml, ligarPosts, compositorHtml, ligarCompositor } from './posts.js';
import { montarCall } from './chamada-ui.js';

await montarLayout();
const main = $('#conteudo');
const id = Number(param('id'));
let call = null;

if (configurado) carregar();

async function carregar() {
  const { data: c } = await sb.from('communities').select('*, games(slug,title), profiles!communities_owner_id_fkey(username)').eq('id', id).maybeSingle();
  if (!c) { main.innerHTML = '<p class="vazio">Comunidade não encontrada.</p>'; return; }
  document.title = `${c.name} | Control Critic`;
  const u = await usuario();
  const p = await perfil();
  const { data: membro } = u ? await sb.from('community_members').select('*').eq('community_id', id).eq('user_id', u.id).maybeSingle() : { data: null };
  const dono = u && (c.owner_id === u.id || ['admin', 'moderator'].includes(p?.role));
  const moderador = dono || membro?.role === 'mod';
  const { data: segredo } = membro || dono ? await sb.from('community_secrets').select('*').eq('community_id', id).maybeSingle() : { data: null };
  const { data: pedidos } = dono && c.is_private ? await sb.from('community_requests').select('*, profiles(username,avatar_url,equipped_frame)').eq('community_id', id).order('created_at') : { data: [] };
  const { data: meuPedido } = u && !membro && c.is_private ? await sb.from('community_requests').select('created_at').eq('community_id', id).eq('user_id', u.id).maybeSingle() : { data: null };
  const bloqueada = c.is_private && !membro && !dono;
  const linkConvite = segredo ? `${location.origin}${location.pathname}?id=${id}&convite=${segredo.invite_code}` : '';

  main.innerHTML = `
    <div class="cartao" style="margin-bottom:18px">
      <div class="com-capa" ${cssUrl(c.banner_url) ? `style="background-image:url('${esc(cssUrl(c.banner_url))}')"` : ''}></div>
      <div class="controles" style="align-items:flex-end;gap:14px"><img class="com-icone" src="${urlSegura(c.icon_url) || 'img/Control.png'}" alt="">
      <h1 style="margin:8px 0 0">${c.is_private ? '🔒 ' : ''}${esc(c.name)}${c.oficial ? ' <span class="tag amarela" title="Comunidade oficial do Control Critic">✔ Oficial</span>' : ''}</h1></div>
      <p class="muted">${esc(c.description || '')}</p>
      <p style="margin:10px 0">${c.games ? `<a class="tag" href="jogo.html?slug=${encodeURIComponent(c.games.slug)}">${esc(c.games.title)}</a> ` : ''}
        <span class="tag">${Number(c.members_count) === 1 ? '1 membro' : `${Number(c.members_count).toLocaleString('pt-BR')} membros`}</span> <span class="tag">${c.is_private ? '🔒 Privada' : '🌐 Pública'}</span>
        <span class="muted">· criada por ${esc(c.profiles?.username || '—')}</span></p>
      <div class="controles">
        ${!u ? `<a class="btn" href="entrar.html?volta=${encodeURIComponent('comunidade.html' + location.search)}">Entrar para participar</a>`
          : membro ? '<button class="btn sec" id="sair">Sair da comunidade</button>'
          : meuPedido ? '<button class="btn sec" id="cancelar-pedido">⏳ Pedido enviado · cancelar</button>'
          : `<button class="btn" id="participar">${c.is_private && !param('convite') ? '🔒 Pedir para entrar' : 'Participar'}</button>`}
        ${segredo && (c.is_private ? dono : true) ? '<button class="btn sec" id="convidar">🔗 Convidar</button>' : ''}
        ${dono ? '<button class="btn sec" id="editar">Configurar</button>' : ''}
        ${u && !dono ? '<button class="bt-denunciar" id="den-comunidade">🚩 Denunciar</button>' : ''}
      </div>
    </div>

    ${c.regras && !bloqueada ? `<details class="cartao regras-com" style="margin-bottom:14px" ${membro ? '' : 'open'}><summary><strong>📜 Regras da comunidade</strong></summary><p class="quebra" style="margin-top:8px">${esc(c.regras)}</p>
      <p class="muted" style="font-size:.82rem">Valem também as <a href="diretrizes.html">diretrizes do Control Critic</a>.</p></details>` : ''}
    ${bloqueada ? `<div class="cartao vazio">🔒 Esta comunidade é privada. O mural, as partidas e a call aparecem só para membros.
      ${u ? (meuPedido ? '<br>Seu pedido está aguardando o dono aprovar.' : '<br>Peça para entrar ou use um link de convite.') : ''}</div>` : ''}
    <div id="ao-vivo-discord" class="lista-ao-vivo" aria-live="polite"></div>
    <div class="abas ${bloqueada ? 'hidden' : ''}"><button class="aba ativo" data-a="posts">Mural</button>${dono && c.is_private ? `<button class="aba" data-a="pedidos">Pedidos${pedidos.length ? ` (${pedidos.length})` : ''}</button>` : ''}<button class="aba" data-a="partidas">Partidas 📅</button>${dono ? '<button class="aba" data-a="membros">Membros e cargos</button>' : ''}<button class="aba" data-a="call">Call 🔊</button><button class="aba" data-a="discord">Discord / PS5</button></div>

    <section data-p="pedidos" class="hidden">
      <div class="lista">${(pedidos || []).map((r) => `<div class="cartao controles" style="align-items:center">
        ${avatarHtml(r.profiles)} <a class="usuario" href="perfil.html?u=${encodeURIComponent(r.profiles?.username || '')}">${esc(r.profiles?.username)}</a>
        <span class="muted" style="flex:1">${esc(r.message || '')}</span>
        <button class="btn pequeno" data-aceitar="${r.user_id}">Aceitar</button><button class="btn sec pequeno" data-recusar="${r.user_id}">Recusar</button></div>`).join('')
        || '<p class="vazio">Nenhum pedido pendente.</p>'}</div>
    </section>

    <section data-p="posts" class="${bloqueada ? 'hidden' : ''}">
      ${membro ? compositorHtml('Compartilhe algo com a comunidade: um print, uma dica, marque uma partida...') : '<p class="muted" style="margin-bottom:12px">Participe da comunidade para publicar.</p>'}
      <div class="lista" id="posts" style="margin-top:14px">${esqueletoLista(3)}</div>
    </section>

    <section data-p="membros" class="hidden"><p class="muted" style="margin-bottom:10px">🛡️ <strong>Moderadores</strong> podem apagar posts e comentários desta comunidade. Só você (dono) promove, rebaixa e remove membros.</p>
      <div class="lista" id="membros"></div></section>

    <section data-p="partidas" class="hidden">
      ${membro ? `<details class="cartao" style="margin-bottom:14px"><summary style="cursor:pointer;font-weight:700">+ Agendar uma partida</summary>
        <form id="form-evento" style="margin-top:10px">
          <div class="form-linha">
            <div><label for="ev-titulo">Título</label><input id="ev-titulo" required minlength="3" maxlength="80" placeholder="Ex.: Raid de sábado"></div>
            <div><label for="ev-data">Data e hora</label><input id="ev-data" type="datetime-local" required></div>
            <div><label for="ev-plat">Plataforma</label><select id="ev-plat"><option value="">Qualquer</option>
              ${['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile', 'Crossplay'].map((x) => `<option>${x}</option>`).join('')}</select></div>
            <div><label for="ev-vagas">Vagas</label><input id="ev-vagas" type="number" min="2" max="100" placeholder="Sem limite"></div>
          </div>
          <label for="ev-desc">Detalhes</label><textarea id="ev-desc" rows="2" maxlength="1000" placeholder="Modo de jogo, nível mínimo, se vai ter call..."></textarea>
          <button class="btn" style="margin-top:10px">Agendar e avisar os membros</button>
        </form></details>` : '<p class="muted" style="margin-bottom:12px">Participe da comunidade para agendar e entrar em partidas.</p>'}
      <div class="lista" id="eventos"></div>
    </section>

    <section data-p="call" class="hidden">
      ${membro ? '<div id="call-box"></div>' : '<p class="muted">Participe da comunidade para entrar na call.</p>'}
      ${c.discord_guild_id && /^\d{17,20}$/.test(c.discord_guild_id) ? `<details class="cartao" style="margin-top:14px"><summary style="cursor:pointer;font-weight:700">💬 Sala de voz do Discord da comunidade (para quem está no PS5/Xbox)</summary>
        <p class="muted" style="margin:8px 0">Veja quem está nos canais de voz do Discord e entre com um clique. Se a <strong>ponte</strong> estiver ligada, o Discord aparece aqui na call como “🎮 Discord” e todo mundo se ouve.</p>
        <iframe src="https://discord.com/widget?id=${c.discord_guild_id}&theme=dark" width="100%" height="420" style="border:0;border-radius:10px;max-width:420px" loading="lazy" title="Discord"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"></iframe></details>` : ''}
    </section>

    <section data-p="discord" class="hidden">
      <div class="discord-box">
        <div style="flex:1;min-width:220px">
          <h3>Jogando no PS5 ou Xbox?</h3>
          <p class="muted">Consoles não abrem chamadas pelo navegador, mas têm Discord integrado. Vincule sua conta do Discord ao console
          (PS5: Configurações → Usuários e contas → Vincular a outros serviços → Discord) e entre na call do <strong>servidor do Discord</strong> da comunidade.</p>
          <p class="muted" style="margin-top:8px">🔗 Com a <strong>ponte de voz</strong> ligada (o robô do Control Critic aparece no canal de voz do Discord), quem está no Discord e quem está na call do site <strong>se ouvem</strong>: o Discord aparece na call do site como “🎮 Discord”. A ponte leva só a voz; tela e câmera continuam só no site. Sem a ponte, são salas separadas: combinem de usar a mesma.</p>
        </div>
        ${c.discord_invite ? `<a class="btn discord" href="${urlSegura(c.discord_invite)}" target="_blank" rel="noopener noreferrer">Entrar no servidor do Discord</a>`
          : '<span class="muted">Esta comunidade ainda não tem servidor do Discord vinculado.</span>'}
      </div>
      <div id="widget" style="margin-top:14px"></div>
      ${dono ? '<div id="ponte-box" style="margin-top:14px"></div>' : ''}
    </section>

    <dialog id="dlg"><form method="dialog" id="form-cfg">
      <h2 style="margin-top:0">Configurar comunidade</h2>
      <label for="c-nome">Nome</label><input id="c-nome" required minlength="3" maxlength="60" value="${esc(c.name)}">
      <label for="c-desc">Descrição</label><textarea id="c-desc" rows="3" maxlength="500">${esc(c.description || '')}</textarea>
      <label for="c-regras">Regras (aparecem no topo para quem entra)</label><textarea id="c-regras" rows="4" maxlength="2000" placeholder="Ex.: 1. Sem spoiler sem aviso. 2. Respeito na call.">${esc(c.regras || '')}</textarea>
      <div class="form-linha">
        <div><label for="c-banner">Banner (1500×400, até 3 MB)</label><input id="c-banner" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          ${c.banner_url ? '<label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" id="c-sem-banner" style="width:auto"> Remover banner</label>' : ''}</div>
        <div><label for="c-icone">Ícone (quadrado, até 3 MB)</label><input id="c-icone" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          ${c.icon_url ? '<label style="display:flex;gap:8px;font-weight:400"><input type="checkbox" id="c-sem-icone" style="width:auto"> Remover ícone</label>' : ''}</div>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="c-priv" style="width:auto" ${c.is_private ? 'checked' : ''}>
        🔒 Comunidade privada (só membros veem o mural, as partidas e a call; para entrar, link de convite ou pedido aprovado por você)</label>
      <label for="c-inv">Convite do Discord</label><input id="c-inv" placeholder="https://discord.gg/..." value="${esc(c.discord_invite || '')}">
      <label for="c-guild">ID do servidor do Discord (para mostrar quem está online/em call)</label>
      <input id="c-guild" placeholder="ex.: 123456789012345678" value="${esc(c.discord_guild_id || '')}">
      <p class="muted" style="font-size:.85rem;margin-top:6px">No Discord: Configurações do servidor → Widget → ative "Habilitar widget do servidor" e copie o ID.</p>
      <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button>
      <button type="button" class="btn perigo" id="c-del" style="margin-left:auto">Excluir comunidade</button></div>
    </form></dialog>`;

  if (c.discord_guild_id && !bloqueada) aoVivoDiscord($('#ao-vivo-discord'), c.id);
  // Abas
  main.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
    main.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
    main.querySelectorAll('[data-p]').forEach((s) => s.classList.toggle('hidden', s.dataset.p !== b.dataset.a));
    if (b.dataset.a === 'discord') { widgetDiscord(c.discord_guild_id); if (dono) painelPonte(c); }
    history.replaceState(null, '', '#' + b.dataset.a);
  });
  const abaInicial = main.querySelector(`.aba[data-a="${location.hash.slice(1)}"]`);
  if (abaInicial) abaInicial.click();

  // Partidas
  carregarEventos(u, membro, dono, c.game_id);
  $('#form-evento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const quando = new Date($('#ev-data').value);
    if (!(quando > new Date())) return toast('Escolha uma data no futuro.', true);
    const { error } = await sb.from('events').insert({
      community_id: id, creator_id: u.id, title: $('#ev-titulo').value.trim(), starts_at: quando.toISOString(), game_id: c.game_id,
      platform: $('#ev-plat').value || null, slots: $('#ev-vagas').value ? Number($('#ev-vagas').value) : null, description: $('#ev-desc').value.trim() || null,
    });
    if (error) return falha(error);
    toast('Partida agendada! Os membros foram avisados.');
    e.target.reset(); e.target.closest('details').open = false;
    carregarEventos(u, membro, dono, c.game_id);
  });
  $('#den-comunidade')?.addEventListener('click', () => denunciar('community', id));

  // Membros transmitindo na Twitch agora
  if (!bloqueada) sb.from('community_members').select('profiles(username,twitch_user)').eq('community_id', id).limit(300).then(async ({ data: ms }) => {
    const comTwitch = (ms || []).map((m) => m.profiles).filter((x) => x?.twitch_user);
    const vivo = await aoVivo(comTwitch.map((x) => x.twitch_user));
    const lives = comTwitch.filter((x) => vivo.has(x.twitch_user.toLowerCase()));
    if (lives.length) main.querySelector('.cartao')?.insertAdjacentHTML('beforeend', `<div style="margin-top:10px"><strong>📺 Membros ao vivo agora:</strong>
      ${lives.map((x) => `${esc(x.username)} ${seloAoVivo(vivo.get(x.twitch_user.toLowerCase()), x.twitch_user)}`).join(' · ')}</div>`);
  });

  $('#participar')?.addEventListener('click', async () => {
    let mensagem = null;
    if (c.is_private && !param('convite')) {
      mensagem = prompt('Esta comunidade é privada. Quer mandar uma mensagem para o dono junto com o pedido? (opcional)', '');
      if (mensagem === null) return;
    }
    const { data: r, error } = await sb.rpc('join_community', { cid: id, codigo: param('convite'), mensagem: mensagem || null });
    if (error) return falha(error);
    toast(r === 'membro' ? 'Bem-vindo à comunidade!' : 'Pedido enviado! Você será avisado quando o dono aprovar.');
    if (param('convite')) history.replaceState(null, '', `?id=${id}`);
    carregar();
  });
  $('#cancelar-pedido')?.addEventListener('click', async () => {
    const { error } = await sb.from('community_requests').delete().eq('community_id', id).eq('user_id', u.id);
    error ? falha(error) : carregar();
  });
  $('#convidar')?.addEventListener('click', async () => {
    const link = c.is_private ? linkConvite : `${location.origin}${location.pathname}?id=${id}`;
    try { await navigator.clipboard.writeText(link); toast(c.is_private ? 'Link de convite copiado! Quem abrir entra direto.' : 'Link da comunidade copiado!'); }
    catch { prompt('Copie o link:', link); }
  });
  main.querySelectorAll('[data-aceitar],[data-recusar]').forEach((b) => b.onclick = async () => {
    const aceitar = !!b.dataset.aceitar;
    const { error } = await sb.rpc('answer_join_request', { cid: id, uid: b.dataset.aceitar || b.dataset.recusar, aceitar });
    if (error) return falha(error);
    toast(aceitar ? 'Membro aceito!' : 'Pedido recusado.'); carregar();
  });
  $('#sair')?.addEventListener('click', async () => {
    if (!confirm(`Sair de ${c.name}?${c.is_private ? ' Por ser privada, para voltar você vai precisar de um novo convite ou aprovação.' : ''}`)) return;
    await call?.sair();
    const { error } = await sb.from('community_members').delete().eq('community_id', id).eq('user_id', u.id);
    if (error) return falha(error);
    carregar();
  });

  // Configurações (dono/moderação)
  $('#editar')?.addEventListener('click', () => $('#dlg').showModal());
  $('#dlg')?.addEventListener('close', async () => {
    if ($('#dlg').returnValue !== 'ok') return;
    const dados = {
      name: $('#c-nome').value.trim(), description: $('#c-desc').value.trim() || null, regras: $('#c-regras').value.trim() || null, is_private: $('#c-priv').checked,
      discord_invite: $('#c-inv').value.trim() || null, discord_guild_id: $('#c-guild').value.trim() || null,
    };
    try {
      if ($('#c-sem-banner')?.checked) dados.banner_url = null;
      if ($('#c-sem-icone')?.checked) dados.icon_url = null;
      if ($('#c-banner').files[0]) dados.banner_url = await enviarImagem(u.id, 'comunidade-banner', $('#c-banner').files[0]);
      if ($('#c-icone').files[0]) dados.icon_url = await enviarImagem(u.id, 'comunidade-icone', $('#c-icone').files[0]);
    } catch (e) { return falha(e); }
    const { error } = await sb.from('communities').update(dados).eq('id', id);
    if (error) return falha(/discord/.test(error.message) ? { message: 'Convite ou ID do Discord em formato inválido.' } : error);
    toast('Comunidade atualizada.'); carregar();
  });
  $('#c-del')?.addEventListener('click', async () => {
    if (!confirm('Excluir a comunidade e todos os posts? Isso não pode ser desfeito.')) return;
    const { error } = await sb.from('communities').delete().eq('id', id);
    if (error) return falha(error);
    location.href = 'comunidades.html';
  });

  // Mural
  if ($('#compositor')) ligarCompositor($('#compositor'), { u, comunidade: id, jogo: c.games ? { id: c.game_id, title: c.games.title } : null, aoPublicar: () => carregarPosts(u, moderador), moderador });
  carregarPosts(u, moderador);
  sb.channel('posts:' + id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `community_id=eq.${id}` }, () => carregarPosts(u, moderador))
    .subscribe();
  if (dono) carregarMembros(c, u);

  if (membro && segredo && $('#call-box')) call = montarCall($('#call-box'), {
    // A sala tem uma chave que só membros conhecem (em todas as comunidades): ninguém de fora entra na call só sabendo o número
    salaId: `${id}-${segredo?.room_key || 'sem-chave'}`, u, p, titulo: c.name,
    descricao: 'Voz, câmera e compartilhamento de tela direto no navegador, com chat. Ideal para até 6 pessoas. Clique num vídeo para destacá-lo.',
  });
}

async function carregarPosts(u, moderador) {
  const { data: posts } = await sb.from('posts').select(COLUNAS_POST).eq('community_id', id).eq('status', 'published')
    .order('aviso', { ascending: false }).order('created_at', { ascending: false }).limit(60);
  const box = $('#posts');
  box.innerHTML = (posts || []).map((x) => postHtml(x, { u, moderar: moderador, mostrarComunidade: false })).join('') || '<p class="vazio">Nenhum post ainda. Seja o primeiro!</p>';
  ligarPosts(box, { u });
}

// Membros e cargos (só o dono)
async function carregarMembros(c, u) {
  const { data: ms } = await sb.from('community_members').select('user_id, role, joined_at, profiles(username,avatar_url,equipped_frame)').eq('community_id', id).limit(500);
  const box = $('#membros');
  const ordem = (m) => (m.user_id === c.owner_id ? 0 : m.role === 'mod' ? 1 : 2);
  box.innerHTML = (ms || []).sort((a, b) => ordem(a) - ordem(b)).map((m) => `<div class="cartao controles" style="align-items:center">
    ${avatarHtml(m.profiles)} <a class="usuario" href="perfil.html?u=${encodeURIComponent(m.profiles?.username || '')}" style="flex:1">${esc(m.profiles?.username)}</a>
    ${m.user_id === c.owner_id ? '<span class="tag amarela">👑 Dono</span>' : `
      <span class="tag">${m.role === 'mod' ? '🛡️ Moderador' : 'Membro'}</span>
      <button class="btn sec pequeno" data-cargo="${m.user_id}:${m.role === 'mod' ? 'member' : 'mod'}">${m.role === 'mod' ? 'Tirar moderador' : 'Tornar moderador'}</button>
      <button class="btn perigo pequeno" data-cargo="${m.user_id}:remover">Remover</button>`}</div>`).join('') || '<p class="vazio">Sem membros.</p>';
  box.querySelectorAll('[data-cargo]').forEach((b) => b.onclick = async () => {
    const [uid, papel] = b.dataset.cargo.split(':');
    if (papel === 'remover' && !confirm('Remover este membro da comunidade?')) return;
    const { error } = await sb.rpc('set_community_role', { cid: id, uid, papel });
    if (error) return falha(error);
    toast('Feito!'); carregarMembros(c, u);
  });
}

// Ponte de voz oficial (só o dono vê): adiciona o robô, escolhe o canal e confirma com /vincular no Discord
async function painelPonte(c) {
  const box = $('#ponte-box');
  const [{ data: cfg }, { data: ponte, error }] = await Promise.all([
    sb.rpc('public_settings'), sb.from('discord_bridges').select('*').eq('community_id', id).maybeSingle()]);
  if (error) { box.innerHTML = ''; return; }                       // banco ainda sem a tabela
  const app = /^\d{17,20}$/.test(cfg?.robo_discord || '') ? cfg.robo_discord : null;
  const servidor = /^\d{17,20}$/.test(c.discord_guild_id || '') ? c.discord_guild_id : null;
  // Permissões: ver canais, conectar, falar e usar detecção de voz
  const convite = app && `https://discord.com/oauth2/authorize?client_id=${app}&scope=bot%20applications.commands&permissions=36785152${servidor ? '&guild_id=' + servidor : ''}`;
  box.innerHTML = `<div class="cartao">
    <h3>🔗 Ponte de voz com o Discord <span class="tag">só você vê</span></h3>
    <p class="muted">Junta um canal de voz do seu servidor do Discord com a call desta comunidade: quem está no console fala com quem está no site.</p>
    ${!app ? '<p class="aviso" style="margin-top:10px">O robô oficial ainda não foi configurado pela equipe do site.</p>' : !servidor
      ? '<p class="aviso" style="margin-top:10px">Primeiro preencha o <strong>ID do servidor do Discord</strong> em "Configurar" (no topo da comunidade).</p>' : `
      <ol style="margin:10px 0 0 18px;line-height:1.9">
        <li><a class="btn sec pequeno" href="${convite}" target="_blank" rel="noopener noreferrer">➕ Adicionar o robô ao meu servidor</a> <span class="muted" style="font-size:.85rem">(precisa ser administrador do servidor)</span></li>
        <li>No Discord: Configurações → Avançado → ligue o <strong>Modo desenvolvedor</strong>. Clique com o botão direito no canal de voz → <strong>Copiar ID do canal</strong>.
          <form id="form-ponte" class="controles" style="margin-top:6px"><input id="ponte-canal" required pattern="\\d{17,20}" placeholder="ID do canal de voz" value="${esc(ponte?.channel_id || '')}" style="max-width:260px">
            <button class="btn pequeno">Salvar canal</button></form></li>
        ${ponte ? `<li>${ponte.verified ? `✅ <strong>Confirmado</strong> no Discord${ponte.verified_by ? ' por ' + esc(ponte.verified_by) : ''}.`
          : `No seu servidor do Discord, digite <code style="font-size:1.05rem">/vincular ${esc(ponte.verify_code)}</code> (precisa da permissão "Gerenciar servidor").
             <button class="btn sec pequeno" id="ponte-atualizar">Já digitei</button>`}</li>` : ''}
      </ol>
      ${ponte ? `<label style="display:flex;gap:8px;align-items:center;font-weight:400;margin-top:10px"><input type="checkbox" id="ponte-ativa" style="width:auto" ${ponte.active ? 'checked' : ''}> Ponte ligada
        <span class="muted" style="font-size:.85rem">(ela entra sozinha quando há gente no site e no Discord)</span></label>
        <button class="btn perigo pequeno" id="ponte-remover" style="margin-top:8px">Remover ponte</button>` : ''}
      <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:700">🤖 Comandos do robô no seu servidor</summary>
        <ul style="margin-top:8px;line-height:1.7">
          <li><strong>/avisos</strong> (admin): escolhe o canal para a promoção do dia, a enquete "este ou aquele", o ranking da semana e o aviso de quem começou a transmitir.</li>
          <li><strong>/conectar</strong>: cada pessoa liga a conta do Discord ao perfil do site (uma vez só).</li>
          <li><strong>/grupo</strong>, <strong>/nota</strong>, <strong>/enquete</strong> e <strong>/ranking</strong>: usam o site sem sair do Discord.</li>
          <li>🔴 Quando alguém transmite (Go Live) numa call do servidor, aparece aqui no topo da comunidade e no início do site, com o botão <strong>Assistir no Discord</strong>.</li>
        </ul></details>
      <p class="muted" style="font-size:.82rem;margin-top:10px">A ponte leva só a voz (o Discord não permite robôs com vídeo). Ela depende do computador da equipe do site estar ligado.
        Avise a galera do servidor que o canal está ligado ao site.</p>`}
  </div>`;
  $('#form-ponte')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const canal = $('#ponte-canal').value.trim();
    const { error: er } = ponte
      ? await sb.from('discord_bridges').update({ guild_id: servidor, channel_id: canal }).eq('community_id', id)
      : await sb.from('discord_bridges').insert({ community_id: id, guild_id: servidor, channel_id: canal });
    if (er) return falha(er);
    toast('Canal salvo! Agora confirme no Discord com /vincular.'); painelPonte(c);
  });
  $('#ponte-atualizar')?.addEventListener('click', () => painelPonte(c));
  $('#ponte-ativa')?.addEventListener('change', async (e) => {
    const { error: er } = await sb.from('discord_bridges').update({ active: e.target.checked }).eq('community_id', id);
    er ? falha(er) : toast(e.target.checked ? 'Ponte ligada.' : 'Ponte desligada.');
  });
  $('#ponte-remover')?.addEventListener('click', async () => {
    if (!confirm('Remover a ponte desta comunidade?')) return;
    const { error: er } = await sb.from('discord_bridges').delete().eq('community_id', id);
    er ? falha(er) : painelPonte(c);
  });
}

// Widget público do Discord: mostra membros online e quem está em canal de voz
async function widgetDiscord(guildId) {
  const box = $('#widget');
  if (!guildId || box.dataset.ok) return;
  box.dataset.ok = '1';
  try {
    const r = await fetch(`https://discord.com/api/guilds/${encodeURIComponent(guildId)}/widget.json`);
    if (!r.ok) throw new Error();
    const w = await r.json();
    const emCall = (w.members || []).filter((m) => m.channel_id);
    const canais = Object.fromEntries((w.channels || []).map((ch) => [ch.id, ch.name]));
    box.innerHTML = `<div class="cartao">
      <h3>${esc(w.name)} <span class="muted" style="font-family:Inter;font-size:.9rem">· ${w.presence_count} online</span></h3>
      ${emCall.length ? `<p style="margin:8px 0 4px"><strong>Em call agora:</strong></p><div class="discord-membros">
        ${emCall.map((m) => `<span>🔊 ${esc(m.username)} <span class="muted">(${esc(canais[m.channel_id] || 'voz')})</span></span>`).join('')}</div>`
        : '<p class="muted">Ninguém na call do Discord agora.</p>'}
      <p class="muted" style="font-size:.82rem;margin-top:8px">Lista do widget público do Discord (pode levar alguns minutos para atualizar e não mostra quem está invisível).</p>
      ${w.instant_invite ? `<p style="margin-top:10px"><a href="${urlSegura(w.instant_invite)}" target="_blank" rel="noopener noreferrer">Convite instantâneo</a></p>` : ''}
    </div>`;
  } catch {
    box.innerHTML = '<p class="muted">Não foi possível carregar o widget. Verifique se o widget do servidor está habilitado no Discord.</p>';
  }
}

// ---------- Partidas agendadas ----------
async function carregarEventos(u, membro, dono) {
  const { data: evs } = await sb.from('events').select('*, event_attendees(user_id, profiles(username)), profiles!events_creator_id_fkey(username)')
    .eq('community_id', id).gte('starts_at', new Date(Date.now() - 3 * 3600e3).toISOString()).order('starts_at').limit(30);
  const fmt = (d, o) => new Date(d).toLocaleString('pt-BR', o);
  $('#eventos').innerHTML = (evs || []).map((e) => {
    const nomes = e.event_attendees.map((a) => a.profiles?.username).filter(Boolean);
    const vou = u && e.event_attendees.some((a) => a.user_id === u.id);
    const lotado = e.slots && nomes.length >= e.slots;
    return `<div class="cartao evento">
      <div class="data">${fmt(e.starts_at, { day: '2-digit' })}<small>${fmt(e.starts_at, { month: 'short' })}</small><small>${fmt(e.starts_at, { hour: '2-digit', minute: '2-digit' })}</small></div>
      <div style="flex:1;min-width:200px">
        <strong>${esc(e.title)}</strong> ${e.platform ? `<span class="tag">${esc(e.platform)}</span>` : ''}
        <span class="tag">${nomes.length}${e.slots ? '/' + e.slots : ''} confirmados</span>
        ${e.description ? `<p class="muted quebra" style="margin-top:4px">${esc(e.description)}</p>` : ''}
        <p class="muted" style="font-size:.82rem;margin-top:4px">${nomes.length ? 'Vão: ' + nomes.map(esc).join(', ') : 'Ninguém confirmado ainda'} · criada por ${esc(e.profiles?.username || '—')}</p>
      </div>
      <div class="controles">
        ${membro ? (vou ? `<button class="btn sec pequeno" data-sair="${e.id}">Não vou mais</button>` : `<button class="btn pequeno" data-ir="${e.id}" ${lotado ? 'disabled' : ''}>${lotado ? 'Lotado' : 'Eu vou!'}</button>`) : ''}
        <button class="btn sec pequeno" data-ics="${e.id}" title="Adicionar à agenda do celular/computador">📅 Agenda</button>
        ${u && (e.creator_id === u.id || dono) ? `<button class="btn perigo pequeno" data-cancelar="${e.id}">Cancelar</button>` : ''}
      </div></div>`;
  }).join('') || '<p class="vazio">Nenhuma partida agendada. Que tal marcar uma?</p>';

  const recarregar = () => carregarEventos(u, membro, dono);
  $('#eventos').querySelectorAll('[data-ir]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('event_attendees').insert({ event_id: Number(b.dataset.ir), user_id: u.id });
    if (error) return falha(error);
    toast('Presença confirmada! Você recebe um lembrete antes de começar.'); recarregar();
  });
  $('#eventos').querySelectorAll('[data-sair]').forEach((b) => b.onclick = async () => {
    const { error } = await sb.from('event_attendees').delete().eq('event_id', b.dataset.sair).eq('user_id', u.id);
    error ? falha(error) : recarregar();
  });
  $('#eventos').querySelectorAll('[data-cancelar]').forEach((b) => b.onclick = async () => {
    if (!confirm('Cancelar esta partida?')) return;
    const { error } = await sb.from('events').delete().eq('id', b.dataset.cancelar);
    error ? falha(error) : recarregar();
  });
  $('#eventos').querySelectorAll('[data-ics]').forEach((b) => b.onclick = () => {
    const e = evs.find((x) => x.id == b.dataset.ics);
    const t = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const fim = new Date(new Date(e.starts_at).getTime() + 2 * 3600e3);
    const limpa = (x) => String(x || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Control Critic//PT-BR', 'BEGIN:VEVENT', `UID:evento-${e.id}@controlcritic`,
      `DTSTAMP:${t(new Date())}`, `DTSTART:${t(e.starts_at)}`, `DTEND:${t(fim)}`, `SUMMARY:${limpa(e.title)}`,
      `DESCRIPTION:${limpa((e.description || '') + '\n' + location.href.split('#')[0] + '#call')}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Partida em 30 minutos', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'partida.ics' });
    a.click();
  });
}
