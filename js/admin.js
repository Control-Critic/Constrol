import { apagarArquivos } from './app.js';
import { SUPABASE_ANON_KEY } from './config.js';
import { avatarHtml, cssDoItem, cssMolduraImagem, aoMudarOnline, estadoOnline } from './app.js';
import { sb, $, esc, montarLayout, configurado, exigirLogin, perfil, data, toast, falha, urlSegura, plural, paginaInterna, corSegura, cabecalhosLogin } from './app.js';

await montarLayout();
const main = $('#conteudo');
let P;

const ABAS = [
  ['geral', 'Visão geral'], ['status', 'Status 🩺'], ['metricas', 'Métricas 📊'], ['problemas', 'Problemas 🐞'], ['denuncias', 'Denúncias'], ['apelacoes', 'Apelações'], ['jogos', 'Jogos'], ['noticias', 'Notícias'], ['promos', 'Promoções'], ['memes', 'Memes 😂'], ['stories', 'Stories 📸'],
  ['reviews', 'Avaliações'], ['posts', 'Posts'], ['comunidades', 'Comunidades'], ['mensagens', 'Mensagens'],
  ['usuarios', 'Usuários'], ['cargos', 'Cargos', true], ['itens', 'Itens', true], ['desafios', 'Desafios', true], ['registro', 'Registro'], ['site', 'Site', true], ['auto', 'Automação', true],
];

function iniciar() {
  const abas = ABAS.filter(([, , soAdmin]) => !soAdmin || P.role === 'admin');
  main.innerHTML = `<h1>Painel de Admin</h1>
    <div class="abas">${abas.map(([k, t], i) => `<button class="aba ${i ? '' : 'ativo'}" data-a="${k}">${t}</button>`).join('')}</div>
    <div id="painel"></div><dialog id="dlg"></dialog>`;
  main.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
    main.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
    abrir(b.dataset.a);
  });
  abrir('geral');
}

const painel = () => $('#painel');
const VIEWS = { geral, status, metricas, problemas, denuncias, apelacoes, jogos, noticias, promos, memes, stories, reviews, posts, comunidades, mensagens, usuarios, cargos, itens, desafios, registro, site, auto };
function abrir(k) { painel().innerHTML = '<p class="muted">Carregando...</p>'; VIEWS[k]().catch(falha); }

// Campo de busca de jogo com sugestões (o catálogo tem milhares de jogos)
function ligarBuscaJogo(input) {
  const caixa = input.parentElement, oculto = caixa.querySelector('input[type=hidden]'), sug = caixa.querySelector('.sugestoes');
  let t;
  input.oninput = () => {
    oculto.value = '';
    clearTimeout(t);
    t = setTimeout(async () => {
      const termo = input.value.trim().replace(/[%,()]/g, '');
      if (termo.length < 2) return sug.classList.add('hidden');
      const { data } = await sb.from('games').select('id,title,release_year').ilike('title', `%${termo}%`).order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(8);
      sug.innerHTML = (data || []).map((j) => `<button type="button" data-id="${j.id}" data-t="${esc(j.title)}">${esc(j.title)}${j.release_year ? ` <span class="muted">(${j.release_year})</span>` : ''}</button>`).join('') || '<p class="muted" style="padding:8px">Nenhum jogo.</p>';
      sug.classList.remove('hidden');
      sug.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { oculto.value = b.dataset.id; input.value = b.dataset.t; sug.classList.add('hidden'); });
    }, 300);
  };
}

// Formulário genérico em <dialog>. campos: [nome, rótulo, tipo, opções]
function formulario(titulo, campos, valores = {}) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">${esc(titulo)}</h2>
    ${campos.map(([n, r, tipo = 'text', ops]) => {
      const v = valores[n] ?? '';
      if (tipo === 'textarea') return `<label>${r}</label><textarea name="${n}" rows="5">${esc(v)}</textarea>`;
      if (tipo === 'checkbox') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${n}" style="width:auto" ${v ? 'checked' : ''}> ${r}</label>`;
      if (tipo === 'select') return `<label>${r}</label><select name="${n}"><option value="">—</option>${ops.map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ot)}</option>`).join('')}</select>`;
      if (tipo === 'file') return `<label>${r}</label><input type="file" name="${n}" accept="image/*">`;
      if (tipo === 'jogo') return `<label>${r}</label><div class="busca-jogo"><input type="search" data-busca-jogo="${n}" placeholder="Digite o nome do jogo..." value="${esc(valores.__jogo_titulo || '')}" autocomplete="off">
        <input type="hidden" name="${n}" value="${esc(v)}"><div class="sugestoes hidden"></div></div>`;
      return `<label>${r}</label><input type="${tipo}" name="${n}" value="${esc(v)}">`;
    }).join('')}
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  dlg.showModal();
  dlg.querySelectorAll('[data-busca-jogo]').forEach(ligarBuscaJogo);
  return new Promise((ok) => dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return ok(null);
    const f = dlg.querySelector('form'), out = {};
    for (const [n, , tipo] of campos) {
      const el = f.elements[n];
      if (tipo === 'checkbox') out[n] = el.checked;
      else if (tipo === 'file') out[n] = el.files[0] || null;
      else if (tipo === 'number') out[n] = el.value === '' ? null : Number(el.value);
      else out[n] = el.value.trim() === '' ? null : el.value.trim();
    }
    ok(out);
  }, { once: true }));
}

async function upload(arq, pasta) {
  if (!arq) return undefined;
  const caminho = `${pasta}/${Date.now()}-${arq.name.replace(/[^\w.-]/g, '_')}`;
  const { error } = await sb.storage.from('media').upload(caminho, arq);
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
}

function tabela(cab, linhas) {
  return `<div class="tabela-wrap"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.join('') || `<tr><td colspan="${cab.length}" class="muted">Nada por aqui.</td></tr>`}</tbody></table></div>`;
}

function acoes(handlers) {
  painel().querySelectorAll('[data-acao]').forEach((b) => b.onclick = async () => {
    try { await handlers[b.dataset.acao](b.dataset.id, b); } catch (e) { falha(e); }
  });
}

const reais = (c) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const corta = (s, n = 80) => esc(s && s.length > n ? s.slice(0, n) + '…' : s || '');

// ---------------- Visão geral ----------------
// Números das funções novas: quem está online/em call agora (presença) e o movimento das últimas 24 h
async function agoraNoSite() {
  const ontem = new Date(Date.now() - 864e5).toISOString();
  const conta = (q) => q.then(({ count }) => count ?? 0, () => 0);
  const [stories, posts, videos, memes, problemas] = await Promise.all([
    conta(sb.from('stories').select('id', { count: 'exact', head: true }).gte('created_at', ontem)),
    conta(sb.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', ontem)),
    conta(sb.from('posts').select('id', { count: 'exact', head: true }).not('video_url', 'is', null).gte('created_at', ontem)),
    conta(sb.from('posts').select('id', { count: 'exact', head: true }).eq('ig_ok', true).eq('ig_aprovado', false).eq('ig_recusado', false)),
    conta(sb.from('app_feedback').select('id', { count: 'exact', head: true }).eq('status', 'aberto').neq('kind', 'erro')),
  ]);
  const k = (v, r, link) => `<div class="kpi">${link ? `<a href="#" data-ir="${link}" style="color:inherit;text-decoration:none">` : ''}<div class="valor">${v}</div><div class="rotulo">${r}</div>${link ? '</a>' : ''}</div>`;
  const desenhar = (online) => {
    const est = estadoOnline(); const calls = [...est.values()].filter((x) => x.call).length;
    const el = $('#kpis-agora'); if (!el) return;
    el.innerHTML = k(online.size, '🟢 online agora') + k(calls, '🔊 em call agora') + k(stories, '📸 stories (24 h)') + k(posts, '📝 posts (24 h)')
      + k(videos, '🎬 vídeos (24 h)') + k(memes, '😂 memes esperando aprovação', 'memes') + k(problemas, '🐞 problemas/sugestões abertos', 'problemas');
    el.querySelectorAll('[data-ir]').forEach((a) => a.onclick = (e) => { e.preventDefault(); main.querySelector(`.aba[data-a="${a.dataset.ir}"]`)?.click(); });
  };
  aoMudarOnline(desenhar);
}

// ---------------- Stories (moderação) ----------------
async function stories() {
  const { data: ss, error } = await sb.from('stories').select('id,image_url,video_url,caption,poll,question,highlight,close_friends,created_at,expires_at,profiles!stories_user_id_fkey(username)')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw /stories/.test(error.message) ? new Error('Rode o supabase/schema.sql para ativar os stories.') : error;
  const agora = Date.now();
  painel().innerHTML = `<p class="muted">Stories publicados (os vencidos que não viraram destaque são apagados na limpeza semanal). Stories "💚 amigos" só aparecem aqui se você for melhor amigo da pessoa.</p>
    ${ss.length ? tabela(['Mídia', 'Autor', 'Conteúdo', 'Quando', 'Situação', ''], ss.map((x) => `<tr>
      <td>${x.video_url ? `<video src="${urlSegura(x.video_url)}#t=0.5" muted preload="metadata" style="width:80px;height:80px;object-fit:cover;border-radius:8px"></video>`
        : `<a href="${urlSegura(x.image_url)}" target="_blank" rel="noopener noreferrer"><img src="${urlSegura(x.image_url)}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px"></a>`}</td>
      <td>@${esc(x.profiles?.username)}</td>
      <td>${corta(x.caption || '', 80)}${x.poll ? `<br><span class="tag">📊 ${esc(x.poll.pergunta)}</span>` : ''}${x.question ? `<br><span class="tag">💬 ${esc(x.question)}</span>` : ''}</td>
      <td>${data(x.created_at)}</td>
      <td>${x.highlight ? `<span class="tag amarela">⭐ ${esc(x.highlight)}</span>` : new Date(x.expires_at) > agora ? '<span class="tag">no ar</span>' : '<span class="tag">vencido</span>'}${x.close_friends ? ' <span class="tag">💚</span>' : ''}</td>
      <td><button class="btn perigo pequeno" data-acao="apagar" data-id="${x.id}">Apagar</button></td></tr>`)) : '<p class="muted">Nenhum story ainda.</p>'}`;
  acoes({ apagar: async (id) => { if (!confirm('Apagar este story? A pessoa não é avisada.')) return; const st = (ss || []).find((x) => x.id == id); const { error: e } = await sb.from('stories').delete().eq('id', id); if (e) throw e; apagarArquivos(st?.image_url, st?.video_url); toast('Story apagado.'); stories(); } });
}

async function geral() {
  const { data: s, error } = await sb.rpc('admin_stats');
  if (error) throw error;
  const k = (v, r) => `<div class="kpi"><div class="valor">${v}</div><div class="rotulo">${r}</div></div>`;
  painel().innerHTML = `<div class="kpis">
      ${k(s.users, 'usuários')}${k(s.users_7d, 'novos (7 dias)')}${k(s.games, 'jogos')}${k(s.reviews, 'avaliações')}
      ${k(s.reviews_7d, 'avaliações (7 dias)')}${k(s.communities, 'comunidades')}${k(s.posts, 'posts')}${k(s.messages_new, 'mensagens novas')}
      ${k(s.reports_open ?? 0, 'denúncias abertas')}${k(s.events_next ?? 0, 'partidas agendadas')}
      ${s.active_7d != null ? k(s.active_7d, 'ativos (7 dias)') : ''}${s.banned != null ? k(s.banned, 'suspensos') : ''}${s.staff != null ? k(s.staff, 'equipe') : ''}
    </div>
    ${s.signups ? `<h2>Cadastros por dia (últimos 30 dias)</h2>
      <div class="cartao">${tabela(['Dia', 'Novos usuários'], s.signups.filter((d) => d.n > 0).reverse().map((d) => `<tr><td>${new Date(d.dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</td><td>${d.n}</td></tr>`))}
      <p class="muted" style="font-size:.85rem;margin-top:6px">Total no período: ${s.signups.reduce((a, d) => a + d.n, 0)}. Dias sem cadastro não aparecem.</p></div>` : ''}
    <h2>Top jogos</h2>
    ${tabela(['Jogo', 'Nota', 'Avaliações'], s.top_games.map((g) => `<tr><td>${esc(g.title)}</td><td>${Number(g.avg_rating).toFixed(2)}</td><td>${g.reviews_count}</td></tr>`))}
    <h2>Agora e nas últimas 24 h</h2><div class="kpis" id="kpis-agora"><p class="muted">Carregando...</p></div>
    <div id="uso"></div>`;
  if (P.role === 'admin') usoDoBanco();
  agoraNoSite();
}

// Uso do plano gratuito do Supabase (500 MB de banco e 1 GB de arquivos)
async function usoDoBanco() {
  const { data: u, error } = await sb.rpc('admin_usage');
  if (error || !u) return;
  const mb = (b) => (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
  const barra = (v, lim) => { const pct = Math.min(100, Math.round((v / lim) * 100)); return `<div class="barra-xp" style="max-width:420px;margin:6px 0"><div style="width:${pct}%;${pct > 80 ? 'background:#ff5c5c' : ''}"></div></div><span class="muted">${mb(v)} de ${mb(lim)} (${pct}%)</span>`; };
  $('#uso').innerHTML = `<h2>Uso do Supabase (plano gratuito)</h2>
    <div class="cartao"><strong>Banco de dados</strong>${barra(u.banco_bytes, 500 * 1048576)}
      <p style="margin-top:12px"><strong>Arquivos (imagens)</strong> · ${plural(u.arquivos, 'arquivo')}</p>${barra(u.arquivos_bytes, 1024 * 1048576)}
      <p class="muted" style="font-size:.85rem;margin-top:8px">Acima de 80% fica vermelho. Tráfego e conexões em tempo real não aparecem aqui: veja em Supabase → Usage.</p></div>
    <h3 style="margin-top:14px">Maiores tabelas</h3>
    ${tabela(['Tabela', 'Tamanho', 'Linhas (aprox.)'], (u.tabelas || []).map((t) => `<tr><td>${esc(t.nome)}</td><td>${mb(t.bytes)}</td><td>${Number(t.linhas).toLocaleString('pt-BR')}</td></tr>`))}`;
}

// ---------------- Problemas: relatos das pessoas e erros automáticos ----------------
async function problemas() {
  const f = painel().dataset.fb || 'bug';
  let q = sb.from('app_feedback').select('*, profiles(username)').order('created_at', { ascending: false }).limit(200);
  q = f === 'resolvido' ? q.eq('status', 'resolvido') : q.eq('status', 'aberto').eq('kind', f);
  const { data: fs, error } = await q;
  if (error) throw /app_feedback/.test(error.message) ? new Error('Banco desatualizado: rode de novo o supabase/schema.sql.') : error;
  const ROT = { bug: '🐞 Problemas relatados', sugestao: '💡 Sugestões', erro: '⚠️ Erros automáticos', resolvido: '✓ Resolvidos' };
  painel().innerHTML = `<div class="chips">${Object.entries(ROT).map(([k, t]) => `<button class="chip ${k === f ? 'ativo' : ''}" data-fb="${k}">${t}</button>`).join('')}</div>
    <p class="muted" style="margin:10px 0">${f === 'erro' ? 'Erros de JavaScript que aconteceram no navegador das pessoas (registrados sozinhos, sem a pessoa precisar avisar). Repetidos na mesma hora contam uma vez.' : 'Enviados pelo botão "🐞 Reportar problema" no rodapé do site.'}</p>
    ${tabela(['Quando', 'Quem', 'Mensagem', 'Página / aparelho', ''], fs.map((x) => `<tr>
      <td>${new Date(x.created_at).toLocaleString('pt-BR')}</td><td>${esc(x.profiles?.username || 'visitante')}</td>
      <td class="quebra" style="max-width:420px">${esc(x.message)}${x.details ? `<br><span class="muted" style="font-size:.78rem">${esc(JSON.stringify(x.details).slice(0, 300))}</span>` : ''}</td>
      <td><a href="${paginaInterna(x.page)}" target="_blank" rel="noopener noreferrer">${esc(x.page || '—')}</a><br><span class="muted" style="font-size:.75rem">${esc((x.agent || '').replace(/Mozilla\/5.0 /, '').slice(0, 90))}</span></td>
      <td class="controles">${x.status === 'aberto' ? `<button class="btn sec pequeno" data-acao="resolver" data-id="${x.id}">✓ Resolvido</button>` : ''}
        <button class="btn perigo pequeno" data-acao="apagar" data-id="${x.id}">Apagar</button></td></tr>`))}`;
  painel().querySelectorAll('[data-fb]').forEach((b) => b.onclick = () => { painel().dataset.fb = b.dataset.fb; problemas(); });
  acoes({
    resolver: async (id) => { const { error: e } = await sb.from('app_feedback').update({ status: 'resolvido' }).eq('id', id); if (e) throw e; problemas(); },
    apagar: async (id) => { const { error: e } = await sb.from('app_feedback').delete().eq('id', id); if (e) throw e; problemas(); },
  });
}

// ---------------- Jogos ----------------
const filtroJogos = { q: '', destaque: false, pagina: 0 };
async function jogos() {
  const f = filtroJogos;
  let q = sb.from('games').select('id,slug,title,featured,avg_rating,reviews_count,categories(name)', { count: 'exact' })
    .order('featured', { ascending: false }).order('igdb_rating_count', { ascending: false, nullsFirst: false }).range(f.pagina * 50, f.pagina * 50 + 49);
  if (f.q) q = q.ilike('title', `%${f.q.replace(/[%,()]/g, '')}%`);
  if (f.destaque) q = q.eq('featured', true);
  const [{ data: gs, count }, { data: cats }] = await Promise.all([q, sb.from('categories').select('*').order('name')]);
  const campos = [
    ['title', 'Título'], ['slug', 'Slug (endereço, ex.: elden-ring)'], ['description', 'Descrição', 'textarea'],
    ['category_id', 'Categoria', 'select', cats.map((c) => [c.id, c.name])], ['release_year', 'Ano de lançamento', 'number'],
    ['cover_url', 'URL da capa (ou envie um arquivo abaixo)'], ['capa', 'Enviar capa', 'file'], ['featured', 'Destaque na página inicial', 'checkbox'],
    ['store_ps', 'Link PlayStation'], ['store_xbox', 'Link Xbox'], ['store_steam', 'Link Steam'], ['store_nintendo', 'Link Nintendo'],
    ['steam_appid', 'ID na Steam (para promoções e notícias automáticas)', 'number'],
  ];
  painel().innerHTML = `<div class="controles" style="margin-bottom:12px"><button class="btn" data-acao="novo">+ Novo jogo</button>
      <input id="j-q" type="search" placeholder="Buscar jogo..." value="${esc(f.q)}" style="max-width:300px">
      <label style="display:flex;gap:6px;align-items:center;margin:0;font-weight:400"><input type="checkbox" id="j-dest" style="width:auto" ${f.destaque ? 'checked' : ''}> Só destaques</label>
      <span class="muted">${plural((count ?? 0).toLocaleString('pt-BR'), 'jogo')}</span></div>
    ${tabela(['Jogo', 'Categoria', 'Nota', 'Destaque', ''], gs.map((g) => `<tr>
      <td><a href="jogo.html?slug=${encodeURIComponent(g.slug)}" target="_blank">${esc(g.title)}</a></td><td>${esc(g.categories?.name || '—')}</td>
      <td>${Number(g.avg_rating).toFixed(1)} (${g.reviews_count})</td><td>${g.featured ? '⭐' : ''}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="editar" data-id="${g.id}">Editar</button>
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${g.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const dados = await formulario(id ? 'Editar jogo' : 'Novo jogo', campos, v);
    if (!dados) return;
    const url = await upload(dados.capa, 'capas');
    delete dados.capa;
    if (url) dados.cover_url = url;
    if (!dados.slug && dados.title) dados.slug = dados.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error } = id ? await sb.from('games').update(dados).eq('id', id) : await sb.from('games').insert(dados);
    if (error) throw error;
    toast('Jogo salvo.'); jogos();
  };
  acoes({
    novo: () => salvar({}),
    editar: async (id) => { const { data: g } = await sb.from('games').select('*').eq('id', id).single(); salvar(g, id); },
    excluir: async (id) => {
      if (!confirm('Excluir o jogo e todas as avaliações dele?')) return;
      const { error } = await sb.from('games').delete().eq('id', id); if (error) throw error; jogos();
    },
  });
  let tj;
  $('#j-q').oninput = (e) => { clearTimeout(tj); tj = setTimeout(() => { f.q = e.target.value.trim(); f.pagina = 0; jogos(); }, 350); };
  $('#j-dest').onchange = (e) => { f.destaque = e.target.checked; f.pagina = 0; jogos(); };
  painel().insertAdjacentHTML('beforeend', `<div class="controles" style="justify-content:center;margin-top:12px">
    ${f.pagina > 0 ? '<button class="btn sec pequeno" id="j-ant">← Anteriores</button>' : ''}
    ${(f.pagina + 1) * 50 < (count ?? 0) ? '<button class="btn sec pequeno" id="j-prox">Próximos →</button>' : ''}</div>`);
  $('#j-ant')?.addEventListener('click', () => { f.pagina--; jogos(); });
  $('#j-prox')?.addEventListener('click', () => { f.pagina++; jogos(); });
}

// ---------------- Notícias ----------------
async function noticias() {
  const [{ data: ns }, { data: gs }] = await Promise.all([
    sb.from('news').select('*, games(title)').order('created_at', { ascending: false }).limit(200), Promise.resolve({ data: [] })]);
  const campos = [['title', 'Título'], ['summary', 'Resumo (aparece na página inicial)'], ['body', 'Texto', 'textarea'],
    ['game_id', 'Jogo relacionado (opcional)', 'jogo'], ['cover_url', 'URL da imagem'], ['imagem', 'Enviar imagem', 'file'],
    ['published', 'Publicada', 'checkbox']];
  const { data: igUltimo } = await sb.from('settings').select('value').eq('key', 'instagram_ultimo').maybeSingle();
  const ultimo = igUltimo?.value;
  const igStatus = (n) => n.instagram_at ? `<a class="tag" href="${urlSegura(n.instagram_url || 'https://www.instagram.com/control.critic/')}" target="_blank" rel="noopener noreferrer">📸 no Instagram</a>`
    : n.instagram_status === 'urgente' ? '<span class="tag amarela">📸 publicando…</span>' : n.instagram_status === 'erro' ? '<span class="tag" style="background:#e5484d;color:#fff">📸 falhou</span>' : '';
  painel().innerHTML = `<div class="cartao" style="margin-bottom:12px"><strong>📸 Instagram</strong>
      <p class="muted" style="font-size:.88rem;margin-top:4px">Todo dia às 12h50 sai um <strong>meme</strong> aprovado (aba Memes) ou uma enquete, e às 18h50 o <strong>resumo do dia</strong> (ou a notícia do dia; sem notícia, a promoção do dia).
        Para algo urgente, use <strong>📸 Postar agora</strong> na notícia: sai em 1 a 2 minutos com a etiqueta "URGENTE".</p>
      ${ultimo ? `<p style="font-size:.88rem;margin-top:6px">Último post: ${esc({ resumo: 'resumo do dia', noticia: 'notícia do dia', promocao: 'promoção do dia', urgente: 'notícia urgente', meme: 'meme', versus: 'enquete' }[ultimo.tipo] || ultimo.tipo)} em ${new Date(ultimo.em).toLocaleString('pt-BR')}
        ${ultimo.url ? ` · <a href="${urlSegura(ultimo.url)}" target="_blank" rel="noopener noreferrer">ver post</a>` : ''}</p>` : '<p class="muted" style="font-size:.85rem;margin-top:6px">Ainda nenhum post (configure o robô: scripts/instagram/LEIA-ME.md).</p>'}</div>
    <div class="controles" style="margin-bottom:12px"><button class="btn" data-acao="novo">+ Escrever notícia</button></div>
    ${tabela(['Título', 'Fonte', 'Data', 'Status', ''], ns.map((n) => `<tr>
      <td>${n.source_url ? `<a href="${urlSegura(n.source_url)}" target="_blank" rel="noopener noreferrer">${corta(n.title)}</a>` : corta(n.title)}</td>
      <td>${esc(n.source || 'Equipe')}</td><td>${data(n.created_at)}</td>
      <td>${n.published ? '<span class="tag amarela">publicada</span>' : '<span class="tag">pendente</span>'} ${igStatus(n)}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${n.id}">${n.published ? 'Despublicar' : 'Publicar'}</button>
      ${n.published && !n.instagram_at && n.instagram_status !== 'urgente' ? `<button class="btn sec pequeno" data-acao="instagram" data-id="${n.id}" title="Publica agora no Instagram como notícia urgente">📸 Postar agora</button>` : ''}
      <button class="btn sec pequeno" data-acao="editar" data-id="${n.id}">Editar</button>
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${n.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const dados = await formulario(id ? 'Editar notícia' : 'Nova notícia', campos, v);
    if (!dados) return;
    const url = await upload(dados.imagem, 'noticias'); delete dados.imagem; if (url) dados.cover_url = url;
    if (!dados.title || !dados.body) return toast('Título e texto são obrigatórios.', true);
    const { error } = id ? await sb.from('news').update(dados).eq('id', id) : await sb.from('news').insert(dados);
    if (error) throw error; toast('Notícia salva.'); noticias();
  };
  acoes({
    novo: () => salvar({ published: true }),
    editar: (id) => { const n = ns.find((x) => x.id == id); salvar({ ...n, __jogo_titulo: n.games?.title }, id); },
    alternar: async (id) => { const n = ns.find((x) => x.id == id); const { error } = await sb.from('news').update({ published: !n.published }).eq('id', id); if (error) throw error; noticias(); },
    instagram: async (id) => {
      const n = ns.find((x) => x.id == id);
      if (!confirm(`Publicar agora no Instagram como URGENTE?\n\n"${n.title}"\n\nO post sai em 1 a 2 minutos e não pode ser desfeito por aqui (só apagando no próprio Instagram).`)) return;
      const { data: { session } } = await sb.auth.getSession();
      const r = await fetch('/.netlify/functions/instagram-agora', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}`, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ noticia: Number(id) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.erro || 'Não foi possível publicar.');
      toast(d.aviso || '📸 Enviado! O post aparece no Instagram em 1 a 2 minutos.'); noticias();
    },
    excluir: async (id) => { if (!confirm('Excluir notícia?')) return; const { error } = await sb.from('news').delete().eq('id', id); if (error) throw error; noticias(); },
  });
}

// ---------------- Memes para o Instagram ----------------
// O autor marca "é meme" ao postar; aqui a equipe aprova. Às 12h50 o robô posta o aprovado mais antigo, com crédito.
async function memes() {
  const { data: ms, error } = await sb.from('posts').select('id,body,image_url,created_at,ig_aprovado,ig_recusado,instagram_at,instagram_url,profiles!posts_user_id_fkey(username)')
    .eq('ig_ok', true).eq('status', 'published').order('created_at', { ascending: false }).limit(100);
  if (error) throw /ig_ok/.test(error.message) ? new Error('Rode o supabase/schema.sql de novo para ativar os memes.') : error;
  const fila = ms.filter((m) => m.ig_aprovado && !m.instagram_at).length;
  const situacao = (m) => m.instagram_at ? `<a class="tag amarela" href="${urlSegura(m.instagram_url || 'https://www.instagram.com/control.critic/')}" target="_blank" rel="noopener noreferrer">📸 publicado</a>`
    : m.ig_aprovado ? '<span class="tag amarela">na fila</span>' : m.ig_recusado ? '<span class="tag">recusado</span>' : '<span class="tag">aguardando</span>';
  painel().innerHTML = `<div class="cartao" style="margin-bottom:12px"><strong>😂 Memes da comunidade</strong>
      <p class="muted" style="font-size:.88rem;margin-top:4px">Todo dia às 12h50 o robô publica o meme aprovado mais antigo, com crédito ao autor. Na fila: <strong>${fila}</strong>.
      Sem meme aprovado, ele posta uma enquete "Qual você prefere?" com dois jogos.<br>Aprove só o que é original ou de uso livre, sem ofensas e sem dados pessoais.</p></div>
    ${ms.length ? tabela(['Meme', 'Autor', 'Legenda', 'Data', 'Situação', ''], ms.map((m) => `<tr>
      <td><a href="${urlSegura(m.image_url)}" target="_blank" rel="noopener noreferrer"><img src="${urlSegura(m.image_url)}" alt="" style="width:90px;height:90px;object-fit:cover;border-radius:8px"></a></td>
      <td>@${esc(m.profiles?.username)}</td><td>${corta(m.body, 100)}</td><td>${data(m.created_at)}</td><td>${situacao(m)}</td>
      <td class="controles">${m.instagram_at ? '' : `${m.ig_aprovado ? '' : `<button class="btn pequeno" data-acao="aprovar" data-id="${m.id}">✔ Aprovar</button>`}
        ${m.ig_recusado ? '' : `<button class="btn sec pequeno" data-acao="recusar" data-id="${m.id}">✕ Recusar</button>`}`}</td></tr>`))
    : '<p class="muted">Nenhum meme enviado ainda. Ao postar uma imagem, o usuário pode marcar "😂 É meme".</p>'}`;
  const mudar = async (id, dados) => { const { error: e } = await sb.from('posts').update(dados).eq('id', id); if (e) throw e; memes(); };
  acoes({
    aprovar: (id) => mudar(id, { ig_aprovado: true, ig_recusado: false }),
    recusar: (id) => mudar(id, { ig_aprovado: false, ig_recusado: true }),
  });
}

// ---------------- Promoções ----------------
async function promos() {
  const [{ data: ds }, { data: gs }] = await Promise.all([
    sb.from('deals').select('*, games(title)').eq('auto', false).order('discount_pct', { ascending: false }).limit(300), Promise.resolve({ data: [] })]);
  const campos = [['game_id', 'Jogo', 'jogo'],
    ['store', 'Loja', 'select', [['playstation', 'PlayStation'], ['xbox', 'Xbox'], ['nintendo', 'Nintendo'], ['steam', 'Steam'], ['outra', 'Outra']]],
    ['preco', 'Preço com desconto (R$)', 'number'], ['original', 'Preço original (R$)', 'number'], ['discount_pct', 'Desconto (%)', 'number'],
    ['url', 'Link da oferta'], ['ends_at', 'Termina em', 'date']];
  painel().innerHTML = `<p class="muted">Aqui ficam as ofertas cadastradas manualmente (PlayStation, Xbox, Nintendo...). As da Steam são automáticas e aparecem na página Promoções.</p>
    <div class="controles" style="margin:12px 0"><button class="btn" data-acao="novo">+ Nova promoção</button></div>
    ${tabela(['Jogo', 'Loja', 'Preço', 'Desconto', 'Atualizada', ''], ds.map((d) => `<tr>
      <td>${esc(d.games?.title)}</td><td>${esc(d.store)} ${d.auto ? '<span class="tag">auto</span>' : ''}</td>
      <td>${reais(d.price_cents)} <s class="muted">${d.original_cents ? reais(d.original_cents) : ''}</s></td><td>${d.discount_pct}%</td><td>${data(d.updated_at)}</td>
      <td class="controles">${d.auto ? '' : `<button class="btn sec pequeno" data-acao="editar" data-id="${d.id}">Editar</button>`}
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${d.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const d = await formulario(id ? 'Editar promoção' : 'Nova promoção', campos,
      { ...v, __jogo_titulo: v.games?.title, preco: v.price_cents != null ? v.price_cents / 100 : '', original: v.original_cents != null ? v.original_cents / 100 : '', ends_at: v.ends_at?.slice(0, 10) });
    if (!d) return;
    if (!d.game_id || !d.store) return toast('Escolha o jogo e a loja.', true);
    const dados = { game_id: Number(d.game_id), store: d.store, url: d.url, ends_at: d.ends_at,
      price_cents: d.preco == null ? null : Math.round(d.preco * 100), original_cents: d.original == null ? null : Math.round(d.original * 100),
      discount_pct: d.discount_pct ?? (d.preco && d.original ? Math.round((1 - d.preco / d.original) * 100) : 0), auto: false, updated_at: new Date().toISOString() };
    const { error } = id ? await sb.from('deals').update(dados).eq('id', id) : await sb.from('deals').upsert(dados, { onConflict: 'game_id,store' });
    if (error) throw error; toast('Promoção salva.'); promos();
  };
  acoes({
    novo: () => salvar({}),
    editar: (id) => salvar(ds.find((d) => d.id == id), id),
    excluir: async (id) => { const { error } = await sb.from('deals').delete().eq('id', id); if (error) throw error; promos(); },
  });
}

// ---------------- Métricas de produto (agregadas; ninguém é identificado) ----------------
async function metricas() {
  const dias = Number(painel().dataset.dias || 28);
  const { data: m, error } = await sb.rpc('metricas_produto', { dias });
  if (error) throw error;
  const pct = (n, total) => (total ? `${Math.round((100 * n) / total)}%` : '—');
  const novos = m.novos_cadastros || 0, at = m.ativacao || {}, ev = m.eventos || {}, ret = m.retencao || {}, uso = m.uso_7_dias || {};
  const cartao = (titulo, valor, sub = '') => `<div class="cartao" style="text-align:center"><div class="nota-grande" style="font-size:2rem">${valor}</div><strong>${titulo}</strong>${sub ? `<p class="muted" style="font-size:.82rem;margin:4px 0 0">${sub}</p>` : ''}</div>`;
  painel().innerHTML = `
    <div class="chips" style="margin-bottom:12px">${[7, 28, 90].map((d) => `<button class="chip ${d === dias ? 'ativo' : ''}" data-d="${d}">${d} dias</button>`).join('')}</div>
    <div class="grade">
      ${cartao('Usuários semanais ativos de verdade', m.usuarios_semanais_significativos ?? 0, 'Métrica principal: pessoas que avaliaram, postaram, comentaram, criaram/entraram em grupo, mandaram mensagem, postaram story ou mexeram na biblioteca nos últimos 7 dias')}
      ${cartao('Novos cadastros', novos, `nos últimos ${dias} dias`)}
      ${cartao('Visitas (navegadores/dia)', ev.visita || 0, 'contagem diária sem identificar ninguém')}
    </div>
    <h2>Conversão</h2>
    <p>Cliques em "Criar conta": <strong>${ev.clique_cadastro || 0}</strong> · Abriram o cadastro: <strong>${ev.cadastro_inicio || 0}</strong> · Enviaram o cadastro: <strong>${ev.cadastro_enviado || 0}</strong>
      ${ev.cadastro_inicio ? `(${pct(ev.cadastro_enviado || 0, ev.cadastro_inicio)} de quem abriu)` : ''}</p>
    <h2>Ativação de quem chegou no período</h2>
    ${tabela(['Etapa', 'Pessoas', '% dos novos'], [['Concluiu as boas-vindas', at.onboarding], ['Adicionou o primeiro jogo', at.primeiro_jogo], ['Fez a primeira avaliação', at.primeira_avaliacao],
      ['Entrou numa comunidade', at.primeira_comunidade], ['Criou ou entrou num grupo', at.primeiro_grupo], ['Entrou numa call', at.primeira_call]].map(([e, n]) => `<tr><td>${e}</td><td>${n || 0}</td><td>${pct(n || 0, novos)}</td></tr>`))}
    <h2>Retenção</h2>
    <p>Voltaram no dia seguinte: <strong>${ret.d1 ?? '—'}${ret.d1 != null ? '%' : ''}</strong> · na 2ª semana: <strong>${ret.d7 ?? '—'}${ret.d7 != null ? '%' : ''}</strong> · depois de 30 dias: <strong>${ret.d30 ?? '—'}${ret.d30 != null ? '%' : ''}</strong>
      <br><span class="muted" style="font-size:.82rem">Base: login diário registrado. "—" = ainda não há gente suficiente com esse tempo de conta.</span></p>
    <h2>Uso por funcionalidade (7 dias)</h2>
    <p>${Object.entries(uso).map(([k, n]) => `<span class="tag">${esc(k)}: ${n}</span>`).join(' ')} ${ev.grupo_criado ? `<span class="tag">grupos criados (evento): ${ev.grupo_criado}</span>` : ''} ${ev.call_entrou ? `<span class="tag">entradas em call: ${ev.call_entrou}</span>` : ''} ${ev.instalou_app ? `<span class="tag">instalações do app: ${ev.instalou_app}</span>` : ''}</p>
    <h2>Erros por página (${dias} dias)</h2>
    <p>${Object.entries(m.erros_por_pagina || {}).map(([p, n]) => `<span class="tag">${esc(p)}: ${n}</span>`).join(' ') || 'Nenhum erro registrado. 🎉'}</p>
    <p class="muted" style="font-size:.82rem;margin-top:14px">Privacidade: só contadores agregados. Nenhum id, nome, IP ou página com parâmetros é registrado para métricas; navegadores com "Não rastrear" não entram na contagem.</p>`;
  painel().querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { painel().dataset.dias = b.dataset.d; metricas(); });
}

// ---------------- Status: robôs, erros do site e serviços ----------------
async function status() {
  const [{ data: robos }, { data: erros }, { data: cfg }] = await Promise.all([
    sb.from('robot_runs').select('*').order('robo'),
    sb.from('client_errors').select('*').gte('dia', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).order('vezes', { ascending: false }).limit(100),
    sb.from('settings').select('key,value').in('key', ['push', 'last_sync', 'last_igdb']),
  ]);
  const conf = Object.fromEntries((cfg || []).map((x) => [x.key, x.value]));
  const ROBOS = { sync: 'Notícias e promoções (6/6 h)', igdb: 'Catálogo IGDB (diário)', instagram: 'Instagram (3x/dia)', semanal: 'Robô semanal', backup: 'Backup (domingo)' };
  const dur = (r) => (r.inicio && r.fim ? `${Math.max(0, Math.round((new Date(r.fim) - new Date(r.inicio)) / 1000))} s` : '—');
  const porCat = {};
  for (const e of erros || []) porCat[e.categoria] = (porCat[e.categoria] || 0) + e.vezes;
  painel().innerHTML = `
    <h2>🤖 Robôs</h2>
    ${tabela(['Robô', 'Última execução', 'Duração', 'Resultado'], Object.entries(ROBOS).map(([k, nome]) => { const r = (robos || []).find((x) => x.robo === k);
      return `<tr><td>${nome}</td><td>${r ? data(r.fim || r.inicio) : '<span class="muted">sem registro ainda</span>'}</td><td>${r ? dur(r) : '—'}</td>
        <td>${!r ? '—' : r.ok === null ? '⏳ rodando' : r.ok ? '✅ ok' : '❌ falhou'} <span class="muted" style="font-size:.8rem">${esc(r?.resumo || '')}</span></td></tr>`; }))}
    <h2>🔔 Serviços</h2>
    <ul>
      <li>Notificações no celular: ${conf.push?.url ? '✅ configuradas' : '⚠️ não configuradas (aba Site)'}</li>
      <li>Última sincronização de notícias: ${conf.last_sync?.at ? data(conf.last_sync.at) : '—'}</li>
      <li>TURN e robô do Discord: teste na aba <strong>Site</strong>.</li>
    </ul>
    <h2>🐞 Erros do site (7 dias)</h2>
    <p class="muted">Agrupados por mensagem; sem dados pessoais. ${Object.entries(porCat).map(([c, n]) => `<span class="tag">${esc(c)}: ${n}</span>`).join(' ') || 'Nenhum erro registrado. 🎉'}</p>
    ${(erros || []).length ? tabela(['Dia', 'Vezes', 'Tipo', 'Página', 'Mensagem', 'Versão'], erros.map((e) => `<tr><td>${esc(e.dia)}</td><td>${e.vezes}</td><td>${esc(e.categoria)}</td><td>${esc(e.pagina)}</td><td>${corta(e.mensagem, 160)}</td><td><code>${esc(String(e.versao || '').slice(0, 7))}</code></td></tr>`)) : ''}`;
}

// ---------------- Apelações de suspensão ----------------
async function apelacoes() {
  const { data: ap, error } = await sb.from('appeals').select('*, profiles(username,banned,banned_until,ban_reason)').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  painel().innerHTML = `<p class="muted" style="margin-bottom:10px">Pedidos de revisão de quem foi suspenso. Cada pessoa pode pedir uma vez por semana.</p>
    ${tabela(['Data', 'Usuário', 'Pedido', 'Situação', ''], (ap || []).map((a) => `<tr><td>${data(a.created_at)}</td>
      <td>${esc(a.profiles?.username || '—')}${a.profiles?.ban_reason ? `<br><span class="muted" style="font-size:.8rem">Motivo: ${corta(a.profiles.ban_reason, 100)}</span>` : ''}</td>
      <td>${corta(a.texto, 300)}</td><td>${esc(a.status)}${a.resposta ? `<br><span class="muted">${corta(a.resposta, 140)}</span>` : ''}</td>
      <td class="controles">${a.status === 'aberta' ? `<button class="btn pequeno" data-acao="aceitar" data-id="${a.id}">Aceitar e reativar</button><button class="btn sec pequeno" data-acao="negar" data-id="${a.id}">Negar</button>` : ''}</td></tr>`))}`;
  const responder = async (id, status) => {
    const resposta = (prompt(status === 'aceita' ? 'Mensagem para a pessoa (opcional)' : 'Explique por que a suspensão continua', '') || '').trim().slice(0, 500) || null;
    const { error: e } = await sb.from('appeals').update({ status, resposta }).eq('id', id); if (e) throw e;
    const a = ap.find((x) => x.id == id);
    if (status === 'aceita') { const { error: e2 } = await sb.rpc('admin_unban', { uid: a.user_id }); if (e2) throw e2; }
    toast('Resposta registrada.'); apelacoes();
  };
  acoes({ aceitar: (id) => responder(id, 'aceita'), negar: (id) => responder(id, 'negada') });
}

// ---------------- Denúncias ----------------
const MOTIVO = { spam: 'Spam', ofensivo: 'Ofensivo', assedio: 'Assédio', 'conteudo_impróprio': 'Impróprio', golpe: 'Golpe', outro: 'Outro' };
async function denuncias() {
  const filtro = painel().dataset.filtro || 'aberta';
  const { data: rs } = await sb.from('reports').select('*, profiles!reports_reporter_id_fkey(username)').eq('status', filtro).order('gravidade', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  // Carrega o conteúdo denunciado para mostrar junto
  const ids = (t) => rs.filter((r) => r.target_type === t).map((r) => r.target_id);
  const [rev, pos, pro, com, cmt, pcm] = await Promise.all([
    ids('review').length ? sb.from('reviews').select('id,body,status,user_id,games(slug,title),profiles!reviews_user_id_fkey(username)').in('id', ids('review')) : { data: [] },
    ids('post').length ? sb.from('posts').select('id,body,status,user_id,community_id,profiles!posts_user_id_fkey(username)').in('id', ids('post')) : { data: [] },
    ids('profile').length ? sb.from('profiles').select('id,username,bio,banned').in('id', ids('profile')) : { data: [] },
    ids('community').length ? sb.from('communities').select('id,name,description').in('id', ids('community')) : { data: [] },
    ids('comment').length ? sb.from('review_comments').select('id,body,status,profiles(username)').in('id', ids('comment')) : { data: [] },
    ids('post_comment').length ? sb.from('post_comments').select('id,body,post_id,profiles(username)').in('id', ids('post_comment')) : { data: [] },
  ]);
  const alvo = { review: new Map((rev.data || []).map((x) => [String(x.id), x])), post: new Map((pos.data || []).map((x) => [String(x.id), x])),
    profile: new Map((pro.data || []).map((x) => [String(x.id), x])), community: new Map((com.data || []).map((x) => [String(x.id), x])),
    comment: new Map((cmt.data || []).map((x) => [String(x.id), x])), post_comment: new Map((pcm.data || []).map((x) => [String(x.id), x])) };
  const descrever = (r) => {
    const x = alvo[r.target_type]?.get(String(r.target_id));
    if (r.target_type === 'message') return `Mensagem direta <span class="muted">(privada: abra só para analisar)</span> <button class="btn sec pequeno" data-acao="verMsg" data-id="${r.id}">Ver mensagem</button>`;
    if (!x) return '<span class="muted">(conteúdo já removido)</span>';
    if (r.target_type === 'review') return `Avaliação de <strong>${esc(x.profiles?.username)}</strong> em <a href="jogo.html?slug=${encodeURIComponent(x.games?.slug)}" target="_blank">${esc(x.games?.title)}</a>: “${corta(x.body, 160)}” ${x.status === 'hidden' ? '<span class="tag">oculta</span>' : ''}`;
    if (r.target_type === 'post_comment') return `Comentário de <strong>${esc(x.profiles?.username)}</strong> num <a href="index.html?post=${x.post_id}" target="_blank">post</a>: “${corta(x.body, 160)}”`;
    if (r.target_type === 'post') return `Post de <strong>${esc(x.profiles?.username)}</strong> (<a href="${x.community_id ? 'comunidade.html?id=' + x.community_id : 'index.html?post=' + x.id}" target="_blank">${x.community_id ? 'comunidade' : 'feed'}</a>): “${corta(x.body, 160)}” ${x.status === 'hidden' ? '<span class="tag">oculto</span>' : ''}`;
    if (r.target_type === 'profile') return `Perfil <a href="perfil.html?u=${encodeURIComponent(x.username)}" target="_blank">${esc(x.username)}</a> ${x.banned ? '<span class="tag">banido</span>' : ''}`;
    if (r.target_type === 'community') return `Comunidade <a href="comunidade.html?id=${x.id}" target="_blank">${esc(x.name)}</a>`;
    if (r.target_type === 'message') return `<button class="btn sec pequeno" data-acao="verMsg" data-id="${r.id}">Ver mensagem denunciada</button>`;
    if (r.target_type === 'comment') return `Comentário de <strong>${esc(x.profiles?.username)}</strong>: “${corta(x.body, 160)}” ${x.status === 'hidden' ? '<span class="tag">oculto</span>' : ''}`;
    return esc(r.target_type);
  };
  const acaoAlvo = (r) => {
    const x = alvo[r.target_type]?.get(String(r.target_id));
    if (!x) return '';
    if (['review', 'post', 'comment'].includes(r.target_type)) return x.status === 'hidden' ? '' : `<button class="btn perigo pequeno" data-acao="ocultar" data-id="${r.id}">Ocultar conteúdo</button>`;
    if (r.target_type === 'profile' && P.role === 'admin' && !x.banned) return `<button class="btn perigo pequeno" data-acao="banir" data-id="${r.id}">Banir usuário</button>`;
    if (r.target_type === 'post_comment') return `<button class="btn perigo pequeno" data-acao="apagarPc" data-id="${r.id}">Apagar comentário</button>`;
    if (r.target_type === 'community') return `<button class="btn perigo pequeno" data-acao="excluirCom" data-id="${r.id}">Excluir comunidade</button>`;
    return '';
  };
  painel().innerHTML = `<div class="chips">${['aberta', 'resolvida', 'descartada'].map((f) => `<button class="chip ${f === filtro ? 'ativo' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}s</button>`).join('')}</div>
    ${tabela(['Data', 'Motivo', 'Conteúdo denunciado', 'Denunciante', ''], rs.map((r) => `<tr>
      <td>${data(r.created_at)}</td><td>${r.gravidade >= 3 ? '<span class="tag" style="background:var(--perigo,#e53935);color:#fff">🔴 Urgente</span> ' : r.gravidade === 2 ? '<span class="tag">🟠</span> ' : ''}<span class="tag amarela">${MOTIVO[r.reason] || esc(r.reason)}</span>${r.decisao ? `<br><span class="muted" style="font-size:.8rem">Decisão: ${corta(r.decisao, 140)}</span>` : ''}${r.details ? `<br><span class="muted">${corta(r.details, 140)}</span>` : ''}</td>
      <td>${descrever(r)}</td><td>${esc(r.profiles?.username || '—')}</td>
      <td class="controles">${r.status === 'aberta' ? `${acaoAlvo(r)}<button class="btn sec pequeno" data-acao="resolver" data-id="${r.id}">✓ Resolvida</button>
        <button class="btn sec pequeno" data-acao="descartar" data-id="${r.id}">Descartar</button>` : ''}</td></tr>`))}`;
  painel().querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { painel().dataset.filtro = b.dataset.f; denuncias(); });
  // Toda decisão fica registrada (quem, quando e o porquê)
  const marcar = async (id, status) => { const decisao = (prompt('Registre a decisão (opcional): o que foi feito e por quê', '') || '').trim().slice(0, 500) || null; const { error } = await sb.from('reports').update({ status, decisao }).eq('id', id); if (error) throw error; };
  const r = (id) => rs.find((x) => x.id == id);
  acoes({
    resolver: async (id) => { await marcar(id, 'resolvida'); denuncias(); },
    verMsg: async (id) => { const { data: m, error } = await sb.rpc('mensagem_denunciada', { rid: Number(id) }); if (error) throw error; const x = m?.[0]; alert(x ? `De: ${x.autor}\nPara: ${x.destinatario}\nEm: ${new Date(x.enviada).toLocaleString('pt-BR')}\n\n${x.corpo}` : 'A mensagem não existe mais.'); },
    descartar: async (id) => { await marcar(id, 'descartada'); denuncias(); },
    ocultar: async (id) => {
      const d = r(id), t = { review: 'reviews', post: 'posts', comment: 'review_comments' }[d.target_type];
      const { error } = await sb.from(t).update({ status: 'hidden' }).eq('id', d.target_id); if (error) throw error;
      await marcar(id, 'resolvida'); toast('Conteúdo ocultado.'); denuncias();
    },
    apagarPc: async (id) => {
      const { error } = await sb.from('post_comments').delete().eq('id', r(id).target_id); if (error) throw error;
      await marcar(id, 'resolvida'); toast('Comentário apagado.'); denuncias();
    },
    banir: async (id) => {
      if (!confirm('Banir este usuário? Ele não poderá mais publicar.')) return;
      const { error } = await sb.from('profiles').update({ banned: true }).eq('id', r(id).target_id); if (error) throw error;
      await marcar(id, 'resolvida'); toast('Usuário banido.'); denuncias();
    },
    excluirCom: async (id) => {
      if (!confirm('Excluir a comunidade e todos os posts?')) return;
      const { error } = await sb.from('communities').delete().eq('id', r(id).target_id); if (error) throw error;
      await marcar(id, 'resolvida'); denuncias();
    },
  });
}

// ---------------- Moderação ----------------
async function reviews() {
  const { data: rs } = await sb.from('reviews').select('*, games(title), profiles!reviews_user_id_fkey(username)').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Usuário', 'Jogo', 'Nota', 'Comentário', 'Status', ''], rs.map((r) => `<tr>
    <td>${esc(r.profiles?.username)}</td><td>${esc(r.games?.title)}</td><td>${r.rating}★</td><td>${corta(r.body, 120)}</td>
    <td>${r.status === 'published' ? 'visível' : '<span class="tag">oculta</span>'}</td>
    <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${r.id}">${r.status === 'published' ? 'Ocultar' : 'Mostrar'}</button>
    <button class="btn perigo pequeno" data-acao="excluir" data-id="${r.id}">Excluir</button></td></tr>`));
  acoes({
    alternar: async (id) => { const r = rs.find((x) => x.id == id); const { error } = await sb.from('reviews').update({ status: r.status === 'published' ? 'hidden' : 'published' }).eq('id', id); if (error) throw error; reviews(); },
    excluir: async (id) => { if (!confirm('Excluir avaliação?')) return; const { error } = await sb.from('reviews').delete().eq('id', id); if (error) throw error; reviews(); },
  });
}

async function posts() {
  const { data: ps } = await sb.from('posts').select('*, communities(name), profiles!posts_user_id_fkey(username)').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Usuário', 'Comunidade', 'Post', 'Mídia', 'Data', ''], ps.map((p) => `<tr>
    <td>${esc(p.profiles?.username)}</td><td>${p.community_id ? `<a href="comunidade.html?id=${p.community_id}" target="_blank">${esc(p.communities?.name)}</a>` : '<span class="muted">feed</span>'}</td>
    <td>${corta(p.body, 140)}</td>
    <td>${p.video_url ? `<a href="${urlSegura(p.video_url)}" target="_blank" rel="noopener noreferrer">🎬 vídeo</a>` : p.image_url ? `<a href="${urlSegura(p.image_url)}" target="_blank" rel="noopener noreferrer"><img src="${urlSegura(p.image_url)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:6px"></a>` : ''}${p.musica ? ' 🎵' : ''}</td><td>${data(p.created_at)}</td>
    <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${p.id}">${p.status === 'published' ? 'Ocultar' : 'Mostrar'}</button>
    <button class="btn perigo pequeno" data-acao="excluir" data-id="${p.id}">Excluir</button></td></tr>`));
  acoes({
    alternar: async (id) => { const p = ps.find((x) => x.id == id); const { error } = await sb.from('posts').update({ status: p.status === 'published' ? 'hidden' : 'published' }).eq('id', id); if (error) throw error; posts(); },
    excluir: async (id) => { if (!confirm('Excluir post?')) return; const { data: antes } = await sb.from('posts').select('image_url,video_url').eq('id', id).maybeSingle(); const { error } = await sb.from('posts').delete().eq('id', id); if (error) throw error; apagarArquivos(antes?.image_url, antes?.video_url); posts(); },
  });
}

async function comunidades() {
  const { data: cs } = await sb.from('communities').select('*, profiles!communities_owner_id_fkey(username)').order('created_at', { ascending: false });
  painel().innerHTML = tabela(['Comunidade', 'Dono', 'Membros', 'Discord', 'Criada', ''], cs.map((c) => `<tr>
    <td><a href="comunidade.html?id=${c.id}" target="_blank">${esc(c.name)}</a></td><td>${esc(c.profiles?.username || '—')}</td>
    <td>${c.members_count}</td><td>${c.discord_invite ? '✔' : ''}</td><td>${data(c.created_at)}</td>
    <td class="controles"><button class="btn sec pequeno" data-acao="oficial" data-id="${c.id}">${c.oficial ? '✔ Oficial · tirar' : 'Marcar oficial'}</button><button class="btn perigo pequeno" data-acao="excluir" data-id="${c.id}">Excluir</button></td></tr>`));
  acoes({ oficial: async (id) => { const c = cs.find((x) => x.id == id); const { error } = await sb.from('communities').update({ oficial: !c.oficial }).eq('id', id); if (error) throw error; comunidades(); },
    excluir: async (id) => { if (!confirm('Excluir comunidade e posts?')) return; const { error } = await sb.from('communities').delete().eq('id', id); if (error) throw error; comunidades(); } });
}

async function mensagens() {
  const { data: ms } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Data', 'Nome', 'E-mail', 'Mensagem', 'Status', ''], ms.map((m) => `<tr>
    <td>${data(m.created_at)}</td><td>${esc(m.name)}${m.age ? ` <span class="muted">(${m.age})</span>` : ''}</td>
    <td><a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: Control Critic')}">${esc(m.email)}</a></td>
    <td class="quebra">${m.subject && m.subject !== 'geral' ? `<span class="tag ${m.subject === 'privacidade' ? 'amarela' : ''}">${esc(m.subject)}</span><br>` : ''}${esc(m.message)}</td>
    <td><select data-id="${m.id}" class="st" style="width:auto">${['novo', 'lido', 'respondido'].map((s) => `<option ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><button class="btn perigo pequeno" data-acao="excluir" data-id="${m.id}">Excluir</button></td></tr>`));
  painel().querySelectorAll('select.st').forEach((s) => s.onchange = async () => {
    const { error } = await sb.from('contact_messages').update({ status: s.value }).eq('id', s.dataset.id);
    error ? falha(error) : toast('Status atualizado.');
  });
  acoes({ excluir: async (id) => { if (!confirm('Excluir mensagem?')) return; const { error } = await sb.from('contact_messages').delete().eq('id', id); if (error) throw error; mensagens(); } });
}

// ---------------- Usuários ----------------
const PERMISSAO = { user: 'Usuário', moderator: 'Moderador', admin: 'Administrador' };
const suspenso = (u) => u.banned && (!u.banned_until || new Date(u.banned_until) > new Date());
let filtroUsuarios = { q: '', papel: '', situacao: '', pagina: 0 };

async function usuarios() {
  const POR = 50, f = filtroUsuarios;
  let q = sb.from('profiles').select('id,username,avatar_url,equipped_frame,role,xp,banned,banned_until,titles,created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(f.pagina * POR, f.pagina * POR + POR - 1);
  if (f.q) q = q.ilike('username', `%${f.q.replace(/[%,()]/g, '')}%`);
  if (f.papel) q = q.eq('role', f.papel);
  if (f.situacao === 'suspensos') q = q.eq('banned', true);
  const [{ data: us, count, error }, { data: titulos }] = await Promise.all([q, sb.from('site_titles').select('*').order('sort')]);
  if (error) throw error;
  const T = new Map((titulos || []).map((t) => [t.id, t]));
  painel().innerHTML = `
    <div class="form-linha" style="margin-bottom:12px">
      <input id="u-q" type="search" placeholder="Buscar por nome de usuário..." value="${esc(f.q)}">
      <select id="u-papel"><option value="">Todas as permissões</option>${Object.entries(PERMISSAO).map(([v, t]) => `<option value="${v}" ${f.papel === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select id="u-sit"><option value="">Todas as situações</option><option value="suspensos" ${f.situacao ? 'selected' : ''}>Suspensos</option></select>
    </div>
    <p class="muted" style="margin-bottom:8px">${plural((count ?? 0).toLocaleString('pt-BR'), 'usuário')}. Clique em um usuário para gerenciar, ou marque vários para agir em lote.</p>
    ${P.role === 'admin' ? `<div class="cartao controles lote-barra" style="margin-bottom:10px;align-items:center;gap:8px">
      <label style="display:flex;gap:6px;align-items:center;font-weight:400;margin:0"><input type="checkbox" id="u-todos" style="width:auto"> Marcar todos da página</label>
      <span class="muted" id="u-sel">0 selecionados</span>
      <button class="btn pequeno" id="u-lote-itens" disabled>🎁 Dar/tirar itens</button><button class="btn sec pequeno" id="u-lote-xp" disabled>⭐ Dar XP</button>
      <button class="btn sec pequeno" id="u-lote-geral" title="Dar itens para todos os usuários do site">🌍 Itens para todos</button></div>` : ''}
    ${tabela(['', 'Usuário', 'Permissão', 'Cargos', 'XP', 'Situação', 'Desde'], us.map((u) => `<tr class="linha-usuario" data-id="${u.id}" style="cursor:pointer">
      <td>${P.role === 'admin' ? `<input type="checkbox" class="u-marca" value="${u.id}" style="width:18px;height:18px" aria-label="Selecionar ${esc(u.username)}">` : ''}</td>
      <td><span class="controles" style="align-items:center;flex-wrap:nowrap">${avatarHtml(u)} <strong>${esc(u.username)}</strong>${u.id === P.id ? ' <span class="muted">(você)</span>' : ''}</span></td>
      <td>${PERMISSAO[u.role]}</td>
      <td>${(u.titles || []).map((t) => T.get(t)).filter(Boolean).map((t) => `<span class="tag" style="background:${corSegura(t.color)};color:#000">${esc(t.icon || '')} ${esc(t.name)}</span>`).join(' ')}</td>
      <td>${u.xp}</td>
      <td>${suspenso(u) ? `<span class="tag" style="background:var(--perigo);color:#fff">suspenso${u.banned_until ? ' até ' + new Date(u.banned_until).toLocaleDateString('pt-BR') : ''}</span>` : 'ativo'}</td>
      <td>${data(u.created_at)}</td></tr>`))}
    <div class="controles" style="justify-content:center;margin-top:12px">
      ${f.pagina > 0 ? '<button class="btn sec pequeno" id="u-ant">← Anteriores</button>' : ''}
      ${(f.pagina + 1) * POR < (count ?? 0) ? '<button class="btn sec pequeno" id="u-prox">Próximos →</button>' : ''}
    </div>`;
  let t;
  $('#u-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); f.pagina = 0; usuarios(); }, 350); };
  $('#u-papel').onchange = (e) => { f.papel = e.target.value; f.pagina = 0; usuarios(); };
  $('#u-sit').onchange = (e) => { f.situacao = e.target.value; f.pagina = 0; usuarios(); };
  $('#u-ant')?.addEventListener('click', () => { f.pagina--; usuarios(); });
  $('#u-prox')?.addEventListener('click', () => { f.pagina++; usuarios(); });
  painel().querySelectorAll('.linha-usuario').forEach((tr) => tr.onclick = (e) => { if (!e.target.closest('.u-marca')) fichaUsuario(tr.dataset.id, T); });
  // Ações em lote
  const marcados = () => [...painel().querySelectorAll('.u-marca:checked')].map((c) => c.value);
  const contar = () => { const n = marcados().length; $('#u-sel') && ($('#u-sel').textContent = `${plural(n, 'selecionado')}`); ['u-lote-itens', 'u-lote-xp'].forEach((k) => { if ($('#' + k)) $('#' + k).disabled = !n; }); };
  painel().querySelectorAll('.u-marca').forEach((c) => c.onchange = contar);
  $('#u-todos')?.addEventListener('change', (e) => { painel().querySelectorAll('.u-marca').forEach((c) => { c.checked = e.target.checked; }); contar(); });
  $('#u-lote-itens')?.addEventListener('click', () => darEmLote({ uids: marcados() }));
  $('#u-lote-geral')?.addEventListener('click', () => darEmLote({ todos: true }));
  $('#u-lote-xp')?.addEventListener('click', async () => {
    const uids = marcados(), q = Number(prompt(`Quanto de XP dar para ${plural(uids.length, 'pessoa')}? (negativo para tirar)`, '100'));
    if (!q) return;
    const motivo = prompt('Motivo (aparece no histórico):', 'Evento da comunidade') || null;
    const { error: e } = await sb.rpc('admin_xp_lote', { uids, quantidade: q, motivo });
    if (e) return falha(e);
    toast(`⭐ ${q} XP para ${plural(uids.length, 'pessoa')}.`); usuarios();
  });
}

// Dar/tirar itens para várias pessoas (ou todo mundo): escolhe os itens numa grade e confirma
async function darEmLote({ uids = [], todos = false, itensIniciais = [] } = {}) {
  const { data: itens } = await sb.from('cosmetics').select('id,name,kind,icon,rarity').order('kind').order('sort');
  const dlg = $('#dlg');
  let alvos = [...uids];
  dlg.innerHTML = `<h2 style="margin-top:0">🎁 Itens em lote</h2>
    ${todos ? '<p class="aviso">Vai valer para <strong>todos os usuários</strong> do site (menos os suspensos).</p>' : `
      <p class="muted">Para: <strong id="l-alvos">${alvos.length}</strong> <span id="l-alvos-txt">${alvos.length === 1 ? 'pessoa' : 'pessoas'}</span>. ${uids.length ? '' : 'Busque e adicione abaixo.'}</p>
      <div class="busca-jogo"><input id="l-busca" type="search" placeholder="Adicionar pessoa pelo nome..." autocomplete="off"><span class="sugestoes hidden" id="l-sug"></span></div>
      <div class="controles" id="l-chips" style="margin:6px 0;gap:4px"></div>`}
    <p class="muted" style="font-size:.82rem">Marque os itens. Escolha se é para <strong>dar</strong> ou <strong>tirar</strong>.</p>
    <div id="l-itens"></div>
    <div class="controles" style="margin-top:12px"><button class="btn" id="l-dar">🎁 Dar marcados</button><button class="btn perigo" id="l-tirar">Tirar marcados</button><button class="btn sec" id="l-fechar">Fechar</button></div>`;
  dlg.showModal();
  const sel = seletorItens($('#l-itens'), itens || [], new Set());
  itensIniciais.forEach((id) => dlg.querySelector(`.item-opcao[data-id="${CSS.escape(id)}"]`)?.click());
  $('#l-fechar').onclick = () => dlg.close();
  const desenharAlvos = async () => {
    if (todos || !$('#l-chips')) return;
    $('#l-alvos').textContent = alvos.length;
    $('#l-alvos-txt') && ($('#l-alvos-txt').textContent = alvos.length === 1 ? 'pessoa' : 'pessoas');
    const { data: ps } = alvos.length ? await sb.from('profiles').select('id,username').in('id', alvos) : { data: [] };
    $('#l-chips').innerHTML = (ps || []).map((p) => `<span class="tag">@${esc(p.username)} <button type="button" data-tirar-alvo="${p.id}" style="background:none;border:0;color:inherit;cursor:pointer">✕</button></span>`).join('');
    $('#l-chips').querySelectorAll('[data-tirar-alvo]').forEach((b) => b.onclick = () => { alvos = alvos.filter((x) => x !== b.dataset.tirarAlvo); desenharAlvos(); });
  };
  desenharAlvos();
  let t;
  $('#l-busca')?.addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = e.target.value.trim().replace(/[%,()]/g, ''), sug = $('#l-sug');
      if (q.length < 2) return sug.classList.add('hidden');
      const { data } = await sb.from('profiles').select('id,username').ilike('username', `%${q}%`).limit(8);
      sug.innerHTML = (data || []).map((p) => `<button type="button" data-id="${p.id}">@${esc(p.username)}</button>`).join('');
      sug.classList.remove('hidden');
      sug.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { if (!alvos.includes(b.dataset.id)) alvos.push(b.dataset.id); sug.classList.add('hidden'); $('#l-busca').value = ''; desenharAlvos(); });
    }, 250);
  });
  const enviar = async (dar) => {
    const ids = sel.marcados();
    if (!ids.length) return toast('Marque pelo menos um item.', true);
    if (!todos && !alvos.length) return toast('Adicione pelo menos uma pessoa.', true);
    if (!confirm(`${dar ? 'Dar' : 'Tirar'} ${plural(ids.length, 'item', 'itens')} ${todos ? 'de TODOS os usuários' : `de ${plural(alvos.length, 'pessoa')}`}?`)) return;
    const { data: n, error: e } = await sb.rpc('admin_cosmetics_lote', { uids: todos ? [] : alvos, dar: dar ? ids : [], tirar: dar ? [] : ids, todos });
    if (e) return falha(e);
    try { sessionStorage.removeItem('cc_itens'); } catch { /* ignora */ }
    dlg.close(); toast(`${dar ? '🎁 Entregue' : 'Removido'} para ${plural(n, 'pessoa')}.`);
  };
  $('#l-dar').onclick = () => enviar(true);
  $('#l-tirar').onclick = () => enviar(false);
}

// Ficha completa de um usuário, com todas as ações da equipe
async function fichaUsuario(uid, T) {
  const [{ data: d, error }, { data: itens }] = await Promise.all([sb.rpc('admin_user_detail', { uid }), sb.from('cosmetics').select('id,name,kind,icon,rarity').order('kind').order('sort')]);
  if (error) return falha(error);
  const u = d.profile, eu = u.id === P.id, admin = P.role === 'admin';
  const dlg = $('#dlg');
  dlg.innerHTML = `
    <div class="controles" style="align-items:center;margin-bottom:10px">${avatarHtml(u, 'grande')}
      <div style="flex:1"><h2 style="margin:0">${esc(u.username)}</h2>
        <span class="muted">${PERMISSAO[u.role]} · ${u.xp} XP · desde ${data(d.created_at || u.created_at)}</span>
        ${d.email ? `<br><span class="muted">📧 ${esc(d.email)}</span>` : ''}
        ${d.last_sign_in_at ? `<br><span class="muted">Último login: ${new Date(d.last_sign_in_at).toLocaleString('pt-BR')}</span>` : ''}</div>
      <a class="btn sec pequeno" href="perfil.html?u=${encodeURIComponent(u.username)}" target="_blank">Ver perfil</a></div>
    <div class="kpis">
      <div class="kpi"><div class="valor">${d.reviews}</div><div class="rotulo">avaliações</div></div>
      <div class="kpi"><div class="valor">${d.posts}</div><div class="rotulo">posts</div></div>
      <div class="kpi"><div class="valor">${d.communities}</div><div class="rotulo">comunidades</div></div>
      <div class="kpi"><div class="valor" style="${d.reports_against ? 'color:var(--perigo)' : ''}">${d.reports_against}</div><div class="rotulo">denúncias contra</div></div>
    </div>
    ${suspenso(u) ? `<div class="aviso erro">Suspenso ${u.banned_until ? 'até ' + new Date(u.banned_until).toLocaleString('pt-BR') : 'permanentemente'}${u.ban_reason ? ' · Motivo: ' + esc(u.ban_reason) : ''}</div>` : ''}

    ${eu ? '<p class="muted">Este é você: permissão e suspensão não podem ser alteradas na própria conta.</p>' : `
    <h3>Suspensão</h3>
    ${suspenso(u) ? '<button class="btn sec pequeno" id="f-desbanir">Reativar conta</button>' : `
      <div class="controles"><select id="f-dias" style="width:auto"><option value="1">1 dia</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="">Permanente</option></select>
      <input id="f-motivo" placeholder="Motivo (a pessoa recebe esse texto)" maxlength="300" style="flex:1;min-width:180px">
      <button class="btn perigo pequeno" id="f-banir" ${u.role !== 'user' && !admin ? 'disabled title="Moderadores não podem suspender a equipe"' : ''}>Suspender</button></div>`}
    ${admin ? `<h3 style="margin-top:14px">Permissão</h3>
      <div class="controles"><select id="f-papel" style="width:auto">${Object.entries(PERMISSAO).map(([v, t]) => `<option value="${v}" ${u.role === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <button class="btn pequeno" id="f-salvar-papel">Salvar permissão</button></div>
      <p class="muted" style="font-size:.82rem">Moderador: modera conteúdo, denúncias e suspende usuários comuns. Administrador: acesso total.</p>` : ''}`}

    ${admin ? `<h3 style="margin-top:14px">Cargos (aparecem no perfil)</h3>
      <div class="chips" id="f-titulos">${[...T.values()].map((t) => `<button type="button" class="chip ${(u.titles || []).includes(t.id) ? 'ativo' : ''}" data-t="${esc(t.id)}">${esc(t.icon || '')} ${esc(t.name)}</button>`).join('') || '<span class="muted">Crie cargos na aba Cargos.</span>'}</div>
      <button class="btn pequeno" id="f-salvar-titulos">Salvar cargos</button>

      <h3 style="margin-top:14px">XP</h3>
      <div class="controles"><input id="f-xp" type="number" placeholder="+100 ou -50" style="width:130px"><input id="f-xp-motivo" placeholder="Motivo (ex.: campeão do torneio)" maxlength="120" style="flex:1;min-width:180px">
      <button class="btn pequeno" id="f-dar-xp">Aplicar</button></div>

      <h3 style="margin-top:14px">Itens (molduras, banners e selos)</h3>
      <p class="muted" style="font-size:.82rem">Clique nos itens para marcar ou desmarcar (✓ = a pessoa tem) e depois em <strong>Salvar itens</strong>.</p>
      <div id="f-itens"></div>
      <button class="btn pequeno" id="f-salvar-itens" style="margin-top:8px">Salvar itens</button>` : ''}

    <h3 style="margin-top:14px">Histórico da equipe</h3>
    <div class="lista" style="max-height:180px;overflow:auto">${d.history.map((h) => `<div class="muted" style="font-size:.85rem">${new Date(h.created_at).toLocaleString('pt-BR')} · <strong>${esc(h.action)}</strong>${h.por ? ' por ' + esc(h.por) : ''}${h.details?.motivo ? ' · ' + esc(h.details.motivo) : ''}</div>`).join('') || '<span class="muted">Nenhuma ação registrada.</span>'}</div>
    <div class="controles" style="margin-top:16px"><button class="btn sec" id="f-fechar">Fechar</button></div>`;
  dlg.showModal();
  const rpc = async (fn, args, msg) => {
    const { error: e } = await sb.rpc(fn, args);
    if (e) return falha(e);
    toast(msg); fichaUsuario(uid, T); usuarios();
  };
  $('#f-fechar').onclick = () => dlg.close();
  $('#f-desbanir')?.addEventListener('click', () => rpc('admin_unban', { uid }, 'Conta reativada.'));
  $('#f-banir')?.addEventListener('click', () => {
    const dias = $('#f-dias').value ? Number($('#f-dias').value) : null, motivo = $('#f-motivo').value.trim();
    if (!motivo) return toast('Informe o motivo da suspensão.', true);
    if (confirm(`Suspender ${u.username} ${dias ? `por ${plural(dias, 'dia')}` : 'permanentemente'}?`)) rpc('admin_ban', { uid, dias, motivo }, 'Usuário suspenso.');
  });
  $('#f-salvar-papel')?.addEventListener('click', () => {
    const novo = $('#f-papel').value;
    if (novo !== u.role && confirm(`Mudar a permissão de ${u.username} para ${PERMISSAO[novo]}?`)) rpc('admin_set_role', { uid, novo }, 'Permissão atualizada.');
  });
  dlg.querySelectorAll('#f-titulos .chip').forEach((b) => b.onclick = () => b.classList.toggle('ativo'));
  $('#f-salvar-titulos')?.addEventListener('click', () => rpc('admin_set_titles', { uid, ids: [...dlg.querySelectorAll('#f-titulos .chip.ativo')].map((b) => b.dataset.t) }, 'Cargos atualizados.'));
  $('#f-dar-xp')?.addEventListener('click', () => {
    const quantidade = Number($('#f-xp').value);
    if (!quantidade) return toast('Informe a quantidade de XP.', true);
    rpc('admin_adjust_xp', { uid, quantidade, motivo: $('#f-xp-motivo').value.trim() || null }, 'XP ajustado.');
  });
  if ($('#f-itens')) {
    const sel = seletorItens($('#f-itens'), itens || [], new Set(d.cosmetics));
    $('#f-salvar-itens').onclick = () => {
      const { dar, tirar } = sel.diferenca();
      if (!dar.length && !tirar.length) return toast('Nada mudou.');
      rpc('admin_cosmetics_lote', { uids: [uid], dar, tirar }, `Itens salvos (+${dar.length} / −${tirar.length}).`);
    };
  }
}

// ---------------- Cargos personalizados (somente admin) ----------------
async function cargos() {
  const { data: ts } = await sb.from('site_titles').select('*').order('sort');
  const { data: us } = await sb.from('profiles').select('titles').neq('titles', '{}');
  const uso = (id) => (us || []).filter((u) => (u.titles || []).includes(id)).length;
  painel().innerHTML = `<p class="muted">Cargos são títulos visuais exibidos no perfil (ex.: Streamer, Parceiro). Eles <strong>não dão permissões</strong>:
    para isso use Moderador/Administrador na ficha do usuário.</p>
    <div class="controles" style="margin:12px 0"><button class="btn" data-acao="novo">+ Novo cargo</button></div>
    ${tabela(['Cargo', 'Identificador', 'Pessoas', ''], (ts || []).map((t) => `<tr>
      <td><span class="tag" style="background:${corSegura(t.color)};color:#000">${esc(t.icon || '')} ${esc(t.name)}</span></td><td><code>${esc(t.id)}</code></td><td>${uso(t.id)}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="editar" data-id="${esc(t.id)}">Editar</button>
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${esc(t.id)}">Excluir</button></td></tr>`))}`;
  const campos = [['name', 'Nome'], ['icon', 'Emoji (opcional)'], ['color', 'Cor', 'color'], ['sort', 'Ordem', 'number']];
  acoes({
    novo: async () => {
      const v = await formulario('Novo cargo', [['id', 'Identificador (letras minúsculas, ex.: streamer)'], ...campos], { color: '#ffd33c', sort: 50 });
      if (!v) return;
      const { error } = await sb.from('site_titles').insert({ ...v, id: (v.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '_') }); if (error) throw error; cargos();
    },
    editar: async (id) => {
      const v = await formulario('Editar cargo', campos, ts.find((t) => t.id === id)); if (!v) return;
      const { error } = await sb.from('site_titles').update(v).eq('id', id); if (error) throw error; cargos();
    },
    excluir: async (id) => { if (!confirm('Excluir este cargo? Ele some do perfil de quem tem.')) return; const { error } = await sb.from('site_titles').delete().eq('id', id); if (error) throw error; cargos(); },
  });
}

// ---------------- Itens: molduras, banners e selos (somente admin) ----------------
const TIPO_ITEM = { frame: 'Moldura', banner: 'Banner', badge: 'Selo' };
const RARIDADES = [['comum', 'Comum'], ['rara', 'Rara'], ['epica', 'Épica'], ['lendaria', 'Lendária'], ['especial', 'Especial']];

function aplicarEstilosPrevia(lista) {
  let el = document.getElementById('estilos-previa');
  if (!el) { el = document.createElement('style'); el.id = 'estilos-previa'; document.head.append(el); }
  el.textContent = lista.map(cssDoItem).join('\n');
}
// Grade de itens com filtro e busca; clique marca/desmarca. diferenca() diz o que dar e o que tirar.
function seletorItens(box, itens, tem = new Set()) {
  const marcado = new Set(tem); let filtro = '', busca = '';
  const TIPO = { frame: '🖼️ Molduras', banner: '🎨 Banners', badge: '🏅 Selos' };
  box.innerHTML = `<div class="controles" style="gap:6px;margin-bottom:8px">
      <button type="button" class="chip ativo" data-f="">Todos</button>${Object.entries(TIPO).map(([k, t]) => `<button type="button" class="chip" data-f="${k}">${t}</button>`).join('')}
      <input type="search" placeholder="Buscar item..." style="flex:1;min-width:140px" data-busca>
      <button type="button" class="btn sec pequeno" data-todos>Marcar visíveis</button><button type="button" class="btn sec pequeno" data-nenhum>Desmarcar visíveis</button></div>
    <div class="grade-itens"></div><p class="muted" data-resumo style="font-size:.82rem;margin-top:6px"></p>`;
  const grade = box.querySelector('.grade-itens');
  const visiveis = () => itens.filter((i) => (!filtro || i.kind === filtro) && (!busca || i.name.toLowerCase().includes(busca)));
  const desenhar = () => {
    grade.innerHTML = visiveis().map((i) => `<button type="button" class="item-opcao ${marcado.has(i.id) ? 'marcado' : ''}" data-id="${esc(i.id)}" title="${esc(i.name)}">
      <span class="item-previa">${previaItem(i)}</span><span class="item-nome">${esc(i.name)}</span><span class="item-check">✓</span></button>`).join('') || '<p class="muted">Nenhum item.</p>';
    grade.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { marcado.has(b.dataset.id) ? marcado.delete(b.dataset.id) : marcado.add(b.dataset.id); b.classList.toggle('marcado'); resumo(); });
    resumo();
  };
  const resumo = () => { const { dar, tirar } = diferenca(); box.querySelector('[data-resumo]').textContent = dar.length || tirar.length ? `Alterações: +${dar.length} para dar, −${tirar.length} para tirar.` : ''; };
  const diferenca = () => ({ dar: [...marcado].filter((x) => !tem.has(x)), tirar: [...tem].filter((x) => !marcado.has(x)) });
  box.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filtro = b.dataset.f; box.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('ativo', x === b)); desenhar(); });
  box.querySelector('[data-busca]').oninput = (e) => { busca = e.target.value.trim().toLowerCase(); desenhar(); };
  box.querySelector('[data-todos]').onclick = () => { visiveis().forEach((i) => marcado.add(i.id)); desenhar(); };
  box.querySelector('[data-nenhum]').onclick = () => { visiveis().forEach((i) => marcado.delete(i.id)); desenhar(); };
  desenhar();
  return { diferenca, marcados: () => [...marcado] };
}

const previaItem = (c) => c.kind === 'frame' ? avatarHtml({ ...P, equipped_frame: c.id }, 'grande')
  : c.kind === 'banner' ? `<div class="amostra-banner bn-${esc(c.id)}" style="width:180px"></div>` : `<span style="font-size:2rem">${esc(c.icon || '🏅')}</span>`;
// Metas automáticas (Steam/biblioteca): o banco confere sozinho (check_regras)
const TIPOS_META = {
  horas_serie: { nome: 'Horas num jogo ou série', padrao: true, unidade: 'Horas', exemplo: '"devil may cry" + 100 horas (soma DMC 1 a 5)' },
  conquistas_serie: { nome: '% das conquistas Steam num jogo/série', padrao: true, unidade: '% das conquistas', exemplo: '"elden ring" + 100 (platinou). Nome vazio = qualquer jogo' },
  horas_categoria: { nome: 'Horas numa categoria', categoria: true, unidade: 'Horas', exemplo: 'Terror + 100 horas' },
  jogos_categoria: { nome: 'Jogos de uma categoria na biblioteca', categoria: true, unidade: 'Jogos', exemplo: 'RPG + 20 jogos' },
  zerados_categoria: { nome: 'Jogos zerados de uma categoria', categoria: true, unidade: 'Jogos zerados', exemplo: 'Terror + 10 zerados' },
  horas_total: { nome: 'Horas jogadas no total', unidade: 'Horas', exemplo: '10.000 horas' },
  jogos_total: { nome: 'Jogos na biblioteca (total)', unidade: 'Jogos', exemplo: '200 jogos' },
};
const CATS_META = [['acao', 'Ação'], ['aventura', 'Aventura'], ['arcade', 'Arcade'], ['esportes', 'Esportes'], ['estrategia', 'Estratégia'], ['fps', 'FPS'],
  ['indies', 'Indies'], ['luta', 'Luta'], ['mobile', 'Mobile'], ['musica', 'Música'], ['rpg', 'RPG'], ['simulacao', 'Simulação'], ['terror', 'Terror']];
const descreverMeta = (r) => { const t = TIPOS_META[r?.tipo]; if (!t) return '';
  const alvo = t.padrao ? (r.padrao ? `"${r.padrao}"` : 'qualquer jogo') : t.categoria ? (CATS_META.find(([v]) => v === r.categoria)?.[1] || r.categoria) : '';
  return `🎮 ${t.nome}${alvo ? `: ${alvo}` : ''} ≥ ${r.min ?? r.pct}${r.pct ? '%' : ''}`; };
const comoGanha = (c) => [c.unlock_level ? `nível ${c.unlock_level}` : '', c.unlock_streak ? `${c.unlock_streak} dias seguidos` : '', c.regra ? descreverMeta(c.regra) : ''].filter(Boolean).join(' ou ') || (c.custom ? 'dado pela equipe' : 'regra do site');

async function itens() {
  const [{ data: cs, error }, { data: posse }] = await Promise.all([
    sb.from('cosmetics').select('*').order('kind').order('sort'), sb.from('user_cosmetics').select('cosmetic_id')]);
  if (error) throw error;
  const qtd = (id) => (posse || []).filter((x) => x.cosmetic_id === id).length;
  aplicarEstilosPrevia(cs.filter((c) => c.custom));
  painel().innerHTML = `<p class="muted">Crie molduras, banners e selos. Eles podem ser dados manualmente (ficha do usuário) ou liberados
      automaticamente por nível ou por dias seguidos de login. Itens originais do site podem ter nome e descrição editados, mas não ser excluídos.</p>
    <div class="controles" style="margin:12px 0"><button class="btn sec" data-acao="lote" data-id="x">🎁 Dar vários itens</button><button class="btn sec" data-acao="metas" data-id="x" title="Confere as metas automáticas para todos e entrega a quem já cumpre">🎮 Aplicar metas agora</button><button class="btn" data-acao="novo" data-id="frame">+ Nova moldura</button>
      <button class="btn" data-acao="novo" data-id="banner">+ Novo banner</button><button class="btn" data-acao="novo" data-id="badge">+ Novo selo</button></div>
    ${tabela(['Prévia', 'Item', 'Como ganha', 'Pessoas', ''], cs.map((c) => `<tr>
      <td><div class="previa-celula">${previaItem(c)}</div></td>
      <td><strong>${esc(c.name)}</strong>${c.active === false ? ' <span class="tag">desativado</span>' : ''}<br><span class="muted">${TIPO_ITEM[c.kind]} · <span class="r-${c.rarity}">${esc(c.rarity)}</span>${c.custom ? ' · criado no painel' : ''}</span><br><span class="muted" style="font-size:.82rem">${esc(c.description)}</span></td>
      <td>${esc(comoGanha(c))}</td><td>${qtd(c.id)}</td>
      <td class="controles"><button class="btn ${c.destaque ? '' : 'sec'} pequeno" data-acao="destacar" data-id="${esc(c.id)}" title="${c.destaque ? 'Tirar do destaque' : 'Mostrar em destaque no topo da página de Conquistas'}">${c.destaque ? '⭐' : '☆'}</button>
        <button class="btn pequeno" data-acao="dar" data-id="${esc(c.id)}" title="Dar este item para várias pessoas ou para todos">🎁 Dar</button>
        <button class="btn sec pequeno" data-acao="editar" data-id="${esc(c.id)}">Editar</button>
        ${c.active === false ? `<button class="btn sec pequeno" data-acao="reativar" data-id="${esc(c.id)}">Reativar</button>`
          : `<button class="btn perigo pequeno" data-acao="excluir" data-id="${esc(c.id)}">Excluir</button>`}</td></tr>`))}`;
  acoes({
    destacar: async (id) => { const c = cs.find((x) => x.id === id); const { error: e } = await sb.from('cosmetics').update({ destaque: !c.destaque }).eq('id', id); if (e) throw e; toast(c.destaque ? 'Tirado do destaque.' : '⭐ Em destaque na página de Conquistas.'); itens(); },
    metas: async () => { const { data: n, error: e } = await sb.rpc('admin_aplicar_regras'); if (e) throw e; toast(`🎮 Metas conferidas para ${plural(n, 'pessoa')}.`); itens(); },
    dar: (id) => darEmLote({ itensIniciais: [id] }),
    lote: () => darEmLote({}),
    novo: (tipo) => editorItem({ kind: tipo, custom: true, rarity: 'comum', style: tipo === 'badge' ? null : { cores: ['#ffd33c', '#ff6d00'], animado: tipo === 'frame' } }),
    editar: (id) => editorItem(cs.find((c) => c.id === id)),
    excluir: (id) => excluirItem(cs.find((c) => c.id === id), qtd(id)),
    reativar: async (id) => { const { error: e } = await sb.from('cosmetics').update({ active: true }).eq('id', id); if (e) throw e; toast('Item reativado.'); itens(); },
  });
}

// Personalizado: apaga de vez. Original do site: desativa (some da loja de conquistas e de quem estava usando).
async function excluirItem(c, qtd) {
  if (!confirm(`Excluir "${c.name}"? ${qtd == null ? 'Ele é removido de quem o possui' : qtd ? `Ele é removido de ${plural(qtd, 'pessoa')} que o possuem` : 'Ninguém tem este item ainda'}${c.custom ? '.' : ' (item original: fica desativado e pode ser reativado depois).'}`)) return;
  const { error } = c.custom ? await sb.from('cosmetics').delete().eq('id', c.id) : await sb.from('cosmetics').update({ active: false }).eq('id', c.id);
  if (error) return falha(/active/.test(error.message) ? { message: 'Banco desatualizado: rode de novo o supabase/schema.sql.' } : error);
  try { sessionStorage.removeItem('cc_itens'); } catch { /* ignora */ }
  toast('Item excluído.'); itens();
}

function editorItem(c) {
  const novo = !c.id, st = c.style || {}, dlg = $('#dlg');
  const cores = st.cores?.length ? st.cores : ['#ffd33c', '#ff6d00'];
  dlg.innerHTML = `<form method="dialog" id="form-item">
    <h2 style="margin-top:0">${novo ? 'Nova' : 'Editar'} ${TIPO_ITEM[c.kind].toLowerCase()}</h2>
    <div class="controles" style="align-items:center;gap:16px"><div id="it-previa" style="min-width:160px;min-height:170px;padding:30px;display:flex;justify-content:center;align-items:center;overflow:visible"></div>
      <span class="muted" style="font-size:.85rem">Pré-visualização</span></div>
    <div class="form-linha">
      <div><label for="it-nome">Nome</label><input id="it-nome" required maxlength="40" value="${esc(c.name || '')}"></div>
      <div><label for="it-rar">Raridade</label><select id="it-rar">${RARIDADES.map(([v, t]) => `<option value="${v}" ${c.rarity === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    <label for="it-desc">Descrição (como desbloquear, aparece para quem ainda não tem)</label>
    <input id="it-desc" required maxlength="120" value="${esc(c.description || '')}" placeholder="Ex.: Participe do torneio de outubro">
    ${c.kind === 'badge' ? `<label for="it-icone">Emoji do selo</label><input id="it-icone" maxlength="4" value="${esc(c.icon || '🏅')}" style="max-width:100px">`
    : c.custom ? `
      <label>Cores (de 1 a 6)</label>
      <div class="controles" id="it-cores">${cores.map((x) => `<input type="color" value="${esc(x)}" style="width:54px;height:40px;padding:2px">`).join('')}
        <button type="button" class="btn sec pequeno" id="it-mais">+ cor</button><button type="button" class="btn sec pequeno" id="it-menos">− cor</button></div>
      ${c.kind === 'frame' ? `<div class="form-linha">
        <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="it-anim" style="width:auto" ${st.animado ? 'checked' : ''}> Girar (animado)</label>
        <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="it-brilho" style="width:auto" ${st.brilho ? 'checked' : ''}> Brilho</label>
        <div><label for="it-vel">Velocidade (segundos por volta)</label><input id="it-vel" type="number" min="1" max="20" value="${st.velocidade || 4}"></div>
        <div><label for="it-emoji">Emoji no canto (opcional)</label><input id="it-emoji" maxlength="4" value="${esc(st.emoji || '')}" placeholder="🔥"></div></div>` : ''}
      <label for="it-img">Ou envie uma imagem (PNG com fundo transparente para moldura; JPG/PNG para banner)</label>
      <input id="it-img" type="file" accept="image/png,image/webp,image/jpeg,image/gif">
      ${c.kind === 'frame' ? `<div class="form-linha" id="it-ajuste">
        <div><label for="it-escala">Tamanho da imagem: <span id="it-escala-v">${st.escala || 180}%</span></label><input id="it-escala" type="range" min="80" max="260" step="2" value="${st.escala || 180}"></div>
        <div><label for="it-x">Mover para os lados</label><input id="it-x" type="range" min="-30" max="30" value="${st.x || 0}"></div>
        <div><label for="it-y">Mover para cima/baixo</label><input id="it-y" type="range" min="-30" max="30" value="${st.y || 0}"></div></div>
        <p class="muted" style="font-size:.8rem">Os ajustes valem para molduras com imagem. 100% = do tamanho da foto.</p>` : ''}
      ${st.imagem ? '<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="it-sem-img" style="width:auto"> Remover imagem e usar as cores</label>' : ''}`
    : '<p class="muted">A aparência dos itens originais vem do código do site.</p>'}
    <h3 style="margin-top:14px">Desbloqueio automático (opcional)</h3>
    <div class="form-linha">
      <div><label for="it-nivel">Ao chegar no nível</label><input id="it-nivel" type="number" min="1" max="500" value="${c.unlock_level ?? ''}" placeholder="—"></div>
      <div><label for="it-seq">Com dias seguidos de login</label><input id="it-seq" type="number" min="1" max="3650" value="${c.unlock_streak ?? ''}" placeholder="—"></div>
    </div>
    <h3 style="margin-top:14px">🎮 Meta automática (Steam e biblioteca)</h3>
    <div class="form-linha">
      <div><label for="it-rtipo">Tipo de meta</label><select id="it-rtipo"><option value="">Nenhuma</option>${Object.entries(TIPOS_META).map(([k, t]) => `<option value="${k}" ${c.regra?.tipo === k ? 'selected' : ''}>${t.nome}</option>`).join('')}</select></div>
      <div data-rcampo="padrao"><label for="it-rpadrao">Nome do jogo/série contém</label><input id="it-rpadrao" maxlength="60" value="${esc(c.regra?.padrao || '')}" placeholder="ex.: devil may cry"></div>
      <div data-rcampo="categoria"><label for="it-rcat">Categoria</label><select id="it-rcat">${CATS_META.map(([v, t]) => `<option value="${v}" ${c.regra?.categoria === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label for="it-rmin" id="it-rmin-rot">Quantidade</label><input id="it-rmin" type="number" min="1" max="100000" value="${c.regra?.min ?? c.regra?.pct ?? ''}"></div>
    </div>
    <p class="muted" style="font-size:.82rem" id="it-rdica"></p>
    <p class="muted" style="font-size:.82rem">Deixe em branco para só dar manualmente (ficha do usuário). Quem já cumpre a regra recebe na hora.</p>
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button>
      ${novo ? '' : '<button type="button" class="btn perigo" id="it-excluir" style="margin-left:auto">🗑️ Excluir item</button>'}</div>
  </form>`;
  dlg.showModal();
  $('#it-excluir')?.addEventListener('click', () => { dlg.close(); excluirItem(c, null); });

  let arquivo = null, urlTemp = null;
  const id = c.id || `${c.kind === 'frame' ? 'f' : c.kind === 'banner' ? 'b' : 's'}_c${Date.now().toString(36)}`;
  const coletar = () => {
    const out = { cores: [...dlg.querySelectorAll('#it-cores input[type=color]')].map((i) => i.value) };
    if ($('#it-anim')) { out.animado = $('#it-anim').checked; out.brilho = $('#it-brilho').checked; out.velocidade = Number($('#it-vel').value) || 4; out.emoji = $('#it-emoji').value.trim() || null; }
    out.imagem = $('#it-sem-img')?.checked ? null : st.imagem || null;
    if ($('#it-escala')) { out.escala = Number($('#it-escala').value); out.x = Number($('#it-x').value); out.y = Number($('#it-y').value); $('#it-escala-v').textContent = out.escala + '%'; }
    return out;
  };
  const atualizar = () => {
    const estilo = c.custom && c.kind !== 'badge' ? coletar() : st;
    const previa = { ...c, id: 'previa_item', style: estilo, icon: $('#it-icone')?.value };
    // imagem ainda não enviada: mostra pela URL local
    let css = cssDoItem({ ...previa, style: { ...estilo, imagem: null } });
    if (urlTemp) css += c.kind === 'frame' ? `.m-previa_item{--anel:url("${urlTemp}") center/100% 100% no-repeat;--anim:none}${cssMolduraImagem('previa_item', estilo)}` : `.bn-previa_item{background:url("${urlTemp}") center/cover !important}`;
    else if (estilo.imagem) css = cssDoItem(previa);
    let el = document.getElementById('estilos-editor');
    if (!el) { el = document.createElement('style'); el.id = 'estilos-editor'; document.head.append(el); }
    el.textContent = c.custom ? css : '';
    $('#it-previa').innerHTML = previaItem(c.custom ? previa : { ...c, icon: $('#it-icone')?.value || c.icon });
  };
  dlg.querySelector('form').addEventListener('input', atualizar);
  const metaCampos = () => {
    const t = TIPOS_META[$('#it-rtipo').value];
    dlg.querySelector('[data-rcampo="padrao"]').classList.toggle('hidden', !t?.padrao);
    dlg.querySelector('[data-rcampo="categoria"]').classList.toggle('hidden', !t?.categoria);
    $('#it-rmin-rot').textContent = t?.unidade || 'Quantidade';
    $('#it-rdica').textContent = t ? `Exemplo: ${t.exemplo}. As horas e conquistas vêm da importação da Steam (atualizada toda segunda pelo robô).` : '';
  };
  $('#it-rtipo').onchange = metaCampos; metaCampos();
  $('#it-mais')?.addEventListener('click', () => { const k = dlg.querySelectorAll('#it-cores input').length; if (k < 6) { $('#it-mais').insertAdjacentHTML('beforebegin', '<input type="color" value="#ffffff" style="width:54px;height:40px;padding:2px">'); atualizar(); } });
  $('#it-menos')?.addEventListener('click', () => { const l = dlg.querySelectorAll('#it-cores input'); if (l.length > 1) { l[l.length - 1].remove(); atualizar(); } });
  $('#it-img')?.addEventListener('change', (e) => {
    arquivo = e.target.files[0] || null;
    if (arquivo && arquivo.size > 2 * 1024 * 1024) { arquivo = null; e.target.value = ''; return toast('Imagem de até 2 MB.', true); }
    urlTemp = arquivo ? URL.createObjectURL(arquivo) : null; atualizar();
  });
  atualizar();

  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    try {
      const linha = {
        name: $('#it-nome').value.trim(), description: $('#it-desc').value.trim(), rarity: $('#it-rar').value,
        unlock_level: $('#it-nivel').value ? Number($('#it-nivel').value) : null, unlock_streak: $('#it-seq').value ? Number($('#it-seq').value) : null,
        regra: (() => {
          const tipo = $('#it-rtipo').value, t = TIPOS_META[tipo], n = Number($('#it-rmin').value);
          if (!tipo || !n) return null;
          return { tipo, ...(t.padrao ? { padrao: $('#it-rpadrao').value.trim().toLowerCase() } : {}), ...(t.categoria ? { categoria: $('#it-rcat').value } : {}), ...(t.unidade === '% das conquistas' ? { pct: Math.min(n, 100) } : { min: n }) };
        })(),
      };
      if (c.kind === 'badge') linha.icon = $('#it-icone').value.trim() || '🏅';
      else if (c.custom) {
        linha.style = coletar();
        if (arquivo) linha.style.imagem = await upload(arquivo, 'itens');
      }
      const { error } = novo
        ? await sb.from('cosmetics').insert({ ...linha, id, kind: c.kind, custom: true, sort: 1000 })
        : await sb.from('cosmetics').update(linha).eq('id', c.id);
      if (error) throw error;
      try { sessionStorage.removeItem('cc_itens'); } catch { /* ignora */ }
      if (linha.regra) await sb.rpc('admin_aplicar_regras');   // quem já cumpre a meta recebe na hora
      toast(novo ? 'Item criado! Dê para alguém na ficha do usuário ou espere a regra liberar.' : 'Item atualizado.');
      itens();
    } catch (e) { falha(e); }
  }, { once: true });
}

// ---------------- Desafios: cria, acompanha os mais curtidos e premia ----------------
async function desafios() {
  const [{ data: chs, error }, { data: itensRec }] = await Promise.all([
    sb.from('challenges').select('*, cosmetics(name)').order('starts_at', { ascending: false }).limit(50),
    sb.from('cosmetics').select('id,name,kind').order('name'),
  ]);
  const TIPO = { frame: 'Moldura', banner: 'Banner', badge: 'Selo' };
  const nomeItem = Object.fromEntries((itensRec || []).map((i) => [i.id, `${TIPO[i.kind]}: ${i.name}`]));
  if (error) throw /challenges/.test(error.message) ? new Error('Banco desatualizado: rode de novo o supabase/schema.sql.') : error;
  const agora = new Date();
  const estado = (c) => new Date(c.starts_at) > agora ? 'agendado' : new Date(c.ends_at) > agora ? '🟢 aberto' : 'encerrado';
  painel().innerHTML = `<p class="muted">Desafios aparecem no topo do feed da página inicial. As pessoas participam com um post (foto, print, texto).
    Ao final, veja os mais curtidos e premie quem você escolher: o item e o XP caem na conta na hora, com aviso.</p>
    <div class="controles" style="margin:12px 0"><button class="btn" data-acao="novo">+ Novo desafio</button></div>
    ${tabela(['Desafio', 'Período', 'Prêmio', 'Situação', ''], (chs || []).map((c) => `<tr>
      <td><strong>${esc(c.title)}</strong><br><span class="muted" style="font-size:.82rem">${esc((c.description || '').slice(0, 100))}</span></td>
      <td>${data(c.starts_at)} → ${data(c.ends_at)}</td><td>${[c.reward_cosmetic, ...(c.reward_extras || [])].filter(Boolean).map((id) => esc(nomeItem[id] || id)).join('<br>')}${c.reward_cosmetic || c.reward_extras?.length ? '<br>' : ''}+ ${c.reward_xp} XP</td>
      <td>${estado(c)}${c.winners?.length ? `<br><span class="muted">${plural(c.winners.length, 'premiado')}</span>` : ''}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="ver" data-id="${c.id}">Participações</button>
        <button class="btn sec pequeno" data-acao="editar" data-id="${c.id}">Editar</button><button class="btn perigo pequeno" data-acao="excluir" data-id="${c.id}">Excluir</button></td></tr>`))}
    <div id="participacoes"></div>`;
  const local = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const editor = (c = {}) => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">${c.id ? 'Editar' : 'Novo'} desafio</h2>
      <label for="d-t">Título</label><input id="d-t" required minlength="3" maxlength="80" value="${esc(c.title || '')}" placeholder="Ex.: Melhor print de paisagem da semana">
      <label for="d-d">Regras / descrição</label><textarea id="d-d" rows="3" maxlength="1000" placeholder="O que vale, como participar, critério (ex.: mais curtidos + escolha da equipe)">${esc(c.description || '')}</textarea>
      <div class="form-linha">
        <div><label for="d-i">Começa</label><input id="d-i" type="datetime-local" required value="${local(c.starts_at || Date.now())}"></div>
        <div><label for="d-f">Termina</label><input id="d-f" type="datetime-local" required value="${local(c.ends_at || Date.now() + 7 * 864e5)}"></div>
        <div><label for="d-r">Item de prêmio</label><select id="d-r"><option value="">Nenhum</option>${(itensRec || []).filter((i) => i.kind !== 'badge').map((i) => `<option value="${esc(i.id)}" ${i.id === c.reward_cosmetic ? 'selected' : ''}>${esc(nomeItem[i.id])}</option>`).join('')}</select></div>
        <div><label for="d-x">XP de prêmio</label><input id="d-x" type="number" min="0" max="5000" value="${c.reward_xp ?? 200}"></div>
      </div>
      <details style="margin-top:8px"><summary style="cursor:pointer">🎁 Prêmios extras (molduras, banners e selos a mais)</summary>
        <div style="max-height:200px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px;margin-top:6px">
        ${(itensRec || []).map((i) => `<label style="display:flex;gap:6px;align-items:center;font-weight:400;font-size:.85rem"><input type="checkbox" class="d-extra" value="${esc(i.id)}" style="width:auto" ${(c.reward_extras || []).includes(i.id) ? 'checked' : ''}> ${esc(nomeItem[i.id])}</label>`).join('')}
        </div></details>
      <p class="muted" style="font-size:.82rem">Dica: crie antes uma moldura exclusiva em Itens (sem desbloqueio automático) para ser o prêmio. Dá para premiar com moldura + banner + selo juntos.</p>
      <div class="controles" style="margin-top:14px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
    dlg.showModal();
    dlg.addEventListener('close', async () => {
      if (dlg.returnValue !== 'ok') return;
      const linha = { title: $('#d-t').value.trim(), description: $('#d-d').value.trim() || null, starts_at: new Date($('#d-i').value).toISOString(),
        ends_at: new Date($('#d-f').value).toISOString(), reward_cosmetic: $('#d-r').value || null, reward_xp: Number($('#d-x').value) || 0,
        reward_extras: [...dlg.querySelectorAll('.d-extra:checked')].map((x) => x.value).filter((x) => x !== $('#d-r').value) };
      const { error: e } = c.id ? await sb.from('challenges').update(linha).eq('id', c.id) : await sb.from('challenges').insert({ ...linha, created_by: P.id });
      if (e) return falha(/check/.test(e.message) ? { message: 'O fim precisa ser depois do começo.' } : e);
      toast('Desafio salvo.'); desafios();
    }, { once: true });
  };
  acoes({
    novo: () => editor(),
    editar: (id) => editor(chs.find((c) => c.id == id)),
    excluir: async (id) => { if (!confirm('Excluir o desafio? Os posts continuam, só perdem a marcação.')) return; const { error: e } = await sb.from('challenges').delete().eq('id', id); if (e) throw e; desafios(); },
    ver: async (id) => {
      const c = chs.find((x) => x.id == id);
      const { data: ps } = await sb.from('posts').select('id,body,image_url,likes_count,user_id,profiles!posts_user_id_fkey(username)').eq('challenge_id', id).order('likes_count', { ascending: false }).limit(100);
      $('#participacoes').innerHTML = `<h2>Participações: ${esc(c.title)} (${ps?.length || 0})</h2>
        ${tabela(['', 'Quem', 'Post', 'Curtidas'], (ps || []).map((x) => `<tr><td><input type="checkbox" value="${x.user_id}" style="width:auto" ${c.winners.includes(x.user_id) ? 'checked disabled' : ''}></td>
          <td>${esc(x.profiles?.username)}</td><td>${x.image_url ? `<img src="${urlSegura(x.image_url)}" alt="" style="height:60px;border-radius:6px"> ` : ''}<a href="index.html?post=${x.id}" target="_blank">${esc(x.body.slice(0, 80))}</a></td><td>❤️ ${x.likes_count}</td></tr>`))}
        <button class="btn" id="premiar" style="margin-top:10px">🏆 Premiar selecionados</button>`;
      $('#premiar').onclick = async () => {
        const ids = [...new Set([...$('#participacoes').querySelectorAll('input:checked:not(:disabled)')].map((i) => i.value))];
        if (!ids.length) return toast('Marque quem vai ganhar.', true);
        if (!confirm(`Premiar ${plural(ids.length, 'pessoa')}? Elas recebem o item e o XP agora.`)) return;
        const { error: e } = await sb.rpc('award_challenge', { chid: Number(id), vencedores: ids });
        if (e) return falha(e);
        toast('Premiado! 🏆'); desafios();
      };
    },
  });
}

// ---------------- Registro de ações da equipe ----------------
async function registro() {
  const { data: ls, error } = await sb.from('admin_log').select('*, profiles!admin_log_actor_id_fkey(username)').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const ids = [...new Set(ls.filter((l) => l.target_type === 'user').map((l) => l.target_id))];
  const { data: alvos } = ids.length ? await sb.from('profiles').select('id,username').in('id', ids) : { data: [] };
  const nome = new Map((alvos || []).map((a) => [a.id, a.username]));
  painel().innerHTML = `<p class="muted" style="margin-bottom:10px">Últimas 200 ações de moderação e administração (suspensões, permissões, XP, itens, exclusões e ocultações).</p>
    ${tabela(['Quando', 'Quem', 'Ação', 'Alvo', 'Detalhes'], ls.map((l) => `<tr><td>${new Date(l.created_at).toLocaleString('pt-BR')}</td>
      <td>${esc(l.profiles?.username || '—')}</td><td><strong>${esc(l.action)}</strong></td>
      <td>${l.target_type === 'user' ? `<a href="perfil.html?u=${encodeURIComponent(nome.get(l.target_id) || '')}" target="_blank">${esc(nome.get(l.target_id) || 'usuário removido')}</a>` : esc(`${l.target_type || ''} ${l.target_id || ''}`)}</td>
      <td class="muted">${l.details ? esc(Object.entries(l.details).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v ?? '—'}`).join(' · ')) : ''}</td></tr>`))}`;
}

// ---------------- Site: aviso global (somente admin) ----------------
async function site() {
  const { data: st } = await sb.from('settings').select('*').eq('key', 'aviso_site').maybeSingle();
  const a = st?.value || {};
  painel().innerHTML = `<form class="cartao" id="form-aviso">
      <h3>Aviso no topo do site</h3>
      <p class="muted">Aparece para todos os visitantes em todas as páginas (ex.: manutenção, evento, novidade).</p>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="av-ativo" style="width:auto" ${a.ativo ? 'checked' : ''}> Mostrar o aviso</label>
      <label for="av-texto">Texto</label><input id="av-texto" maxlength="200" value="${esc(a.texto || '')}" placeholder="Ex.: Torneio de Street Fighter 6 neste sábado! Inscreva-se na comunidade Luta e FGC.">
      <div class="form-linha">
        <div><label for="av-tipo">Estilo</label><select id="av-tipo">${[['info', 'Informação (amarelo)'], ['alerta', 'Alerta (vermelho)'], ['evento', 'Evento (roxo)']].map(([v, t]) => `<option value="${v}" ${a.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label for="av-link">Link (opcional)</label><input id="av-link" value="${esc(a.link || '')}" placeholder="comunidade.html?id=8"></div>
      </div>
      <button class="btn" style="margin-top:12px">Salvar aviso</button>
    </form>`;
  // Teste dos servidores TURN: pede credenciais ao site e tenta uma retransmissão com cada endereço
  painel().insertAdjacentHTML('beforeend', `<div class="cartao" style="margin-top:14px">
    <h3>📡 Servidores de retransmissão (TURN)</h3>
    <p class="muted">Testa, a partir da sua internet, se cada TURN responde. Os próprios (Oracle, IPv6 de casa) são usados primeiro; a Cloudflare só entra se eles falharem.
      Endereços IPv6 só passam no teste se a sua internet atual também tiver IPv6.</p>
    <button class="btn" id="testar-turn" style="margin-top:10px">Testar agora</button><div id="res-turn" style="margin-top:10px"></div></div>`);
  $('#testar-turn').onclick = async () => {
    const box = $('#res-turn'); box.innerHTML = '<p class="muted">Testando (até 8 s por servidor)...</p>';
    let d;
    try { const r = await fetch('/.netlify/functions/turn', { headers: await cabecalhosLogin() }); d = await r.json(); if (!r.ok) throw new Error(d.erro || r.status); }
    catch (e) { box.innerHTML = `<p class="aviso erro">A função de TURN falhou: ${esc(e.message)}. Confira as variáveis no Netlify.</p>`; return; }
    const testes = [];
    for (const [grupo, lista] of [['Próprio', d.primarios || []], ['Cloudflare (reserva)', d.reserva || (d.primarios ? [] : d.iceServers)]])
      for (const sv of lista) for (const url of [].concat(sv.urls).filter((u) => /^turns?:/.test(u))) testes.push({ grupo, url, sv });
    if (!testes.length) { box.innerHTML = '<p class="muted">Nenhum TURN configurado.</p>'; return; }
    const testar = ({ url, sv }) => new Promise((ok) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: url, username: sv.username, credential: sv.credential }], iceTransportPolicy: 'relay' });
      const fim = (res) => { clearTimeout(t); pc.close(); ok(res); };
      const t = setTimeout(() => fim(null), 8000);
      pc.onicecandidate = (e) => { if (e.candidate?.type === 'relay' || / relay /.test(e.candidate?.candidate || '')) fim(e.candidate.address || 'ok'); };
      pc.createDataChannel('t'); pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => fim(null));
    });
    const res = await Promise.all(testes.map(testar));
    box.innerHTML = tabela(['Servidor', 'Endereço', 'Resultado'], testes.map((x, i) => `<tr><td>${esc(x.grupo)}</td><td><code>${esc(x.url)}</code></td>
      <td>${res[i] ? '✅ respondendo' : '❌ sem resposta'}</td></tr>`));
  };

  // Robô oficial do Discord (ponte de voz): só o ID público do aplicativo, para o botão de convite das comunidades
  const { data: robo } = await sb.from('settings').select('value').eq('key', 'robo_discord').maybeSingle();
  painel().insertAdjacentHTML('beforeend', `<form class="cartao" id="form-robo" style="margin-top:14px">
    <h3>🔗 Robô da ponte de voz (Discord)</h3>
    <p class="muted">Com o ID preenchido, os donos de comunidade veem o botão "Adicionar o robô ao Discord" e podem ligar a ponte na comunidade deles.
      É o <strong>Application ID</strong> do Discord Developer Portal (General Information). Ele é público: <strong>não</strong> é o token.</p>
    <div class="controles" style="margin-top:8px"><input id="robo-id" pattern="\\d{17,20}" placeholder="ex.: 123456789012345678" value="${esc(robo?.value?.client_id || '')}" style="max-width:280px">
      <button class="btn">Salvar</button></div></form>`);
  $('#form-robo').onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#robo-id').value.trim();
    const { error } = await sb.from('settings').upsert({ key: 'robo_discord', value: { client_id: v || null } });
    error ? falha(error) : toast(v ? 'Robô configurado! O botão já aparece para os donos de comunidade.' : 'Robô removido.');
  };
  // Notificações no celular: gera as chaves no navegador (nunca saem daqui) e configura o banco
  const { data: pushCfg } = await sb.from('settings').select('value').eq('key', 'push').maybeSingle();
  painel().insertAdjacentHTML('beforeend', `<div class="cartao" style="margin-top:14px">
    <h3>Notificações no celular</h3>
    <p class="muted">Situação: ${pushCfg?.value?.url ? '✅ banco configurado (falta só conferir as variáveis no Netlify)' : '⚠️ ainda não configurado'}.</p>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Clique para gerar as chaves. Elas são criadas aqui no seu navegador. Copie cada uma para
      <strong>Netlify → Site configuration → Environment variables</strong> e faça um novo deploy. Gerar de novo invalida as inscrições antigas
      (as pessoas precisam ativar de novo).</p>
    <button class="btn" id="gerar-push" style="margin-top:10px">🔑 Gerar chaves e configurar</button>
    <div id="chaves-push" class="hidden" style="margin-top:12px"></div></div>`);
  $('#gerar-push').onclick = async () => {
    if (pushCfg?.value?.url && !confirm('Já existe uma configuração. Gerar novas chaves? Quem já ativou vai precisar ativar de novo.')) return;
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const publica = b64(await crypto.subtle.exportKey('raw', par.publicKey));
    const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d;
    const segredo = b64(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await sb.from('settings').upsert({ key: 'push', value: { url: location.origin + '/.netlify/functions/push', segredo } });
    if (error) return falha(error);
    const linha = (nome, valor) => `<div class="controles" style="align-items:center;margin-bottom:6px"><code style="min-width:170px">${nome}</code>
      <input readonly value="${esc(valor)}" style="flex:1;font-family:monospace;font-size:.8rem"><button type="button" class="btn sec pequeno" data-copiar="${esc(valor)}">Copiar</button></div>`;
    $('#chaves-push').innerHTML = `<div class="aviso">Copie agora: a chave privada e o segredo <strong>não aparecem de novo</strong> e não devem ser compartilhados.</div>
      ${linha('VAPID_PUBLIC_KEY', publica)}${linha('VAPID_PRIVATE_KEY', privada)}${linha('VAPID_SUBJECT', 'mailto:' + (P.username || 'admin') + '@controlcritic.app')}${linha('PUSH_SECRET', segredo)}
      <p class="muted" style="font-size:.85rem">No VAPID_SUBJECT, se preferir, use um e-mail seu de contato (ex.: mailto:voce@gmail.com).</p>`;
    $('#chaves-push').classList.remove('hidden');
    $('#chaves-push').querySelectorAll('[data-copiar]').forEach((b) => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copiar); toast('Copiado!'); } catch { toast('Selecione e copie manualmente.', true); } });
  };

  $('#form-aviso').onsubmit = async (e) => {
    e.preventDefault();
    const link = $('#av-link').value.trim();
    if (link && !/^([a-z]+\.html[\w?=&#.%-]*|https:\/\/[^\s"'<>]+)$/i.test(link)) return toast('Link inválido.', true);
    const value = { ativo: $('#av-ativo').checked, texto: $('#av-texto').value.trim(), tipo: $('#av-tipo').value, link: link || null, versao: Date.now() };
    const { error } = await sb.from('settings').upsert({ key: 'aviso_site', value });
    if (error) return falha(error);
    toast(value.ativo ? 'Aviso publicado.' : 'Aviso desativado.');
  };
}

// ---------------- Automação (somente admin) ----------------
async function auto() {
  const { data: st } = await sb.from('settings').select('*');
  const cfg = Object.fromEntries((st || []).map((s) => [s.key, s.value]));
  const ultimo = cfg.last_sync;
  painel().innerHTML = `
    <div class="cartao">
      <h3>Robô de notícias e promoções</h3>
      <p class="muted">Roda automaticamente pelo GitHub Actions a cada 6 horas (arquivo <code>.github/workflows/sync.yml</code>).
      Também pode ser disparado manualmente em GitHub → Actions → "Sincronizar notícias e promoções" → Run workflow.</p>
      <p style="margin-top:10px"><strong>Última execução:</strong> ${ultimo?.at ? `${new Date(ultimo.at).toLocaleString('pt-BR')} —
        ${plural(ultimo.news ?? 0, 'notícia nova', 'notícias novas')}, ${plural(ultimo.deals ?? 0, 'preço atualizado', 'preços atualizados')}${ultimo.errors?.length ? `, <span style="color:var(--perigo)">${plural(ultimo.errors.length, 'erro')}</span>` : ''}` : 'ainda não executou'}</p>
      ${ultimo?.errors?.length ? `<ul class="muted" style="margin:6px 0 0 18px">${ultimo.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="cartao" style="margin-top:14px">
      <h3>Catálogo automático (IGDB)</h3>
      <p class="muted">Todo dia o robô "Importar jogos (IGDB)" adiciona os próximos 2.000 jogos mais populares e os lançamentos recentes.
      Além disso, quando alguém busca um jogo que não está no site, ele é importado na hora.</p>
      <p style="margin-top:10px"><strong>Última importação:</strong> ${cfg.last_igdb?.at ? `${new Date(cfg.last_igdb.at).toLocaleString('pt-BR')} —
        ${plural(cfg.last_igdb.novos ?? 0, 'jogo novo', 'jogos novos')}, ${plural(cfg.last_igdb.completados ?? 0, 'atualizado')}; catálogo com ${(cfg.last_igdb.catalogo ?? 0).toLocaleString('pt-BR')} jogos` : 'ainda não executou'}</p>
    </div>
    <form class="cartao" id="form-auto" style="margin-top:14px">
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="autopub" style="width:auto" ${cfg.auto_publish_news ? 'checked' : ''}>
        Publicar notícias oficiais automaticamente (desmarcado = ficam pendentes para aprovação na aba Notícias)</label>
      <label>Feeds RSS oficiais (um por linha: Nome | URL)</label>
      <textarea id="feeds" rows="6">${esc((cfg.feeds || []).map((f) => `${f.name} | ${f.url}`).join('\n'))}</textarea>
      <p class="muted" style="font-size:.85rem;margin-top:6px">Além destes, o robô busca as notícias oficiais da Steam de cada jogo que tem "ID na Steam" cadastrado.</p>
      <button class="btn" style="margin-top:12px">Salvar</button>
    </form>`;
  $('#form-auto').onsubmit = async (e) => {
    e.preventDefault();
    const feeds = $('#feeds').value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([n, u]) => n && /^https:\/\//.test(u || '')).map(([name, url]) => ({ name, url }));
    const { error } = await sb.from('settings').upsert([{ key: 'auto_publish_news', value: $('#autopub').checked }, { key: 'feeds', value: feeds }]);
    error ? falha(error) : toast('Configurações salvas.');
  };
}

// ---------------- Início ----------------
// Fica no fim do arquivo: as constantes acima (ABAS, VIEWS) precisam existir antes de montar o painel.
if (configurado && (await exigirLogin())) {
  P = await perfil();
  if (!P || P.role === 'user') {
    main.innerHTML = `<div class="cartao" style="max-width:560px;margin:24px auto"><h2 style="margin-top:0">Acesso restrito à equipe</h2>
      <p class="muted">Sua conta (${esc(P?.username || '')}) ainda não é admin. Peça a um admin para mudar seu papel na aba Usuários,
      ou, se for a primeira conta, rode no SQL Editor do Supabase:</p>
      <pre style="background:var(--cartao-2);padding:10px;border-radius:8px;margin-top:10px;overflow-x:auto">update profiles set role = 'admin' where username = '${esc(P?.username || 'SEU_USUARIO')}';</pre></div>`;
  } else iniciar();
}
