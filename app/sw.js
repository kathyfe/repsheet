// Offline support. Bump VERSION on every deploy so phones pick up the new files.
const VERSION = 'repsheet-0.1.0';
const FILES = [
  './', './index.html', './styles.css', './app.js', './data.js', './logic.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './fonts/big-shoulders-700.woff2', './fonts/big-shoulders-800.woff2', './fonts/archivo-400.woff2', './fonts/archivo-600.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache first, so the app opens instantly with no signal in the gym.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html'))),
  );
});
