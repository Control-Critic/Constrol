// Funções puras de escape e validação usadas ao montar HTML (testadas em tests/front.test.mjs)

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Plural em português: plural(1, 'jogo') -> '1 jogo'; plural(2, 'avaliação', 'avaliações') -> '2 avaliações'
export function plural(n, singular, pluralForma = singular + 's') {
  const v = Number(n) || 0;
  return `${v.toLocaleString('pt-BR')} ${Math.abs(v) === 1 ? singular : pluralForma}`;
}

// Link interno vindo do banco (ex.: página onde um problema foi reportado): só caminhos do próprio site
export function paginaInterna(u) {
  const s = String(u ?? '').trim();
  return /^\/?[\w\-./]*(\?[\w\-.=&%+]*)?(#[\w\-]*)?$/.test(s) && !s.startsWith('//') ? esc(s || '#') : '#';
}

// Cor vinda do banco num atributo style: só hexadecimal (#abc, #aabbcc, #aabbccdd)
export const corSegura = (c, padrao = '#888') => (/^#[0-9a-f]{3,8}$/i.test(String(c ?? '')) ? c : padrao);

// URL dentro de url('...') no CSS: além de http(s), recusa aspas, parênteses, barra invertida e espaços
// (o esc() é decodificado pelo parser HTML dentro do atributo style e não protege a string do CSS)
export function cssUrl(u) {
  const s = String(u ?? '').trim();
  return /^https?:\/\/[^\s'"()\\]+$/i.test(s) || /^\/?[\w\-./]+$/.test(s) ? s : '';
}

// Aceita apenas links http(s) ou caminhos relativos (evita javascript: em links vindos do banco)
export function urlSegura(u) {
  if (!u) return '';
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s) || /^[a-z0-9_\-./]+$/i.test(s)) return esc(s);
  return '';
}
