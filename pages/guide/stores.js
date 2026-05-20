/**
 * pages/guide/stores.js — Winkel Simpel
 *
 * Winkelbibliotheek voor begeleiders.
 * Winkels en ketens aanmaken, bewerken en verwijderen binnen een organisatie.
 * Vergelijkbaar met library.js maar voor winkels.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import {
  StoreFactory,
  StorageFactory,
  CentralStoreFactory,
  StoreSubmissionFactory,
} from '../../lib/dbSchema';

// ---------------------------------------------------------------------------
// StoreLogo — toont logo of winkelicoon placeholder
// ---------------------------------------------------------------------------
function StoreLogo({ url, alt, size = 64 }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f5f5f5', borderRadius: 8,
      }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12h6v10" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt || ''}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8 }}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function StoreLibrary({ claims }) {
  const router = useRouter();
  const { orgId } = claims;

  const [stores, setStores] = useState([]);
  const [centralStores, setCentralStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'chain' | 'store'

  useEffect(() => { loadStores(); }, [orgId]);

  async function loadStores() {
    setLoading(true);
    try {
      const [orgSnap, centralSnap] = await Promise.all([
        StoreFactory.getAll(orgId),
        CentralStoreFactory.getAll(),
      ]);
      setStores(orgSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'org' })));
      setCentralStores(centralSnap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'central' })));
    } catch (err) {
      console.error('Failed to load stores:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(store) {
    if (!confirm(`"${store.name}" verwijderen?`)) return;
    try {
      await StoreFactory.delete(orgId, store.id);
      if (store.logoUrl) {
        await StorageFactory.deleteByUrl(store.logoUrl).catch(() => {});
      }
      setStores(prev => prev.filter(s => s.id !== store.id));
    } catch (err) {
      console.error('Failed to delete store:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  // Combineer centrale + org winkels, vermijd duplicaten op naam
  const orgStoreNames = new Set(stores.map(s => s.name.toLowerCase().trim()));
  const centralOnly = centralStores.filter(
    s => !orgStoreNames.has(s.name.toLowerCase().trim())
  );
  const allStores = [
    ...centralStores
      .filter(s => orgStoreNames.has(s.name.toLowerCase().trim()))
      .map(c => ({
        ...stores.find(s => s.name.toLowerCase().trim() === c.name.toLowerCase().trim()),
        _central: c,
      })),
    ...centralOnly,
    ...stores.filter(s =>
      !centralStores.some(c => c.name.toLowerCase().trim() === s.name.toLowerCase().trim())
    ),
  ];

  const filteredStores = allStores.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const chainCount = allStores.filter(s => s.type === 'chain').length;
  const storeCount = allStores.filter(s => s.type === 'store').length;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide/beheer')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Winkels</h1>
        <button style={styles.addButton} onClick={() => { setEditingStore(null); setShowForm(true); }}>
          + Nieuw
        </button>
      </div>

      {/* Filter chips */}
      <div style={styles.filterRow}>
        {[
          { id: 'all', label: `Alles (${allStores.length})` },
          { id: 'chain', label: `Ketens (${chainCount})` },
          { id: 'store', label: `Winkels (${storeCount})` },
        ].map(f => (
          <button
            key={f.id}
            style={{ ...styles.filterChip, ...(typeFilter === f.id ? styles.filterChipActive : {}) }}
            onClick={() => setTypeFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Zoeken..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        style={styles.searchInput}
      />

      {/* Store list */}
      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : filteredStores.length === 0 ? (
        <div style={styles.centered}>
          <p style={styles.hint}>
            {searchQuery ? 'Geen winkels gevonden.' : 'Nog geen winkels. Voeg er een toe!'}
          </p>
        </div>
      ) : (
        <div style={styles.storeList}>
          {filteredStores.map(store => (
            <StoreCard
              key={store.id}
              store={store}
              onEdit={() => { setEditingStore(store); setShowForm(true); }}
              onDelete={() => handleDelete(store)}
            />
          ))}
        </div>
      )}

      {/* Store form modal */}
      {showForm && (
        <StoreForm
          orgId={orgId}
          store={editingStore}
          onSave={async () => { setShowForm(false); setEditingStore(null); await loadStores(); }}
          onClose={() => { setShowForm(false); setEditingStore(null); }}
          claims={claims}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoreCard
// ---------------------------------------------------------------------------
function StoreCard({ store, onEdit, onDelete }) {
  const isCentral = store._source === 'central';
  const hasOrgVersion = !!store._central;

  const isChain = store.type === 'chain';

  return (
    <div style={styles.card}>
      <div style={styles.cardLogoWrapper}>
        <StoreLogo url={store.logoUrl} alt={store.name} size={56} />
      </div>
      <div style={styles.cardBody}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <p style={styles.cardName}>{store.name}</p>
          {isCentral && !hasOrgVersion && (
            <span style={styles.centralBadge}>Centraal</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
          <span style={{ ...styles.typeBadge, ...(isChain ? styles.typeBadgeChain : styles.typeBadgeStore) }}>
            {isChain ? '🏪 Keten' : '📍 Winkel'}
          </span>
          {!isChain && store.city && (
            <p style={styles.cardAddress}>{store.street} {store.houseNumber}, {store.postalCode} {store.city}</p>
          )}
        </div>
      </div>
      <div style={styles.cardActions}>
        {!isCentral && (
          <>
            <button style={styles.editButton} onClick={onEdit}>Bewerken</button>
            <button style={styles.deleteButton} onClick={onDelete}>Verwijderen</button>
          </>
        )}
        {isCentral && !hasOrgVersion && (
          <span style={{ fontSize: '0.75rem', color: '#aaa' }}>Alleen-lezen</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StoreForm (modal)
// ---------------------------------------------------------------------------
function StoreForm({ orgId, store, onSave, onClose, claims }) {
  const isEditing = !!store;

  const [name, setName] = useState(store?.name || '');
  const [type, setType] = useState(store?.type || 'chain');
  const [street, setStreet] = useState(store?.street || '');
  const [houseNumber, setHouseNumber] = useState(store?.houseNumber || '');
  const [postalCode, setPostalCode] = useState(store?.postalCode || '');
  const [city, setCity] = useState(store?.city || '');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(store?.logoUrl || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [centralMatch, setCentralMatch] = useState(null);
  const fileInputRef = useRef();

  async function checkCentralName(value) {
    if (!value.trim() || value.trim().length < 2) { setCentralMatch(null); return; }
    try {
      const snap = await CentralStoreFactory.getByName(value.trim());
      setCentralMatch(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch { setCentralMatch(null); }
  }

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Kies een afbeelding (jpg, png, webp).');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setError('');
  }

  async function submitToCentral(orgStoreId, name, type, logoUrl) {
    if (centralMatch) return;
    try {
      await StoreSubmissionFactory.create({ name, type, logoUrl, orgId, orgStoreId });
    } catch (err) {
      console.warn('Store submission to central failed (non-blocking):', err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Vul een naam in.'); return; }
    if (type === 'store') {
      if (!street.trim() || !houseNumber.trim() || !postalCode.trim() || !city.trim()) {
        setError('Vul het volledige adres in voor een winkel.');
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const addressFields = type === 'store'
        ? { street: street.trim(), houseNumber: houseNumber.trim(), postalCode: postalCode.trim(), city: city.trim() }
        : { street: null, houseNumber: null, postalCode: null, city: null };

      if (isEditing) {
        let logoUrl = store.logoUrl;
        if (logoFile) {
          logoUrl = await StorageFactory.uploadStoreLogo(orgId, store.id, logoFile);
          if (store.logoUrl && store.logoUrl.includes('firebasestorage')) {
            await StorageFactory.deleteByUrl(store.logoUrl).catch(() => {});
          }
        }
        await StoreFactory.update(orgId, store.id, {
          name: name.trim(),
          nameLower: name.trim().toLowerCase(),
          type,
          logoUrl,
          ...addressFields,
        });
        onSave();
      } else {
        const docRef = await StoreFactory.create(orgId, {
          name: name.trim(),
          type,
          logoUrl: '',
          ...addressFields,
          createdBy: claims.uid,
        });

        let logoUrl = '';
        if (logoFile) {
          logoUrl = await StorageFactory.uploadStoreLogo(orgId, docRef.id, logoFile);
          await StoreFactory.update(orgId, docRef.id, { logoUrl });
        }

        await submitToCentral(docRef.id, name.trim(), type, logoUrl);
        onSave();
      }
    } catch (err) {
      console.error('Failed to save store:', err);
      setError('Opslaan mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{isEditing ? 'Winkel bewerken' : 'Nieuwe winkel of keten'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>

          {/* Type toggle */}
          <div style={styles.field}>
            <label style={styles.label}>Type</label>
            <div style={styles.toggleRow}>
              <button
                type="button"
                style={{ ...styles.toggleButton, ...(type === 'chain' ? styles.toggleActive : {}) }}
                onClick={() => setType('chain')}
              >
                🏪 Keten
              </button>
              <button
                type="button"
                style={{ ...styles.toggleButton, ...(type === 'store' ? styles.toggleActive : {}) }}
                onClick={() => setType('store')}
              >
                📍 Winkel
              </button>
            </div>
            <p style={styles.fieldHint}>
              {type === 'chain'
                ? 'Een keten heeft geen vast adres (bv. Delhaize, Colruyt).'
                : 'Een winkel heeft een specifiek adres.'}
            </p>
          </div>

          {/* Logo upload */}
          <div style={styles.imageUploadArea} onClick={() => fileInputRef.current.click()}>
            {logoPreview ? (
              <img src={logoPreview} alt="Logo voorvertoning" style={styles.logoPreview}
                onError={e => e.target.style.display = 'none'} referrerPolicy="no-referrer" />
            ) : (
              <div style={styles.imagePlaceholder}>
                <span style={{ fontSize: '2rem' }}>🏪</span>
                <span style={styles.imageUploadHint}>Tik om een logo te kiezen (optioneel)</span>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*"
              onChange={handleLogoChange} style={{ display: 'none' }} />
          </div>

          {/* Name */}
          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); checkCentralName(e.target.value); }}
              style={styles.input}
              placeholder={type === 'chain' ? 'bijv. Delhaize' : 'bijv. Delhaize Antwerpen-Centraal'}
              required
            />
            {centralMatch && (
              <div style={styles.centralWarning}>
                <strong>"{centralMatch.name}"</strong> staat al in de centrale bibliotheek en is beschikbaar voor jouw organisatie.
              </div>
            )}
          </div>

          {/* Adres — alleen bij type 'store' */}
          {type === 'store' && (
            <>
              <div style={styles.fieldRow}>
                <div style={{ ...styles.field, flex: 2 }}>
                  <label style={styles.label}>Straat</label>
                  <input type="text" value={street} onChange={e => setStreet(e.target.value)}
                    style={styles.input} placeholder="Kerkstraat" required />
                </div>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Nr.</label>
                  <input type="text" value={houseNumber} onChange={e => setHouseNumber(e.target.value)}
                    style={styles.input} placeholder="12" required />
                </div>
              </div>
              <div style={styles.fieldRow}>
                <div style={{ ...styles.field, flex: 1 }}>
                  <label style={styles.label}>Postcode</label>
                  <input type="text" value={postalCode} onChange={e => setPostalCode(e.target.value)}
                    style={styles.input} placeholder="2000" required />
                </div>
                <div style={{ ...styles.field, flex: 2 }}>
                  <label style={styles.label}>Gemeente</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)}
                    style={styles.input} placeholder="Antwerpen" required />
                </div>
              </div>
            </>
          )}

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

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], StoreLibrary);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.9rem', color: '#4CAF50', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600' },
  title: { fontSize: '1.2rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  addButton: { padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  filterRow: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  filterChip: { padding: '0.35rem 0.875rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '20px', fontSize: '0.82rem', fontWeight: '600', color: '#888', cursor: 'pointer' },
  filterChipActive: { backgroundColor: '#1a1a1a', color: '#fff' },
  searchInput: { width: '100%', padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', marginBottom: '1.25rem', backgroundColor: '#fff', boxSizing: 'border-box' },
  storeList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem' },
  cardLogoWrapper: { flexShrink: 0, width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontSize: '1rem', fontWeight: '600', color: '#1a1a1a', margin: 0 },
  cardAddress: { fontSize: '0.78rem', color: '#999', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardActions: { display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 },
  editButton: { padding: '0.35rem 0.75rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  deleteButton: { padding: '0.35rem 0.75rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  typeBadge: { fontSize: '0.72rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '20px', whiteSpace: 'nowrap' },
  typeBadgeChain: { backgroundColor: '#E8F5E9', color: '#2E7D32' },
  typeBadgeStore: { backgroundColor: '#E3F2FD', color: '#1565C0' },
  centralBadge: { fontSize: '0.7rem', fontWeight: '700', color: '#1565C0', backgroundColor: '#E3F2FD', padding: '0.15rem 0.5rem', borderRadius: '20px', whiteSpace: 'nowrap' },
  centered: { display: 'flex', justifyContent: 'center', paddingTop: '3rem' },
  hint: { color: '#aaa', fontSize: '0.95rem', margin: 0 },
  // Modal
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '1.1rem', color: '#aaa', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  fieldRow: { display: 'flex', gap: '0.75rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  fieldHint: { fontSize: '0.775rem', color: '#aaa', margin: 0 },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', backgroundColor: '#fff', width: '100%', boxSizing: 'border-box' },
  toggleRow: { display: 'flex', gap: '0.5rem' },
  toggleButton: { flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #ddd', backgroundColor: '#fff', fontSize: '0.9rem', fontWeight: '600', color: '#666', cursor: 'pointer' },
  toggleActive: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50', color: '#2E7D32' },
  imageUploadArea: { width: '100%', height: '140px', borderRadius: '12px', border: '2px dashed #ddd', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' },
  logoPreview: { width: '100%', height: '100%', objectFit: 'contain' },
  imagePlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' },
  imageUploadHint: { fontSize: '0.85rem', color: '#aaa' },
  centralWarning: { fontSize: '0.8rem', color: '#1565C0', backgroundColor: '#E3F2FD', padding: '0.6rem 0.8rem', borderRadius: '8px', lineHeight: 1.4, marginTop: '0.25rem' },
  errorText: { color: '#c62828', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#FFEBEE', borderRadius: '8px' },
  saveButton: { padding: '0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: '0.5rem' },
};
