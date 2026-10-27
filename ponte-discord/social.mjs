// Recursos sociais do robô no Discord: leva o Control Critic para onde a galera já está.
//   /conectar   liga a conta do Discord ao perfil do site (código de 15 min)
//   /grupo      cria um "procurando grupo" no site e posta no canal com o botão "Tô dentro"
//   /nota       avalia um jogo sem sair do Discord (vira avaliação no site)
//   /enquete    "este ou aquele" com botões; o resultado sai em 24 h
//   /ranking    quem mais jogou, zerou e avaliou na semana, entre os membros com conta ligada
//   /avisos     (admin do servidor) escolhe o canal de avisos: promoções, enquete do dia, ranking e "ao vivo"
//   Ao vivo     quando alguém liga a transmissão (Go Live) num canal de voz, o robô avisa com o link direto
// Tudo grava com a chave secreta, então as regras do site (banimento, limites) são conferidas aqui.
import { randomInt } from 'node:crypto';

const PLATAFORMAS = ['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile', 'Crossplay'];
const horaBR = () => Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });       // AAAA-MM-DD
const diaSemanaBR = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay(); // 0 = domingo
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const AMARELO = 0xffd33c;
const linkCanal = (g, c) => `https://discord.com/channels/${g}/${c}`;

export function comandosSociais(djs) {
  const T = djs.ApplicationCommandOptionType;
  const guild = { contexts: [djs.InteractionContextType.Guild] };
  return [
    { name: 'conectar', description: 'Liga sua conta do Discord ao seu perfil no Control Critic', ...guild },
    { name: 'grupo', description: 'Procura gente para jogar agora (aparece no site e aqui)', ...guild, options: [
      { type: T.String, name: 'jogo', description: 'Qual jogo?', required: true, autocomplete: true },
      { type: T.Integer, name: 'vagas', description: 'Quantas pessoas faltam', minValue: 1, maxValue: 20 },
      { type: T.String, name: 'plataforma', description: 'Onde vão jogar', choices: PLATAFORMAS.map((p) => ({ name: p, value: p })) },
      { type: T.Integer, name: 'daqui', description: 'Começa daqui a quanto tempo', choices: [['Agora', 0], ['30 min', 30], ['1 hora', 60], ['2 horas', 120]].map(([name, value]) => ({ name, value })) },
      { type: T.String, name: 'obs', description: 'Recado curto (ex.: rankeada, sem tóxico)', maxLength: 200 },
    ] },
    { name: 'nota', description: 'Avalia um jogo (vira uma avaliação no seu perfil do site)', ...guild, options: [
      { type: T.String, name: 'jogo', description: 'Qual jogo?', required: true, autocomplete: true },
      { type: T.Integer, name: 'nota', description: 'De 1 a 5', required: true, minValue: 1, maxValue: 5 },
      { type: T.String, name: 'texto', description: 'O que achou (opcional)', maxLength: 1000 },
    ] },
    { name: 'enquete', description: 'Este ou aquele? Dois jogos parecidos para o servidor votar', ...guild },
    { name: 'ranking', description: 'Ranking da semana do servidor (quem ligou a conta ao site)', ...guild },
    { name: 'avisos', description: 'Escolhe o canal de avisos do Control Critic neste servidor', ...guild,
      defaultMemberPermissions: djs.PermissionFlagsBits.ManageGuild, options: [
        { type: T.Channel, name: 'canal', description: 'Canal de texto para os avisos', required: true, channelTypes: [djs.ChannelType.GuildText, djs.ChannelType.GuildAnnouncement] },
        { type: T.Boolean, name: 'promocoes', description: 'Promoção do dia (jogos bem avaliados), às 10h' },
        { type: T.Boolean, name: 'enquetes', description: 'Enquete "este ou aquele" do dia, às 19h' },
        { type: T.Boolean, name: 'ranking', description: 'Ranking da semana, toda segunda às 12h' },
        { type: T.Boolean, name: 'ao_vivo', description: 'Avisar quando alguém começar a transmitir numa call' },
      ] },
    { name: 'site', description: 'O que o Control Critic faz e os comandos do robô', ...guild },
  ];
}

export function ligarSocial({ cliente, djs, adm, site, log }) {
  const E = djs.EmbedBuilder, B = djs.ButtonBuilder, R = djs.ActionRowBuilder, S = djs.ButtonStyle;
  const efemero = { flags: djs.MessageFlags.Ephemeral };
  const botaoLink = (rotulo, url) => new B().setStyle(S.Link).setLabel(rotulo).setURL(url);
  const linha = (...b) => new R().addComponents(...b);

  // ---------- Conta ligada ----------
  async function perfilDe(discordId) {
    const { data: c } = await adm.from('discord_contas').select('profiles(id,username,banned,banned_until)').eq('discord_id', discordId).maybeSingle();
    const data = c?.profiles;
    if (!data) return null;
    const banido = data.banned && (!data.banned_until || new Date(data.banned_until) > new Date());
    return { ...data, banido };
  }
  const lembrar = (it) => it.guildId && adm.from('discord_membros').upsert({ guild_id: it.guildId, discord_id: it.user.id, visto_em: new Date().toISOString() }).then(() => {}, () => {});
  const pedirConexao = (it) => it.reply({ content: 'Antes, ligue sua conta: use **/conectar** (leva 1 minuto). Assim o que você faz aqui aparece no seu perfil do site.', ...efemero });

  async function conectar(it) {
    const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I para não confundir
    const code = Array.from({ length: 8 }, () => AB[randomInt(AB.length)]).join('');
    const { error } = await adm.from('discord_link_codes').insert({ code, discord_id: it.user.id, discord_name: it.user.username.slice(0, 40), guild_id: it.guildId });
    if (error) return it.reply({ content: 'Não consegui gerar o código agora. Tente de novo em instantes.', ...efemero });
    const url = `${site}/perfil.html?discord=${code}`;
    return it.reply({ content: 'Abra o link, entre na sua conta (ou crie uma, é grátis) e pronto. O link vale 15 minutos e só funciona para você.',
      components: [linha(botaoLink('Ligar minha conta', url))], ...efemero });
  }

  // ---------- Busca de jogo (autocomplete) ----------
  async function autocompletar(it) {
    const termo = String(it.options.getFocused() || '').replace(/[%,()*]/g, '').trim();
    let q = adm.from('games').select('id,title').order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(20);
    if (termo) q = q.ilike('title', `%${termo}%`);
    const { data } = await q;
    return it.respond((data || []).slice(0, 25).map((g) => ({ name: g.title.slice(0, 100), value: String(g.id) }))).catch(() => {});
  }
  async function jogoDe(valor) {
    const id = Number(valor);
    const q = id ? adm.from('games').select('id,title,slug,cover_url').eq('id', id) : adm.from('games').select('id,title,slug,cover_url').ilike('title', String(valor).replace(/[%,()*]/g, '')).limit(1);
    const { data } = await q.maybeSingle();
    return data;
  }

  // ---------- /grupo ----------
  async function grupo(it) {
    const p = await perfilDe(it.user.id);
    if (!p) return pedirConexao(it);
    if (p.banido) return it.reply({ content: 'Sua conta está suspensa no site.', ...efemero });
    const jogo = await jogoDe(it.options.getString('jogo', true));
    if (!jogo) return it.reply({ content: 'Não achei esse jogo no catálogo. Escolha um da lista que aparece enquanto digita.', ...efemero });
    const { count } = await adm.from('lfg_posts').select('id', { count: 'exact', head: true }).eq('user_id', p.id).gt('expires_at', new Date().toISOString());
    if (count >= 3) return it.reply({ content: 'Você já tem 3 grupos abertos. Espere um terminar.', ...efemero });
    const daqui = it.options.getInteger('daqui') ?? 0, inicio = new Date(Date.now() + daqui * 60000);
    const vagas = it.options.getInteger('vagas'), plat = it.options.getString('plataforma'), obs = it.options.getString('obs')?.slice(0, 200) || null;
    const { data: g, error } = await adm.from('lfg_posts').insert({ user_id: p.id, game_id: jogo.id, platform: plat, slots: vagas, note: obs, starts_at: inicio.toISOString(),
      expires_at: new Date(inicio.getTime() + 2 * 3600e3).toISOString(), crossplay: plat === 'Crossplay' }).select('id').single();
    if (error) return it.reply({ content: 'Não consegui criar o grupo agora. Tente de novo.', ...efemero });
    lembrar(it);
    const embed = new E().setColor(AMARELO).setTitle(`🎮 ${jogo.title}`).setURL(`${site}/jogo.html?slug=${encodeURIComponent(jogo.slug)}`)
      .setDescription(`<@${it.user.id}> está procurando gente pra jogar${daqui ? ` daqui a ${daqui >= 60 ? `${daqui / 60} h` : `${daqui} min`}` : ' **agora**'}.${obs ? `\n> ${obs}` : ''}`)
      .addFields({ name: 'Vagas', value: vagas ? String(vagas) : 'Livre', inline: true }, { name: 'Plataforma', value: plat || 'Qualquer', inline: true }, { name: 'Interessados', value: '—', inline: false })
      .setFooter({ text: 'Também aparece no Control Critic, em "Procurando grupo agora"' });
    if (jogo.cover_url) embed.setThumbnail(jogo.cover_url);
    return it.reply({ embeds: [embed], components: [linha(new B().setCustomId(`lfg:${g.id}`).setStyle(S.Success).setLabel('🙋 Tô dentro'), botaoLink('Ver no site', `${site}/#b-grupo`))] });
  }
  async function entrarNoGrupo(it, id) {
    const p = await perfilDe(it.user.id);
    if (!p) return pedirConexao(it);
    if (p.banido) return it.reply({ content: 'Sua conta está suspensa no site.', ...efemero });
    const { data: g } = await adm.from('lfg_posts').select('id,user_id,expires_at,slots').eq('id', id).maybeSingle();
    if (!g || new Date(g.expires_at) < new Date()) return it.reply({ content: 'Esse grupo já terminou.', ...efemero });
    if (g.user_id === p.id) return it.reply({ content: 'Esse grupo é seu. 😄', ...efemero });
    await adm.from('lfg_interest').upsert({ lfg_id: g.id, user_id: p.id }, { ignoreDuplicates: true });
    lembrar(it);
    // Atualiza a lista de interessados na mensagem (menções do Discord de quem tem conta ligada)
    const { data: int } = await adm.from('lfg_interest').select('user_id,profiles(username)').eq('lfg_id', g.id).limit(20);
    const { data: contas } = await adm.from('discord_contas').select('user_id,discord_id').in('user_id', (int || []).map((x) => x.user_id));
    const did = new Map((contas || []).map((c) => [c.user_id, c.discord_id]));
    const nomes = (int || []).map((x) => did.has(x.user_id) ? `<@${did.get(x.user_id)}>` : x.profiles?.username).filter(Boolean);
    const embed = E.from(it.message.embeds[0]);
    const campos = (embed.data.fields || []).map((f) => f.name === 'Interessados' ? { ...f, value: nomes.join(', ').slice(0, 1000) || '—' } : f);
    await it.update({ embeds: [embed.setFields(campos)] });
    return it.followUp({ content: 'Você entrou no grupo! Combine os detalhes com quem criou, aqui no canal.', ...efemero }).catch(() => {});
  }

  // ---------- /nota ----------
  async function nota(it) {
    const p = await perfilDe(it.user.id);
    if (!p) return pedirConexao(it);
    if (p.banido) return it.reply({ content: 'Sua conta está suspensa no site.', ...efemero });
    const jogo = await jogoDe(it.options.getString('jogo', true));
    if (!jogo) return it.reply({ content: 'Não achei esse jogo no catálogo. Escolha um da lista.', ...efemero });
    const n = it.options.getInteger('nota', true), texto = it.options.getString('texto')?.trim().slice(0, 1000) || null;
    const { error } = await adm.from('reviews').upsert({ game_id: jogo.id, user_id: p.id, rating: n, body: texto, status: 'published' }, { onConflict: 'game_id,user_id' });
    if (error) return it.reply({ content: 'Não consegui salvar a avaliação agora.', ...efemero });
    lembrar(it);
    const embed = new E().setColor(AMARELO).setAuthor({ name: `${p.username} avaliou` }).setTitle(`${'★'.repeat(n)}${'☆'.repeat(5 - n)}  ${jogo.title}`)
      .setURL(`${site}/jogo.html?slug=${encodeURIComponent(jogo.slug)}`).setDescription(texto ? `> ${texto.slice(0, 400)}` : 'Concorda? Dá a sua com **/nota**.');
    if (jogo.cover_url) embed.setThumbnail(jogo.cover_url);
    return it.reply({ embeds: [embed] });
  }

  // ---------- Enquetes ----------
  async function sortearPar() {
    const { data: jogos } = await adm.from('games').select('id,title,cover_url,category_id,release_year').not('cover_url', 'is', null).not('category_id', 'is', null)
      .order('igdb_rating_count', { ascending: false, nullsFirst: false }).limit(150);
    const { data: recentes } = await adm.from('discord_enquetes').select('a_id,b_id').gt('created_at', new Date(Date.now() - 14 * 864e5).toISOString());
    const usados = new Set((recentes || []).flatMap((r) => [r.a_id, r.b_id]));
    const l = (jogos || []).filter((j) => !usados.has(j.id));
    for (let t = 0; t < 200; t++) {
      const a = l[Math.floor(Math.random() * Math.min(l.length, 80))], b = l[Math.floor(Math.random() * l.length)];
      if (a && b && a.id !== b.id && a.category_id === b.category_id && Math.abs((a.release_year || 0) - (b.release_year || 0)) <= 8) return [a, b];
    }
    return null;
  }
  const placar = (va, vb) => { const t = va + vb; return t ? `🅰️ ${Math.round((va / t) * 100)}% · 🅱️ ${Math.round((vb / t) * 100)}%  (${t} ${t === 1 ? 'voto' : 'votos'})` : 'Ninguém votou ainda.'; };
  function mensagemEnquete(a, b, va = 0, vb = 0, fim = null) {
    const embed = new E().setColor(AMARELO).setTitle('🤔 Este ou aquele?').setDescription(`🅰️ **${a.title}**\n🅱️ **${b.title}**\n\n${placar(va, vb)}`)
      .setFooter({ text: fim ? 'Enquete encerrada' : 'Vote nos botões. Resultado em 24 h.' });
    if (a.cover_url) embed.setThumbnail(a.cover_url);
    if (b.cover_url) embed.setImage(b.cover_url);
    if (fim) embed.setTitle(`🏆 Resultado: ${fim}`);
    return { embeds: [embed], components: fim ? [] : [linha(new B().setCustomId('voto:1').setStyle(S.Primary).setLabel(`A · ${a.title}`.slice(0, 80)), new B().setCustomId('voto:2').setStyle(S.Danger).setLabel(`B · ${b.title}`.slice(0, 80)))] };
  }
  async function publicarEnquete(canal) {
    const par = await sortearPar();
    if (!par) return null;
    const msg = await canal.send(mensagemEnquete(...par));
    await adm.from('discord_enquetes').insert({ message_id: msg.id, guild_id: canal.guild.id, channel_id: canal.id, a_id: par[0].id, b_id: par[1].id });
    return msg;
  }
  async function enquete(it) {
    await it.deferReply(efemero);
    const msg = await publicarEnquete(it.channel).catch(() => null);
    lembrar(it);
    return it.editReply(msg ? 'Enquete criada! 👇' : 'Não consegui criar a enquete aqui (confira se o robô pode enviar mensagens neste canal).');
  }
  async function contar(messageId) {
    const { data } = await adm.from('discord_votos').select('opcao').eq('message_id', messageId);
    return [(data || []).filter((v) => v.opcao === 1).length, (data || []).filter((v) => v.opcao === 2).length];
  }
  async function votar(it, opcao) {
    const { data: e } = await adm.from('discord_enquetes').select('*, a:a_id(title,cover_url), b:b_id(title,cover_url)').eq('message_id', it.message.id).maybeSingle();
    if (!e || e.encerrada) return it.reply({ content: 'Essa enquete já terminou.', ...efemero });
    await adm.from('discord_votos').upsert({ message_id: e.message_id, discord_id: it.user.id, opcao });
    lembrar(it);
    const [va, vb] = await contar(e.message_id);
    await it.update(mensagemEnquete(e.a, e.b, va, vb));
    return it.followUp({ content: `Voto registrado em **${opcao === 1 ? e.a.title : e.b.title}**. Dá para trocar até o fim.`, ...efemero }).catch(() => {});
  }
  async function fecharEnquetes() {
    const { data } = await adm.from('discord_enquetes').select('*, a:a_id(title,cover_url), b:b_id(title,cover_url)').eq('encerrada', false).lt('fecha_em', new Date().toISOString()).limit(20);
    for (const e of data || []) {
      await adm.from('discord_enquetes').update({ encerrada: true }).eq('message_id', e.message_id);
      const [va, vb] = await contar(e.message_id);
      const canal = await cliente.channels.fetch(e.channel_id).catch(() => null);
      const msg = await canal?.messages?.fetch(e.message_id).catch(() => null);
      await msg?.edit(mensagemEnquete(e.a, e.b, va, vb, va === vb ? 'empate!' : va > vb ? e.a.title : e.b.title)).catch(() => {});
    }
  }

  // ---------- Ranking da semana (membros do servidor com conta ligada) ----------
  async function ranking(guildId) {
    const { data: membros } = await adm.from('discord_membros').select('discord_id').eq('guild_id', guildId).limit(500);
    const ids = (membros || []).map((m) => m.discord_id);
    if (!ids.length) return null;
    const { data: contas } = await adm.from('discord_contas').select('discord_id,profiles!inner(id,username,banned)').in('discord_id', ids).eq('profiles.banned', false);
    const perfis = (contas || []).map((c) => ({ ...c.profiles, discord_id: c.discord_id }));
    if (!perfis.length) return null;
    const desde = new Date(Date.now() - 7 * 864e5).toISOString(), uids = perfis.map((p) => p.id);
    const [rv, ug, lf] = await Promise.all([
      adm.from('reviews').select('user_id').in('user_id', uids).gte('created_at', desde),
      adm.from('user_games').select('user_id,status').in('user_id', uids).gte('updated_at', desde),
      adm.from('lfg_posts').select('user_id').in('user_id', uids).gte('created_at', desde),
    ]);
    const pts = new Map(uids.map((u) => [u, { av: 0, zer: 0, jog: 0, gr: 0 }]));
    for (const r of rv.data || []) pts.get(r.user_id).av++;
    for (const g of ug.data || []) { const x = pts.get(g.user_id); if (g.status === 'zerado') x.zer++; else x.jog++; }
    for (const g of lf.data || []) pts.get(g.user_id).gr++;
    const total = (x) => x.zer * 5 + x.av * 3 + x.gr * 2 + x.jog;
    const top = perfis.map((p) => ({ p, x: pts.get(p.id) })).filter(({ x }) => total(x)).sort((a, b) => total(b.x) - total(a.x)).slice(0, 10);
    if (!top.length) return null;
    const med = ['🥇', '🥈', '🥉'];
    return new E().setColor(AMARELO).setTitle('🏆 Ranking da semana').setURL(`${site}/conquistas.html`)
      .setDescription(top.map(({ p, x }, i) => `${med[i] || `**${i + 1}.**`} <@${p.discord_id}> · ${total(x)} pts  (${[x.zer && `${x.zer} zerado${x.zer > 1 ? 's' : ''}`, x.av && `${x.av} ${x.av > 1 ? 'avaliações' : 'avaliação'}`, x.gr && `${x.gr} grupo${x.gr > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'jogando'})`).join('\n'))
      .setFooter({ text: 'Zerar = 5 · avaliar = 3 · criar grupo = 2 · atualizar a biblioteca = 1. Só conta quem usou /conectar.' });
  }

  // ---------- Promoção do dia ----------
  async function promocoes() {
    const { data } = await adm.from('deals').select('game_id,store,price_cents,original_cents,discount_pct,games!inner(title,slug,cover_url,igdb_rating,igdb_rating_count)')
      .gte('discount_pct', 40).gt('price_cents', 0).gte('updated_at', new Date(Date.now() - 2 * 864e5).toISOString())
      .gte('games.igdb_rating', 75).gte('games.igdb_rating_count', 20).order('discount_pct', { ascending: false }).limit(20);
    const vistos = new Set(), l = (data || []).filter((d) => !vistos.has(d.game_id) && vistos.add(d.game_id)).slice(0, 5);
    if (!l.length) return null;
    const loja = { steam: 'Steam', playstation: 'PS Store', xbox: 'Xbox', nintendo: 'eShop' };
    return new E().setColor(AMARELO).setTitle('💸 Promoções do dia (só jogo bem avaliado)').setURL(`${site}/promocoes.html`)
      .setDescription(l.map((d) => `**[${d.games.title}](${site}/jogo.html?slug=${encodeURIComponent(d.games.slug)})** · ~~${d.original_cents ? brl(d.original_cents) : ''}~~ **${brl(d.price_cents)}** (-${d.discount_pct}%) na ${loja[d.store] || d.store}`).join('\n'))
      .setThumbnail(l[0].games.cover_url || null).setFooter({ text: 'Nota da crítica 75+ (IGDB). Coloque na lista de desejos no site para ser avisado.' });
  }

  // ---------- /avisos e rotina diária ----------
  async function avisos(it) {
    if (!it.memberPermissions?.has(djs.PermissionFlagsBits.ManageGuild)) return it.reply({ content: 'Só quem pode **Gerenciar servidor**.', ...efemero });
    const canal = it.options.getChannel('canal', true);
    const me = it.guild.members.me, perm = canal.permissionsFor(me);
    if (!perm?.has([djs.PermissionFlagsBits.SendMessages, djs.PermissionFlagsBits.EmbedLinks])) return it.reply({ content: `Não tenho permissão para enviar mensagens em ${canal}.`, ...efemero });
    const op = (k) => it.options.getBoolean(k) ?? true;
    const { error } = await adm.from('discord_servidores').upsert({ guild_id: it.guildId, canal_avisos: canal.id, promocoes: op('promocoes'), enquetes: op('enquetes'), ranking: op('ranking'), ao_vivo: op('ao_vivo'),
      configurado_por: it.user.username.slice(0, 40), updated_at: new Date().toISOString() });
    if (error) return it.reply({ content: 'Não consegui salvar. Tente de novo.', ...efemero });
    log(`discord: avisos de ${it.guild.name} em #${canal.name}`);
    return it.reply({ content: `✅ Avisos do Control Critic em ${canal}: ${[op('promocoes') && 'promoções (10h)', op('enquetes') && 'enquete do dia (19h)', op('ranking') && 'ranking (segunda, 12h)', op('ao_vivo') && 'ao vivo'].filter(Boolean).join(', ') || 'nenhum'}.`, ...efemero });
  }
  async function rotina() {
    await fecharEnquetes().catch((e) => log('enquetes:', e.message));
    const { data: sv } = await adm.from('discord_servidores').select('*').not('canal_avisos', 'is', null);
    const h = horaBR(), hoje = hojeBR();
    for (const s of sv || []) {
      const canal = await cliente.channels.fetch(s.canal_avisos).catch(() => null);
      if (!canal?.isTextBased?.()) continue;
      try {
        if (s.promocoes && h >= 10 && s.ultima_promo !== hoje) {
          await adm.from('discord_servidores').update({ ultima_promo: hoje }).eq('guild_id', s.guild_id);
          const e = await promocoes(); if (e) await canal.send({ embeds: [e] });
        }
        if (s.enquetes && h >= 19 && s.ultima_enquete !== hoje) {
          await adm.from('discord_servidores').update({ ultima_enquete: hoje }).eq('guild_id', s.guild_id);
          await publicarEnquete(canal);
        }
        if (s.ranking && diaSemanaBR() === 1 && h >= 12 && s.ultimo_ranking !== hoje) {
          await adm.from('discord_servidores').update({ ultimo_ranking: hoje }).eq('guild_id', s.guild_id);
          const e = await ranking(s.guild_id); if (e) await canal.send({ embeds: [e], allowedMentions: { parse: [] } });
        }
      } catch (e) { log(`avisos ${s.guild_id}:`, e.message); }
    }
  }

  // ---------- Ao vivo: transmissão (Go Live) num canal de voz ----------
  async function aoMudarVoz(antes, depois) {
    const g = depois.guild.id, uid = depois.id;
    if (depois.member?.user?.bot) return;
    const comecou = depois.streaming && depois.channelId && (!antes.streaming || antes.channelId !== depois.channelId);
    const parou = antes.streaming && (!depois.streaming || !depois.channelId);
    if (!comecou && !parou) return;
    const { data: atual } = await adm.from('discord_ao_vivo').select('*').eq('guild_id', g).eq('discord_id', uid).maybeSingle();
    const { data: s } = await adm.from('discord_servidores').select('canal_avisos,ao_vivo').eq('guild_id', g).maybeSingle();
    const avisos = s?.ao_vivo && s.canal_avisos ? await cliente.channels.fetch(s.canal_avisos).catch(() => null) : null;
    if (atual?.message_id && avisos) {   // encerra o aviso anterior
      const m = await avisos.messages.fetch(atual.message_id).catch(() => null);
      await m?.edit({ content: `⚫ A transmissão de **${depois.member?.displayName || 'alguém'}** terminou.`, embeds: [], components: [] }).catch(() => {});
    }
    if (parou && !comecou) { await adm.from('discord_ao_vivo').delete().eq('guild_id', g).eq('discord_id', uid); return; }
    const perfil = await perfilDe(uid);
    const canalVoz = depois.channel, link = linkCanal(g, depois.channelId);
    let message_id = null;
    if (avisos) {
      const m = await avisos.send({ content: `🔴 **${depois.member?.displayName || 'Alguém'}** começou a transmitir em 🔊 **${canalVoz?.name || 'call'}**!`,
        components: [linha(botaoLink('▶️ Assistir no Discord', link), ...(perfil ? [botaoLink('Perfil no site', `${site}/perfil.html?u=${encodeURIComponent(perfil.username)}`)] : []))],
        allowedMentions: { parse: [] } }).catch(() => null);
      message_id = m?.id || null;
    }
    await adm.from('discord_ao_vivo').upsert({ guild_id: g, discord_id: uid, channel_id: depois.channelId, canal_nome: (canalVoz?.name || '').slice(0, 100), user_id: perfil?.id || null, message_id, desde: new Date().toISOString() });
  }
  // Ao ligar o robô: limpa transmissões que terminaram enquanto ele estava desligado
  async function conferirAoVivo() {
    const { data } = await adm.from('discord_ao_vivo').select('guild_id,discord_id');
    for (const v of data || []) {
      const guild = cliente.guilds.cache.get(v.guild_id);
      const st = guild?.voiceStates.cache.get(v.discord_id);
      if (!st?.streaming) await adm.from('discord_ao_vivo').delete().eq('guild_id', v.guild_id).eq('discord_id', v.discord_id);
    }
  }

  async function ajuda(it) {
    const embed = new E().setColor(AMARELO).setTitle('Control Critic no Discord').setURL(site)
      .setDescription(['Rede social brasileira de games: biblioteca, notas, promoções, grupos e calls.', '',
        '**/conectar** liga sua conta (uma vez só)', '**/grupo** procura gente para jogar', '**/nota** avalia um jogo', '**/enquete** este ou aquele?', '**/ranking** ranking da semana do servidor',
        '**/avisos** (admin) promoções, enquete do dia, ranking e aviso de transmissão ao vivo'].join('\n'));
    return it.reply({ embeds: [embed], components: [linha(botaoLink('Abrir o site', site))], ...efemero });
  }

  const COMANDOS = { conectar, grupo, nota, enquete, avisos, site: ajuda,
    ranking: async (it) => { await it.deferReply(); lembrar(it); const e = await ranking(it.guildId).catch(() => null);
      return it.editReply(e ? { embeds: [e], allowedMentions: { parse: [] } } : 'Ninguém pontuou nesta semana ainda (ou ninguém ligou a conta com /conectar). Zere, avalie e crie grupos para aparecer aqui!'); } };

  cliente.on(djs.Events.InteractionCreate, async (it) => {
    try {
      if (it.isAutocomplete() && ['grupo', 'nota'].includes(it.commandName)) return await autocompletar(it);
      if (it.isChatInputCommand() && COMANDOS[it.commandName]) return await COMANDOS[it.commandName](it);
      if (it.isButton()) {
        const [tipo, valor] = it.customId.split(':');
        if (tipo === 'lfg') return await entrarNoGrupo(it, Number(valor));
        if (tipo === 'voto') return await votar(it, Number(valor));
      }
    } catch (e) {
      log('discord social:', e.message);
      const r = { content: 'Algo deu errado. Tente de novo em instantes.', ...efemero };
      (it.deferred || it.replied ? it.followUp(r) : it.reply?.(r))?.catch?.(() => {});
    }
  });
  cliente.on(djs.Events.VoiceStateUpdate, (a, d) => aoMudarVoz(a, d).catch((e) => log('ao vivo:', e.message)));
  // ---------- Call do site -> aviso no Discord ----------
  // Para cada comunidade ligada a um servidor (ID do servidor preenchido na comunidade) com avisos "ao vivo",
  // o robô acompanha quem está na call do site (só observa: não entra na call) e avisa no canal de avisos.
  const callsSite = new Map();   // id da comunidade -> estado
  async function vigiarCallsDoSite() {
    const { data: sv } = await adm.from('discord_servidores').select('guild_id,canal_avisos').eq('ao_vivo', true).not('canal_avisos', 'is', null);
    if (!sv?.length) return;
    const { data: cs } = await adm.from('communities').select('id,name,discord_guild_id').in('discord_guild_id', sv.map((x) => x.guild_id));
    for (const c of cs || []) {
      if (callsSite.has(c.id)) continue;
      const { data: seg } = await adm.from('community_secrets').select('room_key').eq('community_id', c.id).maybeSingle();
      if (!seg) continue;
      const est = { c, canalAvisos: sv.find((x) => x.guild_id === c.discord_guild_id).canal_avisos, msg: null, ultimo: 0, espera: null };
      // conexão separada da ponte de voz (a mesma sala duas vezes na mesma conexão derrubaria a ponte)
      est.ch = adm.channel(`voz:${c.id}-${seg.room_key}`, { config: { presence: { key: `zzzz-observador-${c.id}` } } });
      est.ch.on('presence', { event: 'sync' }, () => { clearTimeout(est.espera); est.espera = setTimeout(() => mudouCall(est).catch((e) => log('call do site:', e.message)), 4000); }).subscribe();
      callsSite.set(c.id, est);
      log(`discord: acompanhando a call do site da comunidade "${c.name}"`);
    }
  }
  async function mudouCall(est) {
    const lista = Object.entries(est.ch.presenceState()).filter(([k]) => !k.startsWith('zzzz')).map(([, v]) => ({ nome: String(v[0]?.nome || 'Alguém').slice(0, 30), tela: !!v[0]?.tela }));
    const pessoas = lista.map((p) => p.nome), naTela = lista.filter((p) => p.tela).map((p) => p.nome);
    const canal = await cliente.channels.fetch(est.canalAvisos).catch(() => null);
    if (!canal?.isTextBased?.()) return;
    const link = `${site}/comunidade.html?id=${est.c.id}#call`;
    const texto = () => `🔊 ${pessoas.length === 1 ? `**${pessoas[0]}** está` : `**${pessoas.slice(0, -1).join(', ')}** e **${pessoas.at(-1)}** estão`} na call da comunidade **${est.c.name}** no site!`
      + (naTela.length ? `\n📺 **${naTela.join(', ')}** ${naTela.length === 1 ? 'está' : 'estão'} transmitindo a tela: entre para assistir.` : '');
    const botoes = [linha(botaoLink(naTela.length ? '📺 Assistir na call' : '🔊 Entrar na call', link))];
    if (pessoas.length && !est.msg) {
      const falta = 10 * 60000 - (Date.now() - est.ultimo);
      // acabou de terminar: espera 10 min para avisar de novo da call (a tela continua avisando na hora)
      if (falta > 0) { clearTimeout(est.espera); est.espera = setTimeout(() => mudouCall(est).catch(() => {}), falta); }
      else est.msg = await canal.send({ content: texto(), components: botoes, allowedMentions: { parse: [] } }).catch(() => null);
    } else if (pessoas.length && est.msg) {
      await est.msg.edit({ content: texto(), components: botoes }).catch(() => {});
    }
    // Transmissão de tela: mensagem nova (edição não notifica ninguém no Discord), e ela vira "terminou" no fim
    if (naTela.length && !est.msgTela) {
      est.msgTela = await canal.send({ content: `📺 **${naTela.join(', ')}** começou a transmitir a tela na call da comunidade **${est.c.name}**!`,
        components: [linha(botaoLink('📺 Assistir na call', link))], allowedMentions: { parse: [] } }).catch(() => null);
    } else if (!naTela.length && est.msgTela) {
      await est.msgTela.edit({ content: `⚫ A transmissão de tela na call da comunidade **${est.c.name}** terminou.`, components: [] }).catch(() => {});
      est.msgTela = null;
    }
    if (!pessoas.length && est.msg) {
      await est.msg.edit({ content: `⚫ A call da comunidade **${est.c.name}** terminou.`, components: [] }).catch(() => {});
      est.msg = null; est.ultimo = Date.now();
    }
  }
  vigiarCallsDoSite().catch((e) => log('call do site:', e.message));
  setInterval(() => vigiarCallsDoSite().catch(() => {}), 5 * 60000);

  conferirAoVivo().catch(() => {});
  setInterval(() => rotina().catch((e) => log('rotina:', e.message)), 5 * 60000);
  setTimeout(() => rotina().catch(() => {}), 20000);
  log('discord: recursos sociais ligados (/conectar, /grupo, /nota, /enquete, /ranking, /avisos, ao vivo)');
}
