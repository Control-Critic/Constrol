// Publica no Instagram do Control Critic pela API oficial (Instagram API com login do Instagram).
//   node scripts/instagram/publicar.mjs manha           -> 09h20: útil para salvar (jogo bom por menos de R$ X, antes de comprar, promoção)
//   node scripts/instagram/publicar.mjs entretenimento  -> 12h50: opinião (meme, este ou aquele, crítica x comunidade, zerou ou largou...)
//   node scripts/instagram/publicar.mjs diario          -> 18h50: notícias em carrossel, opinião da comunidade, top 5 (o Reels do dia sai aqui)
//   node scripts/instagram/publicar.mjs urgente [id]    -> notícias marcadas como urgentes no painel (ou a de id informado)
//   node scripts/instagram/publicar.mjs amostra         -> só com TESTE=1: gera TODOS os formatos em saida-instagram/<formato>/
//   FORMATO=precos ...                                  -> força um formato (veja formatos.mjs), ignorando a rotação
//   TESTE=1 ...                                         -> só gera as artes e a legenda (pasta saida-instagram/), sem publicar
// Variáveis: SUPABASE_URL, SUPABASE_SERVICE_KEY, IG_USER_ID, IG_TOKEN (o token é renovado sozinho e guardado no banco)
// Cada formato escolhe o conteúdo; a rotação (rotacao.mjs) decide qual formato sai em cada horário.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { supabaseRest } from '../../lib/igdb.mjs';
import { arteStory } from './arte.mjs';
import { comporMusica } from './musica.mjs';
import { FORMATOS, noticias } from './formatos.mjs';
import { ordemDeFormatos, usadosRecentes, podeReels, HORARIO_DO_MODO } from './rotacao.mjs';

const gh = !!process.env.GITHUB_ACTIONS;
const env = (k) => (process.env[k] || '').trim();
const log = (m) => console.log(m);
const aviso = (m) => console.log(gh ? `::notice::${m}` : m);
const falhar = (m) => { console.error(gh ? `::error::${m}` : m); process.exit(1); };
process.on('unhandledRejection', (e) => falhar(`Falha: ${e?.message || e}`));

const TESTE = env('TESTE') === '1';
const MODO = process.argv[2] || 'diario';
const ID_NOTICIA = Number(process.argv[3]) || null;
const FORMATO = env('FORMATO');
const faltam = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', ...(TESTE ? [] : ['IG_USER_ID'])].filter((k) => !env(k));
if (faltam.length) falhar(`Faltam variáveis: ${faltam.join(', ')}`);
if (MODO === 'amostra' && !TESTE) falhar('O modo amostra só roda com TESTE=1 (marque "Só gerar as artes").');
if (FORMATO && !FORMATOS[FORMATO]) falhar(`Formato desconhecido: ${FORMATO}. Use um de: ${Object.keys(FORMATOS).join(', ')}`);

const BASE = env('SUPABASE_URL').replace(/\/+(rest\/v1)?\/*$/, '');
const CHAVE = env('SUPABASE_SERVICE_KEY');
const api = supabaseRest(BASE, CHAVE);
const IG = 'https://graph.instagram.com/v23.0';
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const SAIDA = 'saida-instagram';

// Conta linhas sem trazer os dados (só o número; usado em contagens agregadas como "N zeraram")
async function contar(caminho) {
  const auth = CHAVE.startsWith('eyJ') ? { Authorization: `Bearer ${CHAVE}` } : {};
  const r = await fetch(`${BASE}/rest/v1/${caminho}`, { method: 'HEAD', headers: { apikey: CHAVE, ...auth, Prefer: 'count=exact' } });
  return Number(r.headers.get('content-range')?.split('/')[1]) || 0;
}

// ---------- Token: usa o guardado no banco (renovado a cada ~20 dias); na primeira vez, o do GitHub ----------
let tokenCache = null;
async function tokenInstagram() {
  if (tokenCache) return tokenCache;
  const [salvo] = await api('app_secrets?key=eq.instagram_token&select=value');
  let token = salvo?.value?.token || env('IG_TOKEN');
  if (!token) falhar('Sem token do Instagram: coloque IG_TOKEN nos segredos do GitHub (veja scripts/instagram/LEIA-ME.md).');
  const renovado = salvo?.value?.renovado_em ? new Date(salvo.value.renovado_em) : new Date(0);
  if (!TESTE && Date.now() - renovado > 20 * 864e5) {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.access_token) {
      token = d.access_token;
      await api('app_secrets?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates',
        body: [{ key: 'instagram_token', value: { token, renovado_em: new Date().toISOString() }, updated_at: new Date().toISOString() }] });
      log('Token do Instagram renovado (vale por mais 60 dias).');
    } else if (!salvo) {
      log(`Aviso: não deu para renovar o token agora (${d.error?.message || r.status}). Seguindo com o atual.`);
    } else falhar(`O token do Instagram expirou ou foi revogado (${d.error?.message || r.status}). Gere outro e atualize IG_TOKEN (LEIA-ME, passo 4).`);
  }
  return (tokenCache = token);
}

async function ig(caminho, params, token, metodo = 'POST') {
  const q = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${IG}/${caminho}${metodo === 'GET' ? '?' + q : ''}`, metodo === 'GET' ? {} : { method: 'POST', body: q });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    const e = new Error(`Instagram (${caminho.replace(/^\d+\//, '')}): ${d.error?.message || r.status}`);
    e.codigo = d.error?.code; e.sub = d.error?.error_subcode; e.status = r.status;
    throw e;
  }
  return d;
}
// Limite de publicação ou de chamadas: registra e pula, sem quebrar o robô
const ehLimite = (e) => [4, 9, 17, 32, 613].includes(e?.codigo) || e?.sub === 2207042 || /limit|limite|too many/i.test(e?.message || '');
class LimiteAtingido extends Error {}
async function conferirCota(token) {
  try {
    const d = await ig(`${env('IG_USER_ID')}/content_publishing_limit`, { fields: 'quota_usage,config' }, token, 'GET');
    const uso = d.data?.[0]?.quota_usage ?? 0, total = d.data?.[0]?.config?.quota_total ?? 50;
    log(`Cota de publicação do Instagram: ${uso}/${total} nas últimas 24 h.`);
    if (uso >= total) throw new LimiteAtingido(`Cota de publicação esgotada (${uso}/${total} em 24 h).`);
  } catch (e) { if (e instanceof LimiteAtingido) throw e; log(`Não deu para consultar a cota (${e.message}). Seguindo.`); }
}

// O Instagram baixa a imagem de uma URL pública: guardamos no armazenamento do Supabase
async function hospedar(jpeg, nome, tipo = 'image/jpeg', ext = 'jpg') {
  const caminho = `instagram/${new Date().toISOString().slice(0, 10)}/${nome}-${Date.now()}.${ext}`;
  const auth = CHAVE.startsWith('eyJ') ? { Authorization: `Bearer ${CHAVE}` } : {};
  const r = await fetch(`${BASE}/storage/v1/object/media/${caminho}`, { method: 'POST', headers: { apikey: CHAVE, ...auth, 'Content-Type': tipo, 'x-upsert': 'true' }, body: jpeg });
  if (!r.ok) throw new Error(`Não consegui guardar a imagem (${r.status} ${(await r.text()).slice(0, 200)})`);
  return `${BASE}/storage/v1/object/public/media/${caminho}`;
}

async function aguardarPronto(id, token, tentativas = 30) {
  for (let i = 0; i < tentativas; i++) {
    const d = await ig(id, { fields: 'status_code' }, token, 'GET');
    if (d.status_code === 'FINISHED') return;
    if (d.status_code === 'ERROR' || d.status_code === 'EXPIRED') throw new Error(`Instagram recusou a mídia (${d.status_code}).`);
    await espera(3000);
  }
  throw new Error('Instagram demorou demais para processar a mídia.');
}

// ---------- Reels com música ----------
// Músicas livres de direitos ficam em scripts/instagram/musicas/*.mp3 (veja o LEIA-ME). Sem música ou sem ffmpeg, não faz Reels.
const PASTA_MUSICAS = new URL('./musicas/', import.meta.url);
function musicas() { try { return readdirSync(PASTA_MUSICAS).filter((f) => /\.mp3$/i.test(f)); } catch { return []; } }
function temFfmpeg() { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } }
// Sem música na pasta, o robô compõe uma trilha original (musica.mjs): o Reels não depende mais de arquivo de áudio
export const reelsDisponivel = () => env('REELS') !== '0' && temFfmpeg();

// Vídeo vertical (1080x1920): cada arte fica 3,5 s com zoom lento (efeito Ken Burns), transição suave e música com fade no fim
export async function montarReel(imagens, musica) {
  const dir = join(tmpdir(), `reel-${Date.now()}`); mkdirSync(dir, { recursive: true });
  const quadros = [];
  for (const [i, im] of imagens.slice(0, 6).entries()) { const f = join(dir, `q${i}.jpg`); writeFileSync(f, await arteStory(im.jpeg, chamadaDe(im.nome), 'Salve e mande para um amigo')); quadros.push(f); }
  const dur = 3.5, trans = 0.5, fps = 30, n = quadros.length, total = n * dur - (n - 1) * trans, saida = join(dir, 'reel.mp4');
  const quadrosPorArte = Math.round(dur * fps);
  let filtro = quadros.map((_, i) => `[${i}:v]scale=1296:2304,zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${quadrosPorArte}:s=1080x1920:fps=${fps},setsar=1,format=yuv420p[z${i}];`).join('');
  let anterior = '[z0]';
  for (let i = 1; i < n; i++) { const rot = i === n - 1 ? '[v]' : `[x${i}]`; filtro += `${anterior}[z${i}]xfade=transition=fade:duration=${trans}:offset=${(i * (dur - trans)).toFixed(2)}${rot};`; anterior = rot; }
  if (n === 1) filtro += '[z0]null[v];';
  execFileSync('ffmpeg', ['-y', ...quadros.flatMap((q) => ['-i', q]), '-i', musica, '-filter_complex', `${filtro}[${n}:a]afade=t=out:st=${Math.max(0, total - 2.5)}:d=2.5[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(total), '-r', String(fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', saida], { stdio: 'ignore' });
  const mp4 = readFileSync(saida); rmSync(dir, { recursive: true, force: true });
  return mp4;
}
const sortearMusica = () => {
  const l = musicas();
  if (l.length) return new URL(l[Math.floor(Math.random() * l.length)], PASTA_MUSICAS).pathname;
  const m = comporMusica({ segundos: 30, semente: Date.now() });
  const arq = join(tmpdir(), `trilha-${Date.now()}.wav`); writeFileSync(arq, m.wav);
  log(`Trilha original composta: ${m.bpm} bpm, progressão ${m.progressao}, bateria ${m.levada}.`);
  return arq;
};

// Story: todo post do feed também vira story (mais alcance: os stories aparecem no topo do app para os seguidores)
const CHAMADAS = { resumo: 'RESUMO DO DIA', noticia: 'NOTÍCIA NOVA', urgente: 'URGENTE', promo: 'PROMOÇÃO DO DIA', preco: 'PROMOÇÃO DO DIA', precos: 'SALVE PARA DEPOIS', antes: 'ANTES DE COMPRAR',
  meme: 'MEME DO DIA', versus: 'VOTE NOS COMENTÁRIOS', resultado: 'RESULTADO', critica: 'QUEM ESTÁ CERTO?', super: 'DÊ SUA OPINIÃO', zerou: 'ZEROU OU LARGOU?', top: 'SALVE PARA DEPOIS', opiniao: 'A COMUNIDADE DISSE' };
const chamadaDe = (nome) => CHAMADAS[String(nome).split('-')[0]] || 'NOVO POST NO PERFIL';
async function publicarStory(jpeg, nome, token) {
  try {
    const url = await hospedar(await arteStory(jpeg, chamadaDe(nome)), `story-${nome}`);
    const c = await ig(`${env('IG_USER_ID')}/media`, { media_type: 'STORIES', image_url: url }, token);
    await aguardarPronto(c.id, token);
    await ig(`${env('IG_USER_ID')}/media_publish`, { creation_id: c.id }, token);
    log('Story publicado.');
  } catch (e) { aviso(`O post saiu, mas o story falhou: ${e.message}`); }   // story nunca derruba o post
}

// Salva para revisão humana (TESTE): artes, story, legenda e, se for o caso, o Reels
async function salvarTeste(conteudo, pasta, comReels) {
  const dir = join(SAIDA, pasta); mkdirSync(dir, { recursive: true });
  conteudo.imagens.forEach((im, i) => writeFileSync(join(dir, `${String(i + 1).padStart(2, '0')}-${im.nome}.jpg`), im.jpeg));
  writeFileSync(join(dir, 'story.jpg'), await arteStory(conteudo.imagens[0].jpeg, chamadaDe(conteudo.imagens[0].nome)));
  writeFileSync(join(dir, 'legenda.txt'), conteudo.legenda);
  if (comReels) writeFileSync(join(dir, 'reel.mp4'), await montarReel(conteudo.imagens, sortearMusica()));
}

// Publica: 1 imagem = post simples; várias = carrossel (até 10); comReels = vídeo
async function publicarNoInstagram(conteudo, comReels) {
  const token = await tokenInstagram();
  await conferirCota(token);
  const usuario = env('IG_USER_ID');
  const { imagens, legenda } = conteudo;
  let container;
  if (comReels) {
    const url = await hospedar(await montarReel(imagens, sortearMusica()), 'reel', 'video/mp4', 'mp4');
    container = (await ig(`${usuario}/media`, { media_type: 'REELS', video_url: url, caption: legenda, share_to_feed: 'true' }, token)).id;
    await aguardarPronto(container, token, 100);   // vídeo demora mais (até ~5 min)
  } else {
    const urls = [];
    for (const im of imagens.slice(0, 10)) urls.push(await hospedar(im.jpeg, im.nome));
    if (urls.length === 1) container = (await ig(`${usuario}/media`, { image_url: urls[0], caption: legenda }, token)).id;
    else {
      const filhos = [];
      for (const u of urls) filhos.push((await ig(`${usuario}/media`, { image_url: u, is_carousel_item: 'true' }, token)).id);
      for (const f of filhos) await aguardarPronto(f, token);
      container = (await ig(`${usuario}/media`, { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda }, token)).id;
    }
    await aguardarPronto(container, token);
  }
  const post = await ig(`${usuario}/media_publish`, { creation_id: container }, token);
  const info = await ig(post.id, { fields: 'permalink' }, token, 'GET').catch(() => ({}));
  await publicarStory(imagens[0].jpeg, imagens[0].nome, token);
  return { id: post.id, url: info.permalink || null };
}

// Comentários de um post (para o resultado do "este ou aquele"). Sem a permissão de comentários, devolve null e o formato é pulado.
async function lerComentarios(mediaId) {
  try {
    const d = await ig(`${mediaId}/comments`, { fields: 'text', limit: '100' }, await tokenInstagram(), 'GET');
    return (d.data || []).map((c) => c.text);
  } catch (e) { log(`Sem acesso aos comentários (${e.message}): resultado do versus pulado.`); return null; }
}

// ---------- Registro (tabela instagram_posts) ----------
let temTabela = true;
async function historico() {
  try { return await api(`instagram_posts?select=tipo,horario,formato,created_at,game_ids,news_ids,refs,ig_media_id,erro,salvamentos&created_at=gte.${new Date(Date.now() - 90 * 864e5).toISOString()}&order=created_at.desc&limit=500`); }
  catch (e) { temTabela = false; aviso(`Sem histórico (${e.message.slice(0, 120)}). Rode a migração 20261020_08_instagram_posts.sql. Seguindo sem rotação por histórico.`); return []; }
}
async function registrarPost(linha) {
  if (TESTE || !temTabela) return;
  try { await api('instagram_posts', { method: 'POST', body: [linha] }); } catch (e) { aviso(`Não deu para registrar o post: ${e.message}`); }
  // compatibilidade com o painel antigo ("último post do Instagram")
  await api('settings?on_conflict=key', { method: 'POST', prefer: 'resolution=merge-duplicates', body: [{ key: 'instagram_ultimo', value: { tipo: linha.tipo, url: linha.permalink, erro: linha.erro, em: new Date().toISOString() } }] }).catch(() => {});
}

// Gera o conteúdo e publica (ou salva no teste). Devolve true se publicou/gerou.
async function executar(conteudo, horario, hist) {
  const comReels = horario === 'noite' && conteudo.imagens.length >= 3 && reelsDisponivel() && podeReels(horario, hist) && conteudo.tipo !== 'urgente';
  const formato = comReels ? 'reels' : conteudo.imagens.length > 1 ? 'carrossel' : 'imagem';
  const base = { modo: MODO, horario, tipo: conteudo.tipo, formato, game_ids: conteudo.game_ids || [], news_ids: conteudo.news_ids || [], refs: conteudo.refs || [], hashtags: conteudo.tags || [] };
  if (TESTE) {
    await salvarTeste(conteudo, MODO === 'amostra' ? conteudo.tipo : '.', comReels);
    aviso(`TESTE: ${conteudo.tipo} (${formato}, ${conteudo.imagens.length} ${conteudo.imagens.length === 1 ? 'arte' : 'artes'}) salvo em ${SAIDA}/ (nada foi publicado).`);
    return true;
  }
  try {
    const r = await publicarNoInstagram(conteudo, comReels);
    await conteudo.depois?.(r);
    await registrarPost({ ...base, ig_media_id: r.id, permalink: r.url });
    aviso(`Instagram: ${conteudo.tipo} publicado como ${formato} ${r.url || ''}`);
    return true;
  } catch (e) {
    if (e instanceof LimiteAtingido || ehLimite(e)) {
      await registrarPost({ ...base, erro: `limite: ${e.message}`.slice(0, 500) });
      aviso(`Instagram: limite da API atingido. Post pulado e registrado (${e.message}).`);
      return true;   // não quebra o robô
    }
    await registrarPost({ ...base, erro: e.message.slice(0, 500) });
    throw e;
  }
}

function contexto(hist, { ignorarRepetidos = false } = {}) {
  const { jogos, noticias: ns } = usadosRecentes(hist);
  const refsTodas = new Set(hist.filter((h) => !h.erro).flatMap((h) => h.refs || []));
  // o histórico carregado é de 90 dias (memes não repetem nesse prazo); o resto vale por 30 dias
  const refs30 = new Set(hist.filter((h) => !h.erro && Date.now() - new Date(h.created_at) < 30 * 864e5).flatMap((h) => h.refs || []));
  // promoções: além das 48 h, não repete o mesmo jogo em promoção na semana
  const semana = hist.filter((h) => !h.erro && ['precos', 'promo', 'antes-de-comprar'].includes(h.tipo) && Date.now() - new Date(h.created_at) < 7 * 864e5).flatMap((h) => h.game_ids || []);
  return { api, contar, historico: hist, lerComentarios: TESTE ? null : lerComentarios,
    evitarJogos: ignorarRepetidos ? new Set() : new Set([...jogos, ...semana]), evitarNoticias: ignorarRepetidos ? new Set() : ns, refsUsadas: refsTodas, refsRecentes: refs30 };
}

// ---------- Modos ----------
const hist = await historico();

// Execuções agendadas (SO_SE_FALTAR=1): o GitHub às vezes atrasa ou pula um agendamento, então cada horário tem um
// reserva 40 min depois. Os dois só publicam se aquele horário ainda não saiu hoje (nunca publica duas vezes).
if (env('SO_SE_FALTAR') === '1' && !TESTE && HORARIO_DO_MODO[MODO]) {
  const dia = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const jaSaiu = hist.some((h) => !h.erro && h.horario === HORARIO_DO_MODO[MODO] && dia(h.created_at) === dia(Date.now()));
  if (jaSaiu) { aviso(`O post de ${HORARIO_DO_MODO[MODO]} já saiu hoje. Nada a fazer.`); process.exit(0); }
  if (!temTabela && env('RESERVA') === '1') { aviso('Horário reserva: sem a tabela instagram_posts não dá para saber se o post já saiu. Nada feito.'); process.exit(0); }
}

if (MODO === 'urgente') {
  // Notícias marcadas no painel (ou a de id informado). Também respeitam o limite de 48 h.
  const ids = ID_NOTICIA ? [ID_NOTICIA] : (await api('news?select=id&instagram_status=eq.urgente&instagram_at=is.null&order=created_at.asc&limit=3')).map((n) => n.id);
  if (!ids.length) aviso('Instagram: nenhuma notícia urgente pendente.');
  for (const id of ids) {
    const c = await noticias(contexto(hist, { ignorarRepetidos: true }), { ids: [id], urgente: true });
    if (!c) { aviso(`Instagram: a notícia ${id} tem mais de 48 h ou não existe. Não publicada.`); if (!TESTE) await api(`news?id=eq.${id}`, { method: 'PATCH', body: { instagram_status: 'erro' } }); continue; }
    try { await executar(c, 'urgente', hist); } catch (e) { if (!TESTE) await api(`news?id=eq.${id}`, { method: 'PATCH', body: { instagram_status: 'erro' } }); throw e; }
  }
} else if (MODO === 'amostra') {
  // Revisão humana: um exemplo de cada formato, cada um na sua pasta
  const ctx = contexto(hist, { ignorarRepetidos: true });
  for (const [tipo, gerar] of Object.entries(FORMATOS)) {
    try { const c = await gerar(ctx); if (c) await executar(c, 'amostra', hist); else log(`${tipo}: sem conteúdo agora.`); }
    catch (e) { aviso(`${tipo}: falhou (${e.message}).`); }
  }
} else {
  const horario = HORARIO_DO_MODO[MODO] || 'noite';
  const { ordem, anterior } = FORMATO ? { ordem: [FORMATO], anterior: null } : ordemDeFormatos(horario, hist);
  log(`Horário: ${horario}. Último tipo publicado: ${anterior || 'nenhum'}. Ordem de tentativa: ${ordem.join(' → ')}`);
  const ctx = contexto(hist);
  let feito = false;
  for (const tipo of ordem) {
    let c = null;
    try { c = await FORMATOS[tipo](ctx); } catch (e) { aviso(`${tipo}: não deu para montar (${e.message}). Tentando o próximo.`); continue; }
    if (!c) { log(`${tipo}: sem conteúdo bom agora.`); continue; }
    feito = await executar(c, horario, hist);
    break;
  }
  if (!feito) aviso('Instagram: nada novo para publicar agora.');
}
