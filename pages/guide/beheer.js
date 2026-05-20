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
      color: '#F4F8FC',
      borderColor: '#D8E5EF',
    },
    {
      icon: '🏷️',
      label: 'Categorieën',
      description: 'Productcategorieën en pictogrammen beheren',
      href: '/guide/categories',
      color: '#F4F8FC',
      borderColor: '#D8E5EF',
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
            <div style={styles.tileMeta}>
              <span style={styles.tileLabel}>{tile.label}</span>
              <span style={styles.tileDescription}>{tile.description}</span>
            </div>
            <span style={styles.tileArrow}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], Beheer);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#F4F8FC', fontFamily: "'Nunito', system-ui, sans-serif", padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#5B9BD5', margin: '-1.5rem -1.5rem 2rem -1.5rem', padding: '1.25rem 1.5rem' },
  backButton: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '700', color: '#fff', padding: 0, fontFamily: 'inherit' },
  title: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', margin: 0 },
  tileGrid: { display: 'flex', flexDirection: 'column', gap: '0.875rem' },
  tile: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', borderRadius: '16px', border: '1.5px solid', cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 6px rgba(91,155,213,0.07)', fontFamily: 'inherit' },
  tileIcon: { fontSize: '2rem', flexShrink: 0 },
  tileMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  tileLabel: { fontSize: '1.05rem', fontWeight: '800', color: '#1A2B3C' },
  tileDescription: { fontSize: '0.825rem', color: '#6B7E91', fontWeight: '600' },
  tileArrow: { fontSize: '1.5rem', color: '#D8E5EF', fontWeight: '700', flexShrink: 0 },
};
