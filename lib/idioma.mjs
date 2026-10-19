// Detecção simples de idioma (pt x en) e tradução com DeepL.

const PT = /\b(de|que|uma?|com|para|seu|sua|você|do|da|dos|das|em|não|nos?|nas?|mais|como|pelo|pela|é|são|está|jogo|mundo)\b/gi;
const EN = /\b(the|and|of|with|your|you|to|in|is|are|this|that|for|from|game|world|it|its|an?)\b/gi;

export function idioma(texto) {
  if (!texto) return null;
  const pt = (texto.match(PT) || []).length + (texto.match(/ção|ções|ão\b|ões\b/gi) || []).length * 2;
  const en = (texto.match(EN) || []).length;
  return en > pt ? 'en' : 'pt';
}

// Traduz uma lista de textos para português do Brasil. Sem chave, devolve null.
export async function traduzir(textos, chave) {
  if (!chave || !textos.length) return null;
  const host = chave.trim().endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const r = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${chave.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: textos, target_lang: 'PT-BR' }), signal: AbortSignal.timeout(20000),
  });
  if (r.status === 456) throw new Error('Cota mensal do DeepL esgotada.');
  if (!r.ok) throw new Error(`DeepL respondeu ${r.status}`);
  return (await r.json()).translations.map((t) => t.text);
}
