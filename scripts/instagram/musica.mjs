// Música original para os Reels, composta na hora pelo próprio robô (estilo chiptune / 8-bit, a cara de videogame).
// Como é gerada aqui, não tem direito autoral de terceiros. Cada semente dá uma música diferente:
// andamento, tom, sequência de acordes, melodia, levada da bateria e timbres mudam.
// Saída: WAV estéreo 16 bits, 44,1 kHz (o ffmpeg converte para AAC no Reels).

const TAXA = 44100;

// Gerador de números previsível por semente (a mesma semente sempre gera a mesma música: bom para testar)
function aleatorio(semente) {
  let a = semente >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const freq = (nota) => 440 * 2 ** ((nota - 69) / 12);   // nota MIDI -> Hz

// Sequências de acordes que soam bem (graus em semitons a partir da tônica; m = menor)
const PROGRESSOES = [
  { nome: 'pop', acordes: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']] },
  { nome: 'epica', acordes: [[9, 'm'], [5, 'M'], [0, 'M'], [7, 'M']] },
  { nome: 'aventura', acordes: [[0, 'M'], [5, 'M'], [7, 'M'], [5, 'M']] },
  { nome: 'noturna', acordes: [[9, 'm'], [7, 'M'], [5, 'M'], [7, 'M']] },
  { nome: 'arcade', acordes: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']] },
  { nome: 'chefe', acordes: [[9, 'm'], [9, 'm'], [5, 'M'], [4, 'M']] },
];
const triade = (grau, tipo) => [grau, grau + (tipo === 'm' ? 3 : 4), grau + 7];
const PENTATONICA = [0, 2, 4, 7, 9];

// Ondas (fase de 0 a 1)
const quadrada = (f, ciclo = 0.5) => (f % 1 < ciclo ? 1 : -1);
const triangular = (f) => 4 * Math.abs((f % 1) - 0.5) - 1;
const serra = (f) => 2 * (f % 1) - 1;

export function comporMusica({ segundos = 20, semente = Date.now() } = {}) {
  const rnd = aleatorio(semente);
  const escolhe = (l) => l[Math.floor(rnd() * l.length)];
  const bpm = 108 + Math.floor(rnd() * 36);              // 108 a 143
  const tonica = 57 + Math.floor(rnd() * 8);             // Lá a Mi
  const prog = escolhe(PROGRESSOES);
  const timbreMelodia = escolhe([(f) => quadrada(f, 0.25), (f) => quadrada(f, 0.125), (f) => quadrada(f, 0.5), (f) => 0.6 * serra(f) + 0.4 * quadrada(f, 0.25)]);
  const levada = escolhe(['reta', 'quebrada', 'galope']);
  const comArpejo = rnd() < 0.75;

  const n = Math.round(segundos * TAXA);
  const esq = new Float32Array(n), dir = new Float32Array(n);
  const tempo = 60 / bpm, semicolcheia = tempo / 4, compasso = tempo * 4;
  const somar = (i, v, pan = 0) => { if (i >= 0 && i < n) { esq[i] += v * (1 - Math.max(0, pan)); dir[i] += v * (1 + Math.min(0, pan)); } };

  // Toca uma nota com envelope (ataque rápido, decaimento até o sustain, soltura)
  const nota = (inicio, dur, hz, onda, vol, pan = 0, sustain = 0.6) => {
    const i0 = Math.round(inicio * TAXA), tam = Math.round(dur * TAXA), solta = Math.round(0.03 * TAXA);
    for (let k = 0; k < tam + solta; k++) {
      const t = k / TAXA;
      const env = k < 0.004 * TAXA ? k / (0.004 * TAXA) : k < tam ? sustain + (1 - sustain) * Math.exp(-t * 12) : sustain * (1 - (k - tam) / solta);
      somar(i0 + k, onda(hz * t) * vol * env, pan);
    }
  };
  const bumbo = (inicio, vol = 0.9) => { const i0 = Math.round(inicio * TAXA); let fase = 0;
    for (let k = 0; k < 0.18 * TAXA; k++) { const t = k / TAXA; fase += (50 + 110 * Math.exp(-t * 30)) / TAXA; somar(i0 + k, Math.sin(2 * Math.PI * fase) * vol * Math.exp(-t * 18)); } };
  const caixa = (inicio, vol = 0.45) => { const i0 = Math.round(inicio * TAXA);
    for (let k = 0; k < 0.14 * TAXA; k++) { const t = k / TAXA; somar(i0 + k, ((rnd() * 2 - 1) * 0.8 + 0.3 * Math.sin(2 * Math.PI * 185 * t)) * vol * Math.exp(-t * 28)); } };
  const chimbal = (inicio, vol = 0.12, aberto = false) => { const i0 = Math.round(inicio * TAXA); let ant = 0;
    for (let k = 0; k < (aberto ? 0.12 : 0.04) * TAXA; k++) { const r = rnd() * 2 - 1, v = r - ant; ant = r; somar(i0 + k, v * vol * Math.exp(-(k / TAXA) * (aberto ? 25 : 90)), 0.3); } };

  // Motivo da melodia: 2 compassos que se repetem com variação (repetição é o que faz a música "grudar")
  const motivo = [];
  let grau = 2;
  for (let s = 0; s < 32; s++) {
    if (rnd() < (s % 4 === 0 ? 0.85 : 0.45)) {
      grau = Math.max(0, Math.min(9, grau + escolhe([-2, -1, -1, 0, 1, 1, 2])));
      motivo.push({ s, grau, dur: escolhe([1, 2, 2, 3]) });
    }
  }
  const notaDaEscala = (g) => tonica + 12 + PENTATONICA[g % 5] + 12 * Math.floor(g / 5);

  const totalCompassos = Math.ceil(segundos / compasso);
  for (let c = 0; c < totalCompassos; c++) {
    const t0 = c * compasso;
    const [g, tipo] = prog.acordes[c % prog.acordes.length];
    const acorde = triade(g, tipo);
    const introducao = c === 0, final = c >= totalCompassos - 1;
    // Baixo (onda triangular, colcheias, oitava de baixo)
    for (let b = 0; b < 8; b++) nota(t0 + b * tempo / 2, tempo / 2 * 0.9, freq(tonica - 24 + acorde[b % 4 === 3 ? 2 : 0]), triangular, 0.32, 0, 0.8);
    // Arpejo do acorde (semicolcheias, discreto, um pouco para a esquerda)
    if (comArpejo && !introducao) for (let a = 0; a < 16; a++) nota(t0 + a * semicolcheia, semicolcheia * 0.8, freq(tonica + acorde[a % 3] + (a % 6 < 3 ? 0 : 12)), (f) => quadrada(f, 0.5), 0.05, -0.4, 0.3);
    // Melodia (a partir do 2º compasso; o motivo volta a cada 2 compassos, com a 2ª metade variando)
    if (!introducao) for (const m of motivo) {
      if ((m.s >= 16) !== (c % 2 === 1)) continue;
      const g2 = c % 4 === 3 && m.s % 8 === 0 ? m.grau + 1 : m.grau;
      nota(t0 + (m.s % 16) * semicolcheia, m.dur * semicolcheia * 0.9, freq(notaDaEscala(g2)), timbreMelodia, 0.13, 0.2, 0.5);
    }
    // Bateria
    for (let b = 0; b < 4; b++) {
      const tb = t0 + b * tempo;
      if (levada === 'reta' ? b % 2 === 0 : levada === 'quebrada' ? b === 0 || (b === 2 && c % 2 === 1) : true) bumbo(tb);
      if (levada === 'quebrada' && b === 1) bumbo(tb + tempo / 2, 0.7);
      if (b % 2 === 1 && !introducao) caixa(tb);
      for (let h = 0; h < (levada === 'galope' ? 4 : 2); h++) chimbal(tb + h * tempo / (levada === 'galope' ? 4 : 2), 0.1, h === 1 && b === 3);
    }
    if (final) caixa(t0 + 3.75 * tempo, 0.35);   // virada no fim
  }

  // Mixagem: normaliza, compressão suave (tanh) e fades de entrada e saída
  let pico = 0;
  for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(esq[i]), Math.abs(dir[i]));
  const ganho = pico ? 0.9 / pico : 1, fadeIn = 0.4 * TAXA, fadeOut = 2 * TAXA;
  const pcm = Buffer.alloc(44 + n * 4);
  for (let i = 0; i < n; i++) {
    const f = Math.min(1, i / fadeIn, (n - i) / fadeOut);
    pcm.writeInt16LE(Math.round(Math.tanh(esq[i] * ganho * 1.2) * 0.92 * f * 32767), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(dir[i] * ganho * 1.2) * 0.92 * f * 32767), 46 + i * 4);
  }
  // Cabeçalho WAV
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(TAXA, 24);
  pcm.writeUInt32LE(TAXA * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
  return { wav: pcm, bpm, progressao: prog.nome, levada };
}
