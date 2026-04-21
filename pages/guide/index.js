/**
 * pages/guide/index.js — Winkel Simpel
 *
 * Dashboard for guides. Shows a quick overview and navigation to all
 * guide features: product library, shopping lists, and groups.
 */

import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';

function GuideDashboard({ claims }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  const tiles = [
    {
      icon: '🛍️',
      label: 'Productbibliotheek',
      description: 'Producten toevoegen en beheren',
      href: '/guide/library',
      color: '#E8F5E9',
      borderColor: '#A5D6A7',
    },
    {
      icon: '📋',
      label: 'Boodschappenlijstjes',
      description: 'Lijstjes aanmaken en toewijzen',
      href: '/guide/lists',
      color: '#E3F2FD',
      borderColor: '#90CAF9',
    },
    {
      icon: '👥',
      label: 'Groepen & leden',
      description: 'Shoppers en groepen beheren',
      href: '/guide/groups',
      color: '#FFF3E0',
      borderColor: '#FFCC80',
    },
  ];

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Begeleidersdashboard</p>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut}>
          Afmelden
        </button>
      </div>

      {/* Navigation tiles */}
      <div style={styles.tileGrid}>
        {tiles.map((tile) => (
          <button
            key={tile.href}
            style={{ ...styles.tile, backgroundColor: tile.color, borderColor: tile.borderColor }}
            onClick={() => router.push(tile.href)}
          >
            <span style={styles.tileIcon}>{tile.icon}</span>
            <span style={styles.tileLabel}>{tile.label}</span>
            <span style={styles.tileDescription}>{tile.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default withRoleGuard(ROLES.GUIDE, GuideDashboard);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    fontFamily: 'system-ui, sans-serif',
    padding: '1.5rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 0.2rem',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#888',
    margin: 0,
  },
  signOutButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    border: '1.5px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.875rem',
    color: '#666',
    cursor: 'pointer',
  },
  tileGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: '1.25rem',
    borderRadius: '14px',
    border: '1.5px solid',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '0.3rem',
  },
  tileIcon: {
    fontSize: '2rem',
    marginBottom: '0.25rem',
  },
  tileLabel: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tileDescription: {
    fontSize: '0.875rem',
    color: '#666',
  },
};
