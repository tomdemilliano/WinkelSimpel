/**
 * pages/admin/index.js — Winkel Simpel
 *
 * App admin dashboard. Shows all organizations and allows creating new ones.
 * App admins manage the platform at the top level.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import { OrganizationFactory } from '../../lib/dbSchema';

function AdminDashboard({ claims }) {
  const router = useRouter();

  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    setLoading(true);
    try {
      const snap = await OrganizationFactory.getAll();
      setOrganizations(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } catch (err) {
      console.error('Failed to load organizations:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOrg(org) {
    if (!confirm(`Organisatie "${org.name}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    try {
      await OrganizationFactory.delete(org.id);
      setOrganizations((prev) => prev.filter((o) => o.id !== org.id));
    } catch (err) {
      console.error('Failed to delete organization:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Beheerderspaneel</p>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut}>
          Afmelden
        </button>
      </div>

      {/* Stats bar */}
      <div style={styles.statsBar}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{organizations.length}</span>
          <span style={styles.statLabel}>organisaties</span>
        </div>
      </div>

      {/* Section header */}
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Organisaties</p>
        <button style={styles.addButton} onClick={() => setShowForm(true)}>
          + Nieuw
        </button>
      </div>

      {/* Organization list */}
      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : organizations.length === 0 ? (
        <div style={styles.centered}>
          <p style={styles.hint}>Nog geen organisaties. Maak er een aan!</p>
        </div>
      ) : (
        <div style={styles.cardList}>
          {organizations.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              onManage={() => router.push(`/admin/users?org=${org.id}&name=${encodeURIComponent(org.name)}`)}
              onDelete={() => handleDeleteOrg(org)}
            />
          ))}
        </div>
      )}

      {/* New organization modal */}
      {showForm && (
        <NewOrgForm
          claims={claims}
          onSave={async () => {
            setShowForm(false);
            await loadOrganizations();
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgCard
// ---------------------------------------------------------------------------
function OrgCard({ org, onManage, onDelete }) {
  const createdDate = org.createdAt?.seconds
    ? new Date(org.createdAt.seconds * 1000).toLocaleDateString('nl-BE')
    : '';

  return (
    <div style={styles.card}>
      <div style={styles.cardAvatar}>
        {org.name?.[0]?.toUpperCase() || '?'}
      </div>
      <div style={styles.cardBody} onClick={onManage}>
        <p style={styles.cardName}>{org.name}</p>
        {createdDate && <p style={styles.cardSub}>Aangemaakt op {createdDate}</p>}
      </div>
      <div style={styles.cardActions}>
        <button style={styles.manageButton} onClick={onManage}>
          Beheren
        </button>
        <button style={styles.deleteSmallButton} onClick={onDelete}>
          🗑
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewOrgForm (modal)
// ---------------------------------------------------------------------------
function NewOrgForm({ claims, onSave, onClose }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de organisatie een naam.'); return; }
    setSaving(true);
    setError('');
    try {
      await OrganizationFactory.create({ name: name.trim(), createdBy: claims.uid });
      onSave();
    } catch (err) {
      console.error('Failed to create organization:', err);
      setError('Aanmaken mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe organisatie</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam van de organisatie</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="bijv. De Regenboog vzw"
              required
              autoFocus
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Aanmaken...' : 'Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default withRoleGuard(ROLES.APP_ADMIN, AdminDashboard);

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
    marginBottom: '1.5rem',
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
  statsBar: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    padding: '1rem 1.25rem',
    marginBottom: '1.5rem',
    display: 'flex',
    gap: '2rem',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.15rem',
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#aaa',
    fontWeight: '500',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: 0,
  },
  addButton: {
    padding: '0.4rem 0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    padding: '0.875rem',
  },
  cardAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '10px',
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '800',
    fontSize: '1.1rem',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    cursor: 'pointer',
  },
  cardName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 0.15rem',
  },
  cardSub: {
    fontSize: '0.8rem',
    color: '#999',
    margin: 0,
  },
  cardActions: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
  },
  manageButton: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  deleteSmallButton: {
    padding: '0.35rem 0.5rem',
    backgroundColor: '#FFEBEE',
    color: '#c62828',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '3rem',
  },
  hint: {
    color: '#aaa',
    fontSize: '0.95rem',
    margin: 0,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '20px 20px 0 0',
    padding: '1.5rem',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '92vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.25rem',
  },
  modalTitle: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.1rem',
    color: '#aaa',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#444',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #ddd',
    fontSize: '1rem',
    backgroundColor: '#fff',
  },
  errorText: {
    color: '#c62828',
    fontSize: '0.875rem',
    margin: 0,
    padding: '0.6rem 0.8rem',
    backgroundColor: '#FFEBEE',
    borderRadius: '8px',
  },
  saveButton: {
    padding: '0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
};
