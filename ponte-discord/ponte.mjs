// Ponte de voz: canal de voz do Discord <-> call da comunidade no Control Critic.
//
// Um robô do Discord entra no canal de voz e, ao mesmo tempo, entra na call do site como um participante
// chamado "🎮 Discord". O áudio é repassado nos dois sentidos:
//   Discord -> site: cada pessoa do Discord é decodificada (Opus -> PCM), as vozes são misturadas e enviadas
//                    para a call do site como uma trilha só.
//   site -> Discord: as vozes de quem está no site (e o som de tela compartilhada) são misturadas e tocadas
//                    pelo robô no canal do Discord.
// Só voz: robôs do Discord não podem transmitir vídeo/tela.
// A ponte só liga quando há gente dos dois lados (e desliga 30 s depois que um lado esvazia).
//
// Configuração por variáveis de ambiente (arquivo .env): veja .env.exemplo e o LEIA-ME.md.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import wrtc from '@roamhq/wrtc';
import { Readable } from 'node:stream';

const { RTCPeerConnection, MediaStream, nonstandard: { RTCAudioSource, RTCAudioSink } } = wrtc;
const env = (k, padrao = '') => (process.env[k] ?? padrao).trim();
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);
const TESTE = env('MODO_TESTE') === '1'; // sem Discord: toca um bipe na call do site e mede o áudio recebido

const CFG = {
  supabaseUrl: env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, ''),
  chavePublica: env('SUPABASE_CHAVE_PUBLICA'),
  chaveSecreta: env('SUPABASE_SERVICE_KEY'),     // lê as chaves das salas e a lista de pontes (fica só no seu PC)
  site: env('SITE_URL', 'https://control-critic.netlify.app').replace(/\/+$/, ''),
  token: env('DISCORD_TOKEN'),
  nome: env('NOME_NA_CALL', '🎮 Discord'),
  // Opcional (as pontes normalmente vêm do site): "idDaComunidade:idDoCanalDeVoz", várias separadas por vírgula
  pontes: env('PONTES').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [c, v] = x.split(':'); return { comunidade: Number(c), canal: v?.trim() }; }),
};
const faltam = [['SUPABASE_URL', CFG.supabaseUrl], ['SUPABASE_CHAVE_PUBLICA', CFG.chavePublica],
  ...(TESTE ? [['PONTES', CFG.pontes.length]] : [['DISCORD_TOKEN', CFG.token], ['SUPABASE_SERVICE_KEY', CFG.chaveSecreta]])].filter(([, v]) => !v).map(([k]) => k);
if (faltam.length) { console.error(`Faltam variáveis no .env: ${faltam.join(', ')}`); process.exit(1); }
if (CFG.pontes.some((p) => !p.comunidade || !/^\d{17,20}$/.test(p.canal || ''))) {
  console.error('PONTES em formato inválido. Use idDaComunidade:idDoCanalDeVoz (ex.: 3:123456789012345678).'); process.exit(1);
}
if (/^sb_secret_|service_role/.test(CFG.chavePublica)) { console.error('SUPABASE_CHAVE_PUBLICA deve ser a chave PÚBLICA (sb_publishable_...), não a secreta.'); process.exit(1); }

// ---------------------------------------------------------------------------
// Áudio: tudo em PCM 16 bits, 48 kHz. A mesa mistura várias fontes (somando e limitando o volume).
// ---------------------------------------------------------------------------
const TAXA = 48000;
class Mesa {
  constructor(maxMs = 300) { this.fontes = new Map(); this.max = (TAXA * maxMs) / 1000; }
  colocar(chave, amostras) {
    let f = this.fontes.get(chave);
    if (!f) this.fontes.set(chave, (f = { partes: [], total: 0, pronto: false, visto: Date.now() }));
    f.partes.push(amostras); f.total += amostras.length; f.visto = Date.now();
    while (f.total > this.max) f.total -= f.partes.shift().length;   // atraso demais: descarta o mais antigo
    if (f.total >= 960 * 2) f.pronto = true;                          // ~40 ms de folga antes de começar a tocar (evita picotar)
  }
  tirar(n) {
    const soma = new Int32Array(n);
    for (const [chave, f] of this.fontes) {
      if (!f.pronto) { if (Date.now() - f.visto > 10000) this.fontes.delete(chave); continue; }
      let i = 0;
      while (i < n && f.partes.length) {
        const p = f.partes[0], q = Math.min(p.length, n - i);
        for (let j = 0; j < q; j++) soma[i + j] += p[j];
        i += q; f.total -= q;
        if (q === p.length) f.partes.shift(); else f.partes[0] = p.subarray(q);
      }
      if (!f.total) f.pronto = false;
    }
    const out = new Int16Array(n);
    for (let j = 0; j < n; j++) out[j] = soma[j] > 32767 ? 32767 : soma[j] < -32768 ? -32768 : soma[j];
    return out;
  }
  limpar() { this.fontes.clear(); }
}

// Converte o que chega do WebRTC (qualquer taxa, 1 ou 2 canais) para mono 48 kHz
function paraMono48k({ samples, sampleRate, channelCount, numberOfFrames }) {
  let mono = samples;
  if (channelCount === 2) { mono = new Int16Array(numberOfFrames); for (let i = 0; i < numberOfFrames; i++) mono[i] = (samples[2 * i] + samples[2 * i + 1]) >> 1; }
  else if (channelCount !== 1) return null;
  else mono = Int16Array.from(samples);
  if (sampleRate === TAXA) return mono;
  const n = Math.round((mono.length * TAXA) / sampleRate), out = new Int16Array(n), k = (mono.length - 1) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) { const x = i * k, a = Math.floor(x), b = Math.min(a + 1, mono.length - 1); out[i] = mono[a] + (mono[b] - mono[a]) * (x - a); }
  return out;
}
const estereoParaMono = (buf) => { const s = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1), m = new Int16Array(s.length >> 1); for (let i = 0; i < m.length; i++) m[i] = (s[2 * i] + s[2 * i + 1]) >> 1; return m; };
const monoParaEstereoBuffer = (m) => { const s = new Int16Array(m.length * 2); for (let i = 0; i < m.length; i++) s[2 * i] = s[2 * i + 1] = m[i]; return Buffer.from(s.buffer); };
const volume = (a) => { let s = 0; for (const x of a) s += x * x; return Math.round(Math.sqrt(s / Math.max(1, a.length))); };

// ---------------------------------------------------------------------------
// Lado do site: participa da call igual a um navegador (mesmo protocolo de sinalização do js/voz.js)
// ---------------------------------------------------------------------------
async function servidoresIce() {
  const lista = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
  try {
    const r = await fetch(`${CFG.site}/.netlify/functions/turn`, { headers: { Authorization: `Bearer ponte.${createHash('sha256').update('turn:' + CFG.chaveSecreta).digest('hex')}` }, signal: AbortSignal.timeout(10000) });
    if (r.ok) { const d = await r.json(); if (d.iceServers?.length) { log('TURN do site obtido.'); return [...lista, ...d.iceServers]; } }
  } catch { /* segue só com STUN */ }
  log('⚠️ Sem TURN: pessoas em redes restritas (4G, CGNAT) podem não ouvir a ponte.');
  return lista;
}

class SalaSite {
  constructor({ sb, salaId, eu, aoAudio, aoMudar }) {
    Object.assign(this, { sb, salaId, eu, aoAudio, aoMudar });
    this.peers = new Map();
    this.ativo = false;
    this.fonte = new RTCAudioSource();                 // o que o Discord fala entra aqui
    this.trilha = this.fonte.createTrack();
    this.stream = new MediaStream([this.trilha]);
  }

  async conectar() {
    this.ice = await servidoresIce();
    this.canal = this.sb.channel(`voz:${this.salaId}`, { config: { presence: { key: this.eu }, broadcast: { self: false } } });
    this.canal
      .on('presence', { event: 'sync' }, () => { this.#sincronizar(); this.aoMudar(); })
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { if (payload.para === this.eu) this.#sinal(payload).catch((e) => log('sinal:', e.message)); });
    await new Promise((ok, erro) => this.canal.subscribe((st) => {
      if (st === 'SUBSCRIBED') ok();
      if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') erro(new Error('Não foi possível conectar ao Realtime do Supabase.'));
    }));
    this.vigia = setInterval(() => this.#vigiar(), 4000);
  }

  // Pessoas na call do site (sem contar a própria ponte)
  humanos() { return Object.keys(this.canal?.presenceState() || {}).filter((id) => id !== this.eu); }

  async ativar(texto) {
    if (this.ativo) return;
    this.ativo = true;
    await this.canal.track({ nome: CFG.nome });
    this.#sincronizar();
    if (texto) this.canal.send({ type: 'broadcast', event: 'chat', payload: { de: this.eu, nome: CFG.nome, texto, em: Date.now() } });
  }
  async desativar() {
    if (!this.ativo) return;
    this.ativo = false;
    for (const id of [...this.peers.keys()]) this.#remover(id);
    await this.canal.untrack().catch(() => {});
  }
  async encerrar() { clearInterval(this.vigia); await this.desativar(); await this.sb.removeChannel(this.canal).catch(() => {}); this.trilha.stop(); }
  falar(amostras10ms) { this.fonte.onData({ samples: amostras10ms, sampleRate: TAXA, bitsPerSample: 16, channelCount: 1, numberOfFrames: amostras10ms.length }); }

  #sincronizar() {
    if (!this.ativo) return;
    const estado = this.canal.presenceState();
    for (const id of Object.keys(estado)) {
      if (id === this.eu) continue;
      if (!this.peers.has(id)) this.#criarPeer(id, estado[id][0]?.nome || 'Jogador');
      this.peers.get(id).visto = true;
    }
    for (const [id, p] of [...this.peers]) if (!estado[id] && (p.visto || Date.now() - p.criado > 15000)) this.#remover(id);
  }

  #criarPeer(id, nome) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    // O id da ponte começa com "zzzz", então os navegadores são sempre o lado "polite" da negociação:
    // a ponte nunca precisa desfazer uma oferta (rollback).
    const p = { pc, nome, makingOffer: false, pendentes: [], sinks: [], criado: Date.now(), visto: false, lote: [] };
    this.peers.set(id, p);
    pc.addTrack(this.trilha, this.stream);                              // = microfone do participante "Discord"
    pc.addTransceiver('video', { direction: 'recvonly' });              // mesmo formato do site (vídeo e som da tela)
    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.ontrack = ({ track }) => {
      if (track.kind !== 'audio') return;
      const sink = new RTCAudioSink(track);
      sink.ondata = (d) => { const m = paraMono48k(d); if (m) this.aoAudio(`${id}:${track.id}`, m); };
      p.sinks.push(sink);
    };
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      p.lote.push({ candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex });
      clearTimeout(p.timerLote);
      p.timerLote = setTimeout(() => { const c = p.lote.splice(0); if (c.length) this.#enviar(id, { candidates: c }); }, 150);
    };
    pc.onnegotiationneeded = () => this.#oferecer(id, p);
    pc.onconnectionstatechange = () => {
      log(`site: ${nome} -> ${pc.connectionState}`);
      if (pc.connectionState === 'failed') this.#oferecer(id, p, true);
    };
    log(`site: conectando com ${nome}`);
    return p;
  }

  async #oferecer(id, p, reiniciarIce = false) {
    if (p.makingOffer || p.pc.signalingState !== 'stable') return;
    try {
      p.makingOffer = true;
      const oferta = await p.pc.createOffer(reiniciarIce ? { iceRestart: true } : {});
      if (p.pc.signalingState !== 'stable') return;
      await p.pc.setLocalDescription(oferta);
      this.#enviar(id, { desc: { type: p.pc.localDescription.type, sdp: p.pc.localDescription.sdp } });
    } catch (e) { log('oferta:', e.message); } finally { p.makingOffer = false; }
  }

  async #sinal({ de, nome, desc, candidate, candidates }) {
    if (!this.ativo) return;
    if (candidates) { for (const c of candidates) await this.#sinal({ de, nome, candidate: c }); return; }
    let p = this.peers.get(de);
    if (!p) p = this.#criarPeer(de, nome || 'Jogador');
    const { pc } = p;
    if (desc) {
      const colisao = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
      if (colisao) return;                                              // lado "impolite": ignora; o navegador cede
      await pc.setRemoteDescription(desc);
      for (const c of p.pendentes.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      if (desc.type === 'offer') {
        const resposta = await pc.createAnswer();
        await pc.setLocalDescription(resposta);
        this.#enviar(de, { desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }
    } else if (candidate) {
      if (!pc.remoteDescription) { p.pendentes.push(candidate); return; }
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  // Mensagens podem se perder: a cada 4 s reenvia a oferta para quem ainda não conectou
  #vigiar() {
    for (const [id, p] of this.peers) {
      const { pc } = p;
      if (pc.connectionState === 'connected' || Date.now() - p.criado < 5000) continue;
      if (pc.signalingState === 'have-local-offer' && pc.localDescription) this.#enviar(id, { desc: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      else if (pc.signalingState === 'stable' && !pc.remoteDescription) this.#oferecer(id, p);
      else if (pc.signalingState === 'stable' && ['failed', 'disconnected'].includes(pc.iceConnectionState)) this.#oferecer(id, p, true);
    }
  }

  #enviar(para, dados) {
    this.canal.send({ type: 'broadcast', event: 'sinal', payload: { de: this.eu, nome: CFG.nome, para, ...dados } });
  }

  #remover(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.sinks.forEach((s) => s.stop()); p.pc.close(); this.peers.delete(id);
    log(`site: ${p.nome} saiu`);
  }
}

// ---------------------------------------------------------------------------
// Lado do Discord
// ---------------------------------------------------------------------------
class CanalDiscord {
  constructor({ voz, cliente, canal, aoAudio }) {
    Object.assign(this, { voz, cliente, canal, aoAudio });
    this.ouvindo = new Set();
    // Fila do que o site fala (PCM estéreo 48 kHz): preenchida no ritmo do relógio, lida pelo player do Discord
    this.saida = new Readable({ read() {}, highWaterMark: 3840 * 2 });
  }
  humanos() { return [...this.canal.members.values()].filter((m) => !m.user.bot).map((m) => m.displayName); }

  async entrar() {
    const { joinVoiceChannel, entersState, VoiceConnectionStatus, createAudioPlayer, createAudioResource, StreamType, NoSubscriberBehavior } = this.voz;
    this.conexao = joinVoiceChannel({ channelId: this.canal.id, guildId: this.canal.guild.id, adapterCreator: this.canal.guild.voiceAdapterCreator, selfDeaf: false, selfMute: false });
    await entersState(this.conexao, VoiceConnectionStatus.Ready, 20000);
    this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    this.player.on('error', (e) => log('player:', e.message));
    this.conexao.subscribe(this.player);
    this.player.play(createAudioResource(this.saida, { inputType: StreamType.Raw }));
    this.conexao.receiver.speaking.on('start', (uid) => this.#ouvir(uid));
    this.conexao.on('stateChange', (_, novo) => { if (novo.status === VoiceConnectionStatus.Disconnected) log('discord: desconectado do canal'); });
    log(`discord: entrei em #${this.canal.name}`);
  }

  #ouvir(uid) {
    if (this.ouvindo.has(uid) || uid === this.cliente.user.id) return;
    const { EndBehaviorType, prism } = this.voz;
    this.ouvindo.add(uid);
    const opus = this.conexao.receiver.subscribe(uid, { end: { behavior: EndBehaviorType.AfterSilence, duration: 800 } });
    const dec = new prism.opus.Decoder({ rate: TAXA, channels: 2, frameSize: 960 });
    const fim = () => { this.ouvindo.delete(uid); opus.destroy(); dec.destroy(); };
    opus.on('error', fim); dec.on('error', fim); opus.on('end', fim); dec.on('close', fim);
    opus.pipe(dec).on('data', (buf) => this.aoAudio(`d:${uid}`, estereoParaMono(buf)));
  }

  tocar(mono20ms) {
    if (this.saida.readableLength > 3840 * 4) return;   // o player atrasou: não acumula atraso
    this.saida.push(monoParaEstereoBuffer(mono20ms));
  }
  sair() { this.conexao?.destroy(); this.conexao = null; this.ouvindo.clear(); log(`discord: saí de #${this.canal.name}`); }
}

// ---------------------------------------------------------------------------
// Uma ponte por comunidade
// ---------------------------------------------------------------------------
let adm = null; // cliente com a chave secreta (lê as chaves das salas e a lista de pontes)
async function salaDaComunidade(id) {
  if (TESTE && env('SALA_TESTE')) return { nome: 'teste', salaId: env('SALA_TESTE') };
  const { data: c, error } = await adm.from('communities').select('id,name').eq('id', id).maybeSingle();
  if (error || !c) throw new Error(`Comunidade ${id} não encontrada (${error?.message || 'confira o número no endereço comunidade.html?id=...'}).`);
  // Toda sala de call tem uma chave que só membros (e a ponte) conhecem
  const { data: s } = await adm.from('community_secrets').select('room_key').eq('community_id', id).maybeSingle();
  if (!s) throw new Error(`Não achei a chave da sala da comunidade ${id}. Rode o schema.sql atualizado no Supabase.`);
  return { nome: c.name, salaId: `${id}-${s.room_key}` };
}

async function criarPonte({ comunidade, canal: canalId, servidor }, sb, discord) {
  const { nome, salaId } = await salaDaComunidade(comunidade);
  const doSite = new Mesa(), doDiscord = new Mesa();
  const timers = [];
  let ativo = false, ocupado = false, timerSaida = null, pronto = false, encerrada = false;
  const site = new SalaSite({ sb, salaId, eu: `zzzz-ponte-discord-${comunidade}`, aoAudio: (k, a) => doSite.colocar(k, a), aoMudar: () => avaliar() });
  let dc = null, ouvinteVoz = null;
  if (discord) {
    const canal = await discord.cliente.channels.fetch(canalId).catch(() => null);
    if (!canal?.isVoiceBased?.()) throw new Error(`Canal de voz ${canalId} não encontrado. O robô foi adicionado ao servidor? O ID é de um canal de VOZ?`);
    if (servidor && canal.guild.id !== servidor) throw new Error(`O canal ${canalId} não é do servidor ${servidor} informado na comunidade.`);
    dc = new CanalDiscord({ voz: discord.voz, cliente: discord.cliente, canal, aoAudio: (k, a) => doDiscord.colocar(k, a) });
    ouvinteVoz = (antes, depois) => { if ([antes.channelId, depois.channelId].includes(canalId)) avaliar(); };
    discord.aoMudarVoz.add(ouvinteVoz);
  }
  await site.conectar();
  log(`ponte "${nome}" pronta: call do site <-> ${dc ? '#' + dc.canal.name + ' (' + dc.canal.guild.name + ')' : 'MODO TESTE (bipe)'}`);

  // Liga quando há gente dos dois lados; desliga 30 s depois que um lado esvazia
  async function avaliar() {
    if (ocupado || !pronto || encerrada) return;
    const noSite = site.humanos(), noDiscord = dc ? dc.humanos() : ['teste'];
    const deveLigar = noSite.length > 0 && noDiscord.length > 0;
    if (deveLigar) { clearTimeout(timerSaida); timerSaida = null; }
    if (deveLigar && !ativo) {
      ocupado = true;
      try {
        if (dc) await dc.entrar();
        await site.ativar(dc ? `Ponte ligada: quem está no Discord (${noDiscord.join(', ')}) ouve vocês e vocês ouvem o Discord.` : null);
        ativo = true; log(`ponte "${nome}" LIGADA (${noSite.length} no site, ${noDiscord.length} no Discord)`);
      } catch (e) { log(`não consegui ligar a ponte "${nome}":`, e.message); dc?.sair(); }
      ocupado = false;
    } else if (!deveLigar && ativo && !timerSaida) {
      timerSaida = setTimeout(async () => {
        timerSaida = null;
        if (site.humanos().length && (!dc || dc.humanos().length)) return;
        await desligar(); log(`ponte "${nome}" desligada (um dos lados ficou vazio)`);
      }, 30000);
    }
  }
  async function desligar() { await site.desativar(); dc?.sair(); doSite.limpar(); doDiscord.limpar(); ativo = false; }
  pronto = true;
  timers.push(setInterval(avaliar, 15000));
  avaliar();

  // Relógio de áudio: a cada 10 ms manda o Discord para o site; a cada 20 ms manda o site para o Discord
  let fase = 0, t = 0, medidas = [], prox = performance.now(), timerRelogio = null;
  const passo = () => {
    if (!ativo) return;
    let paraSite = doDiscord.tirar(480);
    if (!dc) { const a = new Int16Array(480); for (let i = 0; i < 480; i++) a[i] = Math.sin(2 * Math.PI * 440 * (t++) / TAXA) * 6000; paraSite = a; }
    site.falar(paraSite);
    if (++fase % 2 === 0) {
      const paraDiscord = doSite.tirar(960);
      if (dc) dc.tocar(paraDiscord); else medidas.push(volume(paraDiscord));
    }
  };
  const relogio = () => {
    if (encerrada) return;
    const agora = performance.now();
    if (agora - prox > 200) prox = agora;                // ficou travado: não tenta "recuperar" segundos de áudio
    while (prox <= agora) { passo(); prox += 10; }
    timerRelogio = setTimeout(relogio, Math.max(0, prox - performance.now()));
  };
  relogio();
  if (!dc) timers.push(setInterval(() => { if (medidas.length) { log(`teste: volume recebido do site (média 5 s): ${Math.round(medidas.reduce((a, b) => a + b, 0) / medidas.length)}`); medidas = []; } }, 5000));

  return {
    async encerrar() {
      encerrada = true; clearTimeout(timerSaida); clearTimeout(timerRelogio); timers.forEach(clearInterval);
      if (ouvinteVoz) discord.aoMudarVoz.delete(ouvinteVoz);
      await desligar(); await site.encerrar();
      log(`ponte "${nome}" removida`);
    },
  };
}

// ---------------------------------------------------------------------------
// Lista de pontes: as do .env (PONTES) + as que os donos de comunidade configuraram no site
// (tabela discord_bridges, confirmadas com /vincular). Atualiza a cada 30 s, sem reiniciar.
// ---------------------------------------------------------------------------
async function pontesDoBanco() {
  const { data, error } = await adm.from('discord_bridges').select('community_id,guild_id,channel_id').eq('verified', true).eq('active', true);
  if (error) { log('não consegui ler as pontes do site:', error.message); return null; }
  return data.map((b) => ({ comunidade: Number(b.community_id), canal: b.channel_id, servidor: b.guild_id }));
}

// /vincular <código>: um administrador do servidor confirma que aceita a ponte com a comunidade
function registrarVincular(discord) {
  const { cliente, djs } = discord;
  cliente.application.commands.set([{
    name: 'vincular', description: 'Liga um canal de voz deste servidor à call de uma comunidade do Control Critic',
    defaultMemberPermissions: djs.PermissionFlagsBits.ManageGuild, contexts: [djs.InteractionContextType.Guild],
    options: [{ type: djs.ApplicationCommandOptionType.String, name: 'codigo', description: 'Código mostrado na comunidade, no site (aba Discord / PS5)', required: true, minLength: 6, maxLength: 6 }],
  }]).then(() => log('discord: comando /vincular registrado')).catch((e) => log('não consegui registrar /vincular:', e.message));
  cliente.on(djs.Events.InteractionCreate, async (it) => {
    if (!it.isChatInputCommand() || it.commandName !== 'vincular') return;
    const responder = (texto) => it.reply({ content: texto, flags: djs.MessageFlags.Ephemeral }).catch(() => {});
    if (!it.inGuild()) return responder('Use este comando dentro do servidor.');
    if (!it.memberPermissions?.has(djs.PermissionFlagsBits.ManageGuild)) return responder('Só quem tem a permissão **Gerenciar servidor** pode vincular.');
    const codigo = it.options.getString('codigo', true).trim();
    const { data: b } = await adm.from('discord_bridges').select('community_id,guild_id,channel_id,verified').eq('verify_code', codigo).eq('guild_id', it.guildId).maybeSingle();
    if (!b) return responder('Código não encontrado para este servidor. Confira o código na comunidade (aba **Discord / PS5**) e se o ID do servidor está certo em "Configurar".');
    if (b.verified) return responder('Esta ponte já estava confirmada. ✅');
    const canal = await it.guild.channels.fetch(b.channel_id).catch(() => null);
    if (!canal?.isVoiceBased?.()) return responder(`Não encontrei o canal de voz ${b.channel_id} neste servidor (ou não tenho permissão para vê-lo).`);
    const { error } = await adm.from('discord_bridges').update({ verified: true, verified_by: it.user.username }).eq('community_id', b.community_id);
    if (error) return responder('Não consegui salvar a confirmação. Tente de novo em instantes.');
    log(`discord: ${it.user.username} vinculou a comunidade ${b.community_id} ao canal #${canal.name} (${it.guild.name})`);
    responder(`✅ Pronto! O canal **${canal.name}** está ligado à call da comunidade. A ponte entra sozinha quando houver gente no site e aqui (pode levar até 30 s).`);
    sincronizar();
  });
}

const ativas = new Map(); // "comunidade:canal" -> ponte
let ctx = null;
async function sincronizar() {
  const desejadas = [...CFG.pontes];
  if (!TESTE) { const banco = await pontesDoBanco(); if (banco) desejadas.push(...banco); }
  const chaves = new Map(desejadas.map((p) => [`${p.comunidade}:${p.canal}`, p]));
  for (const [k, ponte] of ativas) if (!chaves.has(k)) { ativas.delete(k); await ponte.encerrar().catch(() => {}); }
  for (const [k, p] of chaves) {
    if (ativas.has(k)) continue;
    ativas.set(k, null); // reserva enquanto cria
    try { ativas.set(k, await criarPonte(p, ctx.sb, ctx.discord)); }
    catch (e) { ativas.delete(k); log('❌', e.message); }
  }
}

async function main() {
  adm = createClient(CFG.supabaseUrl, CFG.chaveSecreta || CFG.chavePublica, { auth: { persistSession: false } });
  const sb = createClient(CFG.supabaseUrl, CFG.chavePublica, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 20 } } });
  let discord = null;
  if (!TESTE) {
    const [djs, voz, prism] = await Promise.all([import('discord.js'), import('@discordjs/voice'), import('prism-media')]);
    const cliente = new djs.Client({ intents: [djs.GatewayIntentBits.Guilds, djs.GatewayIntentBits.GuildVoiceStates] });
    const aoMudarVoz = new Set();
    cliente.on(djs.Events.VoiceStateUpdate, (a, d) => aoMudarVoz.forEach((f) => f(a, d)));
    cliente.on(djs.Events.Error, (e) => log('discord:', e.message));
    await new Promise((ok, erro) => { cliente.once(djs.Events.ClientReady, ok); cliente.login(CFG.token).catch(erro); });
    log(`discord: conectado como ${cliente.user.tag} (em ${cliente.guilds.cache.size} servidor(es))`);
    discord = { cliente, djs, voz: { ...voz, prism: prism.default ?? prism }, aoMudarVoz };
    registrarVincular(discord);
  } else log('MODO TESTE: sem Discord, a ponte toca um bipe na call do site.');
  ctx = { sb, discord };
  await sincronizar();
  if (!ativas.size) log('Nenhuma ponte ainda. Elas aparecem aqui quando um dono de comunidade confirmar com /vincular (ou preencha PONTES no .env).');
  setInterval(() => sincronizar().catch((e) => log('sincronizar:', e.message)), 30000);
}
process.on('unhandledRejection', (e) => log('erro:', e?.message || e));
main().catch((e) => { console.error('❌', e.message); process.exit(1); });
