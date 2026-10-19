import { $, montarLayout } from '/js/app.js';

await montarLayout();
const caixa = document.createElement('div');
caixa.className = 'vazio';
const h1 = document.createElement('h1');
h1.textContent = 'Página não encontrada';
const p = document.createElement('p');
p.textContent = 'O link pode estar errado ou a página foi removida.';
const acoes = document.createElement('p');
for (const [href, texto, cls] of [['/index.html', 'Voltar ao início', 'btn'], ['/jogos.html', 'Explorar jogos', 'btn sec']]) {
  const a = document.createElement('a');
  a.href = href; a.className = cls; a.textContent = texto; a.style.margin = '4px';
  acoes.append(a);
}
caixa.append(h1, p, acoes);
$('#conteudo').append(caixa);
