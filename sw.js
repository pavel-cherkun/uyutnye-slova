// Офлайн-режим: сначала сеть (чтобы обновления приходили сразу), при отсутствии сети — кэш.
const CACHE = 'cozy-words-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes('fonts.g'))) {
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
