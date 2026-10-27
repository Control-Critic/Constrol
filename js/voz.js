// Sala de voz/vídeo com compartilhamento de tela e chat de texto.
// WebRTC em malha (cada participante conecta direto com os outros) e o
// Supabase Realtime como "sinalização" (troca das ofertas/respostas).
// Funciona bem para grupos pequenos (até ~6 pessoas).
import { sb, esc, cabecalhosLogin } from './app.js';
import { ICE_SERVERS } from './config.js';
import { prefsAudio, salvarPrefsAudio, restricoesMic, processarMic, melhorarOpus } from './audio-mic.js';
export { prefsAudio } from './audio-mic.js';

// Servidores STUN/TURN: pede credenciais temporárias de TURN ao servidor (se configurado).
// Sem TURN, redes de celular/CGNAT muitas vezes não deixam os navegadores se conectarem.
let iceCache = null;
async function servidoresIce() {
  if (iceCache && iceCache.expira > Date.now()) return iceCache;
  try {
    const r = await fetch('/.netlify/functions/turn', { headers: await cabecalhosLogin() });
    if (r.ok) {
      const d = await r.json();
      if (d.iceServers?.length) {
        // Primeiro só os TURN próprios (Oracle, IPv6 de casa); a Cloudflare entra como reserva se não conectar
        const completa = [...ICE_SERVERS, ...d.iceServers];
        const inicial = d.primarios?.length && d.reserva?.length ? [...ICE_SERVERS, ...d.primarios] : completa;
        return (iceCache = { lista: inicial, completa, turn: true, expira: Date.now() + 3600e3 });
      }
    }
  } catch { /* sem função: só STUN */ }
  return (iceCache = { lista: ICE_SERVERS, completa: ICE_SERVERS, turn: false, expira: Date.now() + 600e3 });
}

const ESTADOS = { new: 'conectando…', connecting: 'conectando…', connected: '', disconnected: 'reconectando…', failed: 'sem conexão', closed: '' };

// ---------- Mini player com vários vídeos (Document Picture-in-Picture) ----------
// A janela fica por cima de tudo (jogo, outras abas) e mostra os vídeos escolhidos lado a lado.
export const miniPlayer = {
  win: null, itens: new Map(),
  async abrir() {
    if (this.win && !this.win.closed) return this.win;
    this.win = await window.documentPictureInPicture.requestWindow({ width: 520, height: 300 });
    const d = this.win.document;
    d.title = 'Call · Control Critic';
    d.body.innerHTML = '<div id="g"></div>';
    const st = d.createElement('style');
    st.textContent = `body{margin:0;background:#0b0b0d;font:12px Inter,system-ui,sans-serif;color:#fff;height:100vh}
      #g{display:grid;gap:4px;padding:4px;height:calc(100vh - 8px);grid-template-columns:repeat(auto-fit,minmax(200px,1fr));grid-auto-rows:1fr}
      .q{position:relative;background:#16161a;border-radius:8px;overflow:hidden;min-height:0}
      .q video{width:100%;height:100%;object-fit:contain;display:block}
      .q span{position:absolute;left:6px;bottom:4px;background:#000a;padding:1px 6px;border-radius:6px}
      .q button{position:absolute;right:4px;top:4px;background:#000a;color:#fff;border:0;border-radius:6px;cursor:pointer}`;
    d.head.append(st);
    this.win.addEventListener('pagehide', () => { for (const it of this.itens.values()) it.tile.classList.remove('no-mini'); this.itens.clear(); this.win = null; });
    return this.win;
  },
  async alternar(id, nome, video, tile) {
    if (this.itens.has(id)) return this.remover(id);
    if (!video.srcObject || video.style.display === 'none') { alert('Essa pessoa está sem vídeo agora (câmera ou tela desligada).'); return; }
    const w = await this.abrir();
    const q = w.document.createElement('div'); q.className = 'q';
    q.innerHTML = '<video autoplay playsinline muted></video><span></span><button title="Tirar do mini player">✕</button>';
    q.querySelector('span').textContent = nome;
    const v = q.querySelector('video'); v.srcObject = video.srcObject;   // mesmo vídeo, sem som duplicado (o som continua na call)
    q.querySelector('button').onclick = () => this.remover(id);
    w.document.getElementById('g').append(q);
    tile.classList.add('no-mini');
    this.itens.set(id, { q, tile });
  },
  remover(id) {
    const it = this.itens.get(id); if (!it) return;
    it.q.remove(); it.tile.classList.remove('no-mini'); this.itens.delete(id);
    if (!this.itens.size) this.win?.close();
  },
  fecharTudo() { this.win?.close(); },
};

export class SalaVoz {
  constructor({ salaId, eu, nome, container, aoMudar, aoChat, aoAviso }) {
    this.salaId = salaId;
    this.eu = eu;
    this.nome = nome;
    this.container = container;
    this.aoMudar = aoMudar || (() => {});
    this.aoChat = aoChat || (() => {});
    this.aoAviso = aoAviso || (() => {});
    this.peers = new Map();          // id -> { pc, polite, makingOffer, ignoreOffer, nome, el, pendentes }
    this.local = null;               // MediaStream do microfone
    this.videoTrack = null;          // câmera ou tela
    this.modoVideo = null;           // 'camera' | 'tela' | null
    this.mudo = false;
    this.audioCtx = null;
  }

  async entrar() {
    await this.#abrirMic(prefsAudio());
    this.ice = await servidoresIce();
    this.#tile(this.eu, this.nome + ' (você)', this.local, true);

    this.canal = sb.channel(`voz:${this.salaId}`, { config: { presence: { key: this.eu }, broadcast: { self: false } } });
    this.canal
      .on('presence', { event: 'sync' }, () => this.#sincronizar())
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { if (payload.para === this.eu) this.#sinal(payload); })
      .on('broadcast', { event: 'estado' }, ({ payload }) => this.#estadoRemoto(payload))
      .on('broadcast', { event: 'chat' }, ({ payload }) => this.aoChat(payload))
      .on('broadcast', { event: 'clipes' }, ({ payload }) => this.aoClipes?.(payload));
    await new Promise((ok, erro) => this.canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { await this.canal.track({ nome: this.nome }); ok(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') erro(new Error('Não foi possível conectar à sala.'));
    }));
    this.vigia = setInterval(() => this.#vigiar(), 4000);
    // Fone desconectado ou microfone trocado no sistema: volta para o microfone padrão sem sair da call
    this.aoTrocarAparelho = async () => {
      const t = this.local?.getAudioTracks()[0];
      if (t && t.readyState === 'ended') {
        try { await this.configurarAudio({ ...prefsAudio(), mic: '' }); this.aoAviso('mic-trocado'); } catch { this.aoAviso('sem-mic'); }
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', this.aoTrocarAparelho);
    this.aoMudar();
  }

  // Mensagens de sinalização podem se perder (limite de mensagens do Realtime).
  // A cada 4 s, pares que não avançaram recebem a oferta de novo.
  async #vigiar() {
    for (const [id, p] of this.peers) {
      const { pc } = p;
      if (pc.connectionState === 'connected') { this.#medirQualidade(p); continue; }
      if (Date.now() - p.criado < 5000) continue;
      // Reconexão limitada: depois de 3 tentativas sem sucesso, avisa uma vez com o que fazer
      if ((p.tentativas || 0) >= 3) { if (!p.desistiu) { p.desistiu = true; this.aoAviso('falhou', p.nome); } continue; }
      // Não conectou só com os servidores próprios: acrescenta a reserva (Cloudflare) e refaz a busca de caminho
      if (!p.comReserva && this.ice.completa.length > this.ice.lista.length) {
        p.comReserva = true;
        try { pc.setConfiguration({ ...pc.getConfiguration(), iceServers: this.ice.completa }); if (!p.polite && pc.remoteDescription) pc.restartIce(); } catch (e) { console.warn(e); }
        continue;
      }
      try {
        if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
          this.#enviar(id, { desc: pc.localDescription });              // a oferta pode ter se perdido
        } else if (pc.signalingState === 'stable' && !pc.remoteDescription && !p.polite) {
          p.makingOffer = true;                                          // ninguém começou: o lado "impolite" puxa
          await pc.setLocalDescription();
          this.#enviar(id, { desc: pc.localDescription });
          p.makingOffer = false;
        } else if (pc.signalingState === 'stable' && pc.remoteDescription && ['new', 'failed', 'disconnected'].includes(pc.iceConnectionState) && !p.polite) {
          pc.restartIce(); p.tentativas = (p.tentativas || 0) + 1;      // negociou mas não achou caminho
        }
      } catch (e) { p.makingOffer = false; console.warn(e); }
    }
  }

  // Qualidade da conexão com cada pessoa (tempo de ida e volta e perda de pacotes de áudio)
  async #medirQualidade(p) {
    try {
      const st = await p.pc.getStats();
      let rtt = null, perdidos = 0, recebidos = 0, relay = false;
      st.forEach((r) => {
        if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') {
          rtt = r.currentRoundTripTime ?? rtt;
          const local = st.get(r.localCandidateId);
          relay = local?.candidateType === 'relay';
        }
        if (r.type === 'inbound-rtp' && r.kind === 'audio') { perdidos += r.packetsLost || 0; recebidos += r.packetsReceived || 0; }
      });
      const perda = recebidos + perdidos ? perdidos / (recebidos + perdidos) : 0;
      const nivel = rtt == null ? '' : rtt > 0.4 || perda > 0.08 ? 'ruim' : rtt > 0.2 || perda > 0.03 ? 'media' : 'boa';
      p.qualidade = { rtt: rtt == null ? null : Math.round(rtt * 1000), perda: Math.round(perda * 1000) / 10, relay, nivel };
      const b = p.el.querySelector('.qualidade');
      if (b) { b.dataset.nivel = nivel; b.title = `Conexão ${nivel === 'boa' ? 'boa' : nivel === 'media' ? 'instável' : 'ruim'}: ${p.qualidade.rtt ?? '?'} ms, ${p.qualidade.perda}% de perda${relay ? ' (via servidor de retransmissão)' : ''}`; b.setAttribute('aria-label', b.title); }
    } catch { /* estatísticas indisponíveis */ }
  }

  // Diagnóstico para copiar e mandar ao suporte: sem SDP, candidatos ICE, IPs ou nomes de aparelhos
  diagnostico() {
    const sup = { tela: !!navigator.mediaDevices?.getDisplayMedia, saida: 'setSinkId' in HTMLMediaElement.prototype };
    return {
      quando: new Date().toISOString(), navegador: navigator.userAgent.replace(/\([^)]*\)/g, '').trim().slice(0, 120),
      turn: !!this.ice?.turn, reservaDisponivel: (this.ice?.completa?.length || 0) > (this.ice?.lista?.length || 0), suporte: sup,
      microfone: this.local?.getAudioTracks()[0]?.readyState || 'sem', mudo: !!this.mudo,
      pessoas: [...this.peers.values()].map((p, i) => ({ n: i + 1, estado: p.pc.connectionState, ice: p.pc.iceConnectionState, tentativas: p.tentativas || 0, ...(p.qualidade || {}) })),
    };
  }

  async sair() {
    miniPlayer.fecharTudo();
    clearInterval(this.vigia);
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.aoTrocarAparelho);
    for (const id of [...this.peers.keys()]) this.#remover(id);
    this.proc?.fechar(); this.proc = null;
    this.local?.getTracks().forEach((t) => t.stop());
    this.#pararPtt();
    this.videoTrack?.stop();
    this.somJogo?.stop(); this.somMusica?.stop(); this.mixCtx?.close(); this.mixCtx = null;
    if (this.canal) { await this.canal.untrack().catch(() => {}); await sb.removeChannel(this.canal); }
    this.audioCtx?.close();
    this.container.innerHTML = '';
    this.local = this.videoTrack = this.canal = null;
    this.modoVideo = null;
    this.aoMudar();
  }

  // Avisa os outros que você está gravando os clipes (eles também ouvem quem entra depois, pelo estado)
  avisarClipes(ativo) {
    this.clipesAtivos = !!ativo;
    this.canal?.send({ type: 'broadcast', event: 'clipes', payload: { de: this.eu, nome: this.nome, ativo: this.clipesAtivos } });
  }

  enviarChat(texto) {
    const msg = { de: this.eu, nome: this.nome, texto: String(texto).slice(0, 500), em: Date.now() };
    this.canal?.send({ type: 'broadcast', event: 'chat', payload: msg });
    this.aoChat(msg);
  }

  // Alguns navegadores (principalmente no celular) bloqueiam áudio automático: tenta tocar de novo
  async ativarSom() {
    await this.audioCtx?.resume().catch(() => {});
    for (const p of this.peers.values()) for (const a of p.el.querySelectorAll('audio')) await a.play().catch(() => {});
  }

  alternarMudo() {
    this.mudo = !this.mudo;
    this.#aplicarMic();
    this.#enviarEstado();
    this.aoMudar();
  }

  // Microfone liberado = não está mudo e (sem "apertar para falar" ou com a tecla apertada)
  #aplicarMic() {
    const ligado = !this.mudo && (!this.prefs?.ptt || this.apertando);
    this.local?.getAudioTracks().forEach((t) => (t.enabled = ligado));
  }

  // Abre o microfone com o processamento escolhido (IA de ruído, sensibilidade) e liga o "apertar para falar"
  async #abrirMic(o) {
    this.prefs = o;
    const bruto = await navigator.mediaDevices.getUserMedia({ audio: restricoesMic(o), video: false });
    const novo = await processarMic(bruto, o);
    const velho = this.proc;
    this.proc = novo;
    if (!this.local) this.local = new MediaStream([novo.track]);
    else {
      for (const p of this.peers.values()) await p.micSender?.replaceTrack(novo.track);
      const t = this.local.getAudioTracks()[0];
      if (t) this.local.removeTrack(t);
      this.local.addTrack(novo.track);
    }
    velho?.fechar();
    this.#pararPtt();
    if (o.ptt) {
      this.apertando = false;
      const alvo = (e) => e.code === o.tecla && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      this.pttDown = (e) => { if (alvo(e) && !e.repeat) { this.apertando = true; this.#aplicarMic(); this.aoMudar(); } };
      this.pttUp = (e) => { if (e.code === o.tecla) { this.apertando = false; this.#aplicarMic(); this.aoMudar(); } };
      this.pttBlur = () => { this.apertando = false; this.#aplicarMic(); };
      addEventListener('keydown', this.pttDown); addEventListener('keyup', this.pttUp); addEventListener('blur', this.pttBlur);
    }
    this.#aplicarMic();
  }
  #pararPtt() {
    if (!this.pttDown) return;
    removeEventListener('keydown', this.pttDown); removeEventListener('keyup', this.pttUp); removeEventListener('blur', this.pttBlur);
    this.pttDown = this.pttUp = this.pttBlur = null;
  }

  // Nível do microfone (dB) para o medidor das configurações
  nivelMic() { return this.proc?.medir() ?? -100; }
  get falandoPtt() { return !!this.prefs?.ptt && !!this.apertando; }

  // Troca microfone/filtros sem sair da call (sensibilidade muda na hora, sem reabrir o microfone)
  async configurarAudio(o) {
    salvarPrefsAudio(o);
    if (!this.local) return;
    const so = this.prefs && ['ruidoIA', 'eco', 'ganho', 'mic', 'ptt', 'tecla', 'autoSens'].every((k) => this.prefs[k] === o[k]);
    if (so && this.proc?.processado) { this.prefs = o; await this.proc.definirSensibilidade(o.autoSens ? null : o.sensibilidade); return; }
    await this.#abrirMic(o);
  }

  async alternarCamera() {
    if (this.modoVideo === 'camera') return this.#pararVideo();
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.#usarVideo(s.getVideoTracks()[0], 'camera');
  }

  // opcoes: { altura: 720|1080, fps: 30|60, som: boolean, movimento: boolean (jogo) ou false (texto/código) }
  async alternarTela(opcoes = {}) {
    if (this.modoVideo === 'tela') return this.#pararVideo();
    const { altura = 1080, fps = 30, som = true, movimento = true } = opcoes;
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { height: { ideal: altura }, frameRate: { ideal: fps, max: fps } },
      // suppressLocalAudioPlayback: não toca o som da aba para você (evita eco); restrictOwnAudio: não captura o som do próprio site (vozes da call)
      audio: som ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false, restrictOwnAudio: true } : false,
      systemAudio: som ? 'include' : 'exclude', selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
      windowAudio: som ? 'window' : 'exclude',
    });
    const track = s.getVideoTracks()[0];
    track.contentHint = movimento ? 'motion' : 'detail';
    track.onended = () => { if (this.videoTrack === track) this.#pararVideo(); }; // usuário clicou em "parar" no navegador
    this.somJogo?.stop();
    this.somJogo = s.getAudioTracks()[0] || null;                        // som do jogo/aba (quando o navegador permite)
    await this.#enviarSomTela();
    this.qualidade = { altura, fps, movimento };
    await this.#usarVideo(track, 'tela');
    return { comSom: !!this.somJogo };
  }

  // Música/som de uma aba (ex.: Spotify no navegador) separado da tela: dá para mostrar a janela do jogo e tocar a música junto
  get musicaAtiva() { return !!this.somMusica && this.somMusica.readyState === 'live'; }
  async alternarMusica() {
    if (this.musicaAtiva) { this.somMusica.stop(); this.somMusica = null; await this.#enviarSomTela(); this.aoMudar(); return false; }
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: true,   // o navegador exige vídeo no pedido; ele é descartado logo abaixo
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false, restrictOwnAudio: true },
      preferCurrentTab: false, selfBrowserSurface: 'exclude', systemAudio: 'exclude', surfaceSwitching: 'include', monitorTypeSurfaces: 'exclude',
    });
    s.getVideoTracks().forEach((t) => t.stop());
    const a = s.getAudioTracks()[0];
    if (!a) throw new Error('Nenhum som foi compartilhado. Escolha a aba do Spotify (open.spotify.com) em "Guia do Chrome" e deixe ligado "Compartilhar áudio da guia".');
    a.onended = () => { if (this.somMusica === a) { this.somMusica = null; this.#enviarSomTela(); this.aoMudar(); } };
    this.somMusica = a;
    await this.#enviarSomTela();
    this.aoMudar();
    return true;
  }

  // Junta o som do jogo e a música numa trilha só (o 2º canal de áudio que todo mundo já recebe)
  async #enviarSomTela() {
    const fontes = [this.somJogo, this.somMusica].filter((t) => t && t.readyState === 'live');
    this.mixCtx?.close(); this.mixCtx = null;
    let saida = fontes[0] || null;
    if (fontes.length > 1) {
      this.mixCtx = new AudioContext({ sampleRate: 48000 });
      const dest = this.mixCtx.createMediaStreamDestination();
      for (const t of fontes) this.mixCtx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      saida = dest.stream.getAudioTracks()[0];
    }
    this.audioTela = saida;
    for (const p of this.peers.values()) await p.audioTelaSender.replaceTrack(saida);
  }

  // Áudio com mais qualidade que o padrão do navegador (32 kbps): voz 64 kbps, som da tela 128 kbps, prioridade alta na rede
  async #qualidadeAudio(sender, bps) {
    try {
      const prm = sender.getParameters();
      prm.encodings = prm.encodings?.length ? prm.encodings : [{}];
      Object.assign(prm.encodings[0], { maxBitrate: bps, priority: 'high', networkPriority: 'high' });
      await sender.setParameters(prm);
    } catch { /* aplicado depois da negociação, se o navegador exigir */ }
  }

  // Ajusta a taxa de envio: tela com mais bits (nitidez) e preferência por fluidez (jogo) ou resolução (texto)
  async #configurarEnvio(sender) {
    try {
      const prm = sender.getParameters();
      prm.encodings = prm.encodings?.length ? prm.encodings : [{}];
      const tela = this.modoVideo === 'tela';
      prm.encodings[0].maxBitrate = tela ? (this.qualidade?.altura >= 1080 ? 4_000_000 : 2_500_000) : 1_200_000;
      prm.encodings[0].maxFramerate = tela ? this.qualidade?.fps || 30 : 30;
      prm.degradationPreference = tela && !this.qualidade?.movimento ? 'maintain-resolution' : 'balanced';
      await sender.setParameters(prm);
    } catch { /* navegador sem suporte: usa o padrão */ }
  }

  get participantes() { return this.peers.size + (this.local ? 1 : 0); }
  get conectados() { return [...this.peers.values()].filter((p) => p.pc.connectionState === 'connected').length; }

  // ---------- internos ----------
  async #usarVideo(track, modo) {
    this.videoTrack?.stop();
    this.videoTrack = track;
    this.modoVideo = modo;
    for (const p of this.peers.values()) { await p.videoSender.replaceTrack(track); this.#configurarEnvio(p.videoSender); }
    this.#mostrarVideo(this.eu, new MediaStream([track]), modo === 'camera');
    this.#enviarEstado();
    this.aoMudar();
  }

  async #pararVideo() {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.modoVideo = null;
    this.somJogo?.stop(); this.somJogo = null;
    for (const p of this.peers.values()) await p.videoSender.replaceTrack(null);
    await this.#enviarSomTela();   // a música (se houver) continua tocando para todos
    this.#mostrarVideo(this.eu, null);
    this.#enviarEstado();
    this.aoMudar();
  }

  #enviarEstado() {
    // Quem está compartilhando a tela fica marcado na presença da sala (o robô do Discord usa para avisar no servidor)
    const tela = this.modoVideo === 'tela';
    if (tela !== !!this.telaNaPresenca && this.canal) { this.telaNaPresenca = tela; this.canal.track({ nome: this.nome, tela }).catch(() => {}); }
    this.canal?.send({ type: 'broadcast', event: 'estado', payload: { de: this.eu, nome: this.nome, video: !!this.videoTrack, mudo: this.mudo, clipes: !!this.clipesAtivos } });
  }

  #estadoRemoto({ de, nome, video, mudo, clipes }) {
    if (clipes !== undefined) this.aoClipes?.({ de, nome, ativo: clipes });
    const p = this.peers.get(de);
    if (!p) return;
    p.mudo = mudo;
    if (video === false) this.#videoRemoto(p, false);
    this.#atualizarNome(p);
  }

  #atualizarNome(p) {
    const st = ESTADOS[p.pc.connectionState] ?? '';
    p.el.querySelector('.nome').textContent = p.nome + (p.mudo ? ' 🔇' : '') + (st ? ` · ${st}` : '');
    p.el.classList.toggle('sem-conexao', p.pc.connectionState === 'failed');
  }

  #videoRemoto(p, ligado) {
    p.el.querySelector('video.v').style.display = ligado ? 'block' : 'none';
    p.el.querySelector('.sem-video').style.display = ligado ? 'none' : 'block';
  }

  #sincronizar() {
    const estado = this.canal.presenceState();
    const presentes = new Set(Object.keys(estado));
    for (const id of presentes) {
      if (id === this.eu) continue;
      if (!this.peers.has(id)) this.#criarPeer(id, estado[id][0]?.nome || 'Jogador');
      this.peers.get(id).visto = true;
    }
    // Só remove quem já apareceu na lista e saiu. Conexões abertas por um convite que chegou
    // antes da lista atualizar ganham 15 s de tolerância.
    for (const [id, p] of [...this.peers]) {
      if (!presentes.has(id) && (p.visto || Date.now() - p.criado > 15000)) this.#remover(id);
    }
    this.aoMudar();
  }

  #criarPeer(id, nome) {
    const pc = new RTCPeerConnection({ iceServers: this.ice.lista });
    const p = { pc, nome, polite: this.eu < id, makingOffer: false, ignoreOffer: false, pendentes: [], mudo: false, criado: Date.now(), visto: false };
    this.peers.set(id, p);

    p.micSender = pc.addTrack(this.local.getAudioTracks()[0], this.local);
    this.#qualidadeAudio(p.micSender, 64000);
    p.videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    p.audioTelaSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;   // som da tela compartilhada
    this.#qualidadeAudio(p.audioTelaSender, 128000);
    if (this.videoTrack) { p.videoSender.replaceTrack(this.videoTrack); this.#configurarEnvio(p.videoSender); }
    if (this.audioTela) p.audioTelaSender.replaceTrack(this.audioTela);

    const remoto = new MediaStream();
    p.el = this.#tile(id, nome, remoto, false);
    pc.ontrack = ({ track }) => {
      remoto.addTrack(track);
      if (track.kind === 'audio') {
        // 2ª trilha de áudio = som da tela compartilhada: toca num elemento próprio
        if (remoto.getAudioTracks().length > 1) {
          const a = document.createElement('audio');
          a.autoplay = true; a.srcObject = new MediaStream([track]); a.className = 'som-tela';
          p.el.append(a); a.play().catch(() => this.aoAviso('som-bloqueado'));
          return;
        }
        this.#detectarFala(remoto, p.el);
        const voz = p.el.querySelector('audio');
        voz.srcObject = new MediaStream([track]);           // só a voz (o som da tela toca em outro elemento)
        const saida = prefsAudio().saida;
        if (saida && voz.setSinkId) voz.setSinkId(saida).catch(() => {}); // saída escolhida antes de entrar
        voz.play().catch(() => this.aoAviso('som-bloqueado'));
      } else {
        // o vídeo aparece quando os quadros começam a chegar (tela ou câmera ligada)
        track.onunmute = () => this.#videoRemoto(p, true);
        track.onmute = () => this.#videoRemoto(p, false);
      }
    };

    // Candidatos ICE vão em lote (menos mensagens = menos risco de bater no limite do Realtime)
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      (p.lote ||= []).push(candidate.toJSON());
      clearTimeout(p.timerLote);
      p.timerLote = setTimeout(() => { const c = p.lote.splice(0); if (c.length) this.#enviar(id, { candidates: c }); }, 150);
    };
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.#enviar(id, { desc: pc.localDescription });
      } catch (e) { console.error(e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { this.#qualidadeAudio(p.micSender, 64000); this.#qualidadeAudio(p.audioTelaSender, 128000); }
      this.#atualizarNome(p);
      if (pc.connectionState === 'connected') { p.tentativas = 0; p.desistiu = false; }
      if (pc.connectionState === 'failed') {
        pc.restartIce(); p.tentativas = (p.tentativas || 0) + 1;
        if (!this.ice.turn) this.aoAviso('sem-turn');
      }
      this.aoMudar();
    };
    setTimeout(() => this.#enviarEstado(), 1500);
    // Não conectou em 20 s? Provavelmente a rede bloqueou a conexão direta.
    setTimeout(() => { if (this.peers.get(id) === p && pc.connectionState !== 'connected') this.aoAviso(this.ice.turn ? 'lento' : 'sem-turn'); }, 20000);
    return p;
  }

  // "Perfect negotiation" (padrão recomendado pelo W3C) para evitar colisões de oferta
  async #sinal({ de, nome, desc, candidate, candidates }) {
    if (candidates) { for (const c of candidates) await this.#sinal({ de, nome, candidate: c }); return; }
    // A oferta pode chegar antes de a lista de presença atualizar: cria a conexão na hora
    // (antes ela era descartada e as pessoas se viam na lista, mas sem áudio/vídeo).
    let p = this.peers.get(de);
    if (!p) {
      if (!this.local) return;
      p = this.#criarPeer(de, nome || this.canal.presenceState()[de]?.[0]?.nome || 'Jogador');
    }
    const { pc } = p;
    try {
      if (desc) {
        const colisao = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && colisao;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription({ type: desc.type, sdp: melhorarOpus(desc.sdp) });
        // candidatos que chegaram antes da descrição
        for (const c of p.pendentes.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          this.#enviar(de, { desc: pc.localDescription });
        }
      } else if (candidate) {
        if (!pc.remoteDescription) { p.pendentes.push(candidate); return; }
        try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffer) console.warn(e); }
      }
    } catch (e) { console.error(e); }
  }

  #enviar(para, dados) {
    this.canal.send({ type: 'broadcast', event: 'sinal', payload: { de: this.eu, nome: this.nome, para, ...JSON.parse(JSON.stringify(dados)) } });
  }

  #remover(id) {
    const p = this.peers.get(id);
    if (!p) return;
    miniPlayer.remover(id);
    p.pc.close();
    p.el.remove();
    this.peers.delete(id);
  }

  #tile(id, nome, stream, local) {
    const el = document.createElement('div');
    el.className = 'participante';
    el.dataset.id = id;
    el.innerHTML = `<span class="sem-video">${esc(nome.trim()[0]?.toUpperCase() || '?')}</span>
      <video class="v" autoplay playsinline muted style="display:none"></video>
      ${local ? '' : '<audio autoplay playsinline></audio>'}
      ${local ? '' : '<span class="qualidade" role="img" aria-label="Medindo conexão"></span>'}<span class="nome">${esc(nome)}${local ? '' : ' · conectando…'}</span>
      <span class="acoes-video">
        <button class="pip" title="Mini player: põe este vídeo numa janela flutuante por cima do jogo (no Chrome dá para pôr vários)" aria-label="Janela flutuante">⧉</button>
        <button class="tela-cheia" title="Tela cheia" aria-label="Tela cheia">⛶</button>
      </span>`;
    if (!local) {
      el.querySelector('video.v').srcObject = stream;
    } else {
      this.#detectarFala(stream, el);
    }
    el.querySelector('.pip').onclick = async (e) => {
      e.stopPropagation();
      const v = el.querySelector('video.v');
      // Chrome/Edge: uma janela flutuante com VÁRIOS vídeos (clique ⧉ em quantos quiser); nos outros, um vídeo por vez
      if (window.documentPictureInPicture) return miniPlayer.alternar(id, nome, v, el);
      try {
        if (document.pictureInPictureElement === v) await document.exitPictureInPicture();
        else if (v.style.display !== 'none' && v.requestPictureInPicture) await v.requestPictureInPicture();
        else this.aoAviso('sem-video');
      } catch { this.aoAviso('sem-pip'); }
    };
    el.querySelector('.tela-cheia').onclick = (e) => {
      e.stopPropagation();
      const v = el.querySelector('video.v');
      (document.fullscreenElement ? document.exitFullscreen() : (v.style.display !== 'none' ? v : el).requestFullscreen?.())?.catch?.(() => {});
    };
    this.container.append(el);
    return el;
  }

  #mostrarVideo(id, stream, espelhar = false) {
    const el = this.container.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    const v = el.querySelector('video.v');
    v.srcObject = stream;
    v.style.display = stream ? 'block' : 'none';
    v.style.transform = espelhar ? 'scaleX(-1)' : '';
    el.querySelector('.sem-video').style.display = stream ? 'none' : 'block';
  }

  #detectarFala(stream, el) {
    if (el.dataset.analisando) return;
    el.dataset.analisando = '1';
    this.audioCtx ||= new AudioContext();
    const an = this.audioCtx.createAnalyser();
    an.fftSize = 512;
    const buf = new Uint8Array(an.frequencyBinCount);
    // A trilha do microfone é trocada (supressão de ruído, troca de aparelho):
    // religa o analisador sempre que a trilha atual mudar.
    let fonte = null, trilhaId = '';
    const loop = () => {
      if (!el.isConnected) { fonte?.disconnect(); return; }
      const t = stream.getAudioTracks()[0];
      if ((t?.id || '') !== trilhaId) {
        fonte?.disconnect(); fonte = null; trilhaId = t?.id || '';
        if (t) { fonte = this.audioCtx.createMediaStreamSource(new MediaStream([t])); fonte.connect(an); }
      }
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {});
      let media = 0;
      if (fonte && t.enabled && !t.muted) { an.getByteFrequencyData(buf); media = buf.reduce((x, y) => x + y, 0) / buf.length; }
      el.classList.toggle('falando', media > 12);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
