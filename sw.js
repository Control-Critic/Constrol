// Service worker do Control Critic: app instalável, abertura rápida e página offline.
//   Páginas (navegação): rede primeiro; sem rede, a última cópia da página ou offline.html.
//   CSS/JS do site: rede primeiro; sem rede, a cópia guardada (nunca HTML no lugar).
//   Imagens do site: cache primeiro, com limite de quantidade.
//   Dados (Supabase, funções, CDN de imagens): nunca passam pelo cache.
//   Páginas privadas (admin, amigos, notificações, chamada): nunca são guardadas.
// A versão sobe a cada deploy que muda arquivos públicos: os caches antigos são apagados na ativação.
const VERSAO = 'cc-v100-__BUILD__'; // __BUILD__ vira o commit no deploy do Netlify (netlify.toml): cada deploy limpa o cache sozinho
const ESTATICO = `${VERSAO}-estatico`, PAGINAS = `${VERSAO}-paginas`, IMAGENS = `${VERSAO}-imagens`;
const ESSENCIAIS = ['/', '/index.html', '/offline.html', '/css/style.css', '/js/app.js', '/js/seguro.js', '/js/config.js', '/img/ControlHeader.png', '/img/Adelino.png', '/img/Control.png', '/img/perfilpadrao.png'];
const PRIVADAS = /^\/(admin|amigos|notificacoes|chamada|entrar)\.html$/;
const MAX_IMAGENS = 150;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(ESTATICO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => !k.startsWith(VERSAO + '-')).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// A página pode pedir para ativar a versão nova na hora
self.addEventListener('message', (e) => { if (e.data === 'atualizar') self.skipWaiting(); });

async function limitar(nome, max) {
  const c = await caches.open(nome), ks = await c.keys();
  for (const k of ks.slice(0, Math.max(0, ks.length - max))) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return; // dados: só rede

  // Navegação
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && !PRIVADAS.test(url.pathname)) { const c = await caches.open(PAGINAS); c.put(req, r.clone()); }
        return r;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match('/offline.html'));
      }
    })());
    return;
  }

  // CSS, JS, manifesto e fontes: rede primeiro (os arquivos não têm hash no nome; misturar versões
  // antigas e novas de módulos quebraria a página). Sem rede, a cópia guardada.
  if (/\.(css|js|mjs|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) { const c = await caches.open(ESTATICO); c.put(req, r.clone()); }
        return r;
      } catch {
        return (await caches.match(req)) || new Response('', { status: 504, statusText: 'Sem conexão' }); // nunca devolve HTML no lugar de JS/CSS
      }
    })());
    return;
  }

  // Imagens do site: cache primeiro, com limite
  if (req.destination === 'image' || /\.(png|jpe?g|webp|gif|svg|avif|ico)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const copia = await caches.match(req);
      if (copia) return copia;
      try {
        const r = await fetch(req);
        if (r.ok) { const c = await caches.open(IMAGENS); await c.put(req, r.clone()); e.waitUntil(limitar(IMAGENS, MAX_IMAGENS)); }
        return r;
      } catch { return (await caches.match('/img/Control.png')) || new Response('', { status: 504 }); }
    })());
  }
  // Demais arquivos: comportamento normal do navegador
});

// ---------- Notificações no celular ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Control Critic', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Control Critic', {
    body: d.body || '', icon: '/img/app/icone-192.png', badge: '/img/app/icone-192.png',
    data: { link: d.link || 'notificacoes.html' }, tag: d.type === 'dm' ? 'dm' : undefined, renotify: d.type === 'dm',
    requireInteraction: d.type === 'call',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL('/' + String(e.notification.data?.link || 'notificacoes.html').replace(/^\/+/, ''), self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
    const aba = abas.find((c) => c.url.startsWith(self.location.origin));
    return aba ? aba.navigate(url).then((c) => c?.focus()) : self.clients.openWindow(url);
  }));
});
