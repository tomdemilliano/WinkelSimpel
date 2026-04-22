/**
 * pages/guide/qr/[shopperId].js — Winkel Simpel
 *
 * Generates and displays a printable QR card for a specific shopper.
 * The guide can print this card and give it to the shopper.
 * The QR code encodes the scan URL with the shopper's token.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../../lib/auth';
import { MemberFactory } from '../../../lib/dbSchema';
import { buildQrUrl } from '../../../lib/qr';

function QrCardPage({ claims }) {
  const router = useRouter();
  const { shopperId } = router.query;
  const { orgId } = claims;

  const [shopper, setShopper] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopperId) return;
    loadShopper();
  }, [shopperId]);

  async function loadShopper() {
    try {
      const snap = await MemberFactory.getById(orgId, shopperId);
      if (!snap.exists()) {
        router.replace('/guide/groups');
        return;
      }
      const data = snap.data();
      setShopper({ id: snap.id, ...data });
      setQrUrl(buildQrUrl(orgId, data.qrToken));
    } catch (err) {
      console.error('Failed to load shopper:', err);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;
  }

  if (!shopper) return null;

  return (
    <>
      {/* Print styles — hide nav, show only card */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: white; }
          .print-card { 
            box-shadow: none !important; 
            border: 2px solid #333 !important;
            page-break-inside: avoid;
          }
        }
      `}</style>

      {/* Navigation — hidden on print */}
      <div style={styles.nav} className="no-print">
        <button style={styles.backButton} onClick={() => router.push('/guide/groups')}>
          ← Terug
        </button>
        <h1 style={styles.navTitle}>QR-kaartje</h1>
        <button style={styles.printButton} onClick={handlePrint}>
          🖨 Afdrukken
        </button>
      </div>

      {/* Instructions — hidden on print */}
      <div style={styles.instructions} className="no-print">
        <p style={styles.instructionsText}>
          Druk dit kaartje af en geef het aan <strong>{shopper.firstName}</strong>.
          De shopper kan hiermee inloggen door de QR-code te scannen.
        </p>
      </div>

      {/* Printable card */}
      <div style={styles.cardWrapper}>
        <div style={styles.card} className="print-card">
          {/* App name */}
          <p style={styles.appName}>🛒 Winkel Simpel</p>

          {/* Shopper name — large for accessibility */}
          <p style={styles.shopperName}>
            {shopper.firstName} {shopper.lastName}
          </p>

          {/* QR code — rendered via API */}
          <div style={styles.qrWrapper}>
            <QrCodeImage url={qrUrl} size={220} />
          </div>

          {/* Clickable URL for laptop testing */}
          <div style={styles.urlBox} className="no-print">
            <p style={styles.urlLabel}>Of open deze link op een toestel:</p>
            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.urlLink}
            >
              {qrUrl}
            </a>
          </div>

          {/* Instruction for shopper — simple words, large text */}
          <div style={styles.shopperInstruction}>
            <p style={styles.instructionStep}>📷 Scan de code</p>
            <p style={styles.instructionStep}>🛒 Start je boodschappen</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// QrCodeImage — renders QR code using qrcode library
// ---------------------------------------------------------------------------
function QrCodeImage({ url, size }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!url) return;
    import('qrcode').then((QRCode) => {
      QRCode.toDataURL(url, {
        width: size,
        margin: 2,
        color: { dark: '#1a1a1a', light: '#ffffff' },
      }).then(setDataUrl);
    });
  }, [url, size]);

  if (!dataUrl) {
    return (
      <div style={{ width: size, height: size, backgroundColor: '#f5f5f5', borderRadius: 8 }} />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR-code"
      width={size}
      height={size}
      style={{ borderRadius: 8, display: 'block' }}
    />
  );
}

export default withRoleGuard(ROLES.GUIDE, QrCardPage);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem 1.5rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    color: '#4CAF50',
    cursor: 'pointer',
    fontWeight: '600',
  },
  navTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0,
  },
  printButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  instructions: {
    maxWidth: '480px',
    margin: '0 auto 1.5rem',
    padding: '0 1.5rem',
  },
  instructionsText: {
    fontSize: '0.9rem',
    color: '#666',
    lineHeight: '1.5',
    margin: 0,
    padding: '0.75rem 1rem',
    backgroundColor: '#FFF3E0',
    borderRadius: '10px',
  },
  cardWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '0 1.5rem 3rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '20px',
    border: '2px solid #1a1a1a',
    padding: '2rem 2rem 1.5rem',
    width: '100%',
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    fontFamily: 'system-ui, sans-serif',
  },
  appName: {
    fontSize: '1rem',
    color: '#888',
    margin: 0,
    fontWeight: '600',
  },
  shopperName: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#1a1a1a',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.2,
  },
  qrWrapper: {
    padding: '0.75rem',
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
  },
  shopperInstruction: {
    width: '100%',
    borderTop: '1px solid #eee',
    paddingTop: '0.875rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  instructionStep: {
    fontSize: '1rem',
    color: '#444',
    margin: 0,
    fontWeight: '600',
    textAlign: 'center',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
  urlBox: {
    width: '100%',
    borderTop: '1px solid #eee',
    paddingTop: '0.875rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  urlLabel: {
    fontSize: '0.75rem',
    color: '#aaa',
    margin: 0,
    textAlign: 'center',
  },
  urlLink: {
    fontSize: '0.7rem',
    color: '#1565C0',
    wordBreak: 'break-all',
    textAlign: 'center',
    textDecoration: 'underline',
    lineHeight: 1.5,
  },
  hint: {
    color: '#aaa',
    fontSize: '0.95rem',
  },
};
