import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { AccessRequestFactory } from '../../lib/dbSchema';

function AccessRequestsPage({ claims }) {
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [error, setError] = useState('');

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await AccessRequestFactory.getByOrg(claims.orgId);
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      setError('Verzoeken laden mislukt.');
    } finally {
      setLoading(false);
    }
  }, [claims.orgId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleAction(requestId, action) {
    setProcessing(requestId + action);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/org/handle-access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'Er is een fout opgetreden.'); return; }
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r));
    } catch {
      setError('Er is een fout opgetreden. Probeer opnieuw.');
    } finally {
      setProcessing(null);
    }
  }

  const pending = requests.filter(r => r.status === 'pending');
  const handled = requests.filter(r => r.status !== 'pending');

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>← Terug</button>
        <h1 style={styles.title}>Toegangsverzoeken</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={styles.content}>
        {error && <p style={styles.errorText}>{error}</p>}

        {loading ? (
          <p style={styles.hint}>Laden...</p>
        ) : pending.length === 0 && handled.length === 0 ? (
          <p style={styles.hint}>Geen toegangsverzoeken.</p>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <p style={styles.sectionLabel}>Te behandelen</p>
                <div style={styles.list}>
                  {pending.map(r => (
                    <div key={r.id} style={styles.card}>
                      <div style={styles.cardInfo}>
                        <p style={styles.cardName}>{r.requestingUserName || r.requestingUserEmail}</p>
                        <p style={styles.cardEmail}>{r.requestingUserEmail}</p>
                        {r.createdAt?.toDate && (
                          <p style={styles.cardDate}>
                            {r.createdAt.toDate().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <div style={styles.cardActions}>
                        <button
                          style={{ ...styles.rejectButton, opacity: processing ? 0.6 : 1 }}
                          disabled={!!processing}
                          onClick={() => handleAction(r.id, 'reject')}
                        >
                          {processing === r.id + 'reject' ? '...' : 'Weigeren'}
                        </button>
                        <button
                          style={{ ...styles.approveButton, opacity: processing ? 0.6 : 1 }}
                          disabled={!!processing}
                          onClick={() => handleAction(r.id, 'approve')}
                        >
                          {processing === r.id + 'approve' ? '...' : 'Goedkeuren'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {handled.length > 0 && (
              <>
                <p style={{ ...styles.sectionLabel, marginTop: pending.length > 0 ? '1.5rem' : 0 }}>Behandeld</p>
                <div style={styles.list}>
                  {handled.map(r => (
                    <div key={r.id} style={{ ...styles.card, opacity: 0.7 }}>
                      <div style={styles.cardInfo}>
                        <p style={styles.cardName}>{r.requestingUserName || r.requestingUserEmail}</p>
                        <p style={styles.cardEmail}>{r.requestingUserEmail}</p>
                      </div>
                      <span style={{ ...styles.statusBadge, ...statusStyle(r.status) }}>
                        {r.status === 'approved' ? 'Goedgekeurd' : 'Geweigerd'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function statusStyle(status) {
  return status === 'approved'
    ? { backgroundColor: '#E8F5E9', color: '#2E7D32' }
    : { backgroundColor: '#FDECEA', color: '#C62828' };
}

export default withRoleGuard([ROLES.ORG_ADMIN], AccessRequestsPage);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.95rem', color: '#4CAF50', fontWeight: '600', cursor: 'pointer', padding: 0 },
  title: { fontSize: '1.2rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  content: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  errorText: { color: '#d93025', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#fdecea', borderRadius: '8px' },
  hint: { fontSize: '0.875rem', color: '#aaa', textAlign: 'center', margin: '2rem 0' },
  sectionLabel: { fontSize: '0.75rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardInfo: { flex: 1, minWidth: 0 },
  cardName: { fontWeight: '700', color: '#1a1a1a', fontSize: '0.95rem', margin: '0 0 0.15rem' },
  cardEmail: { fontSize: '0.8rem', color: '#888', margin: '0 0 0.1rem' },
  cardDate: { fontSize: '0.78rem', color: '#bbb', margin: 0 },
  cardActions: { display: 'flex', gap: '0.5rem', flexShrink: 0 },
  approveButton: { padding: '0.45rem 0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: '700', cursor: 'pointer' },
  rejectButton: { padding: '0.45rem 0.875rem', backgroundColor: '#f5f5f5', color: '#666', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: '700', cursor: 'pointer' },
  statusBadge: { fontSize: '0.78rem', fontWeight: '700', padding: '0.35rem 0.75rem', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 },
};
