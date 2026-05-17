/**
 * pages/guide/lists.js — Winkel Simpel
 *
 * Overview of all shopping lists for the guide's organization.
 * Guides can create new lists, view existing ones and delete draft lists.
 * Active and completed lists can be viewed but not deleted.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { ShoppingListFactory, MemberFactory, GroupFactory } from '../../lib/dbSchema';

// ---------------------------------------------------------------------------
// Status labels and colors
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
  draft: { label: 'Concept', color: '#FF9800', background: '#FFF3E0' },
  active: { label: 'Actief', color: '#4CAF50', background: '#E8F5E9' },
  completed: { label: 'Klaar', color: '#9E9E9E', background: '#F5F5F5' },
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function ShoppingLists({ claims }) {
  const router = useRouter();
  const { orgId } = claims;

  const [lists, setLists] = useState([]);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadAll();
  }, [orgId]);

  async function loadAll() {
    setLoading(true);
    const isPrivate = claims.orgType === 'private';
    try {
      const [listsSnap, membersSnap, groupsSnap] = await Promise.all([
        ShoppingListFactory.getAll(orgId),
        isPrivate ? Promise.resolve({ docs: [] }) : MemberFactory.getByRole(orgId, 'shopper'),
        isPrivate ? Promise.resolve({ docs: [] }) : GroupFactory.getAll(orgId),
      ]);

      setLists(
        listsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
      setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setGroups(groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load lists:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(list) {
    if (!confirm(`Lijstje "${list.title}" verwijderen?`)) return;
    try {
      await ShoppingListFactory.delete(orgId, list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch (err) {
      console.error('Failed to delete list:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  function getAssignedLabel(assignedTo) {
    if (!assignedTo) return 'Niet toegewezen';
    if (assignedTo.type === 'member') {
      if (claims.orgType === 'private' && assignedTo.id === claims.uid) return 'Jij';
      const member = members.find((m) => m.id === assignedTo.id);
      return member ? `${member.firstName} ${member.lastName}` : 'Onbekend lid';
    }
    if (assignedTo.type === 'group') {
      const group = groups.find((g) => g.id === assignedTo.id);
      return group ? `Groep: ${group.name}` : 'Onbekende groep';
    }
    return 'Niet toegewezen';
  }

  // Group lists by status
  const activeLists = lists.filter((l) => l.status === 'active');
  const draftLists = lists.filter((l) => l.status === 'draft');
  const completedLists = lists.filter((l) => l.status === 'completed');

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Lijstjes</h1>
        <button style={styles.addButton} onClick={() => setShowForm(true)}>
          + Nieuw
        </button>
      </div>

      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : (
        <>
          {lists.length === 0 && (
            <div style={styles.centered}>
              <p style={styles.hint}>Nog geen lijstjes. Maak er een aan!</p>
            </div>
          )}

          {activeLists.length > 0 && (
            <Section title="Actief">
              {activeLists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  assignedLabel={getAssignedLabel(list.assignedTo)}
                  onOpen={() => router.push(`/guide/list/${list.id}`)}
                  onDelete={list.status === 'draft' ? () => handleDelete(list) : null}
                />
              ))}
            </Section>
          )}

          {draftLists.length > 0 && (
            <Section title="Concepten">
              {draftLists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  assignedLabel={getAssignedLabel(list.assignedTo)}
                  onOpen={() => router.push(`/guide/list/${list.id}`)}
                  onDelete={() => handleDelete(list)}
                />
              ))}
            </Section>
          )}

          {completedLists.length > 0 && (
            <Section title="Afgerond">
              {completedLists.map((list) => (
                <ListCard
                  key={list.id}
                  list={list}
                  assignedLabel={getAssignedLabel(list.assignedTo)}
                  onOpen={() => router.push(`/guide/list/${list.id}`)}
                  onDelete={null}
                />
              ))}
            </Section>
          )}
        </>
      )}

      {/* New list form modal */}
      {showForm && (
        <NewListForm
          orgId={orgId}
          claims={claims}
          members={members}
          groups={groups}
          onSave={async () => {
            setShowForm(false);
            await loadAll();
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <p style={styles.sectionTitle}>{title}</p>
      <div style={styles.listGroup}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ListCard
// ---------------------------------------------------------------------------
function ListCard({ list, assignedLabel, onOpen, onDelete }) {
  const statusCfg = STATUS_CONFIG[list.status] || STATUS_CONFIG.draft;

  return (
    <div style={styles.card}>
      <div style={styles.cardMain} onClick={onOpen}>
        <div style={styles.cardTop}>
          <p style={styles.cardTitle}>{list.title}</p>
          <span style={{ ...styles.statusBadge, color: statusCfg.color, backgroundColor: statusCfg.background }}>
            {statusCfg.label}
          </span>
        </div>
        <p style={styles.cardSub}>{assignedLabel}</p>
      </div>
      {onDelete && (
        <button style={styles.deleteButton} onClick={onDelete}>🗑</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewListForm (modal)
// ---------------------------------------------------------------------------
function NewListForm({ orgId, claims, members, groups, onSave, onClose }) {
  const isPrivate = claims.orgType === 'private';
  const [title, setTitle] = useState('');
  const [assignType, setAssignType] = useState('member');
  const [assignId, setAssignId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const assignOptions = assignType === 'member' ? members : groups;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Geef het lijstje een naam.'); return; }
    if (!isPrivate && !assignId) { setError('Wijs het lijstje toe aan een persoon of groep.'); return; }

    const assignedTo = isPrivate
      ? { type: 'member', id: claims.uid }
      : { type: assignType, id: assignId };

    setSaving(true);
    setError('');
    try {
      await ShoppingListFactory.create(orgId, {
        title: title.trim(),
        assignedTo,
        createdBy: claims.uid,
      });
      onSave();
    } catch (err) {
      console.error('Failed to create list:', err);
      setError('Aanmaken mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuw lijstje</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam van het lijstje</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
              placeholder="bijv. Weekboodschappen"
              required
            />
          </div>

          {isPrivate ? (
            <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
              Dit lijstje wordt automatisch aan jou toegewezen.
            </p>
          ) : (
            <>
              <div style={styles.field}>
                <label style={styles.label}>Toewijzen aan</label>
                <div style={styles.toggleRow}>
                  <button
                    type="button"
                    style={{ ...styles.toggleButton, ...(assignType === 'member' ? styles.toggleActive : {}) }}
                    onClick={() => { setAssignType('member'); setAssignId(''); }}
                  >
                    Persoon
                  </button>
                  <button
                    type="button"
                    style={{ ...styles.toggleButton, ...(assignType === 'group' ? styles.toggleActive : {}) }}
                    onClick={() => { setAssignType('group'); setAssignId(''); }}
                  >
                    Groep
                  </button>
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  {assignType === 'member' ? 'Kies een shopper' : 'Kies een groep'}
                </label>
                {assignOptions.length === 0 ? (
                  <p style={styles.emptyHint}>
                    {assignType === 'member'
                      ? 'Geen shoppers gevonden. Voeg eerst leden toe via Groepen & leden.'
                      : 'Geen groepen gevonden. Maak eerst een groep aan.'}
                  </p>
                ) : (
                  <select
                    value={assignId}
                    onChange={(e) => setAssignId(e.target.value)}
                    style={styles.input}
                    required
                  >
                    <option value="">— Kies —</option>
                    {assignOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {assignType === 'member'
                          ? `${item.firstName} ${item.lastName}`
                          : item.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}

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

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], ShoppingLists);

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
    padding: '0.25rem 0',
    fontWeight: '600',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: 0,
  },
  addButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    margin: '0 0 0.6rem',
  },
  listGroup: {
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
    overflow: 'hidden',
  },
  cardMain: {
    flex: 1,
    padding: '0.9rem 1rem',
    cursor: 'pointer',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.2rem',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: 0,
  },
  cardSub: {
    fontSize: '0.825rem',
    color: '#888',
    margin: 0,
  },
  statusBadge: {
    fontSize: '0.75rem',
    fontWeight: '700',
    padding: '0.2rem 0.6rem',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  deleteButton: {
    padding: '0 1rem',
    alignSelf: 'stretch',
    backgroundColor: '#FFEBEE',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#c62828',
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '3rem',
  },
  hint: {
    color: '#aaa',
    fontSize: '0.95rem',
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
  toggleRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  toggleButton: {
    flex: 1,
    padding: '0.6rem',
    borderRadius: '8px',
    border: '1.5px solid #ddd',
    backgroundColor: '#fff',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#666',
    cursor: 'pointer',
  },
  toggleActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
    color: '#2E7D32',
  },
  emptyHint: {
    fontSize: '0.85rem',
    color: '#aaa',
    margin: 0,
    padding: '0.75rem',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
    border: '1px dashed #ddd',
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
