import { sb, $, montarLayout, configurado, param, toast, falha, usuario } from './app.js';

await montarLayout();
const volta = (() => { const v = param('volta') || 'perfil.html'; return /^[a-z]+\.html(\?[\w=&%.-]*)?$/i.test(v) ? v : 'perfil.html'; })();
if (configurado && (await usuario())) location.href = volta;

$('#conteudo').insertAdjacentHTML('beforeend', `
  <div class="cartao" style="max-width:440px;margin:24px auto">
    <div class="abas"><button class="aba ativo" data-m="entrar">Entrar</button><button class="aba" data-m="criar">Criar conta</button></div>
    <form id="form">
      <div id="campo-user" class="hidden"><label for="user">Nome de usuário</label><input id="user" minlength="3" maxlength="30" pattern="[A-Za-z0-9_]+" title="Letras, números e _"></div>
      <label for="email">E-mail</label><input id="email" type="email" required autocomplete="email">
      <label for="senha">Senha</label><input id="senha" type="password" required minlength="8" autocomplete="current-password">
      <label id="campo-termos" class="hidden" style="display:flex;gap:8px;align-items:flex-start;font-weight:400;margin-top:14px">
        <input type="checkbox" id="termos" style="width:auto;margin-top:4px">
        <span>Tenho 13 anos ou mais e li e aceito os <a href="termos.html" target="_blank">Termos de Uso</a> e a
        <a href="privacidade.html" target="_blank">Política de Privacidade</a>.</span></label>
      <button class="btn" style="width:100%;margin-top:16px" id="enviar">Entrar</button>
    </form>
    <p style="margin-top:12px;text-align:center"><a href="#" id="esqueci">Esqueci minha senha</a></p>
  </div>`);

let modo = 'entrar';
document.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
  modo = b.dataset.m;
  document.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
  $('#campo-user').classList.toggle('hidden', modo !== 'criar');
  $('#campo-termos').classList.toggle('hidden', modo !== 'criar');
  $('#termos').required = modo === 'criar';
  $('#user').required = modo === 'criar';
  $('#enviar').textContent = modo === 'criar' ? 'Criar conta' : 'Entrar';
  $('#senha').autocomplete = modo === 'criar' ? 'new-password' : 'current-password';
});
// Link "Criar conta grátis" (entrar.html?modo=cadastro) já abre na aba de cadastro
if (param('modo') === 'cadastro') document.querySelector('.aba[data-m="criar"]')?.click();

$('#form').onsubmit = async (e) => {
  e.preventDefault();
  if (!configurado) return;
  const email = $('#email').value.trim(), password = $('#senha').value;
  $('#enviar').disabled = true;
  try {
    if (modo === 'criar') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username: $('#user').value.trim(), accepted_terms: $('#termos').checked },
        emailRedirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'perfil.html') } });
      if (error) throw error;
      if (!data.session) { toast('Conta criada! Confirme pelo link enviado ao seu e-mail.'); return; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error.message.includes('Invalid') ? new Error('E-mail ou senha incorretos.') : error;
    }
    location.href = volta;
  } catch (err) { falha(err); } finally { $('#enviar').disabled = false; }
};

$('#esqueci').onclick = async (e) => {
  e.preventDefault();
  const email = $('#email').value.trim();
  if (!email) return toast('Digite seu e-mail no campo acima.', true);
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'perfil.html?senha=1') });
  error ? falha(error) : toast('Enviamos um link para redefinir a senha.');
};
