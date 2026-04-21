/**
 * pages/scan.js — Winkel Simpel
 *
 * QR scan entry point for shoppers.
 *
 * Two modes:
 *   1. URL parameters present (?org=...&token=...):
 *      Validate the token against Firestore, save the session, redirect to active list.
 *   2. No parameters:
 *      Show the camera-based QR scanner so the shopper can scan their card.
 *
 * This page is intentionally very visual and simple — shoppers cannot read.
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { validateQrToken, saveShopperSession } from '../lib/auth';
import { parseQrQuery } from '../lib/qr';
import { ShoppingListFactory } from '../lib/dbSchema';

// ---------------------------------------------------------------------------
// QR scanner library — loaded dynamically (client-side only)
// We use 'html5-qrcode' (install: npm install html5-qrcode)
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const router = useRouter();
  const { ready } = router;

  const [status, setStatus] = useState('loading'); // loading | scanning | validating | error
  const [errorMessage, setErrorMessage] = useState('');
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);

  // -------------------------------------------------------------------------
  // Mode 1: URL parameters present — validate directly
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    const parsed = parseQrQuery(router.query);
    if (parsed) {
      handleToken(parsed.orgId, parsed.token);
    } else {
      setStatus('scanning');
    }
  }, [ready, router.query]);

  // -------------------------------------------------------------------------
  // Mode 2: Start camera scanner
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'scanning') return;

    let scanner;

    async function startScanner() {
      const { Html5Qrcode } = await import('html5-qrcode');
      scanner = new Html5Qrcode('qr-reader');
      scannerInstanceRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            await scanner.stop();
            const url = new URL(decodedText);
            const orgId = url.searchParams.get('org');
            const token = url.searchParams.get('token');
            if (!orgId || !token) {
              setErrorMessage('Ongeldige QR-code. Vraag een nieuwe aan je begeleider.');
              setStatus('error');
              return;
            }
            handleToken(orgId, token);
          },
          () => {} // ignore scan errors (camera frames without QR)
        );
      } catch {
        setErrorMessage('Camera kon niet worden gestart. Controleer de toestemming.');
        setStatus('error');
      }
    }

    startScanner();

    return () => {
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.stop().catch(() => {});
      }
    };
  }, [status]);

  // -------------------------------------------------------------------------
  // Validate token + find active list
  // -------------------------------------------------------------------------
  async function handleToken(orgId, token) {
    setStatus('validating');
    try {
      const member = await validateQrToken(orgId, token);
      if (!member) {
        setErrorMessage('Deze QR-code is niet geldig. Vraag een nieuwe aan je begeleider.');
        setStatus('error');
        return;
      }

      // Save session to localStorage
      saveShopperSession({
        orgId,
        memberId: member.memberId,
        firstName: member.firstName,
      });

      // Find the active shopping list for this member
      const listSnap = await ShoppingListFactory.getActiveForMember(orgId, member.memberId);

      if (!listSnap.empty) {
        const listId = listSnap.docs[0].id;
        router.replace(`/shop/${listId}`);
      } else {
        // No active list — show friendly message
        setStatus('no-list');
      }
    } catch {
      setErrorMessage('Er is iets misgegaan. Probeer opnieuw.');
      setStatus('error');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={styles.page}>
      {/* Loading */}
      {status === 'loading' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* Camera scanner */}
      {status === 'scanning' && (
        <div style={styles.scannerWrapper}>
          <p style={styles.scanInstruction}>
            Richt de camera op je kaartje
          </p>
          <div id="qr-reader" ref={scannerRef} style={styles.scannerBox} />
          <p style={styles.scanHint}>📷</p>
        </div>
      )}

      {/* Validating */}
      {status === 'validating' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={styles.validatingText}>Even controleren...</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={styles.centered}>
          <div style={styles.iconLarge}>❌</div>
          <p style={styles.errorText}>{errorMessage}</p>
          <button style={styles.retryButton} onClick={() => setStatus('scanning')}>
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* No active list */}
      {status === 'no-list' && (
        <div style={styles.centered}>
          <div style={styles.iconLarge}>🛒</div>
          <p style={styles.noListText}>
            Er is nog geen lijstje klaar. Vraag het aan je begeleider!
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — large, clear, accessible for shoppers
// ---------------------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
    padding: '1rem',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    textAlign: 'center',
    padding: '2rem',
  },
  scannerWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '360px',
  },
  scannerBox: {
    width: '100%',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  scanInstruction: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    margin: 0,
  },
  scanHint: {
    fontSize: '3rem',
  },
  spinner: {
    width: '56px',
    height: '56px',
    border: '5px solid #eee',
    borderTop: '5px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  validatingText: {
    fontSize: '1.25rem',
    color: '#555',
    margin: 0,
  },
  iconLarge: {
    fontSize: '5rem',
  },
  errorText: {
    fontSize: '1.25rem',
    color: '#c62828',
    maxWidth: '300px',
    lineHeight: '1.5',
    margin: 0,
  },
  noListText: {
    fontSize: '1.4rem',
    color: '#555',
    maxWidth: '300px',
    lineHeight: '1.6',
    textAlign: 'center',
    margin: 0,
  },
  retryButton: {
    padding: '1rem 2rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1.1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
};
