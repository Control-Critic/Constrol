// Gera as artes do Instagram (1080×1350, JPEG) com a identidade do Control Critic:
// fundo escuro, amarelo #FFD33C, título em Anton maiúsculo, logo e o mascote Adelino.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const FONTES = [aqui('./fontes/Anton-Regular.ttf'), aqui('./fontes/Inter-Variable.ttf')];
const W = 1080, H = 1350, AMARELO = '#FFD33C', PRETO = '#0B0B0D';
const b64 = (buf, tipo = 'image/png') => `data:${tipo};base64,${Buffer.from(buf).toString('base64')}`;
const LOGO = b64(readFileSync(aqui('../../img/ControlHeader.png')));
const MASCOTE = b64(readFileSync(aqui('../../img/Adelino.png')));
// Skins do Adelino: img/adelino/<tema>.png (ou <tema>-2.png, <tema>-3.png... para variar). Sem skin do tema, usa o padrão.
// Temas: categorias do site (terror, rpg, fps, luta, esportes...), meme, enquete, promocao, urgente, resumo, noticia
const PASTA_SKINS = aqui('../../img/adelino/');
let skins = [];
try { skins = readdirSync(PASTA_SKINS).filter((f) => /\.png$/i.test(f)); } catch { /* sem pasta: só o padrão */ }
export function mascote(...temas) {
  for (const t of temas.filter(Boolean)) {
    const op = skins.filter((f) => new RegExp(`^${String(t).toLowerCase().replace(/[^a-z0-9]/g, '')}(-\\d+)?\\.png$`, 'i').test(f));
    if (op.length) return b64(readFileSync(PASTA_SKINS + op[Math.floor(Math.random() * op.length)]));
  }
  return MASCOTE;
}
// Emojis não existem nas fontes da arte (viram quadrados): ficam só na legenda
const semEmoji = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = (s) => semEmoji(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// Quebra o texto em linhas pela largura aproximada de cada letra (Anton é uma fonte estreita)
function quebrar(texto, tamanho, larguraMax, fator = 0.5) {
  const porLinha = Math.max(6, Math.floor(larguraMax / (tamanho * fator)));
  const linhas = [];
  let atual = '';
  for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
    if ((atual + ' ' + palavra).trim().length > porLinha && atual) { linhas.push(atual); atual = palavra; } else atual = (atual + ' ' + palavra).trim();
  }
  if (atual) linhas.push(atual);
  return linhas;
}
// Escolhe o maior tamanho de título que cabe em no máximo `maxLinhas`
function ajustarTitulo(texto, larguraMax, maxLinhas, tamanhos = [104, 92, 82, 72, 64, 56]) {
  const t = String(texto).toUpperCase();
  for (const tam of tamanhos) { const l = quebrar(t, tam, larguraMax); if (l.length <= maxLinhas) return { tam, linhas: l }; }
  const tam = tamanhos.at(-1), l = quebrar(t, tam, larguraMax);
  return { tam, linhas: [...l.slice(0, maxLinhas - 1), l.slice(maxLinhas - 1).join(' ').slice(0, 40).replace(/\s\S*$/, '') + '…'] };
}

// Baixa a imagem da notícia e recorta para preencher a arte (se falhar, usa um fundo liso)
async function fundo(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'ControlCriticBot/1.0' } });
    if (!r.ok) return null;
    const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();
    return b64(img, 'image/jpeg');
  } catch { return null; }
}

async function renderizar(svg) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

const base = (conteudo, img) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PRETO}" stop-opacity="0.55"/><stop offset="0.35" stop-color="${PRETO}" stop-opacity="0.15"/>
      <stop offset="0.6" stop-color="${PRETO}" stop-opacity="0.85"/><stop offset="1" stop-color="${PRETO}" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="liso" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2410"/><stop offset="0.6" stop-color="${PRETO}"/><stop offset="1" stop-color="#3a2f00"/></linearGradient>
  </defs>
  ${img ? `<image href="${img}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${W}" height="${H}" fill="url(#liso)"/>`}
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${AMARELO}"/>
  <image href="${LOGO}" x="56" y="58" width="300" height="88" preserveAspectRatio="xMinYMid meet"/>
  ${conteudo}
  <text x="${W / 2}" y="${H - 34}" text-anchor="middle" font-family="Inter" font-size="24" fill="#9a9aa5">control-critic.netlify.app · link na bio</text>
</svg>`;

const etiqueta = (texto, cor = AMARELO, corTexto = PRETO) => {
  const w = 40 + texto.length * 19;
  return `<rect x="${W - 56 - w}" y="76" width="${w}" height="56" rx="28" fill="${cor}"/>
  <text x="${W - 56 - w / 2}" y="115" text-anchor="middle" font-family="Anton" font-size="32" fill="${corTexto}" letter-spacing="1">${esc(texto)}</text>`;
};

// Notícia: imagem da notícia de fundo, título grande embaixo
export async function arteNoticia({ titulo, fonte, data, capa, urgente = false, numero = null, tema = null }) {
  const img = await fundo(capa);
  const { tam, linhas } = ajustarTitulo(titulo, W - 112, 5);
  const alturaTitulo = linhas.length * tam * 1.08;
  const yTopo = H - 150 - alturaTitulo;
  const conteudo = `
    ${etiqueta(urgente ? 'URGENTE' : numero ? `NOTÍCIA ${numero}` : 'NOTÍCIA', urgente ? '#E5484D' : AMARELO, urgente ? '#FFFFFF' : PRETO)}
    <rect x="56" y="${yTopo - 46}" width="120" height="10" fill="${AMARELO}"/>
    ${linhas.map((l, i) => `<text x="56" y="${yTopo + tam * (i + 0.9) * 1.08}" font-family="Anton" font-size="${tam}" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <text x="56" y="${H - 96}" font-family="Inter" font-size="30" font-weight="600" fill="${AMARELO}">${esc([fonte, data].filter(Boolean).join('  ·  '))}</text>
    <image href="${mascote(urgente && 'urgente', tema, 'noticia')}" x="${W - 190}" y="${H - 250}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, img));
}

// Capa do resumo do dia (primeiro slide do carrossel)
export async function arteResumo({ data, titulos }) {
  const lista = titulos.slice(0, 5).map((t, i) => {
    const l = quebrar(String(t).toUpperCase(), 40, W - 260, 0.5);
    return { n: i + 1, texto: l.length > 2 ? [l[0], l[1].replace(/\s\S*$/, '') + '…'] : l };
  });
  let y = 560;
  const itens = lista.map((it) => {
    const bloco = `<circle cx="92" cy="${y - 14}" r="30" fill="${AMARELO}"/><text x="92" y="${y}" text-anchor="middle" font-family="Anton" font-size="38" fill="${PRETO}">${it.n}</text>
      ${it.texto.map((l, k) => `<text x="146" y="${y + k * 46}" font-family="Anton" font-size="40" fill="#FFFFFF">${esc(l)}</text>`).join('')}`;
    y += 60 + it.texto.length * 46;
    return bloco;
  }).join('');
  const conteudo = `
    ${etiqueta(data)}
    <text x="56" y="330" font-family="Anton" font-size="150" fill="${AMARELO}">RESUMO</text>
    <text x="56" y="460" font-family="Anton" font-size="150" fill="#FFFFFF">DO DIA</text>
    ${itens}
    <text x="56" y="${H - 96}" font-family="Inter" font-size="30" font-weight="600" fill="#c9c9d1">Arraste para o lado →</text>
    <image href="${mascote('resumo')}" x="${W - 330}" y="140" width="290" height="290" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Promoção do dia (quando não há notícia)
export async function artePromo({ jogo, desconto, preco, loja, capa, tema = null }) {
  const img = await fundo(capa);
  const { tam, linhas } = ajustarTitulo(jogo, W - 112, 3, [96, 84, 72, 62]);
  const yTitulo = H - 330 - linhas.length * tam * 1.08;
  const conteudo = `
    ${etiqueta('PROMOÇÃO')}
    <rect x="56" y="${yTitulo - 210}" width="330" height="150" rx="20" fill="${AMARELO}"/>
    <text x="221" y="${yTitulo - 95}" text-anchor="middle" font-family="Anton" font-size="120" fill="${PRETO}">-${esc(desconto)}%</text>
    ${linhas.map((l, i) => `<text x="56" y="${yTitulo + tam * (i + 0.9) * 1.08}" font-family="Anton" font-size="${tam}" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <text x="56" y="${H - 190}" font-family="Anton" font-size="64" fill="${AMARELO}">${esc(preco || '')}</text>
    <text x="56" y="${H - 110}" font-family="Inter" font-size="30" font-weight="600" fill="#c9c9d1">na ${esc(loja)}</text>
    <image href="${mascote('promocao', tema)}" x="${W - 190}" y="${H - 250}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, img));
}

// Meme da comunidade: a imagem inteira (sem cortar) numa moldura com a identidade, e o crédito do autor
export async function arteMeme({ imagem, autor }) {
  const r = await fetch(imagem, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'ControlCriticBot/1.0' } });
  if (!r.ok) throw new Error(`Não consegui baixar o meme (${r.status}).`);
  const AW = W - 96, AH = H - 360;
  const { data, info } = await sharp(Buffer.from(await r.arrayBuffer()), { animated: false }).resize(AW, AH, { fit: 'inside' }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
  const x = (W - info.width) / 2, y = 190 + (AH - info.height) / 2;
  const conteudo = `
    ${etiqueta('MEME')}
    <rect x="${x - 6}" y="${y - 6}" width="${info.width + 12}" height="${info.height + 12}" rx="14" fill="${AMARELO}"/>
    <image href="${b64(data, 'image/jpeg')}" x="${x}" y="${y}" width="${info.width}" height="${info.height}"/>
    <text x="56" y="${H - 96}" font-family="Inter" font-size="32" font-weight="600" fill="${AMARELO}">por @${esc(autor)} na comunidade</text>
    <image href="${mascote('meme')}" x="${W - 170}" y="${H - 230}" width="130" height="130" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Enquete "Qual você prefere?": dois jogos lado a lado, resposta nos comentários
export async function arteVersus({ a, b, categoria, tema = null }) {
  const [ia, ib] = await Promise.all([a.capa, b.capa].map(async (u) => {
    if (!u) return null;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return null;
      return b64(await sharp(Buffer.from(await r.arrayBuffer())).resize(460, 640, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer(), 'image/jpeg');
    } catch { return null; }
  }));
  const lado = (img, jogo, x, letra) => {
    const { tam, linhas } = ajustarTitulo(jogo.titulo, 440, 2, [52, 44, 38, 32]);
    return `<rect x="${x}" y="300" width="460" height="640" rx="22" fill="#1b1b20"/>
      ${img ? `<clipPath id="c${letra}"><rect x="${x}" y="300" width="460" height="640" rx="22"/></clipPath><image href="${img}" x="${x}" y="300" width="460" height="640" clip-path="url(#c${letra})"/>` : ''}
      <circle cx="${x + 230}" cy="300" r="44" fill="${AMARELO}"/><text x="${x + 230}" y="318" text-anchor="middle" font-family="Anton" font-size="52" fill="${PRETO}">${letra}</text>
      ${linhas.map((l, i) => `<text x="${x + 230}" y="${1000 + i * tam * 1.1}" text-anchor="middle" font-family="Anton" font-size="${tam}" fill="#FFFFFF">${esc(l)}</text>`).join('')}`;
  };
  const conteudo = `
    ${etiqueta(categoria ? String(categoria).toUpperCase().slice(0, 18) : 'ENQUETE')}
    <text x="${W / 2}" y="250" text-anchor="middle" font-family="Anton" font-size="84" fill="#FFFFFF">QUAL VOCÊ <tspan fill="${AMARELO}">PREFERE?</tspan></text>
    ${lado(ia, a, 56, 'A')}${lado(ib, b, W - 516, 'B')}
    <circle cx="${W / 2}" cy="620" r="54" fill="${PRETO}" stroke="${AMARELO}" stroke-width="6"/>
    <text x="${W / 2}" y="642" text-anchor="middle" font-family="Anton" font-size="56" fill="${AMARELO}">VS</text>
    <text x="${W / 2}" y="${H - 96}" text-anchor="middle" font-family="Inter" font-size="32" font-weight="600" fill="${AMARELO}">Responda nos comentários: A ou B?</text>
    <image href="${mascote(tema, 'enquete')}" x="${W / 2 - 75}" y="${H - 300}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}
