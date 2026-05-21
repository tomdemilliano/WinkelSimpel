/**
 * components/InstallPrompt.js — Winkel Simpel
 *
 * Toont een installatiebanner wanneer de browser een PWA-installatie
 * ondersteunt. Wordt NIET getoond op shopper-pagina's (/shop/*, /scan).
 *
 * Gebruik: voeg <InstallPrompt /> toe in pages/_app.js
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const EXCLUDED_PATHS = ['/shop', '/scan'];

export default function InstallPrompt() {
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isTouchDevice =
      navigator.maxTouchPoints > 1 ||
      window.matchMedia('(pointer: coarse)').matches;
    if (!isTouchDevice) return;

    const wasDismissed = localStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) { setDismissed(true); return; }

    // iOS Safari ondersteunt beforeinstallprompt niet — aparte instructiebanner nodig
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
      setShowIOSBanner(true);
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!deferredPrompt || dismissed) return;
    const isExcluded = EXCLUDED_PATHS.some(p => router.pathname.startsWith(p));
    setVisible(!isExcluded);
  }, [deferredPrompt, router.pathname, dismissed]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
    if (outcome === 'dismissed') {
      localStorage.setItem('pwa-install-dismissed', '1');
    }
  }

  function handleDismiss() {
    setVisible(false);
    setShowIOSBanner(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  const isExcluded = EXCLUDED_PATHS.some(p => router.pathname.startsWith(p));

  if (isExcluded) return null;

  if (showIOSBanner && !dismissed) {
    return (
      <div style={styles.banner}>
        <div style={styles.left}>
          <div style={styles.iconWrapper}>
            {/* Safari Delen-icoon */}
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v13M8 6l4-4 4 4" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 14v6a1 1 0 001 1h14a1 1 0 001-1v-6" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p style={styles.title}>Installeer Winkel Simpel</p>
            <p style={styles.subtitle}>
              Tik op <strong>Delen</strong> ↑ en kies <strong>&ldquo;Zet op beginscherm&rdquo;</strong>
            </p>
          </div>
        </div>
        <div style={styles.actions}>
          <button style={styles.dismissButton} onClick={handleDismiss} aria-label="Sluiten">
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div style={styles.banner}>
      <div style={styles.left}>
        <div style={styles.iconWrapper}>
          {/* Winkeltas icon */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" fill="#4CAF50" />
            <path d="M3 6h18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 10a4 4 0 01-8 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p style={styles.title}>Installeer Winkel Simpel</p>
          <p style={styles.subtitle}>Voeg toe aan je startscherm voor snelle toegang</p>
        </div>
      </div>
      <div style={styles.actions}>
        <button style={styles.installButton} onClick={handleInstall}>
          Installeren
        </button>
        <button style={styles.dismissButton} onClick={handleDismiss} aria-label="Sluiten">
          ✕
        </button>
      </div>
    </div>
  );
}

const styles = {
  banner: {
    position: 'fixed',
    bottom: '1rem',
    left: '1rem',
    right: '1rem',
    maxWidth: '480px',
    margin: '0 auto',
    backgroundColor: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
    padding: '1rem 1rem 1rem 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    zIndex: 9999,
    border: '1px solid #e8e8e8',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
    minWidth: 0,
  },
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: '#E8F5E9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 1.2,
  },
  subtitle: {
    margin: '0.2rem 0 0',
    fontSize: '0.78rem',
    color: '#888',
    lineHeight: 1.3,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  installButton: {
    padding: '0.55rem 1rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dismissButton: {
    padding: '0.5rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#bbb',
    fontSize: '1rem',
    cursor: 'pointer',
    lineHeight: 1,
  },
};
