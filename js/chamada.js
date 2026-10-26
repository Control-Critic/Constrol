// Call em janela separada: a pessoa continua navegando pelo site na janela principal
import { $, esc, configurado, exigirLogin, perfil, param } from './app.js';
import { montarCall } from './chamada-ui.js';

const main = $('#conteudo');
const sala = param('sala'), titulo = param('titulo') || 'Call';
// Login primeiro, sempre: o endereço não decide se a página exige conta
const u = configurado ? await exigirLogin() : null;
if (u && sala && /^[\w-]{1,120}$/.test(sala)) {
  document.title = `🔊 ${titulo} | Control Critic`;
  main.innerHTML = `<h2 style="margin:0 0 6px">🔊 ${esc(titulo)}</h2><div id="call-box"></div>`;
  const call = montarCall($('#call-box'), { salaId: sala, u, p: await perfil(), titulo, janela: true,
    descricao: 'Deixe esta janela aberta: a call continua enquanto você navega pelo site na outra janela.' });
  $('#call-box [data-v="entrar"]')?.click();
  addEventListener('pagehide', () => call.sair());
} else if (u || !configurado) main.innerHTML = '<p class="vazio">Call não encontrada.</p>';
