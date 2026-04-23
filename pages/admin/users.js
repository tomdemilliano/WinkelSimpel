/**
 * pages/admin/users.js — Winkel Simpel
 *
 * User management for a specific organization.
 * App admins can add guides (with Firebase Auth accounts) and view all members.
 * Accessed via /admin/users?org={orgId}&name={orgName}
 *
 * Note: Creating Firebase Auth accounts for guides requires the Firebase Admin SDK,
 * which runs server-side. This page uses a Next.js API route for that purpose.
 * See pages/api/admin/create-guide.js
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { MemberFactory } from '../../lib/dbSchema';

// Role labels
const ROLE_CONFIG = {
  guide: { label: 'Begeleider', color: '#1565C0', background: '#E3F2FD' },
  shopper: { label: 'Shopper', color: '#2E7D32', background: '#E8F5E9' },
  app_admin: { label: 'Beheerder', color: '#6A1B9A', background: '#F3E5F5' },
};

function UsersPage({ claims }) {
  const router = useRouter();
  const { org: orgId, name: orgName } = router.query;

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!router.isReady || !orgId) return;
    loadMembers();
  }, [router.isReady, orgId]);

  async function loadMembers() {
    setLoading(true);
    try {
      const snap = await MemberFactory.getAll(orgId);
      setMembers(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            // Sort: guides first, then shoppers
            const order = { guide: 0, app_admin: 1, shopper: 2 };
            return (order[a.role] ?? 3) - (order[b.role] ?? 3);
          })
      );
    } catch (err) {
      console.error('Failed to load members:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMember(member) {
    const label = `${member.firstName} ${member.lastName}`;
    if (!confirm(`Gebruiker "${label}" verwijderen?`)) return;
    try {
      await MemberFactory.delete(orgId, member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      console.error('Failed to delete member:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  const guides = members.filter((m) => m.role === 'guide');
  const shoppers = members.filter((m) => m.role === 'shopper');
  const admins = members.filter((m) => m.role === 'app_admin');

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/admin')}>
          ← Terug
        </button>
        <div style={styles.headerCenter}>
          <EditableOrgName orgId={orgId} initialName={orgName || ''} />
          <p style={styles.subtitle}>{members.length} gebruikers</p>
        </div>
        <button style={styles.addButton} onClick={() => setShowForm(true)}>
          + Begeleider
        </button>
      </div>

      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : (
        <>
          {admins.length > 0 && (
            <MemberSection
              title="Beheerders"
              members={admins}
              onDelete={handleDeleteMember}
            />
          )}

          <MemberSection
            title="Begeleiders"
            members={guides}
            emptyMessage="Nog geen begeleiders. Voeg er een toe via de knop rechtsboven."
            onDelete={handleDeleteMember}
          />

          <MemberSection
            title="Shoppers"
            members={shoppers}
            emptyMessage="Shoppers worden toegevoegd via de begeleidersinterface."
            onDelete={null}
          />
        </>
      )}

      {/* New guide modal */}
      {showForm && (
        <NewGuideForm
          orgId={orgId}
          onSave={async () => {
            setShowForm(false);
            await loadMembers();
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberSection
// ---------------------------------------------------------------------------
function MemberSection({ title, members, emptyMessage, onDelete }) {
  return (
    <div style={styles.section}>
      <p style={styles.sectionTitle}>{title}</p>
      {members.length === 0 && emptyMessage ? (
        <p style={styles.emptyHint}>{emptyMessage}</p>
      ) : (
        <div style={styles.cardList}>
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onDelete={onDelete ? () => onDelete(member) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberCard
// ---------------------------------------------------------------------------
function MemberCard({ member, onDelete }) {
  const roleCfg = ROLE_CONFIG[member.role] || { label: member.role, color: '#666', background: '#eee' };

  return (
    <div style={styles.card}>
      <div style={styles.cardAvatar}>
        {member.firstName?.[0]?.toUpperCase() || '?'}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{member.firstName} {member.lastName}</p>
        {member.email ? (
          <p style={styles.cardSub}>{member.email}</p>
        ) : (
          <p style={styles.cardSub}>Geen e-mailadres (shopper)</p>
        )}
      </div>
      <div style={styles.cardRight}>
        <span style={{
          ...styles.roleBadge,
          color: roleCfg.color,
          backgroundColor: roleCfg.background,
        }}>
          {roleCfg.label}
        </span>
        {onDelete && (
          <button style={styles.deleteSmallButton} onClick={onDelete}>
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewGuideForm (modal)
// Creates a guide: Firestore member document + Firebase Auth account
// via a server-side API route.
// ---------------------------------------------------------------------------
function NewGuideForm({ orgId, onSave, onClose }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Vul voor- en achternaam in.');
      return;
    }
    if (!email.trim()) {
      setError('Vul een e-mailadres in.');
      return;
    }
    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Get current user's ID token for server-side verification
      const { getAuth } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const idToken = await getAuth(auth.app).currentUser?.getIdToken();

      // Call server-side API route that uses Firebase Admin SDK
      const res = await fetch('/api/admin/create-guide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          orgId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Aanmaken mislukt. Probeer opnieuw.');
        setSaving(false);
        return;
      }

      onSave();
    } catch (err) {
      console.error('Failed to create guide:', err);
      setError('Er is een fout opgetreden. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe begeleider</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldRow}>
            <div style={styles.field}>
              <label style={styles.label}>Voornaam</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={styles.input}
                placeholder="Marie"
                required
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Achternaam</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={styles.input}
                placeholder="Janssen"
                required
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>E-mailadres</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="marie@organisatie.be"
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Tijdelijk wachtwoord</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Minimaal 8 tekens"
              required
            />
            <p style={styles.fieldHint}>
              De begeleider kan dit later zelf wijzigen.
            </p>
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Aanmaken...' : 'Begeleider aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditableOrgName — inline bewerken van organisatienaam
// ---------------------------------------------------------------------------
function EditableOrgName({ orgId, initialName }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputRef = React.useRef();

  // Sync als initialName later binnenkomt via router.query
  React.useEffect(() => { if (initialName) setName(initialName); }, [initialName]);

  async function handleSave() {
    if (!name.trim() || name.trim() === initialName) { setEditing(false); return; }
    setSaving(true);
    try {
      const { OrganizationFactory } = await import('../../lib/dbSchema');
      await OrganizationFactory.update(orgId, { name: name.trim() });
    } catch (err) {
      console.error('Failed to update org name:', err);
      setName(initialName);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus
          style={{ fontSize: '1rem', fontWeight: '700', border: '1.5px solid #4CAF50', borderRadius: '6px', padding: '0.25rem 0.5rem', color: '#1a1a1a', outline: 'none', maxWidth: '180px' }}
        />
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '0.25rem 0.6rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}>
          {saving ? '...' : '✓'}
        </button>
        <button onClick={() => setEditing(false)}
          style={{ padding: '0.25rem 0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', color: '#666' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setEditing(true)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      <h1 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>{name || 'Organisatie'}</h1>
      <span style={{ fontSize: '0.75rem', color: '#bbb' }}>✏️</span>
    </button>
  );
}

export default withRoleGuard(ROLES.APP_ADMIN, UsersPage);

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
    gap: '0.5rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    color: '#4CAF50',
    cursor: 'pointer',
    fontWeight: '600',
    padding: '0.25rem 0',
    whiteSpace: 'nowrap',
  },
  headerCenter: {
    flex: 1,
    textAlign: 'center',
  },
  title: {
    fontSize: '1.1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 0.2rem',
  },
  subtitle: {
    fontSize: '0.8rem',
    color: '#888',
    margin: 0,
  },
  addButton: {
    padding: '0.45rem 0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  section: {
    marginBottom: '1.75rem',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: '0 0 0.6rem',
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
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#F3E5F5',
    color: '#6A1B9A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '1rem',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 0.15rem',
  },
  cardSub: {
    fontSize: '0.8rem',
    color: '#999',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.4rem',
    flexShrink: 0,
  },
  roleBadge: {
    fontSize: '0.75rem',
    fontWeight: '700',
    padding: '0.2rem 0.6rem',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  deleteSmallButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: '#FFEBEE',
    color: '#c62828',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  emptyHint: {
    fontSize: '0.85rem',
    color: '#bbb',
    margin: 0,
    padding: '0.75rem 1rem',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
    border: '1px dashed #eee',
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
  fieldRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  field: {
    flex: 1,
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
    width: '100%',
    boxSizing: 'border-box',
  },
  fieldHint: {
    fontSize: '0.775rem',
    color: '#aaa',
    margin: 0,
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
