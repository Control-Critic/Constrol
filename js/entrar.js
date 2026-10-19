import { sb, $, montarLayout, configurado, param, toast, usuario } from './app.js';

await montarLayout();
// Retorno seguro: só páginas do próprio site (com ?parâmetros e #âncora opcionais)
const volta = (() => { const v = param('volta') || 'perfil.html'; return /^[a-z]+\.html(\?[\w=&%.-]*)?(#[\w-]*)?$/i.test(v) ? v : 'perfil.html'; })();
const modoInicial = { cadastro: 'criar', recuperar: 'recuperar', 'nova-senha': 'nova-senha' }[param('modo')] || 'entrar';
if (configurado && modoInicial !== 'nova-senha' && (await usuario())) location.href = volta;
const pasta = location.origin + location.pathname.replace(/[^/]*$/, '');

$('#conteudo').insertAdjacentHTML('beforeend', `
  <div class="cartao entrar" style="max-width:460px;margin:24px auto">
    <h1 class="sr-only" id="titulo-entrar">Entrar no Control Critic</h1>
    <div class="abas" role="tablist" aria-label="Entrar ou criar conta" id="abas-entrar">
      <button class="aba" role="tab" id="aba-entrar" data-m="entrar" aria-controls="painel-entrar" aria-selected="false">Entrar</button>
      <button class="aba" role="tab" id="aba-criar" data-m="criar" aria-controls="painel-entrar" aria-selected="false">Criar conta</button>
    </div>
    <div role="tabpanel" id="painel-entrar" aria-labelledby="aba-entrar"><form id="form" novalidate>
      <h2 id="titulo-modo" class="titulo-modo hidden"></h2>
      <p id="dica-modo" class="muted hidden"></p>
      <div id="campo-user" class="campo hidden">
        <label for="user">Nome de usuário</label>
        <input id="user" minlength="3" maxlength="30" autocomplete="username" spellcheck="false" autocapitalize="none" aria-describedby="user-ajuda user-erro">
        <small id="user-ajuda" class="muted">3 a 30 caracteres: letras, números e _</small>
        <p class="erro-campo" id="user-erro"></p>
      </div>
      <div id="campo-email" class="campo">
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" autocapitalize="none" aria-describedby="email-erro">
        <p class="erro-campo" id="email-erro"></p>
      </div>
      <div id="campo-senha" class="campo">
        <label for="senha">Senha</label>
        <div class="senha-caixa">
          <input id="senha" type="password" autocomplete="current-password" aria-describedby="senha-req senha-erro">
          <button type="button" class="btn sec pequeno" id="ver-senha" aria-pressed="false" aria-controls="senha">Mostrar</button>
        </div>
        <ul id="senha-req" class="senha-req hidden" aria-label="Requisitos da senha">
          <li data-r="tam">Pelo menos 8 caracteres</li>
          <li data-r="letra">Uma letra</li>
          <li data-r="num">Um número</li>
        </ul>
        <p class="erro-campo" id="senha-erro"></p>
      </div>
      <div id="campo-termos" class="campo hidden">
        <label class="check" style="align-items:flex-start;font-weight:400">
          <input type="checkbox" id="termos" style="width:auto;margin-top:4px" aria-describedby="termos-erro">
          <span>Tenho 13 anos ou mais e li e aceito os <a href="termos.html" target="_blank" rel="noopener">Termos de Uso</a>, as
          <a href="diretrizes.html" target="_blank" rel="noopener">Diretrizes</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label>
        <p class="erro-campo" id="termos-erro"></p>
      </div>
      <button class="btn" style="width:100%;margin-top:16px" id="enviar">Entrar</button>
      <p id="status" class="status-entrar" role="status" aria-live="polite"></p>
    </form></div>
    <div id="links-extra" class="links-entrar">
      <button type="button" class="link" id="ir-recuperar">Esqueci minha senha</button>
      <button type="button" class="link" id="ir-link">Entrar com um link no e-mail</button>
    </div>
    <div id="reenviar" class="hidden" style="margin-top:12px;text-align:center">
      <button type="button" class="btn sec pequeno" id="bt-reenviar">Reenviar e-mail de confirmação</button>
    </div>
  </div>`);

const MODOS = {
  entrar: { botao: 'Entrar', aba: 'entrar' },
  criar: { botao: 'Criar conta grátis', aba: 'criar' },
  recuperar: { botao: 'Enviar link de recuperação', titulo: 'Recuperar senha', dica: 'Digite o e-mail da sua conta. Enviamos um link para você criar uma senha nova.' },
  link: { botao: 'Enviar link de acesso', titulo: 'Entrar com link', dica: 'Enviamos um link para o seu e-mail. É só abrir para entrar, sem senha.' },
  'nova-senha': { botao: 'Salvar nova senha', titulo: 'Criar uma senha nova', dica: 'Escolha a senha nova da sua conta.' },
};
let modo = 'entrar';
const mostrar = (id, sim) => $(id).classList.toggle('hidden', !sim);
const status = (t, erro = false) => { $('#status').textContent = t; $('#status').classList.toggle('erro', erro); };

function trocarModo(m, focar = true) {
  modo = m;
  const cfg = MODOS[m];
  document.querySelectorAll('#abas-entrar .aba').forEach((x) => {
    const ativo = x.dataset.m === cfg.aba;
    x.classList.toggle('ativo', ativo); x.setAttribute('aria-selected', String(ativo)); x.tabIndex = ativo || (!cfg.aba && x.dataset.m === 'entrar') ? 0 : -1;
  });
  if (cfg.aba) $('#painel-entrar').setAttribute('aria-labelledby', `aba-${cfg.aba}`);
  mostrar('#abas-entrar', !!cfg.aba);
  mostrar('#titulo-modo', !!cfg.titulo); $('#titulo-modo').textContent = cfg.titulo || '';
  mostrar('#dica-modo', !!cfg.dica); $('#dica-modo').textContent = cfg.dica || '';
  // Só os campos da ação atual aparecem
  mostrar('#campo-user', m === 'criar');
  mostrar('#campo-termos', m === 'criar');
  mostrar('#campo-email', m !== 'nova-senha');
  mostrar('#campo-senha', ['entrar', 'criar', 'nova-senha'].includes(m));
  mostrar('#senha-req', ['criar', 'nova-senha'].includes(m));
  mostrar('#links-extra', ['entrar', 'criar'].includes(m) || m === 'recuperar' || m === 'link');
  $('#ir-recuperar').textContent = m === 'entrar' || m === 'criar' ? 'Esqueci minha senha' : '← Voltar para entrar';
  mostrar('#ir-link', m === 'entrar');
  $('#senha').autocomplete = m === 'entrar' ? 'current-password' : 'new-password';
  $('#enviar').textContent = cfg.botao;
  document.querySelectorAll('.erro-campo').forEach((x) => { x.textContent = ''; });
  document.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
  status('');
  if (focar) (m === 'criar' ? $('#user') : m === 'nova-senha' ? $('#senha') : $('#email')).focus();
}

// Abas acessíveis: clique, setas e Home/End
const abas = [...document.querySelectorAll('#abas-entrar .aba')];
abas.forEach((b, i) => {
  b.onclick = () => trocarModo(b.dataset.m);
  b.onkeydown = (e) => {
    const alvo = { ArrowRight: abas[(i + 1) % abas.length], ArrowLeft: abas[(i - 1 + abas.length) % abas.length], Home: abas[0], End: abas.at(-1) }[e.key];
    if (alvo) { e.preventDefault(); alvo.focus(); trocarModo(alvo.dataset.m, false); }
  };
});
$('#ir-recuperar').onclick = () => trocarModo(modo === 'entrar' || modo === 'criar' ? 'recuperar' : 'entrar');
$('#ir-link').onclick = () => trocarModo('link');

// Mostrar/ocultar senha
$('#ver-senha').onclick = () => {
  const ver = $('#senha').type === 'password';
  $('#senha').type = ver ? 'text' : 'password';
  $('#ver-senha').textContent = ver ? 'Ocultar' : 'Mostrar';
  $('#ver-senha').setAttribute('aria-pressed', String(ver));
};

// Requisitos da senha atualizados enquanto digita
const REQ = { tam: (v) => v.length >= 8, letra: (v) => /[A-Za-zÀ-ú]/.test(v), num: (v) => /\d/.test(v) };
$('#senha').addEventListener('input', () => {
  for (const li of document.querySelectorAll('#senha-req li')) li.classList.toggle('ok', REQ[li.dataset.r]($('#senha').value));
});

// Validação: cada campo com mensagem própria; foco no primeiro inválido
function validar() {
  const erros = [];
  const marcar = (campo, msg) => { $(`#${campo}-erro`).textContent = msg; $(`#${campo === 'termos' ? 'termos' : campo}`).setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg) erros.push(campo); };
  if (modo === 'criar') {
    const u = $('#user').value.trim();
    marcar('user', !u ? 'Escolha um nome de usuário.' : !/^[A-Za-z0-9_]{3,30}$/.test(u) ? 'Use de 3 a 30 letras, números ou _.' : '');
  }
  if (modo !== 'nova-senha') {
    const e = $('#email').value.trim();
    marcar('email', !e ? 'Digite seu e-mail.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? 'Esse e-mail não parece válido.' : '');
  }
  if (['entrar', 'criar', 'nova-senha'].includes(modo)) {
    const senha = $('#senha').value;
    marcar('senha', !senha ? 'Digite sua senha.' : modo !== 'entrar' && !Object.values(REQ).every((regra) => regra(senha)) ? 'A senha precisa de 8 caracteres, com letra e número.' : '');
  }
  if (modo === 'criar') marcar('termos', $('#termos').checked ? '' : 'Para criar a conta, confirme a idade e aceite os termos.');
  if (erros.length) $(`#${erros[0]}`).focus();
  return !erros.length;
}

// Reenvio de e-mail com espera (evita spam e o limite do provedor de e-mail)
let esperaAte = 0, emailPendente = '';
function liberarReenvio(email) {
  emailPendente = email; esperaAte = Date.now() + 60_000;
  mostrar('#reenviar', true);
  const bt = $('#bt-reenviar');
  const tic = () => { const s = Math.ceil((esperaAte - Date.now()) / 1000); bt.disabled = s > 0; bt.textContent = s > 0 ? `Reenviar e-mail (${s} s)` : 'Reenviar e-mail de confirmação'; if (s > 0) setTimeout(tic, 1000); };
  tic();
}
$('#bt-reenviar').onclick = async () => {
  if (Date.now() < esperaAte || !emailPendente) return;
  const { error } = await sb.auth.resend({ type: 'signup', email: emailPendente, options: { emailRedirectTo: pasta + 'perfil.html' } });
  if (error) status('Não foi possível reenviar agora. Tente de novo em alguns minutos.', true);
  else { status('E-mail reenviado. Confira também o spam.'); liberarReenvio(emailPendente); }
};

let enviando = false;
$('#form').onsubmit = async (e) => {
  e.preventDefault();
  if (!configurado || enviando || !validar()) return;
  enviando = true;
  const bt = $('#enviar'), textoBt = bt.textContent;
  bt.disabled = true; bt.setAttribute('aria-busy', 'true');
  const email = $('#email').value.trim(), password = $('#senha').value;
  try {
    if (modo === 'criar') {
      bt.textContent = 'Criando sua conta...';
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username: $('#user').value.trim(), accepted_terms: $('#termos').checked }, emailRedirectTo: pasta + 'perfil.html' } });
      if (error) throw error;
      // Mesma mensagem com ou sem conta já existente (não revela quem está cadastrado)
      if (!data.session) { status(`Pronto! Se ${email} ainda não tinha conta, enviamos um link de confirmação. Abra o e-mail para ativar (confira o spam).`); liberarReenvio(email); return; }
    } else if (modo === 'entrar') {
      bt.textContent = 'Entrando...';
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (/not confirmed/i.test(error.message)) { liberarReenvio(email); throw new Error('Confirme seu e-mail pelo link que enviamos antes de entrar.'); }
        throw new Error(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : /rate|many/i.test(error.message) ? 'Muitas tentativas. Espere um pouco e tente de novo.' : 'Não foi possível entrar agora. Tente de novo.');
      }
    } else if (modo === 'recuperar') {
      bt.textContent = 'Enviando...';
      await sb.auth.resetPasswordForEmail(email, { redirectTo: pasta + 'entrar.html?modo=nova-senha' });
      // Sempre a mesma resposta (não revela se o e-mail tem conta)
      status(`Se existir uma conta com ${email}, enviamos um link para criar uma senha nova. Confira também o spam.`);
      return;
    } else if (modo === 'link') {
      bt.textContent = 'Enviando...';
      await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: pasta + volta } });
      status(`Se existir uma conta com ${email}, enviamos um link de acesso. Ele vale por pouco tempo.`);
      return;
    } else if (modo === 'nova-senha') {
      bt.textContent = 'Salvando...';
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(/same|different/i.test(error.message) ? 'A senha nova precisa ser diferente da anterior.' : 'O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
      toast('Senha alterada!');
    }
    status('Tudo certo! Redirecionando...');
    location.href = volta;
  } catch (err) {
    status(err.message || 'Algo deu errado. Tente de novo.', true);
  } finally {
    enviando = false; bt.disabled = false; bt.removeAttribute('aria-busy'); if (bt.textContent.endsWith('...')) bt.textContent = textoBt;
  }
};

// Link de recuperação: o Supabase entra na conta temporariamente e trazemos para cá
sb?.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') trocarModo('nova-senha'); });
trocarModo(modoInicial, false);
if (modoInicial === 'nova-senha' && configurado && !(await usuario())) status('Abra o link mais recente enviado ao seu e-mail para criar a senha nova.', true);
