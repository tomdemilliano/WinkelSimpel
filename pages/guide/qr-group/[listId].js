/**
 * pages/guide/qr-group/[listId].js — Winkel Simpel
 *
 * Genereert en toont een afdrukbaar QR-kaartje voor een groepslijstje.
 * De QR-code bevat de groupToken die op het lijstje staat.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../../lib/auth';
import { ShoppingListFactory, GroupFactory } from '../../../lib/dbSchema';
import { buildDirectShopUrl } from '../../../lib/qr';

function QrGroupCardPage({ claims }) {
  const router = useRouter();
  const { listId } = router.query;
  const { orgId } = claims;

  const [list, setList] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!listId) return;
    loadData();
  }, [listId]);

  async function loadData() {
    try {
      const snap = await ShoppingListFactory.getById(orgId, listId);
      if (!snap.exists()) {
        router.replace('/guide/lists');
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      setList(data);

      if (!data.groupToken) {
        router.replace(`/guide/list/${listId}`);
        return;
      }

      // Laad groepsnaam
      if (data.assignedTo?.type === 'group') {
        const groupSnap = await GroupFactory.getById(orgId, data.assignedTo.id);
        if (groupSnap.exists()) setGroupName(groupSnap.data().name);
      }

      setQrUrl(buildDirectShopUrl(orgId, data.groupToken, listId));
    } catch (err) {
      console.error('Failed to load group list:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;
  if (!list) return null;

  return (
    <>
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

      <div style={styles.nav} className="no-print">
        <button style={styles.backButton} onClick={() => router.push(`/guide/list/${listId}`)}>
          ← Terug
        </button>
        <h1 style={styles.navTitle}>QR-kaartje groep</h1>
        <button style={styles.printButton} onClick={() => window.print()}>
          🖨 Afdrukken
        </button>
      </div>

      <div style={styles.instructions} className="no-print">
        <p style={styles.instructionsText}>
          Dit QR-kaartje geeft toegang tot het lijstje <strong>"{list.title}"</strong> voor groep <strong>{groupName}</strong>.
          Eén kaartje is genoeg — iedereen in de groep kan dezelfde code scannen.
        </p>
      </div>

      <div style={styles.cardWrapper}>
        <div style={styles.card} className="print-card">
          <p style={styles.appName}>🛒 Winkel Simpel</p>
          <p style={styles.listTitle}>{list.title}</p>
          {groupName && <p style={styles.groupName}>Groep: {groupName}</p>}

          <div style={styles.qrWrapper}>
            <QrCodeImage url={qrUrl} size={220} />
          </div>

          <div style={styles.urlBox} className="no-print">
            <p style={styles.urlLabel}>Of open deze link op een toestel:</p>
            <a href={qrUrl} target="_blank" rel="noopener noreferrer" style={styles.urlLink}>
              {qrUrl}
            </a>
          </div>

          <div style={styles.shopperInstruction}>
            <p style={styles.instructionStep}>📷 Scan de code</p>
            <p style={styles.instructionStep}>🛒 Start de boodschappen</p>
          </div>
        </div>
      </div>
    </>
  );
}

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
    return <div style={{ width: size, height: size, backgroundColor: '#f5f5f5', borderRadius: 8 }} />;
  }

  return (
    <img src={dataUrl} alt="QR-code" width={size} height={size} style={{ borderRadius: 8, display: 'block' }} />
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], QrGroupCardPage);

const styles = {
  nav: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', maxWidth: '600px', margin: '0 auto' },
  backButton: { background: 'none', border: 'none', fontSize: '0.9rem', color: '#4CAF50', cursor: 'pointer', fontWeight: '600' },
  navTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  printButton: { padding: '0.5rem 1rem', backgroundColor: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' },
  instructions: { maxWidth: '480px', margin: '0 auto 1.5rem', padding: '0 1.5rem' },
  instructionsText: { fontSize: '0.9rem', color: '#666', lineHeight: '1.5', margin: 0, padding: '0.75rem 1rem', backgroundColor: '#FFF3E0', borderRadius: '10px' },
  cardWrapper: { display: 'flex', justifyContent: 'center', padding: '0 1.5rem 3rem' },
  card: { backgroundColor: '#fff', borderRadius: '20px', border: '2px solid #1a1a1a', padding: '2rem 2rem 1.5rem', width: '100%', maxWidth: '320px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontFamily: 'system-ui, sans-serif' },
  appName: { fontSize: '1rem', color: '#888', margin: 0, fontWeight: '600' },
  listTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#1a1a1a', margin: 0, textAlign: 'center', lineHeight: 1.2 },
  groupName: { fontSize: '1rem', fontWeight: '600', color: '#4CAF50', margin: 0 },
  qrWrapper: { padding: '0.75rem', backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee' },
  urlBox: { width: '100%', borderTop: '1px solid #eee', paddingTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  urlLabel: { fontSize: '0.75rem', color: '#aaa', margin: 0, textAlign: 'center' },
  urlLink: { fontSize: '0.7rem', color: '#1565C0', wordBreak: 'break-all', textAlign: 'center', textDecoration: 'underline', lineHeight: 1.5 },
  shopperInstruction: { width: '100%', borderTop: '1px solid #eee', paddingTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  instructionStep: { fontSize: '1rem', color: '#444', margin: 0, fontWeight: '600', textAlign: 'center' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
  hint: { color: '#aaa', fontSize: '0.95rem' },
};
