import { sb, $, $$, esc, montarLayout, cardJogo, plural, configurado, param, COLUNAS_CARD, esqueletoCards } from './app.js';

await montarLayout();
const main = $('#conteudo');
const POR_PAGINA = 48;
const PLATAFORMAS = ['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile'];
const ORDENS = { igdb_rating_count: 'Mais populares', avg_rating: 'Mais bem avaliados no Control Critic', igdb_rating: 'Melhor nota da crítica (IGDB)', release_year: 'Lançamentos mais recentes', title: 'Ordem alfabética' };

main.insertAdjacentHTML('beforeend', `
  <h1>Jogos</h1>
  <form class="form-linha busca-catalogo" role="search" id="f-busca" style="margin-bottom:12px">
    <label for="q" class="sr-only">Buscar jogo pelo nome</label>
    <input id="q" type="search" placeholder="🔎 Buscar pelo nome..." autocomplete="off" enterkeyhint="search">
    <label for="ordem" class="sr-only">Ordenar por</label>
    <select id="ordem">${Object.entries(ORDENS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
  </form>
  <div class="chips" id="plats" role="group" aria-label="Plataforma"></div>
  <div class="chips" id="cats" role="group" aria-label="Categoria"></div>
  <div class="controles filtros-ativos hidden" id="ativos" aria-label="Filtros ativos"></div>
  <p class="muted" id="contagem" role="status" aria-live="polite" style="margin-bottom:10px"></p>
  <div class="grade" id="lista" aria-busy="true">${esqueletoCards(8)}</div>
  <div style="text-align:center;margin:20px 0"><button class="btn sec hidden" id="mais">Carregar mais</button></div>
  <p class="muted hidden" id="ampliada" role="status" style="text-align:center">🔎 Procurando "<span id="termo"></span>" em todas as plataformas...</p>`);

// Estado na URL: dá para compartilhar e o "voltar" do navegador mantém a busca
const estado = { q: param('q') || '', cat: param('cat') || '', plat: param('plat') || '', ordem: ORDENS[param('ordem')] ? param('ordem') : 'igdb_rating_count', paginas: Math.min(10, Number(param('p')) || 1) };
let nomesCat = new Map(), ctrl = null, pagina = 0;
const buscados = new Set(); // termos já procurados no catálogo completo

function salvarUrl() {
  const u = new URLSearchParams();
  if (estado.q) u.set('q', estado.q);
  if (estado.cat) u.set('cat', estado.cat);
  if (estado.plat) u.set('plat', estado.plat);
  if (estado.ordem !== 'igdb_rating_count') u.set('ordem', estado.ordem);
  if (pagina > 0) u.set('p', String(pagina + 1));
  history.replaceState(history.state, '', location.pathname + (u.toString() ? '?' + u : ''));
}

function pintarFiltros() {
  $('#q').value = estado.q; $('#ordem').value = estado.ordem;
  $$('#cats .chip').forEach((b) => { const on = b.dataset.c === String(estado.cat); b.classList.toggle('ativo', on); b.setAttribute('aria-pressed', String(on)); });
  $$('#plats .chip').forEach((b) => { const on = b.dataset.p === estado.plat; b.classList.toggle('ativo', on); b.setAttribute('aria-pressed', String(on)); });
  const ativos = [
    estado.q && ['q', `“${estado.q}”`],
    estado.plat && ['plat', estado.plat],
    estado.cat && ['cat', nomesCat.get(Number(estado.cat)) || 'Categoria'],
  ].filter(Boolean);
  $('#ativos').classList.toggle('hidden', !ativos.length);
  $('#ativos').innerHTML = ativos.map(([k, t]) => `<button class="chip ativo" data-tira="${k}" aria-label="Remover filtro ${esc(t)}">${esc(t)} ✕</button>`).join('')
    + (ativos.length > 1 ? '<button class="btn sec pequeno" data-tira="tudo">Limpar filtros</button>' : '');
  $$('#ativos [data-tira]').forEach((b) => b.onclick = () => {
    if (b.dataset.tira === 'tudo') Object.assign(estado, { q: '', cat: '', plat: '' }); else estado[b.dataset.tira] = '';
    carregar();
  });
}

if (configurado) {
  $('#plats').innerHTML = `<button class="chip" data-p="">Todas as plataformas</button>${PLATAFORMAS.map((p) => `<button class="chip" data-p="${p}">${p}</button>`).join('')}`;
  const { data: cats } = await sb.from('categories').select('*').order('name');
  nomesCat = new Map((cats || []).map((c) => [c.id, c.name]));
  $('#cats').innerHTML = `<button class="chip" data-c="">Todas as categorias</button>` +
    (cats || []).map((c) => `<button class="chip" data-c="${Number(c.id)}">${esc(c.name)}</button>`).join('');
  $$('#cats .chip').forEach((b) => b.onclick = () => { estado.cat = b.dataset.c; carregar(); });
  $$('#plats .chip').forEach((b) => b.onclick = () => { estado.plat = b.dataset.p; carregar(); });
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(() => { estado.q = $('#q').value.trim(); carregar(); }, 350); };
  $('#f-busca').onsubmit = (e) => { e.preventDefault(); clearTimeout(t); estado.q = $('#q').value.trim(); carregar(); };
  $('#ordem').onchange = () => { estado.ordem = $('#ordem').value; carregar(); };
  $('#mais').onclick = () => carregar(true);
  // Volta para a mesma página de resultados e posição depois de abrir um jogo
  await carregar(false, estado.paginas);
  const pos = Number(sessionStorage.getItem('cc_jogos_scroll') || 0);
  if (pos && sessionStorage.getItem('cc_jogos_url') === location.search) scrollTo(0, pos);
  addEventListener('pagehide', () => { try { sessionStorage.setItem('cc_jogos_scroll', String(scrollY)); sessionStorage.setItem('cc_jogos_url', location.search); } catch { /* ignora */ } });
}

async function carregar(continuar = false, quantasPaginas = 1) {
  pagina = continuar ? pagina + 1 : 0;
  pintarFiltros();
  // Cancela a busca anterior: só a resposta mais recente aparece
  ctrl?.abort(); ctrl = new AbortController();
  const de = pagina * POR_PAGINA, ate = (pagina + quantasPaginas) * POR_PAGINA - 1;
  if (!continuar) { $('#lista').setAttribute('aria-busy', 'true'); if (!$('#lista').children.length || estado.q) $('#lista').innerHTML = esqueletoCards(8); }
  let q = sb.from('games').select(COLUNAS_CARD, { count: 'exact' })
    .order(estado.ordem, { ascending: estado.ordem === 'title', nullsFirst: false })
    .order('igdb_rating_count', { ascending: false, nullsFirst: false })
    .range(de, ate).abortSignal(ctrl.signal);
  const termo = estado.q.replace(/[%,()]/g, '');
  if (termo) q = q.ilike('title', `%${termo}%`);
  if (estado.cat) q = q.contains('category_ids', [Number(estado.cat)]);
  if (estado.plat) q = q.contains('platforms', [estado.plat]);
  const { data, error, count } = await q;
  if (error?.name === 'AbortError' || /abort/i.test(error?.message || '')) return;
  $('#lista').setAttribute('aria-busy', 'false');
  if (error) {
    $('#lista').innerHTML = '<p class="vazio" role="alert">Não foi possível carregar os jogos. <button class="btn sec pequeno" id="tentar">Tentar de novo</button></p>';
    $('#tentar').onclick = () => carregar();
    return;
  }
  pagina += quantasPaginas - 1;
  const html = data.map(cardJogo).join('');
  if (continuar) $('#lista').insertAdjacentHTML('beforeend', html);
  else $('#lista').innerHTML = html || `<div class="vazio"><p>Nenhum jogo encontrado${termo ? ` para “${esc(termo)}”` : ''}.</p>
    ${estado.q || estado.cat || estado.plat ? '<button class="btn sec pequeno" id="limpar-vazio">Limpar filtros</button>' : ''}</div>`;
  $('#limpar-vazio')?.addEventListener('click', () => { Object.assign(estado, { q: '', cat: '', plat: '' }); carregar(); });
  $('#contagem').textContent = plural(count ?? 0, 'jogo encontrado', 'jogos encontrados');
  $('#mais').classList.toggle('hidden', (pagina + 1) * POR_PAGINA >= (count ?? 0));
  salvarUrl();

  // Poucos resultados? Busca no catálogo completo, que adiciona os jogos sozinho, e recarrega
  if (!continuar && termo.length >= 2 && (count ?? 0) < 6 && !buscados.has(termo.toLowerCase())) buscarCompleto(termo);
}

async function buscarCompleto(termo) {
  buscados.add(termo.toLowerCase());
  $('#termo').textContent = termo;
  $('#ampliada').classList.remove('hidden');
  try {
    const r = await fetch(`/.netlify/functions/buscar-jogo?q=${encodeURIComponent(termo)}`);
    const dados = await r.json().catch(() => ({}));
    if (r.ok && dados.adicionados > 0 && estado.q === termo) carregar();
  } catch { /* sem conexão com a função: fica só com o catálogo local */ } finally {
    $('#ampliada').classList.add('hidden');
  }
}
