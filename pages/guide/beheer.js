import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';

function Beheer() {
  const router = useRouter();

  const tiles = [
    {
      icon: '🏪',
      label: 'Winkels',
      description: 'Winkels en ketens beheren',
      href: '/guide/stores',
      color: '#F3E5F5',
      borderColor: '#CE93D8',
    },
    {
      icon: '🏷️',
      label: 'Categorieën',
      description: 'Productcategorieën en pictogrammen beheren',
      href: '/guide/categories',
      color: '#FFF8E1',
      borderColor: '#FFE082',
    },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Beheer</h1>
        <div style={{ width: '60px' }} />
      </div>

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

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], Beheer);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' },
  backButton: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600', color: '#4CAF50', padding: 0 },
  title: { fontSize: '1.2rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  tileGrid: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  tile: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '1.25rem', borderRadius: '14px', border: '1.5px solid', cursor: 'pointer', textAlign: 'left', gap: '0.3rem' },
  tileIcon: { fontSize: '2rem', marginBottom: '0.25rem' },
  tileLabel: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a' },
  tileDescription: { fontSize: '0.875rem', color: '#666' },
};
