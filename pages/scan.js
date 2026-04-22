/**
 * pages/scan.js — Winkel Simpel
 *
 * QR scan entry point for shoppers.
 *
 * Three modes:
 *   1. URL parameters present (?org=...&token=...): validate directly
 *      → works when scanning QR with phone camera app
 *      → works when clicking the link on laptop (via QR card debug URL)
 *   2. No parameters: show camera scanner (mobile fallback)
 *   3. Dev mode: show manual input form to test without QR code
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

  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Manual input state (for laptop testing)
  const [manualOrg, setManualOrg] = useState('');
  const [manualToken, setManualToken] = useState('');

  const scannerInstanceRef = useRef(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (handledRef.current) return;

    const parsed = parseQrQuery(router.query);
    if (parsed) {
      handledRef.current = true;
      handleToken(parsed.orgId, parsed.token);
    } else {
      setStatus('choice');
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
          () => {}
        );
      } catch (err) {
        console.error('Camera start error:', err);
        if (isMounted) {
          setErrorMessage('Camera kon niet worden gestart. Probeer de handmatige methode.');
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
      const member = await validateQrToken(orgId, token);
      if (!member) {
        setErrorMessage('Deze QR-code is niet geldig. Vraag een nieuwe aan je begeleider.');
        setStatus('error');
        return;
      }

      const anonCredential = await signInAnonymously(auth);
      const anonUser = anonCredential.user;

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

      await anonUser.getIdToken(true);

      saveShopperSession({
        orgId,
        memberId: member.memberId,
        firstName: member.firstName,
      });

      const listSnap = await ShoppingListFactory.getActiveForMember(orgId, member.memberId);
      if (!listSnap.empty) {
        const listId = listSnap.docs[0].id;
        // Include org and token so shop page can re-authenticate if session is lost
        router.replace(`/shop/${listId}?org=${orgId}&token=${token}`);
      } else {
        setStatus('no-list');
      }
    } catch (err) {
      console.error('handleToken error:', err);
      setErrorMessage(`Fout: ${err.message}`);
      setStatus('error');
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    if (!manualOrg.trim() || !manualToken.trim()) return;
    handledRef.current = true;
    handleToken(manualOrg.trim(), manualToken.trim());
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={styles.page}>

      {/* Idle */}
      {status === 'idle' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
        </div>
      )}

      {/* Choice: camera or manual */}
      {status === 'choice' && (
        <div style={styles.choiceWrapper}>
          <p style={styles.choiceTitle}>🛒 Winkel Simpel</p>
          <p style={styles.choiceSubtitle}>Hoe wil je inloggen?</p>

          <button
            style={styles.choiceButton}
            onClick={() => setStatus('scanning')}
          >
            📷 QR-code scannen
          </button>

          <div style={styles.divider}>
            <span style={styles.dividerText}>of</span>
          </div>

          <form onSubmit={handleManualSubmit} style={styles.manualForm}>
            <p style={styles.manualLabel}>Handmatig invoeren (voor testen)</p>
            <input
              type="text"
              placeholder="Organisatie ID"
              value={manualOrg}
              onChange={(e) => setManualOrg(e.target.value)}
              style={styles.manualInput}
            />
            <input
              type="text"
              placeholder="QR Token"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              style={styles.manualInput}
            />
            <button type="submit" style={styles.manualButton}>
              Inloggen
            </button>
          </form>

          <p style={styles.manualHint}>
            Vind de organisatie ID en token via het QR-kaartje van de shopper
            (de URL bevat <code>?org=...&token=...</code>)
          </p>
        </div>
      )}

      {/* Camera scanner */}
      {status === 'scanning' && (
        <div style={styles.scannerWrapper}>
          <button
            style={styles.backButton}
            onClick={() => {
              if (scannerInstanceRef.current) {
                scannerInstanceRef.current.stop().catch(() => {});
              }
              handledRef.current = false;
              setStatus('choice');
            }}
          >
            ← Terug
          </button>
          <p style={styles.scanInstruction}>Richt de camera op je kaartje</p>
          <div id="qr-reader" style={styles.scannerBox} />
          <p style={styles.scanHint}>📷</p>
        </div>
      )}

      {/* Validating */}
      {status === 'validating' && (
        <div style={styles.centered}>
          <div style={styles.spinner} />
          <p style={styles.statusText}>Even controleren...</p>
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
              setStatus('choice');
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

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    textAlign: 'center',
    padding: '2rem',
  },
  choiceWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    width: '100%',
    maxWidth: '360px',
  },
  choiceTitle: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#1a1a1a',
    margin: 0,
  },
  choiceSubtitle: {
    fontSize: '1rem',
    color: '#888',
    margin: '0 0 0.5rem',
  },
  choiceButton: {
    width: '100%',
    padding: '1rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1.1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    gap: '0.75rem',
  },
  dividerText: {
    color: '#ccc',
    fontSize: '0.875rem',
    flexShrink: 0,
    margin: '0 auto',
  },
  manualForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    width: '100%',
  },
  manualLabel: {
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#aaa',
    margin: 0,
    textAlign: 'left',
  },
  manualInput: {
    padding: '0.7rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #ddd',
    fontSize: '0.9rem',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
  },
  manualButton: {
    padding: '0.75rem',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  manualHint: {
    fontSize: '0.75rem',
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 1.5,
    margin: 0,
  },
  scannerWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    width: '100%',
    maxWidth: '400px',
  },
  backButton: {
    alignSelf: 'flex-start',
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    color: '#4CAF50',
    cursor: 'pointer',
    fontWeight: '600',
    padding: 0,
  },
  scanInstruction: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    margin: 0,
  },
  scannerBox: {
    width: '100%',
    borderRadius: '16px',
    overflow: 'hidden',
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
    fontSize: '1rem',
    color: '#c62828',
    maxWidth: '320px',
    lineHeight: '1.6',
    margin: 0,
    wordBreak: 'break-word',
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
