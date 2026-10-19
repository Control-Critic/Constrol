import { sb, $, $$, esc, montarLayout, configurado, urlSegura, srcCapa } from './app.js';

await montarLayout();
const main = $('#conteudo');
const POR_PAGINA = 48;
const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

main.insertAdjacentHTML('beforeend', `<h1>Promoções</h1>
  <p class="muted">Preços da Steam de todo o catálogo atualizados automaticamente várias vezes ao dia. Ofertas de outras lojas são cadastradas pela equipe.</p>
  <div class="form-linha" style="margin:14px 0">
    <input id="q" type="search" placeholder="Buscar jogo em promoção...">
    <label for="ordem" class="sr-only">Ordenar promoções</label><select id="ordem">
      <option value="desconto">Maior desconto</option>
      <option value="populares">Mais populares</option>
      <option value="menor">Menor preço</option>
      <option value="recentes">Atualizadas recentemente</option>
    </select>
  </div>
  <div class="chips" id="faixas">${[[0, 'Todas'], [50, '50% ou mais'], [75, '75% ou mais']].map(([v, t]) => `<button class="chip" data-min="${v}">${t}</button>`).join('')}
    <span style="width:12px"></span>${[[0, 'Qualquer preço'], [2000, 'Até R$ 20'], [5000, 'Até R$ 50'], [10000, 'Até R$ 100']].map(([v, t]) => `<button class="chip" data-max="${v}">${t}</button>`).join('')}</div>
  <p class="muted" id="contagem" style="margin-bottom:10px"></p>
  <div class="grade" id="lista"></div>
  <div style="text-align:center;margin:20px 0"><button class="btn sec hidden" id="mais">Carregar mais</button></div>`);

let min = 0, max = 0, pagina = 0;
if (configurado) {
  $$('[data-min]').forEach((b) => b.onclick = () => { min = Number(b.dataset.min); carregar(); });
  $$('[data-max]').forEach((b) => b.onclick = () => { max = Number(b.dataset.max); carregar(); });
  $('#ordem').onchange = () => carregar();
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 350); };
  $('#mais').onclick = () => carregar(true);
  carregar();
}

async function carregar(continuar = false) {
  pagina = continuar ? pagina + 1 : 0;
  $$('[data-min]').forEach((b) => b.classList.toggle('ativo', Number(b.dataset.min) === min));
  $$('[data-max]').forEach((b) => b.classList.toggle('ativo', Number(b.dataset.max) === max));
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  // !inner: filtra pelos campos do jogo (busca por nome)
  let q = sb.from('deals').select('*, games!inner(slug,title,cover_url,igdb_rating_count)', { count: 'exact' }).gt('discount_pct', Math.max(min - 1, 0));
  if (max) q = q.lte('price_cents', max);
  if (termo) q = q.ilike('games.title', `%${termo}%`);
  const ordem = $('#ordem').value;
  if (ordem === 'desconto') q = q.order('discount_pct', { ascending: false });
  if (ordem === 'menor') q = q.order('price_cents', { ascending: true, nullsFirst: false });
  if (ordem === 'recentes') q = q.order('updated_at', { ascending: false });
  if (ordem === 'populares') q = q.order('games(igdb_rating_count)', { ascending: false, nullsFirst: false }); // ordena as promoções pelo jogo (relação 1:1)
  q = q.order('id').range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

  const { data: deals, count, error } = await q;
  if (error) { $('#lista').innerHTML = '<p class="vazio">Erro ao carregar promoções.</p>'; return; }
  const html = deals.map((d) => `
    <div class="jogo-card">
      <a href="jogo.html?slug=${encodeURIComponent(d.games.slug)}" tabindex="-1" aria-hidden="true"><img ${srcCapa(d.games.cover_url, 480)} alt="" loading="lazy"></a>
      <div class="info">
        <a class="titulo" href="jogo.html?slug=${encodeURIComponent(d.games.slug)}" style="color:var(--texto)">${esc(d.games.title)}</a>
        <span><span class="tag amarela">-${d.discount_pct}%</span> <span class="tag">${esc(d.store)}</span></span>
        <span>${d.price_cents != null ? `<strong>${reais(d.price_cents)}</strong>` : ''} ${d.original_cents ? `<s class="muted">${reais(d.original_cents)}</s>` : ''}</span>
        ${d.ends_at ? `<span class="muted">Até ${new Date(d.ends_at).toLocaleDateString('pt-BR')}</span>` : ''}
        ${d.url ? `<a class="btn pequeno" href="${urlSegura(d.url)}" target="_blank" rel="noopener noreferrer">Ver na loja</a>` : ''}
      </div>
    </div>`).join('');
  if (continuar) $('#lista').insertAdjacentHTML('beforeend', html);
  else $('#lista').innerHTML = html || '<p class="vazio">Nenhuma promoção com esses filtros.</p>';
  $('#contagem').textContent = (count === 1 ? '1 promoção ativa' : `${(count ?? 0).toLocaleString('pt-BR')} promoções ativas`);
  $('#mais').classList.toggle('hidden', (pagina + 1) * POR_PAGINA >= (count ?? 0));
}
