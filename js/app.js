import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Aceita a URL com ou sem "/rest/v1" e barras no final
const URL_PROJETO = SUPABASE_URL.trim().replace(/\/+(rest\/v1)?\/*$/, '');
const chaveSecreta = /^sb_secret_/.test(SUPABASE_ANON_KEY) || /service_role/.test(atobSeguro(SUPABASE_ANON_KEY.split('.')[1]));
// Tema salvo (claro/escuro) aplicado antes de montar a página
try { const t = localStorage.getItem('cc_tema'); if (t) document.documentElement.dataset.tema = t; } catch { /* ignora */ }

export const configurado = URL_PROJETO.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('COLE_') && !chaveSecreta;
export const sb = configurado ? createClient(URL_PROJETO, SUPABASE_ANON_KEY) : null;

function atobSeguro(s) { try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } }

// ---------- Utilidades ----------
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const param = (nome) => new URLSearchParams(location.search).get(nome);

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Aceita apenas links http(s) ou caminhos relativos (evita javascript: em links vindos do banco)
export function urlSegura(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s) || /^[a-z0-9_\-./]+$/i.test(s)) return esc(s);
  return '';
}

export function estrelas(nota) {
  const n = Math.round(Number(nota) || 0);
  return `<span class="estrelas" aria-label="${n} de 5">${'★'.repeat(n)}<span class="vazia">${'★'.repeat(5 - n)}</span></span>`;
}

export function data(d) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toast(msg, erro = false) {
  let box = $('#toast');
  if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 4000);
}

export function falha(err) {
  console.error(err);
  toast(err?.message || 'Algo deu errado. Tente de novo.', true);
}

// Nível: cada nível exige mais XP (50, 200, 450, 800...)
export function nivel(xp) {
  const lv = Math.floor(Math.sqrt((xp || 0) / 50)) + 1;
  const atual = 50 * (lv - 1) ** 2, prox = 50 * lv ** 2;
  const titulos = ['Novato', 'Aprendiz', 'Jogador', 'Veterano', 'Crítico', 'Especialista', 'Lenda'];
  return { lv, titulo: titulos[Math.min(lv - 1, titulos.length - 1)], pct: Math.round(((xp - atual) / (prox - atual)) * 100), prox };
}

// Capas: passam pelo CDN de imagens do Netlify (mesmo domínio do site, redimensionadas e em WebP).
// Isso evita bloqueios do navegador a sites externos e deixa a página mais leve. Se falhar, tenta o
// endereço original e, por fim, a imagem padrão (ver o tratador de erro logo abaixo).
const CDN_OK = !/^(localhost|127\.|\[)/.test(location.hostname); // em teste local não existe o CDN
// Imagens do próprio site (img/...) também passam pelo CDN: as capas locais têm 1 a 2 MB em PNG
const EXTERNA = /^(https:\/\/(images\.igdb\.com|i\.ytimg\.com|[a-z0-9.-]*steamstatic\.com|[a-z0-9-]+\.supabase\.co)\/|\/?img\/[\w./-]+\.(png|jpe?g)$)/;
export const urlCdn = (url, largura = 480) => CDN_OK && EXTERNA.test(url || '') ? `/.netlify/images?url=${encodeURIComponent(/^img\//.test(url) ? '/' + url : url)}&w=${largura}&fm=webp&q=75` : url;
export function srcCapa(url, largura = 480) {
  const u = urlSegura(url);
  if (!u) return 'src="img/Control.png"';
  if (!CDN_OK || !EXTERNA.test(url)) return `src="${u}"`;
  return `src="${esc(urlCdn(url, largura))}" data-orig="${u}"`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName !== 'IMG') return;
  if (img.dataset.orig) { const o = img.dataset.orig; delete img.dataset.orig; img.src = o; return; }
  if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(img.src) && !img.src.endsWith('img/Control.png') && img.closest('.jogo-card, .vitrine-jogos, .atividade, .lista, .grade, .detalhe, .carrossel')) img.src = 'img/Control.png';
}, true);

export const avatar = (p) => urlSegura(p?.avatar_url) || 'img/perfilpadrao.png';

// Foto com a moldura equipada (gamificação). classe: classes extras da <img>
export function avatarHtml(p, classe = '', alt = '') {
  const m = /^[a-z0-9_]+$/.test(p?.equipped_frame || '') ? p.equipped_frame : '';
  return `<span class="moldura ${m ? 'com m-' + m : ''}"><img class="avatar ${classe}" src="${avatar(p)}" alt="${esc(alt)}"></span>`;
}

// ---------- Sessão ----------
let _perfil;
export async function usuario() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session?.user ?? null;
}
export async function perfil() {
  if (_perfil !== undefined) return _perfil;
  const u = await usuario();
  if (!u) return (_perfil = null);
  const { data } = await sb.from('profiles').select('*').eq('id', u.id).single();
  return (_perfil = data);
}
export async function exigirLogin() {
  const u = await usuario();
  if (!u) { location.href = 'entrar.html?volta=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return null; }
  return u;
}

// ---------- Layout comum ----------
const LINKS = [
  ['index.html', 'Início'], ['jogos.html', 'Jogos'], ['novidades.html', 'Novidades'], ['promocoes.html', 'Promoções'],
  ['comunidades.html', 'Comunidades'],
];
// Ficam no menu "Mais" (deixa a barra do topo numa linha só)
const LINKS_MAIS = [['conquistas.html', '🏆 Conquistas'], ['sobre.html', 'Quem Somos'], ['contato.html', 'Fale Conosco'], ['privacidade.html', 'Privacidade']];

export async function montarLayout() {
  const pagina = location.pathname.split('/').pop() || 'index.html';
  const topo = document.createElement('header');
  topo.className = 'topo';
  topo.innerHTML = `
    <div class="topo-inner">
      <a class="logo" href="index.html" aria-label="Control Critic - início">
        <img class="marca" src="img/ControlHeader.png" alt="Control Critic">
        <img class="mascote" src="img/Adelino.png" alt="">
      </a>
      <button class="menu-toggle" aria-label="Abrir menu">☰</button>
      <nav class="nav">${LINKS.map(([h, t]) => `<a href="${h}" class="${h === pagina ? 'ativo' : ''}">${t}</a>`).join('')}
        <details class="nav-mais"><summary class="${LINKS_MAIS.some(([h]) => h === pagina) ? 'ativo' : ''}">Mais ▾</summary>
          <div class="nav-sub">${LINKS_MAIS.map(([h, t]) => `<a href="${h}" class="${h === pagina ? 'ativo' : ''}">${t}</a>`).join('')}</div></details></nav>
      <form class="busca" action="jogos.html"><input name="q" type="search" placeholder="Buscar jogo..." aria-label="Buscar jogo"></form>
      <div class="conta"></div>
    </div>`;
  document.body.prepend(topo);
  $('.menu-toggle', topo).onclick = () => topo.classList.toggle('aberto');
  document.addEventListener('click', (e) => { const m = $('.nav-mais', topo); if (m?.open && !m.contains(e.target)) m.open = false; });

  const rodape = document.createElement('footer');
  rodape.className = 'rodape';
  rodape.innerHTML = `
    <div class="redes">
      <a href="https://www.instagram.com/Control.Critic/" target="_blank" rel="noopener"><img src="img/redes/insta.png" alt="Instagram"></a>
      <a href="https://twitter.com/ControlCritic" target="_blank" rel="noopener"><img src="img/redes/tw.png" alt="Twitter"></a>
      <a href="contato.html"><img src="img/redes/gm.png" alt="Fale conosco"></a>
    </div>
    <p>© ${new Date().getFullYear()} Control Critic. Todos os direitos reservados.</p>
    <p style="font-size:.8rem;margin-top:6px">Dados de jogos: <a href="https://www.igdb.com" target="_blank" rel="noopener">IGDB.com</a> e Steam.</p>
    <p style="font-size:.85rem;margin-top:8px"><a href="privacidade.html">Privacidade</a> · <a href="termos.html">Termos de uso</a> ·
      <a href="contato.html">Contato</a> <button class="btn sec pequeno hidden" id="instalar" style="margin-left:8px">📲 Instalar app</button>
      <button class="btn sec pequeno" id="reportar" style="margin-left:8px">🐞 Reportar problema</button>
      <button class="btn sec pequeno" id="tema" style="margin-left:8px" aria-label="Alternar tema claro/escuro">${document.documentElement.dataset.tema === 'claro' ? '🌙 Tema escuro' : '☀️ Tema claro'}</button></p>`;
  document.body.append(rodape);
  $('#tema', rodape).onclick = (e) => {
    const claro = document.documentElement.dataset.tema !== 'claro';
    document.documentElement.dataset.tema = claro ? 'claro' : '';
    e.currentTarget.textContent = claro ? '🌙 Tema escuro' : '☀️ Tema claro';
    try { localStorage.setItem('cc_tema', claro ? 'claro' : ''); } catch { /* ignora */ }
  };
  $('#reportar', rodape).onclick = () => reportarProblema();
  // Atalho para leitores de tela / teclado
  document.body.insertAdjacentHTML('afterbegin', '<a class="pular" href="#conteudo">Pular para o conteúdo</a>');

  configurarPwa();

  if (!configurado) {
    $('main')?.insertAdjacentHTML('afterbegin', chaveSecreta
      ? `<div class="aviso erro"><strong>Chave secreta no site!</strong> O <code>js/config.js</code> está com a Secret/service_role key,
         que dá acesso total ao banco. Troque pela Publishable key e gere uma nova Secret key no Supabase.</div>`
      : `<div class="aviso"><strong>Supabase ainda não configurado.</strong>
         Preencha <code>js/config.js</code> com a URL e a Publishable key do projeto (veja o README).</div>`);
    return;
  }

  mostrarAvisoGlobal();
  carregarEstilosItens();
  if (!Object.keys(NOMES_CAT).length) carregarCategorias();
  const conta = $('.conta', topo);
  const p = await perfil();
  // Conta suspensa: avisa a própria pessoa (ela continua navegando, mas não publica)
  if (p?.banned && (!p.banned_until || new Date(p.banned_until) > new Date())) {
    $('main')?.insertAdjacentHTML('afterbegin', `<div class="aviso erro">⛔ Sua conta está suspensa${p.banned_until ? ' até ' + new Date(p.banned_until).toLocaleString('pt-BR') : ''}.
      ${p.ban_reason ? 'Motivo: ' + esc(p.ban_reason) + '. ' : ''}Você pode navegar, mas não pode publicar. Dúvidas? <a href="contato.html">Fale Conosco</a>.</div>`);
  }
  if (!p) {
    conta.innerHTML = `<a class="btn pequeno" href="entrar.html">Entrar</a>`;
  } else {
    conta.innerHTML = `
      ${p.role !== 'user' ? '<a class="btn sec pequeno" href="admin.html">Admin</a>' : ''}
      <a href="conquistas.html" class="chama-topo" id="chama" title="Sequência de dias e conquistas">🔥 ${p.streak_current || 0}</a>
      <a href="amigos.html" class="sino" title="Amigos" aria-label="Amigos">👥<span class="badge online hidden" id="badge-online" title="Amigos online agora"></span></a>
      <span class="vol-topo"><button class="sino" id="vol-bt" title="Volume do site" aria-label="Volume do site" style="background:none;border:0;cursor:pointer;color:inherit">🔊</button>
        <span class="vol-pop hidden" id="vol-pop"><input type="range" id="vol-site" min="0" max="100" step="5" aria-label="Volume do site"><output id="vol-n"></output><small class="vol-dica">Spotify: em 0% ele pausa e não toca sozinho. Para ajustar o volume dele, use o do aparelho.</small></span></span>
      <a href="notificacoes.html" class="sino" title="Notificações" aria-label="Notificações">🔔<span class="badge hidden" id="badge"></span></a>
      <a href="perfil.html" title="${esc(p.username)}" aria-label="Meu perfil">${avatarHtml(p)}</a>
      <button class="sino sair-topo" id="sair-topo" title="Sair da conta" aria-label="Sair da conta">🚪</button>`;
    ligarVolumeTopo(topo);
    $('#sair-topo', topo).onclick = () => { if (confirm('Sair da sua conta?')) sair(); };
    contarNotificacoes(p.id);
    if (!p.onboarded && p.onboarded !== undefined) import('./boas-vindas.js').then((m) => m.boasVindas(p)).catch(() => {});
    loginDiario();
    entrarOnline(p);
    contarAmigosOnline(p.id);
    // Atualiza o sino em tempo real
    sb.channel('notif:' + p.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${p.id}` }, (m) => {
        contarNotificacoes(p.id);
        toast('🔔 ' + m.new.title);
      }).subscribe();
  }
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.href = 'index.html'; });
}

// Colunas usadas pelos cards de jogo (pedir só isso economiza tráfego do Supabase)
export const COLUNAS_CARD = 'id,slug,title,cover_url,avg_rating,reviews_count,igdb_rating,category_ids,categories(name)';

// Nomes das categorias (tabela pequena, guardada na sessão) para mostrar as até 3 categorias de cada jogo
let NOMES_CAT = {};
try { NOMES_CAT = JSON.parse(sessionStorage.getItem('cc_cats') || '{}'); } catch { /* ignora */ }
async function carregarCategorias() {
  const { data } = await sb.from('categories').select('id,name');
  if (!data) return;
  NOMES_CAT = Object.fromEntries(data.map((c) => [c.id, c.name]));
  try { sessionStorage.setItem('cc_cats', JSON.stringify(NOMES_CAT)); } catch { /* ignora */ }
}
export const nomesCategorias = (g) => {
  const nomes = (g.category_ids || []).map((id) => NOMES_CAT[id]).filter(Boolean);
  return nomes.length ? nomes : g.categories?.name ? [g.categories.name] : [];
};

export function cardJogo(g) {
  return `<a class="jogo-card" href="jogo.html?slug=${encodeURIComponent(g.slug)}">
    <img ${srcCapa(g.cover_url, 480)} alt="" loading="lazy">
    <div class="info">
      <span class="titulo" title="${esc(g.title)}">${esc(g.title)}</span>
      ${nomesCategorias(g).length ? `<span class="tags-cat">${nomesCategorias(g).map((n) => `<span class="tag">${esc(n)}</span>`).join(' ')}</span>` : ''}
      ${g.reviews_count || !g.igdb_rating ? `<span>${estrelas(g.avg_rating)} <span class="muted">(${g.reviews_count})</span></span>`
        // Sem avaliações no site ainda: mostra a nota do IGDB (crítica e público) como nota inicial, convertida para 5 estrelas
        : `<span title="Nota inicial do IGDB (${Math.round(g.igdb_rating)}/100). Avalie para dar a nota do Control Critic!">${estrelas(g.igdb_rating / 20)} <span class="muted">IGDB</span></span>`}
    </div></a>`;
}

// Esqueletos de carregamento (enquanto os dados chegam)
export const esqueletoCards = (n = 4) => Array.from({ length: n }, () => '<div class="jogo-card esqueleto"><div class="esq-img"></div><div class="info"><span class="esq-linha"></span><span class="esq-linha curta"></span></div></div>').join('');
export const esqueletoLista = (n = 3) => Array.from({ length: n }, () => '<div class="cartao esqueleto"><span class="esq-linha"></span><span class="esq-linha curta"></span></div>').join('');

// Carrossel horizontal com setas (rolagem por toque no celular)
export function carrossel(itensHtml, vazio = '') {
  if (!itensHtml) return vazio ? `<p class="vazio">${vazio}</p>` : '';
  return `<div class="carrossel"><button class="car-seta esq" aria-label="Anterior">‹</button><div class="car-trilho">${itensHtml}</div><button class="car-seta dir" aria-label="Próximo">›</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.car-seta');
  if (!b) return;
  const t = b.parentElement.querySelector('.car-trilho');
  t.scrollBy({ left: (b.classList.contains('esq') ? -1 : 1) * t.clientWidth, behavior: 'smooth' });
});
// Esconde a seta do lado em que não há mais itens
document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('car-trilho')) setasCarrossel(e.target); }, true);
function setasCarrossel(t) {
  const c = t.parentElement;
  c.querySelector('.car-seta.esq').disabled = t.scrollLeft < 8;
  c.querySelector('.car-seta.dir').disabled = t.scrollLeft + t.clientWidth >= t.scrollWidth - 8;
}
new MutationObserver(() => document.querySelectorAll('.car-trilho:not([data-ok])').forEach((t) => { t.dataset.ok = 1; requestAnimationFrame(() => setasCarrossel(t)); }))
  .observe(document.documentElement, { childList: true, subtree: true });

// Imagem do IGDB a partir do código (t_screenshot_big, t_1080p, t_thumb...)
export const imgIgdb = (id, tam = 't_screenshot_big') => /^[a-z0-9]{4,40}$/.test(id || '') ? `https://images.igdb.com/igdb/image/upload/${tam}/${id}.jpg` : '';

// Envia uma imagem para o Storage (pasta da própria pessoa) e devolve a URL pública
// Fotos são reduzidas e convertidas para WebP no próprio aparelho antes do envio (economiza 70–90% do armazenamento).
// GIFs ficam como estão (para não perder a animação).
// Antes de comprimir: fotos (JPG/PNG/WebP) de até 25 MB são aceitas, porque viram poucos KB no envio.
// GIF não é comprimido (perderia a animação), então vale o limite normal.
export function imagemAceitavel(arq, limiteMb = 3) {
  if (!arq?.type?.startsWith('image/')) return 'Escolha um arquivo de imagem (JPG, PNG, WebP ou GIF).';
  if (/heic|heif/i.test(arq.type)) return 'Fotos HEIC do iPhone não são aceitas: no iPhone, use "Mais compatível" em Ajustes → Câmera → Formatos, ou envie um print.';
  const max = /^image\/(png|jpeg|webp)$/.test(arq.type) ? 25 : limiteMb;
  if (arq.size > max * 1024 * 1024) return `A imagem deve ter no máximo ${max} MB.`;
  return null;
}

export async function comprimirImagem(arq, maxLado = 1600, qualidade = 0.85) {
  if (!/^image\/(png|jpeg|webp)$/.test(arq.type)) return arq;
  try {
    const bmp = await createImageBitmap(arq);
    const k = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const cv = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    // WebP quando o navegador gera; senão JPEG (ex.: Safari antigo no iPhone)
    for (const tipo of ['image/webp', 'image/jpeg']) {
      const blob = await new Promise((ok) => cv.toBlob(ok, tipo, qualidade));
      if (blob?.type === tipo && blob.size < arq.size) return new File([blob], arq.name.replace(/\.\w+$/, '') + (tipo === 'image/webp' ? '.webp' : '.jpg'), { type: tipo });
    }
    return arq;
  } catch { return arq; }
}

export async function enviarImagem(uid, prefixo, arq, limiteMb = 3, maxLado = 1600) {
  const problema = imagemAceitavel(arq, limiteMb);
  if (problema) throw new Error(problema);
  arq = await comprimirImagem(arq, maxLado);
  if (arq.size > limiteMb * 1024 * 1024) throw new Error(`A imagem deve ter no máximo ${limiteMb} MB.`);
  const ext = (arq.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const caminho = `avatars/${uid}/${prefixo}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(caminho, arq, { contentType: arq.type });
  if (error) throw new Error(`Não foi possível enviar a imagem (${error.message}).`);
  return sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
}

// "Jogando agora" na Steam: { steamid: { jogo, online } } (cache de 1 min no servidor)
export async function steamAgora(ids) {
  const v = [...new Set(ids.filter((x) => /^\d{17}$/.test(x || '')))];
  if (!v.length) return {};
  try { const r = await fetch('/.netlify/functions/steam-agora?ids=' + v.join(',')); return r.ok ? await r.json() : {}; } catch { return {}; }
}

async function contarNotificacoes(uid) {
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false);
  const b = $('#badge');
  if (!b) return;
  b.textContent = count > 99 ? '99+' : count;
  b.classList.toggle('hidden', !count);
}

// ---------- App instalável (PWA) ----------
let pedidoInstalacao = null;
function configurarPwa() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  const bt = $('#instalar');
  const mostrar = () => bt?.classList.remove('hidden');
  if (pedidoInstalacao) mostrar();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalacao = e; mostrar(); });
  bt?.addEventListener('click', async () => {
    if (!pedidoInstalacao) return;
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice;
    pedidoInstalacao = null; bt.classList.add('hidden');
  });
}

// ---------- Denúncias (usado em várias páginas) ----------
const MOTIVOS = [['spam', 'Spam ou propaganda'], ['ofensivo', 'Ofensivo ou discurso de ódio'], ['assedio', 'Assédio ou ameaça'],
  ['conteudo_impróprio', 'Conteúdo impróprio'], ['golpe', 'Golpe ou fraude'], ['outro', 'Outro motivo']];
export async function denunciar(tipo, id) {
  const u = await usuario();
  if (!u) { location.href = 'entrar.html?volta=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return; }
  let dlg = $('#dlg-denuncia');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-denuncia'; document.body.append(dlg); }
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">Denunciar</h2>
    <p class="muted">A equipe de moderação vai analisar. Quem você denunciou não fica sabendo.</p>
    <label for="den-motivo">Motivo</label><select id="den-motivo" required>${MOTIVOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
    <label for="den-det">Detalhes (opcional)</label><textarea id="den-det" rows="3" maxlength="1000"></textarea>
    <div class="controles" style="margin-top:14px"><button class="btn perigo" value="ok">Enviar denúncia</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    const { error } = await sb.from('reports').insert({ reporter_id: u.id, target_type: tipo, target_id: String(id), reason: $('#den-motivo').value, details: $('#den-det').value.trim() || null });
    if (error && error.code !== '23505') return falha(error);
    toast('Denúncia enviada. Obrigado por ajudar a manter a comunidade segura.');
  }, { once: true });
}

// ---------- Reportar problema / sugestão (vai para o painel do admin) ----------
export async function reportarProblema(textoInicial = '') {
  if (!sb) return;
  let dlg = $('#dlg-reportar');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlg-reportar'; document.body.append(dlg); }
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">🐞 Reportar problema ou sugerir</h2>
    <p class="muted">Conte o que aconteceu ou o que poderia ser melhor. A página atual e o seu navegador vão junto para ajudar a equipe.</p>
    <label for="rp-tipo">Tipo</label><select id="rp-tipo"><option value="bug">Algo não funciona</option><option value="sugestao">Sugestão</option></select>
    <label for="rp-msg">Mensagem</label><textarea id="rp-msg" rows="4" maxlength="2000" required placeholder="Ex.: Ao clicar em Publicar no celular, nada acontece."></textarea>
    <div class="controles" style="margin-top:14px"><button class="btn" value="ok">Enviar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  if (textoInicial) $('#rp-msg', dlg).value = textoInicial;
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') return;
    const u = await usuario();
    const { error } = await sb.from('app_feedback').insert({ user_id: u?.id ?? null, kind: $('#rp-tipo').value, message: $('#rp-msg').value.trim(),
      page: (location.pathname + location.search).slice(0, 300), agent: navigator.userAgent.slice(0, 300), details: { tela: `${innerWidth}x${innerHeight}` } });
    error ? falha(error) : toast('Obrigado! A equipe vai analisar. 💛');
  }, { once: true });
}

// Erros do site no navegador das pessoas são registrados automaticamente (aparecem no admin → Problemas)
let errosEnviados = 0;
async function registrarErro(msg, extra) {
  if (!sb || errosEnviados >= 5 || !msg) return;
  const m = String(msg).slice(0, 500);
  if (/ResizeObserver|Script error|extension|chrome-extension|AbortError|NetworkError|Failed to fetch|Load failed/i.test(m + (extra?.arquivo || ''))) return;
  errosEnviados++;
  try {
    const u = await usuario();
    await sb.from('app_feedback').insert({ user_id: u?.id ?? null, kind: 'erro', message: m, page: (location.pathname + location.search).slice(0, 300), agent: navigator.userAgent.slice(0, 300), details: extra || null });
  } catch { /* nunca quebra a página por causa do registro */ }
}
addEventListener('error', (e) => registrarErro(e.message, { arquivo: String(e.filename || '').split('/').pop(), linha: e.lineno, coluna: e.colno }));
addEventListener('unhandledrejection', (e) => registrarErro(e.reason?.message || String(e.reason), { tipo: 'promise', pilha: String(e.reason?.stack || '').slice(0, 800) }));

// ---------- Tradução ----------
// Usa o tradutor embutido do navegador (Chrome 138+), que roda no próprio aparelho e é gratuito.
export async function traduzirNoNavegador(texto) {
  try {
    if (!('Translator' in self)) return null;
    const disp = await self.Translator.availability({ sourceLanguage: 'en', targetLanguage: 'pt' });
    if (disp === 'unavailable') return null;
    const t = await self.Translator.create({ sourceLanguage: 'en', targetLanguage: 'pt' });
    return await t.translate(texto);
  } catch { return null; }
}

// ---------- Login diário ----------
async function loginDiario() {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  try { if (localStorage.getItem('cc_checkin') === hoje) return; } catch { /* sem armazenamento: o servidor evita duplicar */ }
  const { data, error } = await sb.rpc('daily_checkin');
  if (error) return;
  try { localStorage.setItem('cc_checkin', hoje); } catch { /* ignora */ }
  const chama = $('#chama');
  if (chama) chama.textContent = `🔥 ${data.streak}`;
  if (data.ja_feito) return;
  toast(data.streak > 1
    ? `🔥 ${data.streak} dias seguidos! +${data.xp} XP${data.bonus_semanal ? ' (bônus semanal!)' : ''}${data.recorde ? ' · novo recorde' : ''}`
    : `👋 Bem-vindo de volta! +${data.xp} XP pelo login de hoje.`);
}

// ---------- Quem está online (presença global, usada na página de amigos) ----------
let canalOnline = null;
const ouvintesOnline = new Set();
// Para economizar conexões do Supabase, sai da presença quando a aba fica 1 min em segundo plano
function entrarOnline(p) {
  const conectar = () => {
    if (canalOnline) return;
    canalOnline = sb.channel('online', { config: { presence: { key: p.id } } });
    canalOnline.on('presence', { event: 'sync' }, () => ouvintesOnline.forEach((f) => f(onlineAgora())))
      .subscribe((st) => { if (st === 'SUBSCRIBED') canalOnline?.track({ em: Date.now(), call: meuStatus.call }); });
  };
  let timer;
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) timer = setTimeout(() => { if (canalOnline) { sb.removeChannel(canalOnline); canalOnline = null; } }, 60000);
    else conectar();
  });
  conectar();
}
// Bolinha verde no 👥 do topo com quantos amigos estão online agora
async function contarAmigosOnline(uid) {
  const { data } = await sb.from('friendships').select('user_a,user_b').eq('status', 'aceita').or(`user_a.eq.${uid},user_b.eq.${uid}`);
  const amigos = new Set((data || []).map((f) => (f.user_a === uid ? f.user_b : f.user_a)));
  if (!amigos.size) return;
  aoMudarOnline((online) => {
    const n = [...amigos].filter((id) => online.has(id)).length, b = $('#badge-online');
    if (!b) return;
    b.textContent = n; b.classList.toggle('hidden', !n);
    b.parentElement.title = n ? `${n} amigo(s) online agora` : 'Amigos';
  });
}
// Status "na call": vai junto na presença (só o título e, se for de comunidade, o id dela; nunca a chave da sala)
const meuStatus = { call: null };
export function statusCall(info) { meuStatus.call = info; canalOnline?.track({ em: Date.now(), call: info }); }
// Mapa id → { call } de quem está online
export function estadoOnline() {
  const m = new Map();
  for (const [id, lista] of Object.entries(canalOnline?.presenceState() || {})) m.set(id, lista.find((x) => x.call)?.call ? { call: lista.find((x) => x.call).call } : {});
  return m;
}
export function onlineAgora() { return new Set(Object.keys(canalOnline?.presenceState() || {})); }
export function aoMudarOnline(f) { ouvintesOnline.add(f); f(onlineAgora()); }

// ---------- Sair da conta ----------
// Sempre limpa a sessão do navegador, mesmo se o servidor não responder
// (antes, uma falha no servidor deixava a pessoa "presa" logada).
export async function sair() {
  try { await sb.auth.signOut({ scope: 'local' }); } catch { /* segue limpando */ }
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb-') || (k.startsWith('cc_') && k !== 'cc_tema')) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* armazenamento bloqueado */ }
  location.href = 'index.html';
}

// ---------- Aviso global (definido no painel de admin, aba Site) ----------
async function mostrarAvisoGlobal() {
  const { data } = await sb.rpc('public_settings');
  const a = data?.aviso;
  if (!a?.ativo || !a.texto) return;
  try { if (localStorage.getItem('cc_aviso_fechado') === String(a.versao)) return; } catch { /* ignora */ }
  const link = /^([a-z]+\.html[\w?=&#.%-]*|https:\/\/[^\s"'<>]+)$/i.test(a.link || '') ? a.link : null;
  const el = document.createElement('div');
  el.className = 'aviso-global aviso-' + (['info', 'alerta', 'evento'].includes(a.tipo) ? a.tipo : 'info');
  el.innerHTML = `<span>${esc(a.texto)} ${link ? `<a href="${esc(link)}">Saiba mais →</a>` : ''}</span><button aria-label="Fechar aviso">✕</button>`;
  el.querySelector('button').onclick = () => { el.remove(); try { localStorage.setItem('cc_aviso_fechado', String(a.versao)); } catch { /* ignora */ } };
  document.querySelector('.topo')?.after(el);
}

// ---------- Itens criados no painel (molduras e banners personalizados) ----------
// Gera o CSS de cada item a partir do banco. Só valores validados entram no CSS.
const COR = /^#[0-9a-fA-F]{6}$/, ID = /^[a-z0-9_]+$/, IMG = /^https:\/\/[A-Za-z0-9.-]+\.supabase\.co\/storage\/v1\/object\/public\/media\/[A-Za-z0-9/_.-]+$/;
// Moldura com imagem: a arte inteira fica por cima da foto, maior que ela (o que passa da borda aparece)
// escala: tamanho da arte em % da foto (100 = do tamanho da foto; padrão 180). x/y: deslocamento em % (−30 a 30)
const faixa = (v, min, max, pad) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : pad; };
export const cssMolduraImagem = (id, st = {}) => {
  const k = (faixa(st.escala, 80, 260, 180) - 100) / 2, x = faixa(st.x, -30, 30, 0), y = faixa(st.y, -30, 30, 0);
  return `.m-${id}.com::before{inset:${-k + y}% ${-k - x}% ${-k - y}% ${-k + x}%;border-radius:0;z-index:2;pointer-events:none;animation:none}.m-${id}.com{padding:0}.m-${id}.com>img{border:0!important}`;
};
export function cssDoItem(c) {
  const st = c.style || {};
  if (!ID.test(c.id)) return '';
  const cores = (st.cores || []).filter((x) => COR.test(x));
  const img = IMG.test(st.imagem || '') ? st.imagem : null;
  const emoji = st.emoji ? `content: "${String(st.emoji).slice(0, 4).replace(/["\\\n]/g, '')}";` : '';
  const vel = Math.min(Math.max(Number(st.velocidade) || 4, 1), 20);
  if (c.kind === 'frame') {
    const anel = img ? `url("${img}") center/100% 100% no-repeat` : cores.length > 1 ? `conic-gradient(${[...cores, cores[0]].join(',')})` : cores[0] || '#ffd33c';
    return `.m-${c.id}{--anel:${anel};${st.animado && !img ? `--anim:girar ${vel}s linear infinite;` : ''}}`
      + (img ? cssMolduraImagem(c.id, st) : '') + (st.brilho ? `.m-${c.id}.com{box-shadow:0 0 14px 2px ${cores[0] || '#ffd33c'}88}` : '')
      + (emoji ? `.m-${c.id}::after{${emoji}}` : '');
  }
  if (c.kind === 'banner') {
    const fundo = img ? `url("${img}") center/cover no-repeat` : cores.length > 1 ? `linear-gradient(135deg,${cores.join(',')})` : cores[0] || '#1b1b21';
    return `.bn-${c.id}{background:${fundo} !important}`;
  }
  return '';
}
// Usa a cópia salva para desenhar na hora e sempre busca a versão atual em seguida (moldura editada aparece no próximo carregamento de página)
async function carregarEstilosItens() {
  let el = document.getElementById('estilos-itens');
  if (!el) { el = document.createElement('style'); el.id = 'estilos-itens'; document.head.append(el); }
  const aplicar = (itens) => { el.textContent = itens.map(cssDoItem).join('\n'); };
  try { const c = JSON.parse(sessionStorage.getItem('cc_itens') || 'null'); if (c?.itens) aplicar(c.itens); } catch { /* ignora */ }
  const { data } = await sb.from('cosmetics').select('id,kind,style').eq('custom', true);
  if (!data) return;
  aplicar(data);
  try { sessionStorage.setItem('cc_itens', JSON.stringify({ em: Date.now(), itens: data })); } catch { /* ignora */ }
}

// ---------- Twitch: quem está ao vivo ----------
export async function aoVivo(logins) {
  const lista = [...new Set(logins.filter((l) => /^[A-Za-z0-9_]{3,25}$/.test(l || '')).map((l) => l.toLowerCase()))].slice(0, 100);
  if (!lista.length) return new Map();
  try {
    const r = await fetch('/.netlify/functions/ao-vivo?logins=' + lista.join(','));
    if (!r.ok) return new Map();
    return new Map((await r.json()).ao_vivo.map((s) => [s.login.toLowerCase(), s]));
  } catch { return new Map(); }
}
export const seloAoVivo = (s, login) => `<a class="ao-vivo" href="https://twitch.tv/${encodeURIComponent(login)}" target="_blank" rel="noopener"
  title="${esc(s.titulo || '')}">🔴 AO VIVO${s.jogo ? ' · ' + esc(s.jogo) : ''}</a>`;

// ---------- Notificações no celular (Web Push) ----------
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
export function pushSuportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export async function estadoPush() {
  if (!pushSuportado()) return 'sem-suporte';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'ativo' : Notification.permission === 'denied' ? 'bloqueado' : 'inativo';
}
export async function ativarPush(uid) {
  if (!pushSuportado()) throw new Error('Este navegador não suporta notificações. No iPhone, instale o app (Compartilhar → Adicionar à Tela de Início) e abra por ele.');
  const r = await fetch('/.netlify/functions/push');
  if (!r.ok) throw new Error('As notificações no celular ainda não foram configuradas pelo administrador.');
  const { publicKey } = await r.json();
  if (await Notification.requestPermission() !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador para este site.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  // Inscrição antiga feita com outra chave (o admin gerou chaves novas): refaz, senão o envio falha em silêncio
  const velha = await reg.pushManager.getSubscription();
  const chave = b64url(publicKey);
  if (velha) {
    const atual = velha.options?.applicationServerKey ? new Uint8Array(velha.options.applicationServerKey) : null;
    if (!atual || atual.length !== chave.length || atual.some((b, i) => b !== chave[i])) await velha.unsubscribe();
  }
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: uid, p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) throw error;
}
// Diagnóstico: manda 2 notificações de teste (direto e pelo banco) e devolve o que está faltando
export async function testarPush() {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch('/.netlify/functions/push?teste=1', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 503) return 'O administrador ainda não colocou as chaves das notificações no Netlify (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e PUSH_SECRET).';
  if (!r.ok) return d.erro || 'Não foi possível testar agora.';
  const p = [];
  if (!d.aparelhos) p.push('Nenhum aparelho seu está inscrito: toque em "🔔 Ativar neste aparelho" no celular.');
  else if (d.enviados) p.push(`✅ Teste 1 enviado para ${d.enviados} aparelho(s).`);
  else p.push('❌ O envio direto falhou (' + d.erros.map((e) => e.status || e.msg).join(', ') + '). A inscrição antiga foi apagada: ative de novo neste aparelho.');
  if (!d.chaves_netlify) p.push('⚠️ Falta PUSH_SECRET (ou as chaves VAPID) no Netlify.');
  if (!d.banco_configurado) p.push('⚠️ O banco não sabe para onde mandar: admin → Site → Notificações → "Gerar chaves e configurar".');
  else {
    if (!d.segredo_igual) p.push('⚠️ O PUSH_SECRET do Netlify é diferente do salvo no banco: as notificações do site não saem. Gere as chaves de novo e atualize o Netlify.');
    if (!d.endereco_certo) p.push(`⚠️ O banco está apontando para outro endereço (${d.endereco_banco}).`);
  }
  if (d.aparelhos && d.enviados && d.chaves_netlify && d.segredo_igual && d.endereco_certo) p.push('Se o Teste 2 não chegar em 1 minuto, falta a extensão pg_net no Supabase (Database → Extensions → pg_net → ativar).');
  return p.join('\n');
}

export async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// ---------- Música do Spotify (perfil, posts e stories) ----------
// Aceita link do Spotify (open.spotify.com/intl-pt/track/ID?si=...) e guarda só "track/ID"
export function spotifyId(link) {
  const m = String(link || '').match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})/);
  return m ? `${m[1]}/${m[2]}` : null;
}
export const spotifyPlayer = (id, alto = false) => /^(track|album|playlist|episode)\/[A-Za-z0-9]{22}$/.test(id || '')
  ? `<iframe class="spotify" src="https://open.spotify.com/embed/${id}?utm_source=controlcritic" height="${alto ? 352 : 80}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Música no Spotify"></iframe>` : '';
// Nota (status de até 60 caracteres) vale por 24 horas
export const notaAtiva = (p) => p?.nota && p.nota_at && Date.now() - new Date(p.nota_at) < 864e5 ? p.nota : null;

// ---------- Música tocando sozinha (como no Instagram), a menos que a pessoa tenha silenciado ----------
// Usa a API oficial do player do Spotify. Preferência guardada no aparelho: cc_som = 'off' quando silenciou.
export const somLigado = () => { try { return localStorage.getItem('cc_som') !== 'off' && volumeSite() > 0; } catch { return true; } };
export const definirSom = (on) => { try { localStorage.setItem('cc_som', on ? 'on' : 'off'); } catch { /* ignora */ } };
let apiSpotify = null, tocandoAgora = null;
function carregarApiSpotify() {
  if (apiSpotify) return apiSpotify;
  apiSpotify = new Promise((ok) => {
    window.onSpotifyIframeApiReady = (IFrameAPI) => ok(IFrameAPI);
    const s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true;
    s.onerror = () => ok(null); document.head.append(s);
  });
  return apiSpotify;
}
// Troca um <div data-spotify="track/ID"> pelo player controlável; tocar = começar já (respeitando o mudo)
// tocar: começar sozinho; ainda(): checado na hora de tocar (evita tocar depois que a pessoa já saiu do story/post)
export async function playerSpotify(el, tocar = false, ainda = () => true) {
  const id = el?.dataset.spotify;
  if (!/^(track|album|playlist|episode)\/[A-Za-z0-9]{22}$/.test(id || '')) return null;
  const api = await carregarApiSpotify();
  if (!api) { el.outerHTML = spotifyPlayer(id); return null; }
  return new Promise((ok) => api.createController(el, { uri: `spotify:${id.replace('/', ':')}`, height: 80, width: '100%' }, (c) => {
    c.addListener('ready', () => { if (tocar && somLigado() && ainda()) tocarSo(c); });
    ok(c);
  }));
}
export function tocarSo(c) { if (tocandoAgora && tocandoAgora !== c) tocandoAgora.pause?.(); tocandoAgora = c; c.play?.(); }
export function pararMusica() { tocandoAgora?.pause?.(); tocandoAgora = null; }
// Pausa e remove o player (o iframe some, então o som para de vez)
export function destruirPlayer(c) { if (!c) return; try { c.pause?.(); c.destroy?.(); } catch { /* já removido */ } if (tocandoAgora === c) tocandoAgora = null; }

// Vídeo (MP4/WebM/MOV) direto para o armazenamento, sem conversão (limite do plano grátis do Supabase: 50 MB por arquivo)
export async function enviarVideo(uid, prefixo, arq, limiteMb = 50) {
  if (!/^video\/(mp4|webm|quicktime)$/.test(arq.type)) throw new Error('Vídeo precisa ser MP4, WebM ou MOV.');
  if (arq.size > limiteMb * 1024 * 1024) throw new Error(`O vídeo deve ter no máximo ${limiteMb} MB (corte um trecho menor ou reduza a qualidade).`);
  const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }[arq.type];
  const caminho = `avatars/${uid}/${prefixo}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('media').upload(caminho, arq, { contentType: arq.type });
  if (error) throw new Error(`Não foi possível enviar o vídeo (${error.message}).`);
  return sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
}


// ---------- Volume geral do site (calls, vídeos dos posts e stories, sons) ----------
// Multiplica o volume de cada som: na call, o volume individual de cada pessoa fica em data-vol-base.
export const volumeSite = () => { try { const v = Number(localStorage.getItem('cc_volume')); return Number.isFinite(v) && localStorage.getItem('cc_volume') !== null ? v / 100 : 0.7; } catch { return 0.7; } };
export function aplicarVolume(el) {
  if (!el || !('volume' in el)) return;
  const base = el.dataset.volBase != null ? Number(el.dataset.volBase) : 1;
  try { el.volume = Math.max(0, Math.min(1, base * volumeSite())); } catch { /* ignora */ }
}
const aplicarEmTodos = () => document.querySelectorAll('audio, video').forEach(aplicarVolume);
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
  if (n.nodeType !== 1) return;
  if (n.matches?.('audio, video')) aplicarVolume(n);
  n.querySelectorAll?.('audio, video').forEach(aplicarVolume);
}))).observe(document.documentElement, { childList: true, subtree: true });
function ligarVolumeTopo(topo) {
  const bt = $('#vol-bt', topo), pop = $('#vol-pop', topo), r = $('#vol-site', topo), n = $('#vol-n', topo);
  if (!bt) return;
  const pintar = () => { const v = Math.round(volumeSite() * 100); r.value = v; n.textContent = v + '%'; bt.textContent = v === 0 ? '🔇' : v < 40 ? '🔉' : '🔊'; };
  pintar();
  bt.onclick = (e) => { e.stopPropagation(); pop.classList.toggle('hidden'); };
  document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target !== bt) pop.classList.add('hidden'); });
  r.oninput = () => { try { localStorage.setItem('cc_volume', r.value); } catch { /* ignora */ } pintar(); aplicarEmTodos(); if (r.value === '0') pararMusica(); };
}
