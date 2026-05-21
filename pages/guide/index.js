import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { ShoppingListFactory, AccessRequestFactory } from '../../lib/dbSchema';

// ---------------------------------------------------------------------------
// SVG-illustraties voor dashboard-tegels
// ---------------------------------------------------------------------------
function ListsIllustration() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="6" width="36" height="44" rx="5" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
      <rect x="20" y="2" width="16" height="8" rx="3" fill="#5B9BD5"/>
      <line x1="18" y1="22" x2="38" y2="22" stroke="#D0E8FA" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="18" y1="30" x2="38" y2="30" stroke="#D0E8FA" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="18" y1="38" x2="30" y2="38" stroke="#D0E8FA" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="14" cy="22" r="3" fill="#4CAF50"/>
      <path d="M12.5 22l1 1 2-2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="14" cy="30" r="3" fill="#4CAF50"/>
      <path d="M12.5 30l1 1 2-2" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="14" cy="38" r="3" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="1.2"/>
    </svg>
  );
}

function LibraryIllustration() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 22h36l-4 24H14L10 22z" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M6 22h44" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round"/>
      <path d="M20 22V16a8 8 0 0116 0v6" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="22" cy="34" r="3.5" fill="#4CAF50"/>
      <circle cx="34" cy="34" r="3.5" fill="#FF9800"/>
      <path d="M26 38h4" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function GroupsIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="16" r="7" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2"/>
      <path d="M4 38c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="34" cy="14" r="5.5" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="1.5"/>
      <path d="M30 36c0-5.523 3.134-10 7-10s7 4.477 7 10" stroke="#5B9BD5" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function BeheerIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="8" fill="#EBF4FF" stroke="#6B7E91" strokeWidth="2"/>
      <circle cx="24" cy="24" r="3" fill="#6B7E91"/>
      <path d="M24 6v6M24 36v6M6 24h6M36 24h6" stroke="#6B7E91" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M11.5 11.5l4.2 4.2M32.3 32.3l4.2 4.2M11.5 36.5l4.2-4.2M32.3 15.7l4.2-4.2" stroke="#6B7E91" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GuideDashboard
// ---------------------------------------------------------------------------
function GuideDashboard({ claims }) {
  const router = useRouter();
  const [listCounts, setListCounts] = useState(null);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    ShoppingListFactory.getAll(claims.orgId).then(snap => {
      const all = snap.docs.map(d => d.data());
      setListCounts({
        active: all.filter(l => l.status === 'active').length,
        draft:  all.filter(l => l.status === 'draft').length,
      });
    });
  }, [claims.orgId]);

  useEffect(() => {
    if (claims.orgType === 'private') return;
    const user = auth.currentUser;
    if (!user) return;
    user.getIdToken()
      .then(idToken => fetch('/api/org/get-org-name', { headers: { Authorization: `Bearer ${idToken}` } }))
      .then(res => res.json())
      .then(data => { if (data.name) setOrgName(data.name); })
      .catch(() => {});
  }, [claims.orgId, claims.orgType]);

  useEffect(() => {
    if (claims.role !== ROLES.ORG_ADMIN) return;
    AccessRequestFactory.getByOrg(claims.orgId).then(snap => {
      setPendingRequestCount(snap.docs.filter(d => d.data().status === 'pending').length);
    }).catch(() => {});
  }, [claims.orgId, claims.role]);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  function listsBadgeText() {
    if (!listCounts) return null;
    const parts = [];
    if (listCounts.active > 0) parts.push(`${listCounts.active} actief`);
    if (listCounts.draft > 0) parts.push(`${listCounts.draft} concept`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  return (
    <div style={styles.page}>
      {/* Blauwe gradient header */}
      <div style={styles.headerBand}>
        <div>
          <h1 style={styles.appTitle}>Winkel Simpel</h1>
          <p style={styles.appSubtitle}>Begeleidersdashboard</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.headerActions}>
            <button style={styles.iconButton} onClick={() => router.push('/guide/account')} aria-label="Account instellingen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </button>
            <button style={styles.signOutButton} onClick={handleSignOut}>
              Afmelden
            </button>
          </div>
          {orgName && (
            <p style={styles.orgNameLabel}>{orgName}</p>
          )}
        </div>
      </div>

      <div style={styles.content}>
        {/* Toegangsverzoeken melding (alleen org_admin) */}
        {pendingRequestCount > 0 && (
          <button style={styles.requestBanner} onClick={() => router.push('/guide/access-requests')}>
            <span style={styles.requestBannerDot} />
            <span style={styles.requestBannerText}>
              {pendingRequestCount === 1
                ? '1 openstaand toegangsverzoek'
                : `${pendingRequestCount} openstaande toegangsverzoeken`}
            </span>
            <span style={styles.requestBannerArrow}>›</span>
          </button>
        )}

        {/* Primaire tegels */}
        <div style={styles.primaryGrid}>
          <button style={styles.primaryTile} onClick={() => router.push('/guide/lists')}>
            <div style={styles.primaryTileIllustration}>
              <ListsIllustration />
            </div>
            <div style={styles.primaryTileText}>
              <span style={styles.primaryTileLabel}>Boodschappenlijstjes</span>
              <span style={styles.primaryTileDescription}>Lijstjes aanmaken en toewijzen</span>
              {listsBadgeText() && (
                <span style={styles.listBadge}>{listsBadgeText()}</span>
              )}
            </div>
            <span style={styles.primaryTileArrow}>›</span>
          </button>

          <button style={styles.primaryTile} onClick={() => router.push('/guide/library')}>
            <div style={styles.primaryTileIllustration}>
              <LibraryIllustration />
            </div>
            <div style={styles.primaryTileText}>
              <span style={styles.primaryTileLabel}>Productbibliotheek</span>
              <span style={styles.primaryTileDescription}>Producten toevoegen en beheren</span>
            </div>
            <span style={styles.primaryTileArrow}>›</span>
          </button>
        </div>

        {/* Secundaire tegels */}
        <div style={styles.secondaryGrid}>
          <button style={styles.secondaryTile} onClick={() => router.push('/guide/groups')}>
            <GroupsIllustration />
            <span style={styles.secondaryTileLabel}>Groepen & leden</span>
            <span style={styles.secondaryTileDescription}>Shoppers beheren</span>
          </button>

          <button style={styles.secondaryTile} onClick={() => router.push('/guide/beheer')}>
            <BeheerIllustration />
            <span style={styles.secondaryTileLabel}>Beheer</span>
            <span style={styles.secondaryTileDescription}>Winkels & categorieën</span>
          </button>
        </div>

        {claims.orgType === 'private' && (
          <div style={styles.footer}>
            <button style={styles.footerLink} onClick={() => router.push('/guide/request-access')}>
              🏢 Aansluiten bij organisatie
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], GuideDashboard);

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F4F8FC',
    fontFamily: "'Nunito', system-ui, sans-serif",
  },
  headerBand: {
    background: 'linear-gradient(135deg, #5B9BD5 0%, #3A7FC1 100%)',
    padding: '1.75rem 1.5rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.4rem',
  },
  orgNameLabel: {
    fontSize: '0.78rem',
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    margin: 0,
    letterSpacing: '0.03em',
    textAlign: 'right',
  },
  appTitle: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#fff',
    margin: '0 0 0.2rem',
    letterSpacing: '-0.3px',
  },
  appSubtitle: {
    fontSize: '0.875rem',
    color: 'rgba(255,255,255,0.75)',
    margin: 0,
    fontWeight: '600',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1.5px solid rgba(255,255,255,0.4)',
    borderRadius: '50%',
    color: '#fff',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  signOutButton: {
    padding: '0.45rem 1rem',
    backgroundColor: 'rgba(255,255,255,0.15)',
    border: '1.5px solid rgba(255,255,255,0.4)',
    borderRadius: '20px',
    fontSize: '0.85rem',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: '600',
    fontFamily: 'inherit',
  },
  content: {
    padding: '1.25rem 1.25rem 2rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  primaryGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    marginBottom: '0.875rem',
  },
  primaryTile: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1.25rem',
    backgroundColor: '#fff',
    borderRadius: '16px',
    border: '1.5px solid #D0E8FA',
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow: '0 2px 8px rgba(91,155,213,0.10)',
    fontFamily: 'inherit',
  },
  primaryTileIllustration: {
    flexShrink: 0,
    width: '64px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTileText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    minWidth: 0,
  },
  primaryTileLabel: {
    fontSize: '1.05rem',
    fontWeight: '800',
    color: '#1A2B3C',
  },
  primaryTileDescription: {
    fontSize: '0.825rem',
    color: '#6B7E91',
    fontWeight: '600',
  },
  primaryTileArrow: {
    fontSize: '1.5rem',
    color: '#D0E8FA',
    fontWeight: '700',
    flexShrink: 0,
  },
  listBadge: {
    marginTop: '0.3rem',
    display: 'inline-block',
    fontSize: '0.75rem',
    fontWeight: '700',
    color: '#3A7FC1',
    backgroundColor: '#EBF4FF',
    borderRadius: '20px',
    padding: '0.15rem 0.6rem',
    alignSelf: 'flex-start',
  },
  secondaryGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.875rem',
    marginBottom: '1.5rem',
  },
  secondaryTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '1.1rem',
    backgroundColor: '#fff',
    borderRadius: '16px',
    border: '1.5px solid #D8E5EF',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '0.5rem',
    boxShadow: '0 2px 6px rgba(91,155,213,0.07)',
    fontFamily: 'inherit',
  },
  secondaryTileLabel: {
    fontSize: '0.95rem',
    fontWeight: '800',
    color: '#1A2B3C',
  },
  secondaryTileDescription: {
    fontSize: '0.78rem',
    color: '#6B7E91',
    fontWeight: '600',
  },
  requestBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.875rem 1rem',
    backgroundColor: '#FFF8E7',
    border: '1.5px solid #FFD54F',
    borderRadius: '14px',
    cursor: 'pointer',
    marginBottom: '0.875rem',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  requestBannerDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#F59E0B',
    flexShrink: 0,
  },
  requestBannerText: {
    flex: 1,
    fontSize: '0.9rem',
    fontWeight: '700',
    color: '#92400E',
  },
  requestBannerArrow: {
    fontSize: '1.3rem',
    color: '#F59E0B',
    fontWeight: '700',
    flexShrink: 0,
  },
  footer: {
    textAlign: 'center',
  },
  footerLink: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
    color: '#9EB3C8',
    padding: '0.5rem',
    fontFamily: 'inherit',
    fontWeight: '600',
  },
};
