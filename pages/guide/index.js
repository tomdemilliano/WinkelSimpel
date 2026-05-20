import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import { ShoppingListFactory } from '../../lib/dbSchema';

function GuideDashboard({ claims }) {
  const router = useRouter();
  const [listCounts, setListCounts] = useState(null);

  useEffect(() => {
    ShoppingListFactory.getAll(claims.orgId).then(snap => {
      const all = snap.docs.map(d => d.data());
      setListCounts({
        active: all.filter(l => l.status === 'active').length,
        draft:  all.filter(l => l.status === 'draft').length,
      });
    });
  }, [claims.orgId]);

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

  const primaryTiles = [
    {
      icon: '📋',
      label: 'Boodschappenlijstjes',
      description: 'Lijstjes aanmaken en toewijzen',
      badge: listsBadgeText(),
      href: '/guide/lists',
      color: '#E3F2FD',
      borderColor: '#90CAF9',
    },
    {
      icon: '🛍️',
      label: 'Productbibliotheek',
      description: 'Producten toevoegen en beheren',
      badge: null,
      href: '/guide/library',
      color: '#E8F5E9',
      borderColor: '#A5D6A7',
    },
  ];

  const secondaryTiles = [
    {
      icon: '👥',
      label: 'Groepen & leden',
      description: 'Shoppers en groepen beheren',
      href: '/guide/groups',
      color: '#FFF3E0',
      borderColor: '#FFCC80',
    },
    {
      icon: '⚙️',
      label: 'Beheer',
      description: 'Winkels en categorieën',
      href: '/guide/beheer',
      color: '#F5F5F5',
      borderColor: '#E0E0E0',
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Begeleidersdashboard</p>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut}>
          Afmelden
        </button>
      </div>

      <div style={styles.primaryGrid}>
        {primaryTiles.map((tile) => (
          <button
            key={tile.href}
            style={{ ...styles.primaryTile, backgroundColor: tile.color, borderColor: tile.borderColor }}
            onClick={() => router.push(tile.href)}
          >
            <span style={styles.primaryTileIcon}>{tile.icon}</span>
            <span style={styles.primaryTileLabel}>{tile.label}</span>
            <span style={styles.primaryTileDescription}>{tile.description}</span>
            {tile.badge && (
              <span style={styles.listBadge}>{tile.badge}</span>
            )}
          </button>
        ))}
      </div>

      <div style={styles.secondaryGrid}>
        {secondaryTiles.map((tile) => (
          <button
            key={tile.href}
            style={{ ...styles.secondaryTile, backgroundColor: tile.color, borderColor: tile.borderColor }}
            onClick={() => router.push(tile.href)}
          >
            <span style={styles.secondaryTileIcon}>{tile.icon}</span>
            <span style={styles.secondaryTileLabel}>{tile.label}</span>
            <span style={styles.secondaryTileDescription}>{tile.description}</span>
          </button>
        ))}
      </div>

      {claims.orgType === 'private' && (
        <div style={styles.footer}>
          <button style={styles.footerLink} onClick={() => router.push('/guide/request-access')}>
            🏢 Aansluiten bij organisatie
          </button>
        </div>
      )}
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], GuideDashboard);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#1a1a1a', margin: '0 0 0.2rem' },
  subtitle: { fontSize: '0.875rem', color: '#888', margin: 0 },
  signOutButton: { padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '0.875rem', color: '#666', cursor: 'pointer' },

  primaryGrid: { display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' },
  primaryTile: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '1.5rem', borderRadius: '14px', border: '1.5px solid', cursor: 'pointer', textAlign: 'left', gap: '0.3rem' },
  primaryTileIcon: { fontSize: '2.5rem', marginBottom: '0.3rem' },
  primaryTileLabel: { fontSize: '1.15rem', fontWeight: '700', color: '#1a1a1a' },
  primaryTileDescription: { fontSize: '0.875rem', color: '#666' },
  listBadge: { marginTop: '0.5rem', display: 'inline-block', fontSize: '0.78rem', fontWeight: '600', color: '#1565C0', backgroundColor: '#BBDEFB', borderRadius: '20px', padding: '0.2rem 0.6rem' },

  secondaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  secondaryTile: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '1.1rem', borderRadius: '14px', border: '1.5px solid', cursor: 'pointer', textAlign: 'left', gap: '0.25rem' },
  secondaryTileIcon: { fontSize: '1.75rem', marginBottom: '0.2rem' },
  secondaryTileLabel: { fontSize: '0.975rem', fontWeight: '700', color: '#1a1a1a' },
  secondaryTileDescription: { fontSize: '0.8rem', color: '#888' },

  footer: { textAlign: 'center' },
  footerLink: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: '#9E9E9E', padding: '0.5rem' },
};
