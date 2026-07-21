// sw.js — versioned precache service worker (plan §14).
// CACHE_VERSION must be bumped in the same commit as any app change
// (see docs/MAINTENANCE.md). scripts/check-precache.mjs keeps PRECACHE honest.

const CACHE_VERSION = 'gt-v0.15.0';

const PRECACHE = [
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/platform.js',
  'js/db.js',
  'js/store.js',
  'js/stats.js',
  'js/parser.js',
  'js/analysis-export.js',
  'js/backup.js',
  'js/ui/components.js',
  'js/ui/home.js',
  'js/ui/log.js',
  'js/ui/set-editor.js',
  'js/ui/history.js',
  'js/ui/day.js',
  'js/ui/dashboard.js',
  'js/ui/chart.js',
  'js/ui/manage.js',
  'js/ui/settings.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // Atomic: if any file fails, installation fails and the old SW keeps serving.
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // SPA navigation fallback: any page navigation serves the cached shell.
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || fetch(req);
  })());
});
