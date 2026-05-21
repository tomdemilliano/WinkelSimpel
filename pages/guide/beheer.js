import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';

function StoreIllustration() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="22" width="40" height="24" rx="3" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
      <path d="M6 22L12 8h28l6 14" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2" strokeLinejoin="round"/>
      <line x1="6" y1="22" x2="46" y2="22" stroke="#5B9BD5" strokeWidth="2"/>
      <rect x="20" y="34" width="12" height="12" rx="2" fill="#5B9BD5"/>
      <rect x="8" y="27" width="8" height="6" rx="1.5" fill="#5B9BD5" opacity="0.35"/>
      <rect x="36" y="27" width="8" height="6" rx="1.5" fill="#5B9BD5" opacity="0.35"/>
    </svg>
  );
}

function CategoryIllustration() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="8" width="20" height="17" rx="4" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2"/>
      <rect x="28" y="8" width="20" height="17" rx="4" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
      <rect x="4" y="29" width="20" height="15" rx="4" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
      <rect x="28" y="29" width="20" height="15" rx="4" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2"/>
      <circle cx="14" cy="16" r="3.5" fill="#5B9BD5"/>
      <circle cx="38" cy="16" r="3.5" fill="#5B9BD5" opacity="0.5"/>
      <circle cx="14" cy="36" r="3.5" fill="#5B9BD5" opacity="0.5"/>
      <circle cx="38" cy="36" r="3.5" fill="#5B9BD5"/>
    </svg>
  );
}

function Beheer() {
  const router = useRouter();

  const tiles = [
    {
      Illustration: StoreIllustration,
      label: 'Winkels',
      description: 'Winkels en ketens beheren',
      href: '/guide/stores',
    },
    {
      Illustration: CategoryIllustration,
      label: 'Categorieën',
      description: 'Productcategorieën en pictogrammen beheren',
      href: '/guide/categories',
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
            style={styles.tile}
            onClick={() => router.push(tile.href)}
          >
            <div style={styles.tileIllustration}>
              <tile.Illustration />
            </div>
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
  tile: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', backgroundColor: '#fff', borderRadius: '16px', border: '1.5px solid #D8E5EF', cursor: 'pointer', textAlign: 'left', boxShadow: '0 2px 6px rgba(91,155,213,0.07)', fontFamily: 'inherit' },
  tileIllustration: { flexShrink: 0, width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tileMeta: { flex: 1, display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  tileLabel: { fontSize: '1.05rem', fontWeight: '800', color: '#1A2B3C' },
  tileDescription: { fontSize: '0.825rem', color: '#6B7E91', fontWeight: '600' },
  tileArrow: { fontSize: '1.5rem', color: '#D8E5EF', fontWeight: '700', flexShrink: 0 },
};
