// Bump CACHE on any change to the precache list so old caches are purged on activate.
const CACHE = 'sprig-v3';
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.css',
  '/vendor/highlight.min.js', '/vendor/github-dark.min.css',
  '/css/base.css', '/css/auth.css', '/css/topbar.css', '/css/sidebar.css',
  '/css/editor.css', '/css/feed.css', '/css/note.css', '/css/modal.css',
  '/css/admin.css', '/css/features.css',
  '/js/main.js', '/js/auth.js', '/js/editor.js', '/js/feed.js', '/js/note-view.js',
  '/js/sidebar.js', '/js/graph.js', '/js/user-menu.js', '/js/admin.js',
  '/js/folders.js', '/js/searches.js', '/js/calendar.js', '/js/templates.js',
  '/js/utils.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
