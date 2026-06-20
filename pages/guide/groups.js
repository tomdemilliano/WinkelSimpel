/**
 * pages/guide/groups.js — Winkel Simpel
 *
 * Tabbladen: Shoppers | Groepen | Begeleiders (alleen org_admin)
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { GroupFactory, MemberFactory, AccessRequestFactory, StorageFactory } from '../../lib/dbSchema';
import { generateQrToken } from '../../lib/qr';

function GroupsAndMembers({ claims }) {
  const router = useRouter();
  const { orgId, uid, role, orgType } = claims;
  const isOrgAdmin = role === 'org_admin';
  const isPrivate = orgType === 'private';

  const [tab, setTab] = useState('shoppers');
  const [groups, setGroups] = useState([]);
  const [shoppers, setShoppers] = useState([]);
  const [loadingShoppers, setLoadingShoppers] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => { loadShoppers(); loadGroups(); }, [orgId]);

  async function loadShoppers() {
    setLoadingShoppers(true);
    try {
      const snap = await MemberFactory.getByRole(orgId, 'shopper');
      setShoppers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setLoadingShoppers(false); }
  }

  async function loadGroups() {
    setLoadingGroups(true);
    try {
      const snap = await GroupFactory.getAll(orgId);
      setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setLoadingGroups(false); }
  }

  async function handleDeleteShopper(shopper) {
    if (!confirm(`Shopper "${shopper.firstName} ${shopper.lastName}" verwijderen?`)) return;
    try {
      await Promise.all(
        groups.filter(g => g.memberIds?.includes(shopper.id))
          .map(g => GroupFactory.update(orgId, g.id, { memberIds: g.memberIds.filter(id => id !== shopper.id) }))
      );
      await MemberFactory.delete(orgId, shopper.id);
      setShoppers(prev => prev.filter(s => s.id !== shopper.id));
      setGroups(prev => prev.map(g => ({ ...g, memberIds: (g.memberIds || []).filter(id => id !== shopper.id) })));
    } catch (err) { alert('Verwijderen mislukt.'); }
  }

  async function handleDeleteGroup(group) {
    if (!confirm(`Groep "${group.name}" verwijderen?`)) return;
    try {
      await GroupFactory.delete(orgId, group.id);
      setGroups(prev => prev.filter(g => g.id !== group.id));
    } catch (err) { alert('Verwijderen mislukt.'); }
  }

  const tabs = [
    { id: 'shoppers', label: 'Shoppers' },
    { id: 'groups', label: 'Groepen' },
    ...(isOrgAdmin ? [{ id: 'guides', label: 'Begeleiders' }] : []),
    ...(isOrgAdmin ? [{ id: 'requests', label: 'Toegangsverzoeken' }] : []),
  ];

  if (isPrivate) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <button style={styles.backButton} onClick={() => router.push('/guide')}>← Terug</button>
          <h1 style={styles.title}>Groepen & leden</h1>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ fontSize: '3rem', margin: '0 0 1rem' }}>👤</p>
          <p style={{ color: '#666', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Als zelfstandig gebruiker heb je geen shoppers of groepen.
          </p>
          <button
            style={{ padding: '0.75rem 1.25rem', backgroundColor: '#E8EAF6', color: '#3949AB', border: 'none', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}
            onClick={() => router.push('/guide/request-access')}
          >
            Aansluiten bij een organisatie →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>← Terug</button>
        <h1 style={styles.title}>Groepen & leden</h1>
        <div style={{ width: 60 }} />
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t.id}
            style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Shoppers tab */}
      {tab === 'shoppers' && (
        <ShoppersTab
          shoppers={shoppers}
          loading={loadingShoppers}
          orgId={orgId}
          uid={uid}
          onReload={loadShoppers}
          onDelete={handleDeleteShopper}
          onQr={(s) => router.push(`/guide/qr/${s.id}`)}
        />
      )}

      {/* Groepen tab */}
      {tab === 'groups' && (
        <GroupsTab
          groups={groups}
          shoppers={shoppers}
          loading={loadingGroups}
          orgId={orgId}
          onReload={loadGroups}
          onDelete={handleDeleteGroup}
        />
      )}

      {/* Begeleiders tab */}
      {tab === 'guides' && isOrgAdmin && (
        <GuidesTab orgId={orgId} uid={uid} />
      )}

      {/* Toegangsverzoeken tab */}
      {tab === 'requests' && isOrgAdmin && (
        <RequestsTab orgId={orgId} callerUid={uid} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShoppersTab
// ---------------------------------------------------------------------------
function ShoppersTab({ shoppers, loading, orgId, uid, onReload, onDelete, onQr }) {
  const [showForm, setShowForm] = useState(false);
  const [editingShopper, setEditingShopper] = useState(null);

  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Shoppers ({shoppers.length})</p>
        <button style={styles.sectionAddButton} onClick={() => setShowForm(true)}>+ Toevoegen</button>
      </div>

      {loading ? <p style={styles.emptyHint}>Laden...</p>
        : shoppers.length === 0 ? <p style={styles.emptyHint}>Nog geen shoppers. Voeg er een toe!</p>
        : (
          <div style={styles.cardList}>
            {shoppers.map(s => (
              <div key={s.id} style={styles.card}>
                <div style={styles.cardAvatar}>{s.firstName?.[0]?.toUpperCase() || '?'}</div>
                <div style={styles.cardBody}>
                  <p style={styles.cardName}>{s.firstName} {s.lastName}</p>
                  <p style={styles.cardSub}>Shopper</p>
                </div>
                <div style={styles.cardActions}>
                  <button style={styles.qrButton} onClick={() => onQr(s)}>QR</button>
                  <button style={styles.editSmallButton} onClick={() => setEditingShopper(s)}>✏️</button>
                  <button style={styles.deleteSmallButton} onClick={() => onDelete(s)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {showForm && (
        <NewShopperForm orgId={orgId} createdBy={uid}
          onSave={async () => { setShowForm(false); await onReload(); }}
          onClose={() => setShowForm(false)} />
      )}
      {editingShopper && (
        <EditShopperForm orgId={orgId} shopper={editingShopper}
          onSave={async () => { setEditingShopper(null); await onReload(); }}
          onClose={() => setEditingShopper(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupsTab
// ---------------------------------------------------------------------------
function GroupsTab({ groups, shoppers, loading, orgId, onReload, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Groepen ({groups.length})</p>
        <button style={styles.sectionAddButton} onClick={() => setShowForm(true)}>+ Toevoegen</button>
      </div>

      {loading ? <p style={styles.emptyHint}>Laden...</p>
        : groups.length === 0 ? <p style={styles.emptyHint}>Nog geen groepen.</p>
        : (
          <div style={styles.cardList}>
            {groups.map(group => (
              <GroupCard key={group.id} group={group} shoppers={shoppers} orgId={orgId}
                onEdit={() => setEditingGroup(group)}
                onDelete={() => onDelete(group)}
                onReload={onReload} />
            ))}
          </div>
        )}

      {showForm && (
        <NewGroupForm orgId={orgId}
          onSave={async () => { setShowForm(false); await onReload(); }}
          onClose={() => setShowForm(false)} />
      )}
      {editingGroup && (
        <EditGroupForm orgId={orgId} group={editingGroup}
          onSave={async () => { setEditingGroup(null); await onReload(); }}
          onClose={() => setEditingGroup(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuidesTab — alleen voor org_admin
// ---------------------------------------------------------------------------
function GuidesTab({ orgId, uid }) {
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGuide, setEditingGuide] = useState(null);

  useEffect(() => { loadGuides(); }, [orgId]);

  async function loadGuides() {
    setLoading(true);
    try {
      const [snap, snapAdmin] = await Promise.all([
        MemberFactory.getByRole(orgId, 'guide'),
        MemberFactory.getByRole(orgId, 'org_admin'),
      ]);
      setGuides([
        ...snap.docs.map(d => ({ id: d.id, ...d.data() })),
        ...snapAdmin.docs.map(d => ({ id: d.id, ...d.data() })),
      ].sort((a, b) => a.firstName.localeCompare(b.firstName)));
    } finally { setLoading(false); }
  }

  async function handleDelete(guide) {
    if (!confirm(`Begeleider "${guide.firstName} ${guide.lastName}" verwijderen?`)) return;
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orgId, memberId: guide.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Verwijderen mislukt.');
        return;
      }
      setGuides(prev => prev.filter(g => g.id !== guide.id));
    } catch {
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  const ROLE_CONFIG = {
    guide: { label: 'Begeleider', color: '#1565C0', bg: '#E3F2FD' },
    org_admin: { label: 'Org. beheerder', color: '#E65100', bg: '#FFF3E0' },
  };

  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Begeleiders ({guides.length})</p>
        <button style={styles.sectionAddButton} onClick={() => setShowForm(true)}>+ Toevoegen</button>
      </div>

      {loading ? <p style={styles.emptyHint}>Laden...</p>
        : guides.length === 0 ? <p style={styles.emptyHint}>Nog geen begeleiders.</p>
        : (
          <div style={styles.cardList}>
            {guides.map(guide => {
              const cfg = ROLE_CONFIG[guide.role] || ROLE_CONFIG.guide;
              return (
                <div key={guide.id} style={styles.card}>
                  <div style={styles.cardAvatar}>{guide.firstName?.[0]?.toUpperCase() || '?'}</div>
                  <div style={styles.cardBody}>
                    <p style={styles.cardName}>{guide.firstName} {guide.lastName}</p>
                    <p style={styles.cardSub}>{guide.email}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: cfg.color, backgroundColor: cfg.bg, padding: '0.15rem 0.5rem', borderRadius: '20px' }}>
                      {cfg.label}
                    </span>
                    <div style={styles.cardActions}>
                      <button style={styles.editSmallButton} onClick={() => setEditingGuide(guide)}>✏️</button>
                      <button style={styles.deleteSmallButton} onClick={() => handleDelete(guide)}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {showForm && (
        <NewGuideForm orgId={orgId} createdBy={uid}
          onSave={async () => { setShowForm(false); await loadGuides(); }}
          onClose={() => setShowForm(false)} />
      )}
      {editingGuide && (
        <EditGuideForm orgId={orgId} guide={editingGuide}
          onSave={async () => { setEditingGuide(null); await loadGuides(); }}
          onClose={() => setEditingGuide(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupCard — met tag-input voor leden
// ---------------------------------------------------------------------------
function GroupCard({ group, shoppers, orgId, onEdit, onDelete, onReload }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  // Lokale kopie van memberIds zodat suggestions meteen bijwerken na toevoegen
  const [localMemberIds, setLocalMemberIds] = useState(group.memberIds || []);

  // Sync als group prop verandert (na reload)
  useEffect(() => {
    setLocalMemberIds(group.memberIds || []);
  }, [group.memberIds]);

  const members = shoppers.filter(s => localMemberIds.includes(s.id));

  const suggestions = search.trim().length > 0
    ? shoppers.filter(s =>
        !localMemberIds.includes(s.id) &&
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase().trim())
      )
    : [];

  async function addMember(shopper) {
    const newIds = [...localMemberIds, shopper.id];
    setLocalMemberIds(newIds); // meteen updaten voor responsieve UI
    setSearch('');
    setSaving(true);
    try {
      await GroupFactory.update(orgId, group.id, { memberIds: newIds });
      await onReload();
    } catch {
      setLocalMemberIds(group.memberIds || []); // rollback bij fout
    } finally { setSaving(false); }
  }

  async function removeMember(shopperId) {
    const newIds = localMemberIds.filter(id => id !== shopperId);
    setLocalMemberIds(newIds);
    try {
      await GroupFactory.update(orgId, group.id, { memberIds: newIds });
      await onReload();
    } catch {
      setLocalMemberIds(group.memberIds || []);
    }
  }

  return (
    <div style={styles.groupCard}>
      <div style={styles.groupCardHeader} onClick={() => setExpanded(v => !v)}>
        {group.imageUrl && (
          <img
            src={group.imageUrl}
            alt={group.name}
            style={styles.groupImage}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <p style={{ ...styles.cardName, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</p>
          <p style={styles.cardSub}>{localMemberIds.length} {localMemberIds.length === 1 ? 'lid' : 'leden'}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <button style={styles.editSmallButton} onClick={e => { e.stopPropagation(); onEdit(); }}>✏️</button>
          <button style={styles.deleteSmallButton} onClick={e => { e.stopPropagation(); onDelete(); }}>🗑</button>
          <span style={styles.expandIcon}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={styles.groupMemberList}>
          {/* Tags van huidige leden */}
          <div style={styles.tagContainer}>
            {members.length === 0 && <p style={{ fontSize: '0.8rem', color: '#bbb', margin: 0 }}>Nog geen leden</p>}
            {members.map(s => (
              <div key={s.id} style={styles.tag}>
                <span>{s.firstName} {s.lastName}</span>
                <button onClick={() => removeMember(s.id)} style={styles.tagRemove}>✕</button>
              </div>
            ))}
          </div>

          {/* Zoek en voeg toe */}
          <div style={{ position: 'relative', marginTop: '0.5rem' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Naam typen om toe te voegen..."
              style={{ ...styles.searchInput, marginBottom: 0 }}
              disabled={saving}
            />
            {focused && suggestions.length > 0 && (
              <div style={styles.suggestions}>
                {suggestions.map(s => (
                  <div key={s.id} style={styles.suggestion}
                    onMouseDown={e => { e.preventDefault(); addMember(s); }}>
                    {s.firstName} {s.lastName}
                  </div>
                ))}
              </div>
            )}
            {focused && search.trim().length > 0 && suggestions.length === 0 && (
              <div style={styles.suggestions}>
                <div style={{ ...styles.suggestion, color: '#aaa', cursor: 'default' }}>Geen shoppers gevonden</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditGroupForm
// ---------------------------------------------------------------------------
function EditGroupForm({ orgId, group, onSave, onClose }) {
  const [name, setName] = useState(group.name || '');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(group.imageUrl || null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef(null);

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de groep een naam.'); return; }
    setSaving(true);
    try {
      const updates = { name: name.trim() };
      if (imageFile) {
        if (group.imageUrl) {
          try { await StorageFactory.deleteByUrl(group.imageUrl); } catch {}
        }
        updates.imageUrl = await StorageFactory.uploadGroupImage(orgId, group.id, imageFile);
      } else if (removeImage && group.imageUrl) {
        try { await StorageFactory.deleteByUrl(group.imageUrl); } catch {}
        updates.imageUrl = null;
      }
      await GroupFactory.update(orgId, group.id, updates);
      onSave();
    } catch { setError('Opslaan mislukt.'); setSaving(false); }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Groep bewerken</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam van de groep</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={styles.input} required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Afbeelding</label>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
            {imagePreview
              ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <img src={imagePreview} alt="Voorbeeld" style={styles.imagePreview} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <button type="button" onClick={() => imageInputRef.current?.click()} style={styles.imagePickerBtn}>
                      Wijzigen
                    </button>
                    <button type="button" onClick={handleRemoveImage} style={{ ...styles.imagePickerBtn, backgroundColor: '#FFEBEE', color: '#c62828' }}>
                      Verwijderen
                    </button>
                  </div>
                </div>
              )
              : (
                <button type="button" onClick={() => imageInputRef.current?.click()} style={styles.imagePickerBtn}>
                  📷 Afbeelding kiezen
                </button>
              )
            }
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditShopperForm
// ---------------------------------------------------------------------------
function EditShopperForm({ orgId, shopper, onSave, onClose }) {
  const [firstName, setFirstName] = useState(shopper.firstName || '');
  const [lastName, setLastName] = useState(shopper.lastName || '');
  const [voiceName, setVoiceName] = useState(shopper.voiceName || '');
  const [voices, setVoices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    function loadVoices() {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const all = window.speechSynthesis.getVoices();
      setVoices(all.filter(v => v.lang.startsWith('nl')));
    }
    loadVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  function handleTest() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const name = firstName.trim() || 'Demo';
    const utt = new SpeechSynthesisUtterance(`${name} gaat boodschappen doen!`);
    utt.lang = 'nl-BE';
    utt.rate = 0.88;
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
      if (voice) utt.voice = voice;
    }
    window.speechSynthesis.speak(utt);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError('Vul voor- en achternaam in.'); return; }
    setSaving(true);
    try {
      await MemberFactory.update(orgId, shopper.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        voiceName: voiceName || null,
      });
      onSave();
    } catch { setError('Opslaan mislukt.'); setSaving(false); }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Shopper bewerken</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Voornaam</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              style={styles.input} required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Achternaam</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Voorleesstem (optioneel)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={voiceName}
                onChange={e => setVoiceName(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              >
                <option value=''>Standaard (begeleidersinstellingen)</option>
                {voices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleTest}
                style={{ padding: '0.75rem 0.875rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
              >
                Test
              </button>
            </div>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditGuideForm — naam + rol wijzigen (org_admin)
// ---------------------------------------------------------------------------
function EditGuideForm({ orgId, guide, onSave, onClose }) {
  const [firstName, setFirstName] = useState(guide.firstName || '');
  const [lastName, setLastName] = useState(guide.lastName || '');
  const [role, setRole] = useState(guide.role || 'guide');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError('Vul voor- en achternaam in.'); return; }
    setSaving(true);
    setError('');
    try {
      await MemberFactory.update(orgId, guide.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
      });
      // Update custom claims als rol veranderd is
      if (role !== guide.role) {
        const { getAuth } = await import('firebase/auth');
        const { auth } = await import('../../lib/firebase');
        const idToken = await getAuth(auth.app).currentUser?.getIdToken();
        await fetch('/api/admin/update-member-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ uid: guide.id, role, orgId }),
        });
      }
      onSave();
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message);
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Begeleider bewerken</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Voornaam</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              style={styles.input} required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Achternaam</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Rol</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={styles.input}>
              <option value="guide">Begeleider</option>
              <option value="org_admin">Organisatiebeheerder</option>
            </select>
            {role !== guide.role && (
              <p style={{ fontSize: '0.8rem', color: '#E65100', margin: '0.25rem 0 0' }}>
                ⚠️ Rolwijziging wordt onmiddellijk van kracht.
              </p>
            )}
          </div>
          <div style={styles.field}>
            <label style={styles.label}>E-mailadres</label>
            <input type="text" value={guide.email || ''} disabled
              style={{ ...styles.input, backgroundColor: '#f5f5f5', color: '#aaa' }} />
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewShopperForm
// ---------------------------------------------------------------------------
function NewShopperForm({ orgId, createdBy, onSave, onClose }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError('Vul voor- en achternaam in.'); return; }
    setSaving(true);
    try {
      const qrToken = generateQrToken();
      const { doc, setDoc } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      const { v4: uuidv4 } = await import('uuid').catch(() => ({
        v4: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
      }));
      const memberId = uuidv4();
      await setDoc(doc(db, 'organizations', orgId, 'members', memberId), {
        role: 'shopper', firstName: firstName.trim(), lastName: lastName.trim(),
        email: '', qrToken, groupIds: [], createdBy, createdAt: new Date(),
      });
      onSave();
    } catch { setError('Aanmaken mislukt.'); setSaving(false); }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe shopper</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Voornaam</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              style={styles.input} placeholder="bijv. Marie" required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Achternaam</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              style={styles.input} placeholder="bijv. Janssen" required />
          </div>
          <p style={styles.formHint}>Na het aanmaken kan je een QR-kaartje afdrukken voor deze shopper.</p>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Aanmaken...' : 'Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewGroupForm
// ---------------------------------------------------------------------------
function NewGroupForm({ orgId, onSave, onClose }) {
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const imageInputRef = useRef(null);

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de groep een naam.'); return; }
    setSaving(true);
    try {
      const docRef = await GroupFactory.create(orgId, { name: name.trim(), memberIds: [], imageUrl: null });
      if (imageFile) {
        const url = await StorageFactory.uploadGroupImage(orgId, docRef.id, imageFile);
        await GroupFactory.update(orgId, docRef.id, { imageUrl: url });
      }
      onSave();
    } catch { setError('Aanmaken mislukt.'); setSaving(false); }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe groep</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam van de groep</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={styles.input} placeholder="bijv. Groep A" required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Afbeelding (optioneel)</label>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
            {imagePreview
              ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={imagePreview} alt="Voorbeeld" style={styles.imagePreview} />
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} style={styles.imageRemoveBtn}>✕</button>
                </div>
              )
              : (
                <button type="button" onClick={() => imageInputRef.current?.click()} style={styles.imagePickerBtn}>
                  📷 Afbeelding kiezen
                </button>
              )
            }
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Aanmaken...' : 'Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewGuideForm — met uitnodigingsmail
// ---------------------------------------------------------------------------
function NewGuideForm({ orgId, createdBy, onSave, onClose }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('guide');
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tempPassword, setTempPassword] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) { setError('Vul alle velden in.'); return; }
    setSaving(true);
    setError('');
    try {
      const { auth } = await import('../../lib/firebase');
      const { getAuth } = await import('firebase/auth');
      const idToken = await getAuth(auth.app).currentUser?.getIdToken();
      const res = await fetch('/api/org/invite-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orgId, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role, sendInvite }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); setSaving(false); return; }
      if (data.tempPassword) { setTempPassword(data.tempPassword); }
      else { onSave(); }
    } catch { setError('Er is een fout opgetreden.'); setSaving(false); }
  }

  if (tempPassword) {
    return (
      <div style={styles.modalOverlay} onClick={onSave}>
        <div style={styles.modal} onClick={e => e.stopPropagation()}>
          <div style={styles.modalHeader}><h2 style={styles.modalTitle}>Begeleider aangemaakt ✅</h2></div>
          <p style={{ color: '#555', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
            Geef dit tijdelijk wachtwoord door aan <strong>{firstName}</strong>.
          </p>
          <div style={{ backgroundColor: '#f5f5f5', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#888' }}>E-mailadres</p>
            <p style={{ margin: '0 0 1rem', fontWeight: '700' }}>{email}</p>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#888' }}>Tijdelijk wachtwoord</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', letterSpacing: '0.1em' }}>{tempPassword}</p>
          </div>
          <button style={styles.saveButton} onClick={onSave}>Sluiten</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe begeleider</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Voornaam</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={styles.input} required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Achternaam</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>E-mailadres</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} required />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Rol</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={styles.input}>
              <option value="guide">Begeleider</option>
              <option value="org_admin">Organisatiebeheerder</option>
            </select>
          </div>
          <div style={{ backgroundColor: '#F3E5F5', borderRadius: '10px', padding: '0.875rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={sendInvite} onChange={e => setSendInvite(e.target.checked)}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#6A1B9A' }} />
              <div>
                <p style={{ margin: '0 0 0.2rem', fontSize: '0.9rem', fontWeight: '700', color: '#6A1B9A' }}>Uitnodigingsmail sturen</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#888', lineHeight: 1.4 }}>
                  Begeleider ontvangt mail met tijdelijk wachtwoord. Niet aangevinkt: wachtwoord wordt hier getoond.
                </p>
              </div>
            </label>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving} style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Aanmaken...' : sendInvite ? 'Aanmaken & uitnodigen' : 'Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequestsTab — toegangsverzoeken voor org_admin
// ---------------------------------------------------------------------------
function RequestsTab({ orgId, callerUid }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  useEffect(() => { loadRequests(); }, [orgId]);

  async function loadRequests() {
    setLoading(true);
    try {
      const snap = await AccessRequestFactory.getByOrg(orgId);
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleAction(requestId, action) {
    setActionError('');
    try {
      const { getAuth } = await import('firebase/auth');
      const { auth } = await import('../../lib/firebase');
      const idToken = await getAuth(auth.app).currentUser?.getIdToken();
      const res = await fetch('/api/org/handle-access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ requestId, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.message || 'Er is een fout opgetreden.');
        return;
      }
      await loadRequests();
    } catch {
      setActionError('Er is een fout opgetreden. Probeer opnieuw.');
    }
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const processed = requests.filter((r) => r.status !== 'pending');

  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Openstaand ({pending.length})</p>
      </div>
      {actionError && (
        <p style={{ ...styles.errorText, marginBottom: '0.75rem' }}>{actionError}</p>
      )}
      {loading ? (
        <p style={styles.emptyHint}>Laden...</p>
      ) : pending.length === 0 ? (
        <p style={styles.emptyHint}>Geen openstaande verzoeken.</p>
      ) : (
        <div style={styles.cardList}>
          {pending.map((r) => (
            <div key={r.id} style={{ ...styles.card, flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
              <div>
                <p style={styles.cardName}>{r.requestingUserName}</p>
                <p style={styles.cardSub}>{r.requestingUserEmail}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  style={{ padding: '0.4rem 0.875rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => handleAction(r.id, 'approve')}
                >
                  Goedkeuren
                </button>
                <button
                  style={{ padding: '0.4rem 0.875rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                  onClick={() => handleAction(r.id, 'reject')}
                >
                  Weigeren
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {processed.length > 0 && (
        <>
          <div style={{ ...styles.sectionHeader, marginTop: '1.5rem' }}>
            <p style={styles.sectionTitle}>Verwerkt</p>
          </div>
          <div style={styles.cardList}>
            {processed.map((r) => (
              <div key={r.id} style={styles.card}>
                <div style={styles.cardBody}>
                  <p style={styles.cardName}>{r.requestingUserName}</p>
                  <p style={styles.cardSub}>{r.requestingUserEmail}</p>
                </div>
                <span style={{
                  fontSize: '0.75rem', fontWeight: '600', padding: '0.3rem 0.7rem', borderRadius: '20px',
                  ...(r.status === 'approved'
                    ? { backgroundColor: '#E8F5E9', color: '#2E7D32' }
                    : { backgroundColor: '#FFEBEE', color: '#C62828' }),
                }}>
                  {r.status === 'approved' ? 'Goedgekeurd' : 'Geweigerd'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], GroupsAndMembers);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#F4F8FC', fontFamily: "'Nunito', system-ui, sans-serif", padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#5B9BD5', margin: '-1.5rem -1.5rem 1.25rem -1.5rem', padding: '1.25rem 1.5rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.9rem', color: '#fff', cursor: 'pointer', fontWeight: '700', padding: '0.25rem 0', fontFamily: 'inherit' },
  title: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', margin: 0 },
  tabs: { display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '2px solid #eee' },
  tab: { flex: 1, padding: '0.65rem 0.5rem', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: '-2px', fontSize: '0.9rem', fontWeight: '600', color: '#aaa', cursor: 'pointer' },
  tabActive: { color: '#1A2B3C', borderBottomColor: '#5B9BD5' },
  tabContent: { paddingTop: '0.25rem' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.8rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  sectionAddButton: { padding: '0.4rem 0.875rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem' },
  cardAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#E8F5E9', color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1rem', flexShrink: 0 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: '0.95rem', fontWeight: '600', color: '#1a1a1a', margin: '0 0 0.15rem' },
  cardSub: { fontSize: '0.8rem', color: '#999', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardActions: { display: 'flex', gap: '0.35rem', alignItems: 'center' },
  qrButton: { padding: '0.3rem 0.6rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' },
  editSmallButton: { padding: '0.3rem 0.45rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' },
  deleteSmallButton: { padding: '0.3rem 0.45rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' },
  groupCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', overflow: 'hidden' },
  groupImage: { width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 },
  groupCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem', cursor: 'pointer' },
  imageButton: { padding: '0.3rem 0.45rem', backgroundColor: '#F3E5F5', color: '#6A1B9A', border: 'none', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' },
  imagePreview: { width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1.5px solid #eee' },
  imageRemoveBtn: { position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#c62828', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  imagePickerBtn: { padding: '0.6rem 0.875rem', backgroundColor: '#F3E5F5', color: '#6A1B9A', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  expandIcon: { fontSize: '0.75rem', color: '#aaa', marginLeft: '0.25rem' },
  groupMemberList: { borderTop: '1px solid #f0f0f0', padding: '0.75rem' },
  tagContainer: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', minHeight: '28px' },
  tag: { display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#E8F5E9', color: '#2E7D32', borderRadius: '20px', padding: '0.25rem 0.6rem 0.25rem 0.75rem', fontSize: '0.82rem', fontWeight: '600' },
  tagRemove: { background: 'none', border: 'none', cursor: 'pointer', color: '#2E7D32', fontSize: '0.75rem', padding: '0', lineHeight: 1, opacity: 0.7 },
  searchInput: { width: '100%', padding: '0.6rem 0.875rem', borderRadius: '8px', border: '1.5px solid #ddd', fontSize: '0.9rem', backgroundColor: '#fff', boxSizing: 'border-box' },
  suggestions: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1.5px solid #5B9BD5', borderTop: 'none', borderRadius: '0 0 8px 8px', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' },
  suggestion: { padding: '0.7rem 0.875rem', cursor: 'pointer', fontSize: '0.9rem', color: '#1a1a1a', borderBottom: '1px solid #f5f5f5' },
  emptyHint: { fontSize: '0.85rem', color: '#bbb', margin: '0.5rem 0', padding: '0.75rem', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px dashed #eee' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '1.1rem', color: '#aaa', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', backgroundColor: '#fff' },
  formHint: { fontSize: '0.825rem', color: '#aaa', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#fafafa', borderRadius: '8px' },
  errorText: { color: '#c62828', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#FFEBEE', borderRadius: '8px' },
  saveButton: { padding: '0.875rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.5rem', fontFamily: 'inherit' },
};
