import { sb, $, esc, montarLayout, configurado, data, urlSegura, traduzirNoNavegador } from './app.js';

await montarLayout();
const main = $('#conteudo');
main.insertAdjacentHTML('beforeend', `<h1>Novidades</h1>
  <div class="chips"><button class="chip ativo" data-f="">Todas</button><button class="chip" data-f="equipe">Da equipe</button><button class="chip" data-f="oficial">Oficiais</button></div>
  <div class="lista" id="lista"></div>`);

let filtro = '';
document.querySelectorAll('.chip').forEach((b) => b.onclick = () => {
  filtro = b.dataset.f; document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('ativo', x === b)); carregar();
});
if (configurado) carregar();

async function carregar() {
  let q = sb.from('news').select('*, games(slug,title)').eq('published', true).order('created_at', { ascending: false }).limit(50);
  if (filtro === 'equipe') q = q.is('source', null);
  if (filtro === 'oficial') q = q.not('source', 'is', null);
  const { data: news } = await q;
  $('#lista').innerHTML = (news || []).map((n) => `
    <article class="cartao" id="n${n.id}">
      ${n.cover_url ? `<img src="${urlSegura(n.cover_url)}" alt="" style="border-radius:10px;margin-bottom:10px;max-height:280px;object-fit:cover;width:100%">` : ''}
      <span class="muted">${data(n.created_at)} · ${n.source ? esc(n.source) : 'Equipe Control Critic'}</span>
      <h2 class="h3">${esc(n.title)}</h2>${n.lang === 'en' ? `<button class="btn sec pequeno" data-trad="${n.id}" style="margin:4px 0">🌐 Traduzir</button>` : ''}
      ${n.games ? `<p><a class="tag" href="jogo.html?slug=${encodeURIComponent(n.games.slug)}">${esc(n.games.title)}</a></p>` : ''}
      <p class="quebra">${esc(n.source ? (n.summary || '') : n.body)}</p>
      ${n.source_url ? `<p style="margin-top:8px"><a href="${urlSegura(n.source_url)}" target="_blank" rel="noopener noreferrer">Ler na fonte oficial →</a></p>` : ''}
    </article>`).join('') || '<p class="vazio">Nenhuma notícia ainda.</p>';
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  document.querySelectorAll('[data-trad]').forEach((b) => b.onclick = async () => {
    const art = b.closest('article'), h = art.querySelector('h3'), p = art.querySelector('p.quebra');
    b.disabled = true; b.textContent = 'Traduzindo...';
    const [t1, t2] = await Promise.all([traduzirNoNavegador(h.textContent), p?.textContent ? traduzirNoNavegador(p.textContent) : null]);
    if (!t1) { b.textContent = 'Seu navegador não traduz automaticamente (use o Chrome atualizado)'; return; }
    h.textContent = t1; if (t2) p.textContent = t2; b.remove();
  });
}
