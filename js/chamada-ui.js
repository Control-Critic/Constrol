// Interface da call (usada nas comunidades e na call entre amigos)
import { sb, $, esc, falha, toast, statusCall, aplicarVolume, contarEvento, enviarVideo } from './app.js';
import { SalaVoz } from './voz.js';
import { preEntrar } from './pre-call.js';
import { Clipador, clipesSuportados } from './clipes.js';
import { prefsAudio, salvarPrefsAudio, processarMic, restricoesMic, definirSaida } from './audio-mic.js';

export function montarCall(box, { salaId, u, p, descricao = '', titulo = 'Call', janela = false }) {
  box.innerHTML = `
    ${descricao ? `<p class="muted">${descricao}</p>` : ''}
    <div class="controles" style="margin:12px 0">
      <button class="btn" data-v="entrar">🔊 Entrar na call</button>
      <button class="btn sec hidden" data-v="mudo">🎤 Silenciar</button>
      <button class="btn sec hidden" data-v="cam">📷 Câmera</button>
      <button class="btn sec hidden" data-v="tela">🖥️ Compartilhar tela</button>
      <button class="btn sec hidden" data-v="musica" title="Toca para todos o som de uma aba do navegador (ex.: Spotify em open.spotify.com), junto com a tela do jogo">🎵 Tocar música</button>
      <button class="btn sec hidden" data-v="som">🔈 Ativar som</button>
      <button class="btn sec" data-v="cfg-audio" title="Microfone, supressão de ruído e eco">⚙️ Áudio</button>
      ${janela ? '' : '<button class="btn sec" data-v="popout" title="Abre a call numa janela separada: você continua navegando pelo site sem cair">🗗 Abrir em janela</button>'}
      <button class="btn sec hidden" data-v="clipes" title="Grava em segundo plano a tela/câmera em destaque e as vozes. Os outros veem um aviso.">✂️ Clipes</button>
      <button class="btn hidden" data-v="clipar" title="Salva os últimos 30 a 60 segundos">🎬 Clipar</button>
      <button class="btn sec hidden" data-v="diag" title="Copia um resumo técnico da conexão (sem dados pessoais) para mandar ao suporte">📋 Diagnóstico</button>
      <button class="btn perigo hidden" data-v="sair">Sair da call</button>
    </div>
    <div class="opcoes-tela cartao hidden painel-audio" data-v="audio">
      <strong>⚙️ Áudio</strong>
      <div class="form-linha" style="margin-top:8px">
        <label>🎤 Microfone <select data-v="a-mic"><option value="">Padrão do sistema</option></select></label>
        <label>🎧 Saída (fone/caixa) <select data-v="a-saida"><option value="">Padrão do sistema</option></select></label>
      </div>
      <label class="op-check"><input type="checkbox" data-a="ruidoIA"> <span><strong>Supressão de ruído por IA</strong> (recomendado): remove teclado, ventilador, barulho de rua e vozes ao fundo</span></label>
      <div class="sens">
        <div class="controles" style="justify-content:space-between;align-items:center"><strong>Sensibilidade de entrada</strong>
          <label class="op-check" style="margin:0"><input type="checkbox" data-a="autoSens"> Automática</label></div>
        <div class="medidor" data-v="medidor" title="Seu volume agora. Abaixo da linha amarela o microfone fica mudo."><span class="nivel"></span><span class="limite"></span></div>
        <input type="range" min="-80" max="-20" step="1" data-v="a-sens" aria-label="Sensibilidade de entrada">
        <p class="muted" style="font-size:.8rem">Fale normalmente: a barra deve passar da linha amarela. Arraste para a direita se o microfone pega barulho quando você está calado.</p>
      </div>
      <div class="controles" style="align-items:center;gap:14px">
        <label class="op-check"><input type="radio" name="modo-mic" value="voz"> Detecção de voz</label>
        <label class="op-check"><input type="radio" name="modo-mic" value="ptt"> Apertar para falar</label>
        <button type="button" class="btn sec pequeno" data-v="a-tecla">Tecla: V</button>
      </div>
      <p class="muted" style="font-size:.78rem" data-v="a-tecla-aviso">"Apertar para falar" funciona com esta aba (ou a janela da call) em foco. Para usar enquanto joga, abra a call em janela (🗗) e deixe-a por cima.</p>
      <label class="op-check"><input type="checkbox" data-a="eco"> Cancelamento de eco (deixe ligado se estiver sem fone)</label>
      <label class="op-check"><input type="checkbox" data-a="ganho"> Ajuste automático de volume do microfone</label>
      <p class="muted" style="font-size:.8rem;margin-top:6px">💡 Não fique na call do site e na do Discord ao mesmo tempo. Ao compartilhar a tela com som, prefira uma <strong>aba</strong> ou a <strong>janela do jogo</strong>.</p>
      <div class="controles" style="margin-top:8px"><button type="button" class="btn sec pequeno" data-v="a-ouvir">🎧 Ouvir meu microfone</button>
        <button class="btn pequeno" data-v="a-ok">Aplicar</button><button class="btn sec pequeno" data-v="a-fechar">Fechar</button></div>
    </div>
    <div class="opcoes-tela cartao hidden" data-v="opcoes">
      <strong>Compartilhar tela</strong>
      <div class="form-linha" style="margin-top:8px">
        <label>Tipo <select data-v="o-tipo"><option value="jogo">🎮 Jogo / vídeo (mais fluido)</option><option value="texto">📄 Texto / código (mais nítido)</option></select></label>
        <label>Qualidade <select data-v="o-alt"><option value="720">720p</option><option value="1080" selected>1080p</option></select></label>
        <label>Quadros <select data-v="o-fps"><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-v="o-som" checked style="width:auto"> Incluir o som (jogo/aba). As vozes desta call nunca vão junto (Chrome 141 ou mais novo).</label>
      <p class="muted" style="font-size:.78rem;margin:2px 0 0 24px">Tela inteira leva o som de tudo do PC, inclusive o Discord. Para mandar só o jogo: escolha <strong>Janela</strong> → janela do jogo (Chrome atualizado no Windows) ou feche o Discord e fale só por aqui (a ponte traz quem está lá).</p>
      <div class="controles" style="margin-top:8px"><button class="btn pequeno" data-v="o-ok">Escolher o que compartilhar</button><button class="btn sec pequeno" data-v="o-cancelar">Cancelar</button></div>
    </div>
    <div class="controles" style="align-items:center;justify-content:space-between">
      <p class="muted" data-v="info"></p>
      <span class="controles hidden" data-v="layout" style="align-items:center"><button class="chip" data-l="auto" title="Volta todos os vídeos ao tamanho e à ordem automáticos">↺ Organizar automático</button>
        <span class="muted" style="font-size:.8rem">Passe o mouse num vídeo: 🔊 volume da pessoa, ➖➕ tamanho, ◀▶ ou arrastar muda a ordem, ⭐ destaca. Clique duplo: maximizar.</span></span>
    </div>
    <div class="aviso hidden" data-v="aviso"></div>
    <div class="aviso aviso-clipes hidden" data-v="aviso-clipes" role="status"></div>
    <div class="call-layout">
      <div class="sala" data-v="sala"></div>
      <aside class="call-chat hidden" data-v="chat">
        <div class="call-msgs" data-v="msgs"><p class="muted" style="font-size:.85rem">Chat da call: as mensagens não ficam salvas.</p></div>
        <form data-v="form-chat" class="controles"><input data-v="txt" maxlength="500" placeholder="Mensagem..." autocomplete="off" style="flex:1"><button class="btn pequeno">Enviar</button></form>
      </aside>
    </div>`;
  const el = (k) => box.querySelector(`[data-v="${k}"]`);
  let sala = null, emCall = false, relogioCall = null;

  let clipador = null;
  const gravando = new Map();
  const atualizar = () => {
    const dentro = !!sala?.local;
    el('entrar').classList.toggle('hidden', dentro);
    ['mudo', 'cam', 'tela', 'sair', 'layout', 'diag'].forEach((k) => el(k).classList.toggle('hidden', !dentro));
    el('musica').classList.toggle('hidden', !dentro || !navigator.mediaDevices?.getDisplayMedia);
    el('chat').classList.toggle('hidden', !dentro);
    el('clipes').classList.toggle('hidden', !dentro);
    el('clipar').classList.toggle('hidden', !dentro || !clipador?.ligado);
    if (!dentro) { clipador?.desligar(); clipador = null; gravando.clear(); el('clipes').classList.remove('ligado'); el('clipes').textContent = '✂️ Clipes'; mostrarGravando(); }
    if (!dentro && emCall) { emCall = false; statusCall(null); clearInterval(relogioCall); }
    if (dentro && !emCall) relogioCall = setInterval(() => sb.rpc('registrar_call').then(() => {}), 60000);   // conta minutos em call (conquistas)
    if (dentro) emCall = true;
    if (!dentro) { el('info').textContent = ''; el('aviso').classList.add('hidden'); el('som').classList.add('hidden'); el('opcoes').classList.add('hidden'); return; }
    el('mudo').textContent = sala.mudo ? '🔇 Ativar microfone' : sala.prefs?.ptt ? (sala.falandoPtt ? '🎙️ Falando...' : `🎤 Segure ${(sala.prefs.tecla || 'KeyV').replace(/^Key|^Digit/, '')} para falar`) : '🎤 Silenciar';
    el('cam').classList.toggle('ligado', sala.modoVideo === 'camera');
    el('tela').classList.toggle('ligado', sala.modoVideo === 'tela');
    el('tela').textContent = sala.modoVideo === 'tela' ? '🖥️ Parar compartilhamento' : '🖥️ Compartilhar tela';
    el('musica').classList.toggle('ligado', sala.musicaAtiva);
    el('musica').textContent = sala.musicaAtiva ? '🎵 Parar música' : '🎵 Tocar música';
    const outros = sala.participantes - 1;
    el('info').textContent = outros ? `${sala.participantes} pessoas na call · ${sala.conectados} de ${outros} ${outros === 1 ? 'conectada' : 'conectadas'}` : 'Você está na call. Aguardando outras pessoas...';
  };
  const avisar = (tipo, nome) => {
    if (tipo === 'som-bloqueado') { el('som').classList.remove('hidden'); toast('O navegador bloqueou o som. Clique em "Ativar som".', true); return; }
    const msgs = {
      'sem-turn': '⚠️ Não foi possível conectar com alguém da call. Isso costuma acontecer em redes de celular ou de provedores que bloqueiam conexão direta. O administrador do site pode ativar o servidor de retransmissão (TURN) — veja o README.',
      lento: '⏳ A conexão com alguém está demorando. Se não conectar, saiam e entrem de novo na call.',
      falhou: `❌ Não foi possível conectar com ${nome || 'uma pessoa'} depois de 3 tentativas. Peça para ela sair e entrar de novo; se continuar, troquem de rede (Wi-Fi ↔ dados) ou toque em 📋 Diagnóstico e envie em "Reportar problema".`,
      'mic-trocado': '🎤 Seu microfone foi desconectado. Passamos para o microfone padrão do aparelho.',
      'sem-mic': '⚠️ Seu microfone foi desconectado e não há outro disponível. Conecte um fone com microfone.',
      'sem-video': 'Essa pessoa não está com câmera ou tela ligada.',
      'sem-pip': 'Seu navegador não permite janela flutuante para este vídeo.',
    };
    el('aviso').textContent = msgs[tipo] || '';
    el('aviso').classList.toggle('hidden', !msgs[tipo]);
  };
  // Clipes: quem está gravando aparece para todos
  const mostrarGravando = () => {
    const nomes = [...gravando.values()];
    el('aviso-clipes').textContent = nomes.length ? `🔴 ${nomes.join(', ')} ${nomes.length === 1 ? 'está' : 'estão'} com clipes ligados: os últimos segundos da call (vozes e tela) podem ser salvos.` : '';
    el('aviso-clipes').classList.toggle('hidden', !nomes.length);
  };
  const aoClipes = ({ de, nome, ativo }) => {
    if (!de || de === u.id) return;
    if (ativo) gravando.set(de, String(nome || 'Alguém').slice(0, 40)); else gravando.delete(de);
    mostrarGravando();
  };
  const mostrarMsg = (m) => {
    const d = document.createElement('p');
    d.innerHTML = `<strong>${esc(m.nome)}:</strong> ${esc(m.texto)}`;
    el('msgs').append(d); el('msgs').scrollTop = el('msgs').scrollHeight;
  };
  if (!navigator.mediaDevices?.getDisplayMedia) { el('tela').disabled = true; el('tela').title = 'Seu navegador (geralmente celular) não permite compartilhar a tela'; }

  el('entrar').onclick = async () => {
    el('entrar').disabled = true;
    // Tela de pré-entrada: navegador, permissão, microfone (com medidor), saída de som
    if (!(await preEntrar())) { el('entrar').disabled = false; return; }
    sala = new SalaVoz({ salaId, eu: u.id, nome: p.username, container: el('sala'), aoMudar: atualizar, aoChat: mostrarMsg, aoAviso: avisar });
    sala.aoClipes = aoClipes;
    try {
      await sala.entrar();
      contarEvento('call_entrou');
      // Avisa aos amigos que você está em call (comunidade: com link para entrar; privada: só "em call")
      const cid = /^dm-/.test(salaId) ? null : Number(String(salaId).split('-')[0]) || null;
      statusCall({ titulo: String(titulo).slice(0, 60), cid });
    } catch (e) {
      sala = null;
      falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso ao microfone para entrar na call (ícone de cadeado na barra de endereço).' }
        : e.name === 'NotFoundError' ? { message: 'Nenhum microfone encontrado neste aparelho.' } : e);
    } finally { el('entrar').disabled = false; }
  };
  el('sair').onclick = () => { statusCall(null); if (clipador) sala.avisarClipes(false); sala.sair(); };
  if (!clipesSuportados()) { el('clipes').disabled = true; el('clipes').title = 'Seu navegador não grava clipes. Use o Chrome ou o Edge no computador.'; }
  el('clipes').onclick = () => {
    if (!sala?.local) return;
    if (clipador?.ligado) { clipador.desligar(); clipador = null; sala.avisarClipes(false); toast('Clipes desligados. Nada foi salvo.'); }
    else {
      try { clipador = new Clipador(sala); clipador.ligar(); } catch (e) { clipador = null; return falha(e); }
      sala.avisarClipes(true); contarEvento('clipes_ligou');
      toast('Clipes ligados: toque em 🎬 Clipar para salvar os últimos 30 a 60 segundos.');
    }
    el('clipes').classList.toggle('ligado', !!clipador);
    el('clipes').textContent = clipador ? '✂️ Desligar clipes' : '✂️ Clipes';
    atualizar();
  };
  el('clipar').onclick = async () => {
    el('clipar').disabled = true;
    try { abrirClipe(await clipador.clipar()); } catch (e) { falha(e); } finally { el('clipar').disabled = false; }
  };
  const abrirClipe = ({ blob, segundos }) => {
    contarEvento('clipe_salvo');
    const url = URL.createObjectURL(blob);
    const nome = `clip-controlcritic-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg-clipe';
    dlg.setAttribute('aria-label', 'Seu clipe');
    dlg.innerHTML = `<h2 style="margin-top:0">🎬 Seu clipe (${segundos} s)</h2>
      <video controls playsinline src="${url}"></video>
      <label for="clp-txt">Legenda (para postar)</label><input id="clp-txt" maxlength="300" placeholder="Que jogada!">
      <p class="muted" style="font-size:.85rem">Antes de postar, confira se todos que aparecem ou falam concordam.</p>
      <div class="controles"><a class="btn sec" href="${url}" download="${nome}">⬇️ Baixar</a>
        <button class="btn" data-c="postar">📢 Postar no feed</button><button class="btn sec" data-c="fechar">Fechar</button></div>`;
    document.body.append(dlg); dlg.showModal();
    const fechar = () => { dlg.close(); dlg.remove(); URL.revokeObjectURL(url); };
    dlg.querySelector('[data-c="fechar"]').onclick = fechar;
    dlg.querySelector('[data-c="postar"]').onclick = async (ev) => {
      const bt = ev.currentTarget; bt.disabled = true; bt.textContent = 'Enviando...';
      try {
        const arq = new File([blob], nome, { type: 'video/webm' });
        const video_url = await enviarVideo(u.id, 'video', arq, 50, { maxSegundos: 70, aoProgresso: (x) => { bt.textContent = `Otimizando... ${Math.round(x * 100)}%`; } });
        const cid = /^dm-/.test(salaId) ? null : Number(String(salaId).split('-')[0]) || null;
        const { error } = await sb.from('posts').insert({ user_id: u.id, community_id: cid, body: dlg.querySelector('#clp-txt').value.trim() || '🎬 Clipe da call', video_url });
        if (error) throw /row-level/.test(error.message) ? new Error('Você precisa participar da comunidade para postar.') : error;
        contarEvento('clipe_postado'); toast('Clipe postado!'); fechar();
      } catch (e) { falha(e); bt.disabled = false; bt.textContent = '📢 Postar no feed'; }
    };
  };
  el('diag').onclick = async () => {
    const texto = JSON.stringify(sala?.diagnostico?.() || {}, null, 1);
    try { await navigator.clipboard.writeText(texto); toast('Diagnóstico copiado. Cole em "Reportar problema" (rodapé).'); } catch { prompt('Copie o diagnóstico:', texto); }
  };
  // Saída limpa: fechar a aba ou a janela encerra a call e avisa os outros
  addEventListener('pagehide', () => { try { sala?.sair(); } catch { /* já saiu */ } });
  addEventListener('pagehide', () => statusCall(null));
  el('mudo').onclick = () => sala.alternarMudo();
  el('som').onclick = async () => { await sala.ativarSom(); el('som').classList.add('hidden'); };
  el('cam').onclick = () => sala.alternarCamera().catch((e) => falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso à câmera.' } : e));
  // Compartilhar tela: abre as opções antes; se já estiver compartilhando, para
  el('tela').onclick = () => {
    if (sala.modoVideo === 'tela') return sala.alternarTela();
    el('opcoes').classList.toggle('hidden');
  };
  el('musica').onclick = async () => {
    if (!sala.musicaAtiva) toast('Escolha a aba do Spotify (open.spotify.com) em "Guia do Chrome" e deixe ligado "Compartilhar áudio da guia".');
    try { if (await sala.alternarMusica()) toast('🎵 Música tocando para a call. Cada pessoa ajusta no volume 🖥️ Tela do seu quadro.'); }
    catch (e) { if (e.name !== 'NotAllowedError') falha(e); }
  };
  el('o-cancelar').onclick = () => el('opcoes').classList.add('hidden');
  el('o-ok').onclick = async () => {
    el('opcoes').classList.add('hidden');
    try {
      const r = await sala.alternarTela({ altura: Number(el('o-alt').value), fps: Number(el('o-fps').value), som: el('o-som').checked, movimento: el('o-tipo').value === 'jogo' });
      if (el('o-som').checked && !r?.comSom) toast('Compartilhando sem som: o navegador não liberou o áudio dessa janela. Para ter som, compartilhe a tela inteira ou uma aba.');
    } catch (e) { if (e.name !== 'NotAllowedError') falha(e); }
  };
  // Grade livre: cada vídeo tem tamanho (colunas de 12) e posição escolhidos por você.
  // Sem ajuste manual, o tamanho é automático pela quantidade de pessoas.
  const salaEl = el('sala');
  salaEl.classList.add('livre');
  const TAMANHOS = [3, 4, 6, 8, 12];
  const ajustes = new Map(); // id -> { tam, ordem } (só o que você mexeu)
  const tiles = () => [...salaEl.querySelectorAll('.participante')];
  const tamAuto = () => { const n = tiles().length; return n <= 1 ? 12 : n <= 4 ? 6 : n <= 9 ? 4 : 3; };
  const aplicarLayout = () => {
    const lista = tiles().sort((x, y) => (ajustes.get(x.dataset.id)?.ordem ?? 1e3 + tiles().indexOf(x)) - (ajustes.get(y.dataset.id)?.ordem ?? 1e3 + tiles().indexOf(y)));
    lista.forEach((t, i) => {
      const a = ajustes.get(t.dataset.id);
      t.style.setProperty('--tam', a?.tam ?? tamAuto());
      t.style.order = i;
      t.dataset.pos = i;
    });
  };
  const renumerar = () => tiles().sort((x, y) => x.dataset.pos - y.dataset.pos).forEach((t, i) => { const a = ajustes.get(t.dataset.id) || {}; a.ordem = i; ajustes.set(t.dataset.id, a); });
  const mover = (t, d) => {
    renumerar();
    const lista = tiles().sort((x, y) => ajustes.get(x.dataset.id).ordem - ajustes.get(y.dataset.id).ordem);
    const i = lista.indexOf(t), j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    lista.forEach((x, k) => (ajustes.get(x.dataset.id).ordem = k));
    aplicarLayout();
  };
  const redimensionar = (t, d) => {
    const a = ajustes.get(t.dataset.id) || {};
    const atual = Number(t.style.getPropertyValue('--tam')) || tamAuto();
    const k = TAMANHOS.findIndex((x) => x >= atual);
    a.tam = TAMANHOS[Math.max(0, Math.min(TAMANHOS.length - 1, (k < 0 ? 2 : k) + d))];
    ajustes.set(t.dataset.id, a); aplicarLayout();
  };
  const destacar = (t) => {
    renumerar();
    const a = ajustes.get(t.dataset.id);
    const ja = a.tam === 12 && a.ordem === 0;
    tiles().forEach((x) => { const b = ajustes.get(x.dataset.id); if (x !== t) b.ordem += 1; });
    a.ordem = 0; a.tam = ja ? undefined : 12;
    aplicarLayout();
  };
  // Controles em cada vídeo (adicionados quando a pessoa entra na sala)
  const controlesTile = (t) => {
    if (t.querySelector('.ajuste-tile')) return;
    t.draggable = true;
    t.insertAdjacentHTML('beforeend', `<span class="ajuste-tile">
      <button data-t="esq" title="Mover para trás" aria-label="Mover para trás">◀</button><button data-t="dir" title="Mover para frente" aria-label="Mover para frente">▶</button>
      <button data-t="menor" title="Diminuir" aria-label="Diminuir">➖</button><button data-t="maior" title="Aumentar" aria-label="Aumentar">➕</button>
      <button data-t="destaque" title="Destacar (grande e primeiro)" aria-label="Destacar">⭐</button></span>`);
    // Volume individual (só para os outros): voz e som da tela separados, lembrados neste aparelho
    if (t.querySelector('audio')) {
      const nome = (t.querySelector('.nome')?.textContent || 'esta pessoa').split(' · ')[0];
      t.insertAdjacentHTML('beforeend', `<span class="volume-tile">
        <span class="vol-painel">
          <strong>🔊 Volume de ${esc(nome)}</strong>
          <label title="Volume da voz">🎤 Voz <input type="range" min="0" max="100" step="5" data-vol="voz" aria-label="Volume da voz"> <output data-vol-n="voz"></output></label>
          <label title="Volume do som da tela compartilhada">🖥️ Tela <input type="range" min="0" max="100" step="5" data-vol="tela" aria-label="Volume do som da tela"> <output data-vol-n="tela"></output></label>
        </span>
        <button data-vol="mudo" title="Silenciar esta pessoa só para você" aria-label="Silenciar esta pessoa">🔊 Volume</button></span>`);
      ligarVolume(t);
    }
    t.querySelector('.ajuste-tile').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      ({ esq: () => mover(t, -1), dir: () => mover(t, 1), menor: () => redimensionar(t, -1), maior: () => redimensionar(t, 1), destaque: () => destacar(t) })[b.dataset.t]();
    };
    t.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) destacar(t); });
    // Arrastar e soltar: solta um vídeo sobre outro para trocar de lugar
    t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', t.dataset.id); t.classList.add('arrastando'); });
    t.addEventListener('dragend', () => t.classList.remove('arrastando'));
    t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('alvo'); });
    t.addEventListener('dragleave', () => t.classList.remove('alvo'));
    t.addEventListener('drop', (e) => {
      e.preventDefault(); t.classList.remove('alvo');
      const outro = salaEl.querySelector(`.participante[data-id="${CSS.escape(e.dataTransfer.getData('text/plain'))}"]`);
      if (!outro || outro === t) return;
      renumerar();
      const a = ajustes.get(t.dataset.id), b = ajustes.get(outro.dataset.id);
      [a.ordem, b.ordem] = [b.ordem, a.ordem];
      aplicarLayout();
    });
  };
  new MutationObserver(() => { tiles().forEach(controlesTile); aplicarLayout(); }).observe(salaEl, { childList: true });

  function ligarVolume(t) {
    const chave = 'cc_vol_' + t.dataset.id;
    let cfg = { voz: 100, tela: 100, mudo: false };
    try { cfg = { ...cfg, ...JSON.parse(localStorage.getItem(chave) || '{}') }; } catch { /* sem armazenamento */ }
    const v = t.querySelector('.volume-tile'), bt = v.querySelector('[data-vol="mudo"]');
    const aplicar = () => {
      t.querySelectorAll('audio').forEach((a) => {
        if (a.dataset.saida !== String(prefs.saida)) { a.dataset.saida = String(prefs.saida); definirSaida(a, prefs.saida); }
        a.muted = cfg.mudo;
        a.dataset.volBase = (a.classList.contains('som-tela') ? cfg.tela : cfg.voz) / 100; aplicarVolume(a);   // × volume geral do site
      });
      bt.textContent = cfg.mudo ? '🔇 Silenciado' : `${cfg.voz < 50 ? '🔉' : '🔊'} ${cfg.voz}%`;
      v.querySelector('[data-vol-n="voz"]').textContent = cfg.voz + '%';
      v.querySelector('[data-vol-n="tela"]').textContent = cfg.tela + '%';
      bt.classList.toggle('ativo', cfg.mudo);
      t.classList.toggle('silenciado-por-mim', cfg.mudo);
      try { localStorage.setItem(chave, JSON.stringify(cfg)); } catch { /* ignora */ }
    };
    v.querySelector('[data-vol="voz"]').value = cfg.voz;
    v.querySelector('[data-vol="tela"]').value = cfg.tela;
    // Clique: silencia/reativa. Passar o mouse (ou tocar e segurar): mostra os controles de volume
    bt.onclick = (e) => { e.stopPropagation(); cfg.mudo = !cfg.mudo; aplicar(); };
    // O painel aparece ao passar o mouse no quadro (CSS). No celular (sem mouse), um toque no quadro abre/fecha.
    t.addEventListener('click', (e) => { if (!matchMedia('(hover: hover)').matches && !e.target.closest('button,input')) t.classList.toggle('vol-aberto'); });
    v.querySelector('.vol-painel').onclick = (e) => e.stopPropagation();
    v.querySelectorAll('input').forEach((i) => {
      i.onclick = (e) => e.stopPropagation();
      i.oninput = () => { cfg[i.dataset.vol] = Number(i.value); if (i.dataset.vol === 'voz' && cfg.mudo && cfg.voz > 0) cfg.mudo = false; aplicar(); };
    });
    v.draggable = false; v.ondragstart = (e) => { e.preventDefault(); e.stopPropagation(); };
    // O som da tela compartilhada chega depois (outro elemento <audio>): aplica também nele
    new MutationObserver(aplicar).observe(t, { childList: true });
    aplicar();
  }
  box.querySelector('[data-l="auto"]').onclick = () => { ajustes.clear(); aplicarLayout(); };

  // Configurações de áudio (parecidas com as do Discord)
  const prefs = prefsAudio();
  const painel = el('audio');
  let teste = null, timerMedidor = null, tecla = prefs.tecla;
  const nomeTecla = (c) => c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
  const preencher = () => {
    box.querySelectorAll('[data-a]').forEach((c) => (c.checked = !!prefs[c.dataset.a]));
    box.querySelectorAll('[name="modo-mic"]').forEach((r) => (r.checked = r.value === (prefs.ptt ? 'ptt' : 'voz')));
    el('a-sens').value = prefs.sensibilidade;
    el('a-tecla').textContent = 'Tecla: ' + nomeTecla(tecla);
    atualizarSens();
  };
  const atualizarSens = () => {
    const auto = box.querySelector('[data-a="autoSens"]').checked;
    el('a-sens').disabled = auto;
    el('medidor').querySelector('.limite').style.left = auto ? '-10px' : `${((Number(el('a-sens').value) + 80) / 60) * 100}%`;
  };
  const coletar = () => {
    const o = { ...prefs, mic: el('a-mic').value || null, saida: el('a-saida').value || null, sensibilidade: Number(el('a-sens').value), tecla,
      ptt: box.querySelector('[name="modo-mic"][value="ptt"]').checked };
    box.querySelectorAll('[data-a]').forEach((c) => (o[c.dataset.a] = c.checked));
    return o;
  };
  // Medidor: usa a call (se estiver nela) ou um microfone de teste
  const medir = () => sala?.local ? sala.nivelMic() : teste?.proc.medir() ?? -100;
  const ligarMedidor = () => {
    clearInterval(timerMedidor);
    timerMedidor = setInterval(() => {
      if (painel.classList.contains('hidden')) return clearInterval(timerMedidor);
      const db = medir(), pct = Math.max(0, Math.min(100, ((db + 80) / 60) * 100));
      const barra = el('medidor').querySelector('.nivel');
      barra.style.width = pct + '%';
      barra.classList.toggle('aberto', box.querySelector('[data-a="autoSens"]').checked || db >= Number(el('a-sens').value));
    }, 60);
  };
  const pararTeste = () => { if (!teste) return; teste.audio?.remove(); teste.proc.fechar(); teste = null; el('a-ouvir').textContent = '🎧 Ouvir meu microfone'; };
  el('cfg-audio').onclick = async () => {
    painel.classList.toggle('hidden');
    if (painel.classList.contains('hidden')) return pararTeste();
    preencher();
    try {
      const aparelhos = await navigator.mediaDevices.enumerateDevices();
      const opcoes = (tipo, atual, rotulo) => '<option value="">Padrão do sistema</option>' + aparelhos.filter((d) => d.kind === tipo && d.deviceId && d.deviceId !== 'default')
        .map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === atual ? 'selected' : ''}>${esc(d.label || rotulo + ' ' + (i + 1))}</option>`).join('');
      el('a-mic').innerHTML = opcoes('audioinput', prefs.mic, 'Microfone');
      el('a-saida').innerHTML = opcoes('audiooutput', prefs.saida, 'Saída');
      if (!HTMLMediaElement.prototype.setSinkId) { el('a-saida').disabled = true; el('a-saida').title = 'Este navegador não deixa escolher a saída: use a do sistema.'; }
    } catch { /* sem permissão ainda */ }
    ligarMedidor();
  };
  box.querySelector('[data-a="autoSens"]').addEventListener('change', atualizarSens);
  el('a-sens').oninput = () => { atualizarSens(); if (sala?.local) sala.configurarAudio(coletar()); else teste?.proc.definirSensibilidade(Number(el('a-sens').value)); };
  el('a-tecla').onclick = () => {
    el('a-tecla').textContent = 'Aperte uma tecla...';
    const pegar = (e) => { e.preventDefault(); tecla = e.code; el('a-tecla').textContent = 'Tecla: ' + nomeTecla(tecla); removeEventListener('keydown', pegar, true); };
    addEventListener('keydown', pegar, true);
  };
  // Ouvir o próprio microfone (com o processamento escolhido) para comparar; use fone para não dar eco
  el('a-ouvir').onclick = async () => {
    if (teste) return pararTeste();
    try {
      const o = coletar();
      const bruto = await navigator.mediaDevices.getUserMedia({ audio: restricoesMic(o) });
      const proc = await processarMic(bruto, o);
      const audio = Object.assign(document.createElement('audio'), { autoplay: true, srcObject: new MediaStream([proc.track]) });
      await definirSaida(audio, o.saida);
      painel.append(audio);
      teste = { proc, audio };
      el('a-ouvir').textContent = '⏹️ Parar de ouvir';
      toast('Use fone de ouvido para não dar microfonia.');
      ligarMedidor();
    } catch (e) { falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso ao microfone.' } : e); }
  };
  el('a-fechar').onclick = () => { painel.classList.add('hidden'); pararTeste(); };
  el('a-ok').onclick = async () => {
    const o = coletar();
    Object.assign(prefs, o);
    pararTeste();
    try {
      if (sala?.local) await sala.configurarAudio(o); else salvarPrefsAudio(o);
      box.querySelectorAll('.sala audio').forEach((a) => definirSaida(a, o.saida));
      toast('Áudio atualizado.'); painel.classList.add('hidden'); atualizar();
    } catch (e) { falha(e); }
  };

  // Abrir em janela separada (continua na call enquanto navega pelo site)
  el('popout')?.addEventListener('click', async () => {
    const url = `chamada.html?sala=${encodeURIComponent(salaId)}&titulo=${encodeURIComponent(titulo)}`;
    const w = window.open(url, 'cc-call', 'popup,width=960,height=640');
    if (!w) return toast('O navegador bloqueou a janela. Permita pop-ups para este site.', true);
    if (sala?.local) { await sala.sair(); toast('A call continua na janela nova.'); }
  });

  // Mini player: quando a call sai da tela (rolou a página ou trocou de aba da comunidade)
  document.querySelector('.call-flutuante')?.remove();
  const mini = document.createElement('div');
  mini.className = 'call-flutuante hidden';
  mini.innerHTML = `<span>🔊 Em call · <strong>${esc(titulo)}</strong></span><button class="btn sec pequeno" data-m="mudo">🎤</button><button class="btn pequeno" data-m="ir">Voltar</button><button class="btn perigo pequeno" data-m="sair">Sair</button>`;
  document.body.append(mini);
  mini.querySelector('[data-m="ir"]').onclick = () => { const aba = document.querySelector('.aba[data-a="call"]'); aba?.click(); box.scrollIntoView({ behavior: 'smooth' }); };
  mini.querySelector('[data-m="mudo"]').onclick = () => { sala?.alternarMudo(); mini.querySelector('[data-m="mudo"]').textContent = sala?.mudo ? '🔇' : '🎤'; };
  mini.querySelector('[data-m="sair"]').onclick = () => sala?.sair();
  const atualizarMini = () => {
    const r = box.getBoundingClientRect();
    const visivel = box.offsetParent !== null && r.bottom > 80 && r.top < innerHeight - 80;
    mini.classList.toggle('hidden', !sala?.local || visivel);
  };
  addEventListener('scroll', atualizarMini, { passive: true });
  document.addEventListener('click', () => setTimeout(atualizarMini, 50));
  setInterval(atualizarMini, 1500);

  el('form-chat').onsubmit = (e) => { e.preventDefault(); const t = el('txt').value.trim(); if (t) { sala.enviarChat(t); el('txt').value = ''; } };
  window.addEventListener('beforeunload', () => sala?.sair());
  return { sair: () => sala?.sair() };
}
