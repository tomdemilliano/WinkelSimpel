/**
 * pages/scan.js — Winkel Simpel
 *
 * QR scan entry point for shoppers.
 *
 * Flow:
 *   1. Scan QR code → extract orgId + token from URL
 *   2. Validate token against Firestore
 *   3. Sign in anonymously via Firebase Auth
 *   4. Call /api/shopper/auth to set custom claims (orgId, memberId)
 *   5. Force token refresh so new claims are active
 *   6. Save session to localStorage
 *   7. Redirect to active shopping list
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

  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);

  // Mode 1: URL parameters present — validate directly
  useEffect(() => {
    if (!ready) return;
    const parsed = parseQrQuery(router.query);
    if (parsed) {
      handleToken(parsed.orgId, parsed.token);
    } else {
      setStatus('scanning');
    }
  }, [ready, router.query]);

  // Mode 2: Start camera scanner
  useEffect(() => {
    if (status !== 'scanning') return;

    async function startScanner() {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerInstanceRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          async (decodedText) => {
            await scanner.stop();
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
          () => {}
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

      // Step 3: get ID token and call server to set custom claims
      const idToken = await getIdToken(anonUser);
      const claimsRes = await fetch('/api/shopper/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          orgId,
          memberId: member.memberId,
        }),
      });

      if (!claimsRes.ok) {
        const data = await claimsRes.json();
        setErrorMessage(data.message || 'Inloggen mislukt. Probeer opnieuw.');
        setStatus('error');
        return;
      }

      // Step 4: force token refresh so new claims are active in Firestore rules
      await anonUser.getIdToken(true);

      // Step 5: save session to localStorage
      saveShopperSession({
        orgId,
        memberId: member.memberId,
        firstName: member.firstName,
      });

      // Step 6: find active shopping list and redirect
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

  return (
    <div style={styles.page}>
      {status === 'loading' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
        </div>
      )}

      {status === 'scanning' && (
        <div style={styles.scannerWrapper}>
          <p style={styles.scanInstruction}>Richt de camera op je kaartje</p>
          <div id="qr-reader" ref={scannerRef} style={styles.scannerBox} />
          <p style={styles.scanHint}>📷</p>
        </div>
      )}

      {status === 'validating' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={styles.validatingText}>Even controleren...</p>
        </div>
      )}

      {status === 'error' && (
        <div style={styles.centered}>
          <div style={styles.iconLarge}>❌</div>
          <p style={styles.errorText}>{errorMessage}</p>
          <button style={styles.retryButton} onClick={() => setStatus('scanning')}>
            Opnieuw proberen
          </button>
        </div>
      )}

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
