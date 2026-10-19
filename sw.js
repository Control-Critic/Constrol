// Service worker do Control Critic: deixa o app instalável e abre mais rápido.
// Arquivos do site: busca na rede e guarda cópia (funciona offline com a última versão).
// Dados (Supabase, IGDB, funções) nunca são guardados em cache.
const VERSAO = 'cc-v81';
const ESSENCIAIS = ['/', '/index.html', '/css/style.css', '/js/app.js', '/js/config.js', '/img/ControlHeader.png', '/img/Adelino.png', '/img/Control.png', '/img/perfilpadrao.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/.netlify/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
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
