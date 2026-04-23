/**
 * public/sw.js — Winkel Simpel Service Worker
 *
 * Minimale service worker die de PWA installeerbaar maakt.
 * Cachet de app shell voor offline gebruik.
 */

const CACHE_NAME = 'winkel-simpel-v1';

const APP_SHELL = [
  '/',
  '/login',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategie: probeer netwerk, val terug op cache
self.addEventListener('fetch', (event) => {
  // Alleen GET requests cachen
  if (event.request.method !== 'GET') return;
  // API routes niet cachen
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Sla succesvolle responses op in cache
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
