/**
 * pages/guide/groups.js — Winkel Simpel
 *
 * Groups and members management for guides.
 * Guides can create groups, add shoppers (members) to groups,
 * and generate QR cards for individual shoppers.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { GroupFactory, MemberFactory } from '../../lib/dbSchema';
import { generateQrToken } from '../../lib/qr';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function GroupsAndMembers({ claims }) {
  const router = useRouter();
  const { orgId, uid } = claims;

  const [groups, setGroups] = useState([]);
  const [shoppers, setShoppers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  useEffect(() => {
    loadAll();
  }, [orgId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [groupsSnap, shoppersSnap] = await Promise.all([
        GroupFactory.getAll(orgId),
        MemberFactory.getByRole(orgId, 'shopper'),
      ]);
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setShoppers(shoppersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load groups/members:', err);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Group actions
  // -------------------------------------------------------------------------
  async function handleDeleteGroup(group) {
    if (!confirm(`Groep "${group.name}" verwijderen?`)) return;
    try {
      await GroupFactory.delete(orgId, group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
    } catch (err) {
      console.error('Failed to delete group:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  async function handleToggleMemberInGroup(groupId, memberId, currentMemberIds) {
    const isInGroup = currentMemberIds.includes(memberId);
    const newMemberIds = isInGroup
      ? currentMemberIds.filter((id) => id !== memberId)
      : [...currentMemberIds, memberId];

    try {
      await GroupFactory.update(orgId, groupId, { memberIds: newMemberIds });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, memberIds: newMemberIds } : g
        )
      );
    } catch (err) {
      console.error('Failed to update group members:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Shopper actions
  // -------------------------------------------------------------------------
  async function handleDeleteShopper(shopper) {
    if (!confirm(`Shopper "${shopper.firstName} ${shopper.lastName}" verwijderen?`)) return;
    try {
      // Remove from all groups first
      const updatedGroups = await Promise.all(
        groups
          .filter((g) => g.memberIds?.includes(shopper.id))
          .map((g) =>
            GroupFactory.update(orgId, g.id, {
              memberIds: g.memberIds.filter((id) => id !== shopper.id),
            })
          )
      );
      await MemberFactory.delete(orgId, shopper.id);
      setShoppers((prev) => prev.filter((s) => s.id !== shopper.id));
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          memberIds: (g.memberIds || []).filter((id) => id !== shopper.id),
        }))
      );
    } catch (err) {
      console.error('Failed to delete shopper:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Groepen & leden</h1>
        <div style={{ width: 60 }} />
      </div>

      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : (
        <>
          {/* Shoppers section */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <p style={styles.sectionTitle}>Shoppers</p>
              <button style={styles.sectionAddButton} onClick={() => setShowMemberForm(true)}>
                + Toevoegen
              </button>
            </div>

            {shoppers.length === 0 ? (
              <p style={styles.emptyHint}>Nog geen shoppers. Voeg er een toe!</p>
            ) : (
              <div style={styles.cardList}>
                {shoppers.map((shopper) => (
                  <ShopperCard
                    key={shopper.id}
                    shopper={shopper}
                    orgId={orgId}
                    onDelete={() => handleDeleteShopper(shopper)}
                    onQr={() => router.push(`/guide/qr/${shopper.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Groups section */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <p style={styles.sectionTitle}>Groepen</p>
              <button
                style={styles.sectionAddButton}
                onClick={() => { setEditingGroup(null); setShowGroupForm(true); }}
              >
                + Toevoegen
              </button>
            </div>

            {groups.length === 0 ? (
              <p style={styles.emptyHint}>Nog geen groepen.</p>
            ) : (
              <div style={styles.cardList}>
                {groups.map((group) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    shoppers={shoppers}
                    onDelete={() => handleDeleteGroup(group)}
                    onToggleMember={(memberId) =>
                      handleToggleMemberInGroup(group.id, memberId, group.memberIds || [])
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* New shopper modal */}
      {showMemberForm && (
        <NewShopperForm
          orgId={orgId}
          createdBy={uid}
          onSave={async () => {
            setShowMemberForm(false);
            await loadAll();
          }}
          onClose={() => setShowMemberForm(false)}
        />
      )}

      {/* New group modal */}
      {showGroupForm && (
        <NewGroupForm
          orgId={orgId}
          onSave={async () => {
            setShowGroupForm(false);
            await loadAll();
          }}
          onClose={() => setShowGroupForm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShopperCard
// ---------------------------------------------------------------------------
function ShopperCard({ shopper, orgId, onDelete, onQr }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardAvatar}>
        {shopper.firstName?.[0]?.toUpperCase() || '?'}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{shopper.firstName} {shopper.lastName}</p>
        <p style={styles.cardSub}>Shopper</p>
      </div>
      <div style={styles.cardActions}>
        <button style={styles.qrButton} onClick={onQr} title="QR-kaartje">
          QR
        </button>
        <button style={styles.deleteSmallButton} onClick={onDelete} title="Verwijderen">
          🗑
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupCard
// ---------------------------------------------------------------------------
function GroupCard({ group, shoppers, onDelete, onToggleMember }) {
  const [expanded, setExpanded] = useState(false);
  const memberIds = group.memberIds || [];
  const memberCount = memberIds.length;

  return (
    <div style={styles.groupCard}>
      <div style={styles.groupCardHeader} onClick={() => setExpanded((v) => !v)}>
        <div>
          <p style={styles.cardName}>{group.name}</p>
          <p style={styles.cardSub}>{memberCount} {memberCount === 1 ? 'lid' : 'leden'}</p>
        </div>
        <div style={styles.groupCardRight}>
          <button style={styles.deleteSmallButton} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            🗑
          </button>
          <span style={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.groupMemberList}>
          {shoppers.length === 0 && (
            <p style={styles.emptyHint}>Nog geen shoppers beschikbaar.</p>
          )}
          {shoppers.map((shopper) => {
            const inGroup = memberIds.includes(shopper.id);
            return (
              <div
                key={shopper.id}
                style={{
                  ...styles.groupMemberRow,
                  backgroundColor: inGroup ? '#E8F5E9' : '#fff',
                }}
                onClick={() => onToggleMember(shopper.id)}
              >
                <div style={styles.cardAvatar}>
                  {shopper.firstName?.[0]?.toUpperCase() || '?'}
                </div>
                <p style={styles.pickerName}>
                  {shopper.firstName} {shopper.lastName}
                </p>
                <div style={{
                  ...styles.checkbox,
                  backgroundColor: inGroup ? '#4CAF50' : '#fff',
                  borderColor: inGroup ? '#4CAF50' : '#ccc',
                }}>
                  {inGroup && <span style={styles.checkmark}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewShopperForm (modal)
// ---------------------------------------------------------------------------
function NewShopperForm({ orgId, createdBy, onSave, onClose }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError('Vul voor- en achternaam in.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Generate a unique Firebase Auth-independent ID for the shopper
      // We use a random document ID via addDoc through MemberFactory
      const qrToken = generateQrToken();

      // Create a Firestore document with a generated ID
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      const { v4: uuidv4 } = await import('uuid').catch(() => ({
        v4: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
      }));

      const memberId = uuidv4();
      const memberDocRef = doc(db, 'organizations', orgId, 'members', memberId);
      await setDoc(memberDocRef, {
        role: 'shopper',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: '',
        qrToken,
        groupIds: [],
        createdBy,
        createdAt: new Date(),
      });

      onSave();
    } catch (err) {
      console.error('Failed to create shopper:', err);
      setError('Aanmaken mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe shopper</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Voornaam</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={styles.input}
              placeholder="bijv. Marie"
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
              placeholder="bijv. Janssen"
              required
            />
          </div>

          <p style={styles.formHint}>
            Na het aanmaken kan je een QR-kaartje afdrukken voor deze shopper.
          </p>

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

// ---------------------------------------------------------------------------
// NewGroupForm (modal)
// ---------------------------------------------------------------------------
function NewGroupForm({ orgId, onSave, onClose }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de groep een naam.'); return; }
    setSaving(true);
    setError('');
    try {
      await GroupFactory.create(orgId, { name: name.trim(), memberIds: [] });
      onSave();
    } catch (err) {
      console.error('Failed to create group:', err);
      setError('Aanmaken mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe groep</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam van de groep</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="bijv. Groep A"
              required
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

export default withRoleGuard(ROLES.GUIDE, GroupsAndMembers);

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
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    color: '#4CAF50',
    cursor: 'pointer',
    fontWeight: '600',
    padding: '0.25rem 0',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0,
  },
  section: {
    marginBottom: '2rem',
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
  sectionAddButton: {
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
    padding: '0.75rem',
  },
  cardAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '1rem',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
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
  },
  cardActions: {
    display: 'flex',
    gap: '0.4rem',
    alignItems: 'center',
  },
  qrButton: {
    padding: '0.35rem 0.7rem',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '700',
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
  groupCard: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    overflow: 'hidden',
  },
  groupCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem',
    cursor: 'pointer',
  },
  groupCardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  expandIcon: {
    fontSize: '0.75rem',
    color: '#aaa',
  },
  groupMemberList: {
    borderTop: '1px solid #f0f0f0',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  groupMemberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.6rem',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  pickerName: {
    flex: 1,
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: 0,
  },
  checkbox: {
    width: '22px',
    height: '22px',
    borderRadius: '6px',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    fontSize: '0.75rem',
    color: '#fff',
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: '0.85rem',
    color: '#bbb',
    margin: '0.5rem 0',
    padding: '0.75rem',
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
  // Modal
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
  formHint: {
    fontSize: '0.825rem',
    color: '#aaa',
    margin: 0,
    padding: '0.6rem 0.8rem',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
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
