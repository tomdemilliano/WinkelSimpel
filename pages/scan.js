/**
 * pages/scan.js — Winkel Simpel
 *
 * QR scan entry point for shoppers.
 *
 * Primary flow (recommended):
 *   Shopper scans QR code with phone camera app → browser opens
 *   https://app.url/scan?org={orgId}&token={qrToken} directly
 *
 * Secondary flow (fallback):
 *   Shopper opens /scan manually → camera opens in browser to scan QR code
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { signInAnonymously, getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { validateQrToken, saveShopperSession } from '../lib/auth';
import { parseQrQuery } from '../lib/qr';
import { ShoppingListFactory } from '../lib/dbSchema';

export default function ScanPage() {
  const router = useRouter();
  const { ready } = router;

  // 'idle' | 'validating' | 'scanning' | 'error' | 'no-list'
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const scannerInstanceRef = useRef(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (handledRef.current) return;

    const parsed = parseQrQuery(router.query);
    if (parsed) {
      // URL parameters present — came from scanning QR with camera app
      handledRef.current = true;
      handleToken(parsed.orgId, parsed.token);
    } else {
      // No parameters — show camera scanner as fallback
      setStatus('scanning');
    }
  }, [ready, router.query]);

  // Start camera scanner
  useEffect(() => {
    if (status !== 'scanning') return;

    let isMounted = true;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!isMounted) return;

        const scanner = new Html5Qrcode('qr-reader');
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            if (handledRef.current) return;
            handledRef.current = true;
            await scanner.stop().catch(() => {});
            try {
              const url = new URL(decodedText);
              const orgId = url.searchParams.get('org');
              const token = url.searchParams.get('token');
              if (!orgId || !token) {
                setErrorMessage('Ongeldige QR-code. Vraag een nieuwe aan je begeleider.');
                setStatus('error');
                return;
              }
              handleToken(orgId, token);
            } catch {
              setErrorMessage('Ongeldige QR-code. Vraag een nieuwe aan je begeleider.');
              setStatus('error');
            }
          },
          () => {} // ignore per-frame errors
        );
      } catch (err) {
        console.error('Camera start error:', err);
        if (isMounted) {
          setErrorMessage('Camera kon niet worden gestart. Controleer de toestemming in je browser.');
          setStatus('error');
        }
      }
    }

    startScanner();

    return () => {
      isMounted = false;
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.stop().catch(() => {});
      }
    };
  }, [status]);

  async function handleToken(orgId, token) {
    setStatus('validating');
    try {
      // Step 1: validate QR token against Firestore
      const member = await validateQrToken(orgId, token);
      if (!member) {
        setErrorMessage('Deze QR-code is niet geldig. Vraag een nieuwe aan je begeleider.');
        setStatus('error');
        return;
      }

      // Step 2: sign in anonymously via Firebase Auth
      const anonCredential = await signInAnonymously(auth);
      const anonUser = anonCredential.user;

      // Step 3: call server to set custom claims (role, orgId, memberId)
      const idToken = await getIdToken(anonUser);
      const claimsRes = await fetch('/api/shopper/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orgId, memberId: member.memberId }),
      });

      if (!claimsRes.ok) {
        const data = await claimsRes.json();
        setErrorMessage(data.message || 'Inloggen mislukt. Probeer opnieuw.');
        setStatus('error');
        return;
      }

      // Step 4: force token refresh so Firestore rules see the new claims
      await anonUser.getIdToken(true);

      // Step 5: save session to localStorage for the shopper interface
      saveShopperSession({
        orgId,
        memberId: member.memberId,
        firstName: member.firstName,
      });

      // Step 6: find active list and redirect
      const listSnap = await ShoppingListFactory.getActiveForMember(orgId, member.memberId);
      if (!listSnap.empty) {
        router.replace(`/shop/${listSnap.docs[0].id}`);
      } else {
        setStatus('no-list');
      }
    } catch (err) {
      console.error('handleToken error:', err);
      setErrorMessage('Er is iets misgegaan. Probeer opnieuw.');
      setStatus('error');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={styles.page}>

      {/* Idle — waiting for router to be ready */}
      {status === 'idle' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* Validating — processing QR token */}
      {status === 'validating' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={styles.statusText}>Even controleren...</p>
        </div>
      )}

      {/* Camera scanner */}
      {status === 'scanning' && (
        <div style={styles.scannerWrapper}>
          <p style={styles.scanInstruction}>
            Richt de camera op je kaartje
          </p>
          <div id="qr-reader" style={styles.scannerBox} />
          <p style={styles.scanHint}>📷</p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={styles.centered}>
          <div style={styles.iconLarge}>❌</div>
          <p style={styles.errorText}>{errorMessage}</p>
          <button
            style={styles.retryButton}
            onClick={() => {
              handledRef.current = false;
              setStatus('scanning');
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      )}

      {/* No active list */}
      {status === 'no-list' && (
        <div style={styles.centered}>
          <div style={styles.iconLarge}>🛒</div>
          <p style={styles.noListText}>
            Er is nog geen lijstje klaar.{'\n'}Vraag het aan je begeleider!
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
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
    maxWidth: '400px',
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
    margin: 0,
  },
  spinner: {
    width: '56px',
    height: '56px',
    border: '5px solid #eee',
    borderTop: '5px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  statusText: {
    fontSize: '1.25rem',
    color: '#555',
    margin: 0,
  },
  iconLarge: {
    fontSize: '5rem',
  },
  errorText: {
    fontSize: '1.1rem',
    color: '#c62828',
    maxWidth: '300px',
    lineHeight: '1.6',
    margin: 0,
  },
  noListText: {
    fontSize: '1.4rem',
    color: '#555',
    maxWidth: '300px',
    lineHeight: '1.6',
    textAlign: 'center',
    margin: 0,
    whiteSpace: 'pre-line',
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
