// ---------- Escolha do "Qual você prefere?" ----------
// Rivalidades clássicas: os dois lados precisam existir no catálogo (busca por trecho do nome).
const RIVALIDADES = [
  ['resident evil 4', 'silent hill 2', 'Dois clássicos do terror de sobrevivência'],
  ['dark souls', 'elden ring', 'Os dois são soulslike da FromSoftware'],
  ['bloodborne', 'sekiro', 'Soulslikes da FromSoftware'],
  ['the witcher 3', 'skyrim', 'Dois RPGs de mundo aberto gigantes'],
  ['god of war', 'devil may cry 5', 'Ação frenética com combos'],
  ['red dead redemption 2', 'grand theft auto v', 'Mundo aberto da Rockstar'],
  ['the last of us', 'resident evil 2', 'Sobrevivência contra infectados'],
  ['counter-strike', 'valorant', 'Os maiores FPS táticos'],
  ['call of duty', 'battlefield', 'A rivalidade clássica do FPS militar'],
  ['street fighter', 'tekken', 'A eterna briga dos jogos de luta'],
  ['mortal kombat', 'street fighter', 'Lendas da luta'],
  ['hollow knight', 'celeste', 'Indies de plataforma desafiadores'],
  ['hades', 'dead cells', 'Roguelikes de ação'],
  ['stardew valley', 'terraria', 'Indies para perder centenas de horas'],
  ['minecraft', 'terraria', 'Construir, minerar e sobreviver'],
  ['dota 2', 'league of legends', 'Os gigantes do MOBA'],
  ['cyberpunk 2077', 'deus ex', 'RPGs cyberpunk'],
  ['fallout 4', 'the elder scrolls v', 'RPGs de mundo aberto da Bethesda'],
  ['baldur\'s gate 3', 'divinity', 'RPGs táticos da Larian'],
  ['portal 2', 'the talos principle', 'Puzzles em primeira pessoa'],
  ['half-life 2', 'bioshock', 'FPS com história marcante'],
  ['doom', 'wolfenstein', 'FPS frenéticos da id e da MachineGames'],
  ['forza horizon', 'need for speed', 'Corrida arcade'],
  ['ea sports fc', 'efootball', 'O clássico do futebol virtual'],
  ['outlast', 'amnesia', 'Terror em primeira pessoa'],
  ['dead space', 'the callisto protocol', 'Terror no espaço'],
  ['assassin\'s creed', 'ghost of tsushima', 'Furtividade e mundo aberto'],
  ['apex legends', 'fortnite', 'Os battle royale mais jogados'],
  ['persona 5', 'final fantasy', 'JRPGs consagrados'],
  ['rust', 'dayz', 'Sobrevivência multiplayer brutal'],
  ['project zomboid', '7 days to die', 'Sobrevivência zumbi'],
  ['civilization', 'age of empires', 'Estratégia histórica'],
];

// Primeira palavra significativa do nome (para reconhecer franquias: "Resident Evil 2" e "Resident Evil Village")
export function franquia(titulo) {
  const t = String(titulo).toLowerCase().replace(/[:\-–—].*$/, '').replace(/\b(the|a|o)\b/g, '').replace(/\b([ivx]+|\d+)\b/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  return t.split(/\s+/).slice(0, 2).join(' ');
}

export function escolherVersus(jogos, cats, usados, rnd = Math.random) {
  const nomeCat = new Map(cats.map((c) => [c.id, c]));
  const catsDe = (j) => new Set((j.category_ids?.length ? j.category_ids : [j.category_id]).filter(Boolean));
  const chave = (a, b) => [a.id, b.id].sort((x, y) => x - y).join('-');
  const acha = (trecho) => jogos.find((j) => j.title.toLowerCase().includes(trecho));
  const sorteia = (l, n = 10) => l.length ? l[Math.floor(rnd() * Math.min(l.length, n))] : null;
  const comum = (a, b) => [...catsDe(a)].filter((c) => catsDe(b).has(c));

  // 1) Rivalidades clássicas
  const rivais = [];
  for (const [x, y, motivo] of RIVALIDADES) {
    const a = acha(x), b = acha(y);
    if (a && b && a.id !== b.id && !usados.has(chave(a, b))) rivais.push({ a, b, chave: chave(a, b), motivo: motivo + '.', rotulo: 'Rivalidade clássica' });
  }
  // 2) Mesma franquia: "qual o melhor?"
  const porFranquia = {};
  for (const j of jogos) { const f = franquia(j.title); if (f.length >= 4) (porFranquia[f] ||= []).push(j); }
  const familia = [];
  for (const l of Object.values(porFranquia)) for (let i = 0; i < l.length; i++) for (let k = i + 1; k < l.length; k++)
    if (!usados.has(chave(l[i], l[k]))) familia.push({ a: l[i], b: l[k], chave: chave(l[i], l[k]), motivo: 'Mesma franquia: qual é o melhor da série?', rotulo: 'Duelo da franquia' });
  // 3) Parecidos: 2+ categorias em comum, lançados com até 8 anos de diferença, franquias diferentes
  const parecidos = [];
  for (let i = 0; i < jogos.length; i++) for (let k = i + 1; k < jogos.length; k++) {
    const a = jogos[i], b = jogos[k], c = comum(a, b);
    if (c.length < 2 || franquia(a.title) === franquia(b.title)) continue;
    const dif = a.release_year && b.release_year ? Math.abs(a.release_year - b.release_year) : 99;
    if (dif > 8 || usados.has(chave(a, b))) continue;
    const nomes = c.slice(0, 3).map((id) => nomeCat.get(id)?.name).filter(Boolean);
    parecidos.push({ a, b, chave: chave(a, b), pontos: c.length * 3 - dif / 2,
      motivo: `Os dois são de ${nomes.join(' e ').toLowerCase()}${dif <= 2 ? ' e saíram quase juntos' : ''}.`, rotulo: nomes.join(' · '), tema: nomeCat.get(c[0])?.slug });
  }
  parecidos.sort((x, y) => y.pontos - x.pontos);

  // Alterna os formatos para o feed não ficar repetitivo
  const ordem = [[rivais, 4], [familia, 3], [parecidos, 3]].sort(() => rnd() - 0.5);
  for (const [l] of ordem) { const p = sorteia(l, l === parecidos ? 15 : 10); if (p) return p; }
  return null;
}
