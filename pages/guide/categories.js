/**
 * pages/guide/categories.js — Winkel Simpel
 *
 * Categoriebeheer voor begeleiders en org-admins.
 * Categorieën krijgen een naam en een pictogram via ARASAAC of eigen upload.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { CategoryFactory, StorageFactory } from '../../lib/dbSchema';

const ARASAAC_BASE = 'https://static.arasaac.org/pictograms';
const ARASAAC_API = 'https://api.arasaac.org/v1/pictograms';

function arasaacImageUrl(id) {
  return `${ARASAAC_BASE}/${id}/${id}_500.png`;
}

function CategoryIcon({ iconUrl, size = 56 }) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return (
      <div style={{ width: size, height: size, borderRadius: 10, backgroundColor: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="#ccc" strokeWidth="1.5"/>
          <circle cx="8.5" cy="8.5" r="1.5" fill="#ccc"/>
          <path d="M21 15l-5-5L5 21" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    );
  }
  return (
    <img
      src={iconUrl}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: 10, backgroundColor: '#f9f9f9', flexShrink: 0 }}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

function CategoriesPage({ claims }) {
  const router = useRouter();
  const { orgId } = claims;

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    loadCategories();
  }, [orgId]);

  async function loadCategories() {
    setLoading(true);
    try {
      const snap = await CategoryFactory.getAll(orgId);
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(category) {
    if (!confirm(`Categorie "${category.name}" verwijderen?`)) return;
    try {
      await CategoryFactory.delete(orgId, category.id);
      if (category.iconUrl && category.iconUrl.includes('firebasestorage')) {
        await StorageFactory.deleteByUrl(category.iconUrl).catch(() => {});
      }
      setCategories(prev => prev.filter(c => c.id !== category.id));
    } catch (err) {
      console.error('Failed to delete category:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Categorieën</h1>
        <button style={styles.addButton} onClick={() => { setEditingCategory(null); setShowForm(true); }}>
          + Nieuw
        </button>
      </div>

      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : categories.length === 0 ? (
        <div style={styles.centered}>
          <p style={styles.hint}>Nog geen categorieën. Voeg er een toe!</p>
        </div>
      ) : (
        <div style={styles.categoryList}>
          {categories.map(cat => (
            <div key={cat.id} style={styles.card}>
              <CategoryIcon iconUrl={cat.iconUrl} size={56} />
              <div style={styles.cardBody}>
                <p style={styles.cardName}>{cat.name}</p>
              </div>
              <div style={styles.cardActions}>
                <button style={styles.editButton} onClick={() => { setEditingCategory(cat); setShowForm(true); }}>
                  Bewerken
                </button>
                <button style={styles.deleteButton} onClick={() => handleDelete(cat)}>
                  Verwijderen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          orgId={orgId}
          category={editingCategory}
          claims={claims}
          onSave={() => { setShowForm(false); setEditingCategory(null); loadCategories(); }}
          onClose={() => { setShowForm(false); setEditingCategory(null); }}
        />
      )}
    </div>
  );
}

function CategoryForm({ orgId, category, claims, onSave, onClose }) {
  const isEditing = !!category;

  const [name, setName] = useState(category?.name || '');
  const [iconUrl, setIconUrl] = useState(category?.iconUrl || '');
  const [arasaacId, setArasaacId] = useState(category?.arasaacId || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState('');
  const fileInputRef = useRef();

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const res = await fetch(`${ARASAAC_API}/nl/search/${encodeURIComponent(term)}`);
      if (!res.ok) throw new Error('Zoeken mislukt');
      const data = await res.json();
      setSearchResults(data.slice(0, 24));
      if (data.length === 0) setSearchError('Geen pictogrammen gevonden. Probeer een ander woord.');
    } catch (err) {
      setSearchError('Zoeken mislukt. Controleer je internetverbinding.');
    } finally {
      setSearching(false);
    }
  }

  function handleSelectArasaac(pictogram) {
    const url = arasaacImageUrl(pictogram._id);
    setIconUrl(url);
    setArasaacId(pictogram._id);
    setUploadFile(null);
    setUploadPreview('');
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Kies een afbeelding.'); return; }
    setUploadFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setIconUrl('');
    setArasaacId(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Vul een naam in.'); return; }
    setSaving(true);
    setError('');

    try {
      if (isEditing) {
        let finalIconUrl = iconUrl;
        if (uploadFile) {
          finalIconUrl = await StorageFactory.uploadCategoryIcon(orgId, category.id, uploadFile);
          if (category.iconUrl && category.iconUrl.includes('firebasestorage')) {
            await StorageFactory.deleteByUrl(category.iconUrl).catch(() => {});
          }
        }
        await CategoryFactory.update(orgId, category.id, {
          name: name.trim(),
          iconUrl: finalIconUrl,
          arasaacId: arasaacId || null,
        });
      } else {
        const docRef = await CategoryFactory.create(orgId, {
          name: name.trim(),
          iconUrl: '',
          arasaacId: arasaacId || null,
          createdBy: claims.uid,
        });
        let finalIconUrl = iconUrl;
        if (uploadFile) {
          finalIconUrl = await StorageFactory.uploadCategoryIcon(orgId, docRef.id, uploadFile);
        }
        if (finalIconUrl) {
          await CategoryFactory.update(orgId, docRef.id, { iconUrl: finalIconUrl });
        }
      }
      onSave();
    } catch (err) {
      console.error('Failed to save category:', err);
      setError('Opslaan mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  const previewUrl = uploadPreview || iconUrl;

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{isEditing ? 'Categorie bewerken' : 'Nieuwe categorie'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {previewUrl && (
            <div style={styles.iconPreviewWrapper}>
              <img
                src={previewUrl}
                alt="Pictogram voorvertoning"
                style={styles.iconPreview}
                onError={e => e.target.style.display = 'none'}
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={styles.input}
              placeholder="bijv. Groenten & Fruit"
              required
            />
          </div>

          <div style={styles.section}>
            <p style={styles.sectionTitle}>Pictogram zoeken via ARASAAC</p>
            <div style={styles.searchRow}>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSearch())}
                style={{ ...styles.input, flex: 1 }}
                placeholder="bijv. fruit, melk, brood..."
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || !searchTerm.trim()}
                style={{ ...styles.searchButton, opacity: searching || !searchTerm.trim() ? 0.6 : 1 }}
              >
                {searching ? '...' : '🔍 Zoek'}
              </button>
            </div>

            {searchError && <p style={styles.searchError}>{searchError}</p>}

            {searchResults.length > 0 && (
              <div style={styles.pictogramGrid}>
                {searchResults.map(p => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => handleSelectArasaac(p)}
                    style={{
                      ...styles.pictogramItem,
                      borderColor: arasaacId === p._id ? '#4CAF50' : '#eee',
                      backgroundColor: arasaacId === p._id ? '#E8F5E9' : '#fff',
                    }}
                  >
                    <img
                      src={arasaacImageUrl(p._id)}
                      alt={p.keywords?.[0]?.keyword || ''}
                      style={styles.pictogramImg}
                      referrerPolicy="no-referrer"
                    />
                    <span style={styles.pictogramLabel}>
                      {p.keywords?.[0]?.keyword || ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <p style={styles.sectionTitle}>Of eigen afbeelding uploaden</p>
            <button
              type="button"
              onClick={() => fileInputRef.current.click()}
              style={styles.uploadButton}
            >
              📁 Kies afbeelding
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button
            type="submit"
            disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], CategoriesPage);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.9rem', color: '#4CAF50', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '600' },
  title: { fontSize: '1.2rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  addButton: { padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' },
  centered: { display: 'flex', justifyContent: 'center', paddingTop: '3rem' },
  hint: { color: '#aaa', fontSize: '0.95rem' },
  categoryList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem' },
  cardBody: { flex: 1 },
  cardName: { fontSize: '1rem', fontWeight: '600', color: '#1a1a1a', margin: 0 },
  cardActions: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  editButton: { padding: '0.35rem 0.75rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  deleteButton: { padding: '0.35rem 0.75rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '1.1rem', color: '#aaa', cursor: 'pointer', padding: '0.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  iconPreviewWrapper: { display: 'flex', justifyContent: 'center', padding: '0.5rem 0' },
  iconPreview: { width: '100px', height: '100px', objectFit: 'contain', borderRadius: '14px', border: '2px solid #E8F5E9', backgroundColor: '#f9f9f9', padding: '4px' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', backgroundColor: '#fff' },
  section: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  sectionTitle: { fontSize: '0.875rem', fontWeight: '600', color: '#444', margin: 0 },
  searchRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  searchButton: { padding: '0.75rem 1rem', backgroundColor: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  searchError: { fontSize: '0.8rem', color: '#c62828', margin: 0, backgroundColor: '#FFEBEE', padding: '0.5rem 0.75rem', borderRadius: '8px' },
  pictogramGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto', padding: '0.25rem' },
  pictogramItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', padding: '0.5rem', borderRadius: '10px', border: '2px solid', cursor: 'pointer', background: 'none' },
  pictogramImg: { width: '64px', height: '64px', objectFit: 'contain' },
  pictogramLabel: { fontSize: '0.65rem', color: '#666', textAlign: 'center', lineHeight: 1.2, maxWidth: '72px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  uploadButton: { padding: '0.75rem 1rem', backgroundColor: '#f5f5f5', color: '#444', border: '1.5px dashed #ccc', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', textAlign: 'center' },
  errorText: { color: '#c62828', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#FFEBEE', borderRadius: '8px' },
  saveButton: { padding: '0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: '0.25rem' },
};
