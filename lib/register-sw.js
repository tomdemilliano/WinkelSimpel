/**
 * lib/register-sw.js — Winkel Simpel
 *
 * Registreert de service worker. Aanroepen vanuit _app.js via useEffect.
 */

export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registratie mislukt:', err));
  });
}
