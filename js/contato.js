import { sb, $, montarLayout, configurado, toast, falha } from './app.js';

await montarLayout();
$('#conteudo').insertAdjacentHTML('beforeend', `
  <h1>Conosco, você tem voz!</h1>
  <form class="cartao" id="form" style="max-width:720px">
    <div class="form-linha">
      <div><label for="nome">Nome</label><input id="nome" required maxlength="100" placeholder="Seu nome completo"></div>
      <div><label for="email">E-mail</label><input id="email" type="email" required placeholder="voce@exemplo.com"></div>
      <div><label for="idade">Idade</label><input id="idade" type="number" min="13" max="120"></div>
    </div>
    <label for="assunto">Assunto</label>
    <select id="assunto"><option value="geral">Dúvida geral</option><option value="sugestao">Sugestão</option><option value="problema">Problema no site</option>
      <option value="privacidade">Privacidade e meus dados (LGPD)</option><option value="parceria">Parceria</option></select>
    <label for="msg">Mensagem ou sugestão</label>
    <textarea id="msg" rows="5" required maxlength="3000" placeholder="Digite sua mensagem..."></textarea>
    <input id="site" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
    <button class="btn" style="margin-top:14px" id="enviar">Enviar</button>
  </form>
  <div class="cartao hidden" id="ok" style="max-width:720px"><h2 style="margin-top:0">Mensagem enviada! ✅</h2><p class="muted">Obrigado! A equipe vai ler e responder pelo seu e-mail.</p></div>
  <p class="muted" style="margin-top:20px">Também queremos sua opinião no
    <a href="https://docs.google.com/forms/d/e/1FAIpQLSd6jZfNU-pgQNmZiEiiO-aKRDpo3KRY_2Ms2a_a1ceqsRBZcg/viewform" target="_blank" rel="noopener noreferrer">nosso Google Forms</a>.</p>`);

$('#form').onsubmit = async (e) => {
  e.preventDefault();
  if ($('#site').value) return; // armadilha para robôs de spam
  if (!configurado) return toast('Supabase não configurado.', true);
  $('#enviar').disabled = true;
  const { error } = await sb.from('contact_messages').insert({
    name: $('#nome').value.trim(), email: $('#email').value.trim(),
    age: $('#idade').value ? Number($('#idade').value) : null, message: $('#msg').value.trim(), subject: $('#assunto').value,
  });
  $('#enviar').disabled = false;
  if (error) return falha(error);
  $('#form').classList.add('hidden'); $('#ok').classList.remove('hidden');
};
