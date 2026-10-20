// Clipes da call: com os clipes ligados, o navegador grava em segundo plano o vídeo em destaque (tela ou câmera)
// e as vozes de todos. "Clipar" salva os últimos ~30 a 60 segundos. Nada sai do seu aparelho até você baixar ou postar.
// Dois gravadores revezam (um recomeça a cada 60 s, o outro 30 s depois): sempre existe um com pelo menos 30 s gravados.
const LARGURA = 1280, ALTURA = 720, CICLO = 60_000, FPS = 30;

export const clipesSuportados = () => typeof MediaRecorder !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
  && ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].some((t) => MediaRecorder.isTypeSupported(t));

export class Clipador {
  constructor(sala) {
    this.sala = sala;
    this.ligado = false;
  }

  // Maior vídeo visível na call (quem está compartilhando a tela costuma estar em destaque)
  #fonteVideo() {
    let melhor = null, area = 0;
    for (const v of this.sala.container.querySelectorAll('video.v')) {
      if (!v.srcObject || !v.videoWidth || v.style.display === 'none') continue;
      const r = v.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; melhor = v; }
    }
    return melhor;
  }

  #desenhar() {
    const { ctx } = this;
    ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, LARGURA, ALTURA);
    const v = this.#fonteVideo();
    if (v) {
      const esc = Math.min(LARGURA / v.videoWidth, ALTURA / v.videoHeight);
      const w = v.videoWidth * esc, h = v.videoHeight * esc;
      ctx.drawImage(v, (LARGURA - w) / 2, (ALTURA - h) / 2, w, h);
    } else {
      // Ninguém com vídeo: um quadro com quem está na call (o áudio é o principal)
      ctx.fillStyle = '#ffd33c'; ctx.font = 'bold 44px Anton, Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('🎧 Call no Control Critic', LARGURA / 2, ALTURA / 2 - 20);
      ctx.fillStyle = '#a3a3b2'; ctx.font = '28px Inter, sans-serif';
      const nomes = [...this.sala.container.querySelectorAll('.nome')].map((n) => n.textContent.split('·')[0].trim()).filter(Boolean).slice(0, 6);
      ctx.fillText(nomes.join(' · '), LARGURA / 2, ALTURA / 2 + 36);
    }
    // marca d'água discreta
    ctx.globalAlpha = 0.7; ctx.fillStyle = '#ffd33c'; ctx.font = 'bold 22px Inter, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('Control Critic', LARGURA - 18, ALTURA - 18); ctx.globalAlpha = 1;
  }

  // Liga no mixer o seu microfone e o áudio de todo mundo (inclusive quem entrar depois)
  #conectarAudios() {
    const fontes = [this.sala.local, ...[...this.sala.container.querySelectorAll('audio')].map((a) => a.srcObject)].filter(Boolean);
    for (const s of fontes) {
      for (const t of s.getAudioTracks()) {
        if (this.conectados.has(t.id) || t.readyState !== 'live') continue;
        this.conectados.add(t.id);
        try { this.audio.createMediaStreamSource(new MediaStream([t])).connect(this.destino); } catch { /* trilha indisponível */ }
      }
    }
  }

  #novoGravador() {
    const tipo = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const g = { inicio: Date.now(), partes: [], rec: new MediaRecorder(this.fluxo, { mimeType: tipo, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }) };
    g.rec.ondataavailable = (e) => { if (e.data.size) g.partes.push(e.data); };
    g.rec.start(1000);
    return g;
  }

  ligar() {
    if (this.ligado) return;
    this.canvas = document.createElement('canvas');
    this.canvas.width = LARGURA; this.canvas.height = ALTURA;
    this.ctx = this.canvas.getContext('2d');
    this.audio = new AudioContext();
    this.destino = this.audio.createMediaStreamDestination();
    this.conectados = new Set();
    this.#conectarAudios();
    this.fluxo = new MediaStream([this.canvas.captureStream(FPS).getVideoTracks()[0], this.destino.stream.getAudioTracks()[0]]);
    this.quadros = setInterval(() => this.#desenhar(), 1000 / FPS);
    this.audios = setInterval(() => this.#conectarAudios(), 2000);
    // dois gravadores revezando
    this.gravadores = [this.#novoGravador()];
    this.segundo = setTimeout(() => { this.gravadores.push(this.#novoGravador()); }, CICLO / 2);
    this.ciclo = setInterval(() => {
      // o mais antigo recomeça (descarta o que passou de 60 s)
      const velho = this.gravadores.reduce((a, b) => (a.inicio < b.inicio ? a : b));
      try { velho.rec.stop(); } catch { /* já parado */ }
      this.gravadores[this.gravadores.indexOf(velho)] = this.#novoGravador();
    }, CICLO / 2);
    this.ligado = true;
  }

  desligar() {
    if (!this.ligado) return;
    clearInterval(this.quadros); clearInterval(this.audios); clearInterval(this.ciclo); clearTimeout(this.segundo);
    for (const g of this.gravadores) { try { g.rec.stop(); } catch { /* já parado */ } }
    this.fluxo.getTracks().forEach((t) => t.stop());
    this.audio.close().catch(() => {});
    this.gravadores = []; this.ligado = false;
  }

  // Últimos ~30 a 60 s: o gravador mais antigo já tem tudo desde o começo dele (arquivo válido sem parar a gravação)
  async clipar() {
    if (!this.ligado || !this.gravadores.length) throw new Error('Ligue os clipes primeiro.');
    const g = this.gravadores.reduce((a, b) => (a.inicio < b.inicio ? a : b));
    g.rec.requestData();
    await new Promise((r) => setTimeout(r, 300));
    const segundos = Math.round((Date.now() - g.inicio) / 1000);
    if (segundos < 3) throw new Error('Espere alguns segundos depois de ligar os clipes.');
    return { blob: new Blob(g.partes, { type: 'video/webm' }), segundos };
  }
}
