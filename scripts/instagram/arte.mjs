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
  const cabe = Math.max(6, Math.floor(larguraMax / (tam * 0.5)) - 1);   // a última linha corta no limite da largura
  return { tam, linhas: [...l.slice(0, maxLinhas - 1), l.slice(maxLinhas - 1).join(' ').slice(0, cabe).replace(/\s\S*$/, '') + '…'] };
}

// Baixa a imagem da notícia e recorta para preencher a arte (se falhar, usa um fundo liso)
// As "capas" do catálogo costumam ser artes HORIZONTAIS da IGDB (16:9). Cortar uma arte horizontal num quadro vertical
// perde quase tudo; por isso a imagem entra inteira (sem corte) sobre um fundo desfocado dela mesma.
// Da IGDB, pede a versão em alta (1080p) em vez da miniatura.
const emAlta = (url) => String(url).replace(/\/t_(screenshot_big|screenshot_med|cover_big|cover_small|thumb|720p)\//, '/t_1080p/');
async function baixar(url) {
  for (const u of [...new Set([emAlta(url), url])]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'ControlCriticBot/1.0' } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* tenta a próxima */ }
  }
  return null;
}
// Monta w×h: fundo desfocado + a imagem inteira por cima (topo = distância do alto; null = centralizada)
async function encaixar(buf, w, h, topo = null) {
  const meta = await sharp(buf).metadata();
  const proporcao = meta.width / meta.height, alvo = w / h;
  // proporção parecida (até 15% de diferença): preencher cortando um pouco fica melhor que faixas
  if (Math.abs(proporcao - alvo) / alvo < 0.15) return sharp(buf).resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 90 }).toBuffer();
  const frente = await sharp(buf).resize(w, h, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
  const tras = await sharp(buf).resize(w, h, { fit: 'cover' }).blur(28).modulate({ brightness: 0.5 }).toBuffer();
  const top = topo == null ? Math.round((h - frente.info.height) / 2) : Math.min(topo, h - frente.info.height);
  return sharp(tras).composite([{ input: frente.data, left: Math.round((w - frente.info.width) / 2), top }]).jpeg({ quality: 90 }).toBuffer();
}
async function fundo(url) {
  if (!url) return null;
  try { const buf = await baixar(url); return buf ? b64(await encaixar(buf, W, H, 160), 'image/jpeg') : null; } catch { return null; }
}

async function renderizar(svg, largura = W) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: largura }, font: { fontFiles: FONTES, loadSystemFonts: false, defaultFontFamily: 'Inter' } }).render().asPng();
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
    <rect x="40" y="${H - 150}" width="${Math.min(W - 230, 120 + String(autor).length * 22)}" height="76" rx="38" fill="${AMARELO}"/>
    <text x="70" y="${H - 100}" font-family="Inter" font-size="34" font-weight="800" fill="${PRETO}">por ${esc(autor)}</text>
    <text x="70" y="${H - 44}" font-family="Inter" font-size="22" fill="#c9c9d1">membro da comunidade Control Critic</text>
    <image href="${mascote('meme')}" x="${W - 170}" y="${H - 230}" width="130" height="130" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Enquete "Qual você prefere?": dois jogos lado a lado, resposta nos comentários
export async function arteVersus({ a, b, categoria, tema = null }) {
  const [ia, ib] = await Promise.all([capa(a.capa, 460, 640), capa(b.capa, 460, 640)]);
  const lado = (img, jogo, x, letra) => {
    const { tam, linhas } = ajustarTitulo(jogo.titulo, 440, 2, [52, 44, 38, 32]);
    return `<rect x="${x}" y="300" width="460" height="640" rx="22" fill="#1b1b20"/>
      ${img ? `<clipPath id="c${letra}"><rect x="${x}" y="300" width="460" height="640" rx="22"/></clipPath><image href="${img}" x="${x}" y="300" width="460" height="640" clip-path="url(#c${letra})"/>`
        : `<image href="${MASCOTE}" x="${x + 70}" y="440" width="320" height="320" preserveAspectRatio="xMidYMid meet"/>`}
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

// Story (1080×1920): a arte do post no centro, com o fundo desfocado dela mesma e um chamado para o perfil
export async function arteStory(jpegPost, chamada = 'NOVO POST NO PERFIL', rodape = 'Toque na foto do perfil e veja o post') {
  const SW = 1080, SH = 1920, cw = 940, ch = Math.round(cw * H / W);
  const fundoDesfocado = await sharp(jpegPost).resize(SW, SH, { fit: 'cover' }).blur(40).modulate({ brightness: 0.45 }).jpeg({ quality: 80 }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}">
    <image href="${b64(fundoDesfocado, 'image/jpeg')}" x="0" y="0" width="${SW}" height="${SH}"/>
    <text x="${SW / 2}" y="250" text-anchor="middle" font-family="Anton" font-size="78" fill="${AMARELO}">${esc(chamada)}</text>
    <rect x="${(SW - cw) / 2 - 8}" y="${(SH - ch) / 2 - 8 + 40}" width="${cw + 16}" height="${ch + 16}" rx="26" fill="${AMARELO}"/>
    <image href="${b64(jpegPost, 'image/jpeg')}" x="${(SW - cw) / 2}" y="${(SH - ch) / 2 + 40}" width="${cw}" height="${ch}"/>
    <text x="${SW / 2}" y="${SH - 150}" text-anchor="middle" font-family="Inter" font-size="40" font-weight="700" fill="#FFFFFF">${esc(rodape)}</text>
    <text x="${SW / 2}" y="${SH - 95}" text-anchor="middle" font-family="Inter" font-size="30" fill="#c9c9d1">@control.critic</text>
  </svg>`;
  return renderizar(svg, SW);
}

// ---------- Formatos de engajamento (carrosséis salváveis, opinião, preço) ----------
// Regra: só dados reais do site. Capas = as que o próprio site serve (IGDB via catálogo). Nada de imagem de imprensa.

async function capa(url, w, h) {
  if (!url) return null;
  try { const buf = await baixar(url); return buf ? b64(await encaixar(buf, w, h), 'image/jpeg') : null; } catch { return null; }
}
const cartaoCapa = (img, x, y, w, h, id) => `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="24" fill="${AMARELO}"/>
  ${img ? `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath><image href="${img}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#1b1b20"/><image href="${MASCOTE}" x="${x + w * 0.15}" y="${y + h * 0.2}" width="${w * 0.7}" height="${h * 0.6}" preserveAspectRatio="xMidYMid meet"/>`}`;
const titulo = (texto, x, y, larg, maxL, tams, cor = '#FFFFFF', ancora = 'start') => {
  const { tam, linhas } = ajustarTitulo(texto, larg, maxL, tams);
  return { svg: linhas.map((l, i) => `<text x="${x}" y="${y + tam * (i + 0.9) * 1.08}" text-anchor="${ancora}" font-family="Anton" font-size="${tam}" fill="${cor}">${esc(l)}</text>`).join(''), altura: linhas.length * tam * 1.08 };
};
const paragrafo = (texto, x, y, larg, tam = 34, maxL = 8, cor = '#e6e6ea', ancora = 'start') => {
  const l = quebrar(semEmoji(texto), tam, larg, 0.52);
  const linhas = l.length > maxL ? [...l.slice(0, maxL - 1), l[maxL - 1].replace(/\s\S*$/, '') + '…'] : l;
  return { svg: linhas.map((t, i) => `<text x="${x}" y="${y + i * tam * 1.35}" text-anchor="${ancora}" font-family="Inter" font-size="${tam}" font-weight="500" fill="${cor}">${esc(t)}</text>`).join(''), altura: linhas.length * tam * 1.35 };
};
const contador = (n, total) => total > 1 ? `<text x="${W - 56}" y="${H - 34}" text-anchor="end" font-family="Anton" font-size="28" fill="${AMARELO}">${n}/${total}</text>` : '';

// Capa de carrossel: só tipografia + Adelino (ex.: "JOGO BOM POR MENOS DE R$ 30")
export async function arteCapaLista({ etiqueta: et, linha1, destaque, linha2 = '', subtitulo = '', tema = null }) {
  const conteudo = `
    ${etiqueta(et)}
    <text x="56" y="420" font-family="Anton" font-size="120" fill="#FFFFFF">${esc(String(linha1).toUpperCase())}</text>
    <text x="56" y="560" font-family="Anton" font-size="140" fill="${AMARELO}">${esc(String(destaque).toUpperCase())}</text>
    ${linha2 ? `<text x="56" y="690" font-family="Anton" font-size="110" fill="#FFFFFF">${esc(String(linha2).toUpperCase())}</text>` : ''}
    ${paragrafo(subtitulo, 56, 800, W - 420, 36, 4, '#c9c9d1').svg}
    <text x="56" y="${H - 110}" font-family="Inter" font-size="32" font-weight="700" fill="${AMARELO}">Arraste para o lado  →  e salve para depois</text>
    <image href="${mascote(tema, 'promocao')}" x="${W - 380}" y="${H - 620}" width="340" height="340" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Preço: capa do jogo, preço antigo riscado, preço novo e o desconto em destaque
export async function artePreco({ jogo, capaUrl, original, preco, desconto, loja, fim = '', numero = 1, total = 1, tema = null }) {
  const img = await capa(capaUrl, 420, 560);
  const t = titulo(jogo, 56, 760, W - 112, 2, [84, 72, 62, 54]);
  const riscado = original ? `<text x="560" y="420" font-family="Inter" font-size="46" font-weight="600" fill="#9a9aa5">${esc(original)}</text>
    <rect x="556" y="404" width="${Math.max(120, original.length * 25)}" height="5" fill="#E5484D"/>` : '';
  const conteudo = `
    ${etiqueta(`-${desconto}%`)}
    ${cartaoCapa(img, 64, 170, 420, 560, `cp${numero}`)}
    <text x="560" y="330" font-family="Inter" font-size="34" font-weight="600" fill="#c9c9d1">de</text>
    ${riscado}
    <text x="560" y="500" font-family="Inter" font-size="34" font-weight="600" fill="#c9c9d1">por</text>
    <text x="556" y="610" font-family="Anton" font-size="${preco.length > 9 ? 96 : 112}" fill="${AMARELO}">${esc(preco)}</text>
    <text x="560" y="680" font-family="Inter" font-size="32" font-weight="600" fill="#FFFFFF">na ${esc(loja)}</text>
    ${t.svg}
    ${fim ? `<text x="56" y="${780 + t.altura + 40}" font-family="Inter" font-size="32" font-weight="600" fill="#c9c9d1">${esc(fim)}</text>` : ''}
    <text x="56" y="${H - 110}" font-family="Inter" font-size="30" font-weight="700" fill="${AMARELO}">Vale a pena? Comenta aí</text>
    <image href="${mascote('promocao', tema)}" x="${W - 200}" y="${H - 300}" width="160" height="160" preserveAspectRatio="xMidYMid meet"/>
    ${contador(numero, total)}`;
  return renderizar(base(conteudo, null));
}

// Ficha com fatos reais (antes de comprar, top da crítica): capa + lista de rótulo/valor
export async function arteFatos({ etiqueta: et, jogo, capaUrl, fatos, rodape = '', numero = 1, total = 1, tema = null }) {
  const img = await capa(capaUrl, 330, 440);
  const t = titulo(jogo, 430, 190, W - 490, 3, [72, 62, 54, 46]);
  let y = 720;
  const itens = fatos.slice(0, 5).map(({ rotulo, valor }) => {
    const v = paragrafo(valor, 56, y + 46, W - 112, 40, 2, '#FFFFFF');
    const bloco = `<text x="56" y="${y}" font-family="Inter" font-size="28" font-weight="700" fill="${AMARELO}" letter-spacing="1">${esc(String(rotulo).toUpperCase())}</text>${v.svg}`;
    y += 70 + v.altura;
    return bloco;
  }).join('');
  const conteudo = `
    ${etiqueta(et)}
    ${cartaoCapa(img, 64, 200, 330, 440, `cf${numero}`)}
    ${t.svg}
    ${itens}
    ${rodape ? `<text x="56" y="${H - 96}" font-family="Inter" font-size="28" font-weight="600" fill="#c9c9d1">${esc(rodape)}</text>` : ''}
    <image href="${mascote(tema, 'resumo')}" x="${W - 190}" y="${H - 280}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>
    ${contador(numero, total)}`;
  return renderizar(base(conteudo, null));
}

// Opinião da comunidade: texto real de uma avaliação pública, sem nome nem foto do autor
export async function arteOpiniao({ jogo, capaUrl, nota, texto, numero = 1, total = 1, tema = null }) {
  const img = await capa(capaUrl, 240, 320);
  const t = titulo(jogo, 340, 210, W - 400, 2, [64, 56, 48]);
  const estrelas = Array.from({ length: 5 }, (_, i) => `<path transform="translate(${340 + i * 64},${250 + t.altura}) scale(2.2)" d="M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z" fill="${i < nota ? AMARELO : '#3a3a42'}"/>`).join('');
  const p = paragrafo(`“${texto}”`, 70, 640, W - 140, 40, 10, '#FFFFFF');
  const conteudo = `
    ${etiqueta('OPINIÃO')}
    ${cartaoCapa(img, 64, 180, 240, 320, `co${numero}`)}
    ${t.svg}${estrelas}
    <rect x="40" y="580" width="${W - 80}" height="${p.altura + 60}" rx="26" fill="#17171c" stroke="#2c2c34"/>
    ${p.svg}
    <text x="56" y="${H - 96}" font-family="Inter" font-size="28" font-weight="600" fill="#c9c9d1">Avaliação pública de um jogador no Control Critic</text>
    <image href="${mascote(tema, 'enquete')}" x="${W - 180}" y="${H - 270}" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>
    ${contador(numero, total)}`;
  return renderizar(base(conteudo, null));
}

// Pergunta de opinião sobre um jogo (zerou ou largou? superestimado? crítica x comunidade)
export async function artePergunta({ etiqueta: et, pergunta, jogo, capaUrl, opcoes = [], dados = [], tema = null }) {
  const img = await capa(capaUrl, 390, 520);
  const q = titulo(pergunta, W / 2, 170, W - 112, 2, [80, 70, 60], '#FFFFFF', 'middle');
  const yCapa = 200 + q.altura;
  const yB = yCapa + 520;   // fim da capa
  const ops = opcoes.slice(0, 2).map((o, i) => {
    const x = i === 0 ? 56 : W / 2 + 12, w = W / 2 - 68;
    return `<rect x="${x}" y="${yB + 190}" width="${w}" height="96" rx="48" fill="${i === 0 ? AMARELO : '#FFFFFF'}"/>
      <text x="${x + w / 2}" y="${yB + 255}" text-anchor="middle" font-family="Anton" font-size="52" fill="${PRETO}">${esc(o)}</text>`;
  }).join('');
  const linhas = dados.slice(0, 2).map((d, i) => `<text x="${W / 2}" y="${yB + 120 + i * 44}" text-anchor="middle" font-family="Inter" font-size="32" font-weight="600" fill="${i ? '#c9c9d1' : AMARELO}">${esc(d)}</text>`).join('');
  const conteudo = `
    ${etiqueta(et)}
    ${q.svg}
    ${cartaoCapa(img, (W - 390) / 2, yCapa, 390, 520, 'cq')}
    <text x="${W / 2}" y="${yB + 70}" text-anchor="middle" font-family="Anton" font-size="${jogo.length > 26 ? 40 : 50}" fill="#FFFFFF">${esc(String(jogo).toUpperCase().slice(0, 40))}</text>
    ${linhas}${ops}
    <image href="${mascote(tema, 'enquete')}" x="${W - 180}" y="${H - 220}" width="130" height="130" preserveAspectRatio="xMidYMid meet"/>`;
  return renderizar(base(conteudo, null));
}

// Slide de texto do carrossel de notícia ("O que aconteceu", "No Control Critic"...)
export async function arteTexto({ etiqueta: et, titulo: tt, texto, capaUrl = null, numero = 1, total = 1, tema = null }) {
  const img = capaUrl ? await capa(capaUrl, 200, 266) : null;
  const t = titulo(tt, 56, 200, W - (img ? 340 : 112), 3, [80, 70, 60, 52]);
  const p = paragrafo(texto, 56, 300 + Math.max(t.altura, img ? 200 : 0), W - 112, 40, 12, '#FFFFFF');
  const conteudo = `
    ${etiqueta(et)}
    ${img ? cartaoCapa(img, W - 260, 190, 200, 266, `ct${numero}`) : ''}
    <rect x="56" y="${190 + t.altura + 20}" width="120" height="10" fill="${AMARELO}"/>
    ${t.svg}${p.svg}
    <image href="${mascote(tema, 'noticia')}" x="${W - 190}" y="${H - 270}" width="150" height="150" preserveAspectRatio="xMidYMid meet"/>
    ${contador(numero, total)}`;
  return renderizar(base(conteudo, null));
}

// Último slide de todo carrossel: chamada para o site
export async function arteChamada({ titulo: tt = 'QUER MAIS?', linhas = [], numero = 1, total = 1 }) {
  const conteudo = `
    ${etiqueta('CONTROL CRITIC')}
    <text x="${W / 2}" y="380" text-anchor="middle" font-family="Anton" font-size="130" fill="${AMARELO}">${esc(String(tt).toUpperCase())}</text>
    ${linhas.slice(0, 4).map((l, i) => `<text x="${W / 2}" y="${500 + i * 64}" text-anchor="middle" font-family="Inter" font-size="40" font-weight="600" fill="#FFFFFF">${esc(l)}</text>`).join('')}
    <rect x="${W / 2 - 300}" y="${H - 420}" width="600" height="110" rx="55" fill="${AMARELO}"/>
    <text x="${W / 2}" y="${H - 348}" text-anchor="middle" font-family="Anton" font-size="56" fill="${PRETO}">LINK NA BIO</text>
    <image href="${mascote('resumo')}" x="${W / 2 - 120}" y="${H - 290}" width="240" height="200" preserveAspectRatio="xMidYMid meet"/>
    ${contador(numero, total)}`;
  return renderizar(base(conteudo, null));
}

// Resultado do "este ou aquele" anterior (contagem real dos comentários A/B)
export async function arteResultado({ a, b, va, vb }) {
  const [ia, ib] = await Promise.all([capa(a.capa, 400, 540), capa(b.capa, 400, 540)]);
  const tot = va + vb || 1, pa = Math.round((va / tot) * 100), pb = 100 - pa;
  const lado = (img, j, x, pct, votos, vence, id) => `${cartaoCapa(img, x, 330, 400, 540, id)}
    <text x="${x + 200}" y="980" text-anchor="middle" font-family="Anton" font-size="110" fill="${vence ? AMARELO : '#9a9aa5'}">${pct}%</text>
    <text x="${x + 200}" y="1030" text-anchor="middle" font-family="Inter" font-size="28" font-weight="600" fill="#c9c9d1">${votos} ${votos === 1 ? 'voto' : 'votos'}</text>
    ${ajustarTitulo(j.titulo, 400, 2, [44, 38, 32]).linhas.map((l, i) => `<text x="${x + 200}" y="${1090 + i * 44}" text-anchor="middle" font-family="Anton" font-size="40" fill="#FFFFFF">${esc(l)}</text>`).join('')}`;
  const conteudo = `
    ${etiqueta('RESULTADO')}
    <text x="${W / 2}" y="270" text-anchor="middle" font-family="Anton" font-size="84" fill="#FFFFFF">VOCÊS <tspan fill="${AMARELO}">ESCOLHERAM</tspan></text>
    ${lado(ia, a, 80, pa, va, va >= vb, 'ra')}${lado(ib, b, W - 480, pb, vb, vb > va, 'rb')}`;
  return renderizar(base(conteudo, null));
}

// Meme original do Control Critic: texto em cima, o Adelino (com a skin do tema) no meio, a "resposta" embaixo.
// Quando o meme fala de um jogo, a capa do catálogo aparece ao lado do Adelino.
export async function arteMemeAuto({ topo, baixo, skin = 'meme', capaUrl = null, layout = 0 }) {
  if (layout === 1) return memePaineis({ topo, baixo, skin, capaUrl });
  const img = capaUrl ? await capa(capaUrl, 300, 400) : null;
  const t1 = titulo(topo, W / 2, 170, W - 112, 3, [76, 66, 58, 50], '#FFFFFF', 'middle');
  const t2 = ajustarTitulo(baixo, W - 112, 3, [80, 70, 60, 52]);
  const yBaixo = H - 120 - t2.linhas.length * t2.tam * 1.08;
  const yMeio = 200 + t1.altura + 20, altMeio = Math.max(260, yBaixo - yMeio - 40);
  const meio = img
    ? `${cartaoCapa(img, 90, yMeio + (altMeio - 400) / 2, 300, 400, 'cmm')}<image href="${mascote(skin, 'meme')}" x="430" y="${yMeio}" width="560" height="${altMeio}" preserveAspectRatio="xMidYMid meet"/>`
    : `<image href="${mascote(skin, 'meme')}" x="${(W - 700) / 2}" y="${yMeio}" width="700" height="${altMeio}" preserveAspectRatio="xMidYMid meet"/>`;
  const conteudo = `
    ${etiqueta('MEME')}
    ${t1.svg}
    ${meio}
    <rect x="56" y="${yBaixo - 30}" width="${W - 112}" height="6" rx="3" fill="${AMARELO}" opacity="0.6"/>
    ${t2.linhas.map((l, i) => `<text x="${W / 2}" y="${yBaixo + t2.tam * (i + 0.9) * 1.08}" text-anchor="middle" font-family="Anton" font-size="${t2.tam}" fill="${AMARELO}">${esc(l)}</text>`).join('')}`;
  return renderizar(base(conteudo, null));
}

// Segundo layout (para o feed não ter sempre a mesma cara): dois painéis empilhados, cada um com um Adelino
// diferente, como as tirinhas "antes / depois"
async function memePaineis({ topo, baixo, skin, capaUrl }) {
  const img = capaUrl ? await capa(capaUrl, 210, 280) : null;
  const painel = (y, texto, sk, cor, fundoCor) => {
    const t = ajustarTitulo(texto, 560, 4, [64, 56, 48, 42]);
    const alt = t.linhas.length * t.tam * 1.1, y0 = y + (500 - alt) / 2;
    return `<rect x="40" y="${y}" width="${W - 80}" height="500" rx="26" fill="${fundoCor}" stroke="#2c2c34"/>
      <image href="${mascote(sk, 'meme')}" x="60" y="${y + 40}" width="380" height="420" preserveAspectRatio="xMidYMid meet"/>
      ${t.linhas.map((l, i) => `<text x="${W - 80}" y="${y0 + t.tam * (i + 0.9) * 1.1}" text-anchor="end" font-family="Anton" font-size="${t.tam}" fill="${cor}">${esc(l)}</text>`).join('')}`;
  };
  const outra = ['meme', 'enquete', 'urgente', 'luta', 'fps', 'rpg'].find((x) => x !== skin);
  const conteudo = `
    ${etiqueta('MEME')}
    ${painel(170, topo, outra, '#FFFFFF', '#141418')}
    ${painel(700, baixo, skin, AMARELO, '#1d1a0e')}
    ${img ? cartaoCapa(img, W - 290, 1000 - 140, 210, 280, 'cmp') : ''}`;
  return renderizar(base(conteudo, null));
}
