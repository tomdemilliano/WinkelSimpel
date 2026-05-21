/**
 * public/sw.js — Winkel Simpel Service Worker
 */

const CACHE_NAME = 'winkel-simpel-v3';

const APP_SHELL = [
  '/',
  '/login',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Alleen same-origin GET requests behandelen
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;
  if (request.url.includes('/api/')) return;
  // Nooit /scan of /shop cachen — die hebben altijd verse data nodig
  if (request.url.includes('/scan') || request.url.includes('/shop')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
