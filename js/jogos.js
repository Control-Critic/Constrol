import { sb, $, $$, esc, montarLayout, cardJogo, plural, configurado, param, COLUNAS_CARD } from './app.js';

await montarLayout();
const main = $('#conteudo');
const POR_PAGINA = 48;
const PLATAFORMAS = ['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile'];

main.insertAdjacentHTML('beforeend', `
  <h1>Jogos</h1>
  <div class="form-linha" style="margin-bottom:12px">
    <input id="q" type="search" placeholder="Buscar pelo nome..." value="${esc(param('q') || '')}">
    <select id="ordem">
      <option value="igdb_rating_count">Mais populares</option>
      <option value="avg_rating">Mais bem avaliados no Control Critic</option>
      <option value="igdb_rating">Melhor nota da crítica</option>
      <option value="release_year">Lançamentos mais recentes</option>
      <option value="title">Ordem alfabética</option>
    </select>
  </div>
  <div class="chips" id="plats"><button class="chip" data-p="">Todas as plataformas</button>${PLATAFORMAS.map((p) => `<button class="chip" data-p="${p}">${p}</button>`).join('')}</div>
  <div class="chips" id="cats"></div>
  <p class="muted" id="contagem" style="margin-bottom:10px"></p>
  <div class="grade" id="lista"></div>
  <div style="text-align:center;margin:20px 0"><button class="btn sec hidden" id="mais">Carregar mais</button></div>
  <p class="muted hidden" id="ampliada" style="text-align:center">🔎 Procurando "<span id="termo"></span>" em todas as plataformas...</p>`);

let cat = param('cat') || '', plat = param('plat') || '', pagina = 0;
const buscados = new Set(); // termos já procurados no catálogo completo
if (configurado) {
  const { data: cats } = await sb.from('categories').select('*').order('name');
  $('#cats').innerHTML = `<button class="chip" data-c="">Todas as categorias</button>` +
    (cats || []).map((c) => `<button class="chip" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  $$('#cats .chip').forEach((b) => b.onclick = () => { cat = b.dataset.c; carregar(); });
  $$('#plats .chip').forEach((b) => b.onclick = () => { plat = b.dataset.p; carregar(); });
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 350); };
  $('#ordem').onchange = () => carregar();
  $('#mais').onclick = () => carregar(true);
  carregar();
}

async function carregar(continuar = false) {
  pagina = continuar ? pagina + 1 : 0;
  $$('#cats .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.c === String(cat)));
  $$('#plats .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.p === plat));
  const ordem = $('#ordem').value;
  let q = sb.from('games').select(COLUNAS_CARD, { count: 'exact' })
    .order(ordem, { ascending: ordem === 'title', nullsFirst: false })
    .order('igdb_rating_count', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  if (termo) q = q.ilike('title', `%${termo}%`);
  if (cat) q = q.contains('category_ids', [Number(cat)]);
  if (plat) q = q.contains('platforms', [plat]);
  const { data, error, count } = await q;
  if (error) { $('#lista').innerHTML = '<p class="vazio">Erro ao carregar.</p>'; return; }

  const html = data.map(cardJogo).join('');
  if (continuar) $('#lista').insertAdjacentHTML('beforeend', html);
  else $('#lista').innerHTML = html || '<p class="vazio">Nenhum jogo encontrado no Control Critic.</p>';
  $('#contagem').textContent = plural(count ?? 0, 'jogo');
  $('#mais').classList.toggle('hidden', (pagina + 1) * POR_PAGINA >= (count ?? 0));

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
    if (r.ok && dados.adicionados > 0 && $('#q').value.trim() === termo) carregar();
  } catch { /* sem conexão com a função: fica só com o catálogo local */ } finally {
    $('#ampliada').classList.add('hidden');
  }
}
