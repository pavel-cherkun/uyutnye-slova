// Офлайн-режим: сначала сеть (с обязательной сверкой версии, чтобы не смешивались старые и новые файлы),
// при отсутствии сети — кэш.
const CACHE = 'cozy-words-v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // старые кэши удаляем — иначе на телефоне могут остаться модули прошлой версии
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

function fetchFresh(req) {
  return new Request(req.url, { cache: 'no-cache', credentials: 'same-origin', redirect: 'follow' });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // для своих файлов — запрос по URL с обязательной сверкой (no-cache); запрос перехода нельзя
      // пересоздать с параметрами, поэтому тоже идём по URL
      const res = await fetch(sameOrigin ? fetchFresh(req) : req);
      if (res.ok && (sameOrigin || req.url.includes('fonts.g'))) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw new Error('offline');
    }
  })());
});
