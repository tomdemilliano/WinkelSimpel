/**
 * pages/guide/request-access.js — Winkel Simpel
 *
 * Pagina voor stand-alone gebruikers om toegang aan te vragen bij
 * een bestaande organisatie.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { AccessRequestFactory } from '../../lib/dbSchema';

function RequestAccessPage({ claims }) {
  const router = useRouter();
  const { orgType, uid } = claims;

  const [orgs, setOrgs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requesting, setRequesting] = useState(null);
  const [error, setError] = useState('');
  const [successOrgName, setSuccessOrgName] = useState('');

  useEffect(() => {
    if (orgType !== 'private') {
      router.replace('/guide');
    }
  }, [orgType, router]);

  const loadMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const snap = await AccessRequestFactory.getByUser(uid);
      setMyRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      // stille fout
    } finally {
      setLoadingRequests(false);
    }
  }, [uid]);

  useEffect(() => {
    if (orgType !== 'private') return;

    const user = auth.currentUser;
    if (!user) { setLoadingOrgs(false); return; }
    user.getIdToken()
      .then((idToken) => fetch('/api/org/list-organizations', { headers: { Authorization: `Bearer ${idToken}` } }))
      .then((res) => res.json())
      .then((data) => { if (data.orgs) setOrgs(data.orgs); })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));

    loadMyRequests();
  }, [orgType, loadMyRequests]);

  const pendingTargetOrgIds = new Set(
    myRequests.filter((r) => r.status === 'pending').map((r) => r.targetOrgId)
  );

  const filteredOrgs = orgs.filter((org) =>
    org.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleRequest(org) {
    setRequesting(org.id);
    setError('');
    setSuccessOrgName('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/org/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ targetOrgId: org.id, targetOrgName: org.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Er is een fout opgetreden.');
        return;
      }
      setSuccessOrgName(org.name);
      await loadMyRequests();
    } catch {
      setError('Er is een fout opgetreden. Probeer opnieuw.');
    } finally {
      setRequesting(null);
    }
  }

  if (orgType !== 'private') return null;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Aansluiten bij organisatie</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={styles.content}>
        <p style={styles.intro}>
          Zoek een organisatie en dien een toegangsverzoek in. De beheerder van de
          organisatie ontvangt je verzoek en kan het goedkeuren of weigeren.
        </p>

        {successOrgName && (
          <div style={styles.successBanner}>
            Verzoek ingediend bij <strong>{successOrgName}</strong>. Je ontvangt bericht wanneer het verwerkt is.
          </div>
        )}
        {error && <p style={styles.errorText}>{error}</p>}

        <div style={styles.searchRow}>
          <input
            type="text"
            placeholder="Zoek organisatie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {loadingOrgs ? (
          <p style={styles.emptyHint}>Laden...</p>
        ) : filteredOrgs.length === 0 ? (
          <p style={styles.emptyHint}>Geen organisaties gevonden.</p>
        ) : (
          <div style={styles.orgList}>
            {filteredOrgs.map((org) => {
              const hasPending = pendingTargetOrgIds.has(org.id);
              return (
                <div key={org.id} style={styles.orgCard}>
                  <span style={styles.orgName}>{org.name}</span>
                  {hasPending ? (
                    <span style={styles.pendingBadge}>Verzoek ingediend</span>
                  ) : (
                    <button
                      style={{
                        ...styles.requestButton,
                        opacity: requesting === org.id ? 0.6 : 1,
                      }}
                      disabled={requesting === org.id}
                      onClick={() => handleRequest(org)}
                    >
                      {requesting === org.id ? 'Bezig...' : 'Aanvragen'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <h2 style={styles.sectionTitle}>Mijn verzoeken</h2>
        {loadingRequests ? (
          <p style={styles.emptyHint}>Laden...</p>
        ) : myRequests.length === 0 ? (
          <p style={styles.emptyHint}>Je hebt nog geen verzoeken ingediend.</p>
        ) : (
          <div style={styles.requestList}>
            {myRequests.map((r) => (
              <div key={r.id} style={styles.requestCard}>
                <div>
                  <p style={styles.requestOrg}>{r.targetOrgName}</p>
                  {r.createdAt?.toDate && (
                    <p style={styles.requestDate}>
                      {r.createdAt.toDate().toLocaleDateString('nl-BE', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  )}
                  {r.status === 'approved' && (
                    <p style={styles.approvedNote}>
                      Goedgekeurd — log opnieuw in om toegang te krijgen tot de organisatie.
                    </p>
                  )}
                </div>
                <span style={{ ...styles.statusBadge, ...statusBadgeStyle(r.status) }}>
                  {statusLabel(r.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabel(status) {
  switch (status) {
    case 'pending': return 'In behandeling';
    case 'approved': return 'Goedgekeurd';
    case 'rejected': return 'Geweigerd';
    default: return status;
  }
}

function statusBadgeStyle(status) {
  switch (status) {
    case 'pending': return { backgroundColor: '#FFF3E0', color: '#E65100' };
    case 'approved': return { backgroundColor: '#E8F5E9', color: '#2E7D32' };
    case 'rejected': return { backgroundColor: '#FDECEA', color: '#C62828' };
    default: return {};
  }
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], RequestAccessPage);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.95rem', color: '#4CAF50', fontWeight: '600', cursor: 'pointer', padding: 0 },
  title: { fontSize: '1.2rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  content: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  intro: { fontSize: '0.9rem', color: '#666', lineHeight: 1.6, margin: 0 },
  successBanner: { backgroundColor: '#E8F5E9', color: '#2E7D32', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.9rem' },
  errorText: { color: '#d93025', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#fdecea', borderRadius: '8px' },
  searchRow: { display: 'flex', gap: '0.5rem' },
  searchInput: { flex: 1, padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', outline: 'none' },
  emptyHint: { fontSize: '0.875rem', color: '#aaa', textAlign: 'center', margin: 0 },
  orgList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  orgCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  orgName: { fontWeight: '600', color: '#1a1a1a', fontSize: '0.95rem' },
  requestButton: { padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer' },
  pendingBadge: { fontSize: '0.8rem', color: '#E65100', backgroundColor: '#FFF3E0', padding: '0.35rem 0.75rem', borderRadius: '20px', fontWeight: '600' },
  sectionTitle: { fontSize: '1rem', fontWeight: '700', color: '#1a1a1a', margin: '0.5rem 0 0' },
  requestList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  requestCard: { backgroundColor: '#fff', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  requestOrg: { fontWeight: '600', color: '#1a1a1a', fontSize: '0.95rem', margin: '0 0 0.2rem' },
  requestDate: { fontSize: '0.8rem', color: '#aaa', margin: 0 },
  approvedNote: { fontSize: '0.8rem', color: '#2E7D32', margin: '0.4rem 0 0', fontStyle: 'italic' },
  statusBadge: { fontSize: '0.75rem', fontWeight: '600', padding: '0.35rem 0.75rem', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 },
};
