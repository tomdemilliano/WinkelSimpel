/**
 * pages/guide/tags.js — Winkel Simpel
 *
 * Tag management page for guides. Allows creating, editing and deleting
 * product tags (e.g. diepvries, koeling, halal). Tags are org-scoped.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { TagFactory, StorageFactory } from '../../lib/dbSchema';

function TagsPage({ claims }) {
  const router = useRouter();
  const { orgId } = claims;

  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState(null);

  useEffect(() => {
    loadTags();
  }, [orgId]);

  async function loadTags() {
    setLoading(true);
    try {
      const snap = await TagFactory.getAll(orgId);
      setTags(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(tag) {
    if (!confirm(`Tag "${tag.name}" verwijderen?`)) return;
    try {
      await TagFactory.delete(orgId, tag.id);
      if (tag.imageUrl) {
        await StorageFactory.deleteByUrl(tag.imageUrl).catch(() => {});
      }
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch (err) {
      console.error('Failed to delete tag:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide/beheer')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Tags</h1>
        <button style={styles.addButton} onClick={() => { setEditingTag(null); setShowForm(true); }}>
          + Nieuw
        </button>
      </div>

      {loading ? (
        <p style={styles.hint}>Laden...</p>
      ) : tags.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyIcon}>🏷️</p>
          <p style={styles.hint}>Nog geen tags. Voeg er een toe via de knop hierboven.</p>
        </div>
      ) : (
        <div style={styles.tagList}>
          {tags.map((tag) => (
            <div key={tag.id} style={styles.tagCard}>
              <div style={styles.tagImageWrapper}>
                {tag.imageUrl ? (
                  <img src={tag.imageUrl} alt={tag.name} style={styles.tagImage} referrerPolicy="no-referrer" />
                ) : (
                  <span style={styles.tagImagePlaceholder}>🏷️</span>
                )}
              </div>
              <div style={styles.tagBody}>
                <p style={styles.tagName}>{tag.name}</p>
              </div>
              <div style={styles.tagActions}>
                <button
                  style={styles.editIconButton}
                  onClick={() => { setEditingTag(tag); setShowForm(true); }}
                  aria-label="Bewerken"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  style={styles.deleteIconButton}
                  onClick={() => handleDelete(tag)}
                  aria-label="Verwijderen"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TagForm
          orgId={orgId}
          tag={editingTag}
          claims={claims}
          onSave={async () => {
            setShowForm(false);
            setEditingTag(null);
            await loadTags();
          }}
          onClose={() => { setShowForm(false); setEditingTag(null); }}
        />
      )}
    </div>
  );
}

function TagForm({ orgId, tag, claims, onSave, onClose }) {
  const isEditing = !!tag;
  const [name, setName] = useState(tag?.name || '');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(tag?.imageUrl || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef();

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Kies een afbeelding (jpg, png, webp).');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Vul een tagnaam in.'); return; }

    setSaving(true);
    setError('');
    try {
      if (isEditing) {
        let imageUrl = tag.imageUrl;
        if (imageFile) {
          imageUrl = await StorageFactory.uploadTagImage(orgId, tag.id, imageFile);
          if (tag.imageUrl) await StorageFactory.deleteByUrl(tag.imageUrl).catch(() => {});
        }
        await TagFactory.update(orgId, tag.id, { name: name.trim(), imageUrl });
      } else {
        const docRef = await TagFactory.create(orgId, { name: name.trim(), imageUrl: null, createdBy: claims.uid });
        if (imageFile) {
          const imageUrl = await StorageFactory.uploadTagImage(orgId, docRef.id, imageFile);
          await TagFactory.update(orgId, docRef.id, { imageUrl });
        }
      }
      await onSave();
    } catch (err) {
      console.error('Failed to save tag:', err);
      setError('Opslaan mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{isEditing ? 'Tag bewerken' : 'Nieuwe tag'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Image upload */}
          <div style={styles.imageUploadArea} onClick={() => fileInputRef.current.click()}>
            {imagePreview ? (
              <img src={imagePreview} alt="Voorvertoning" style={styles.imagePreview} referrerPolicy="no-referrer" />
            ) : (
              <div style={styles.imagePlaceholder}>
                <span style={{ fontSize: '2.5rem' }}>🏷️</span>
                <span style={styles.imageUploadHint}>Tik om een afbeelding te kiezen (optioneel)</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="bijv. Diepvries"
              required
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

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], TagsPage);

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#F4F8FC', fontFamily: "'Nunito', system-ui, sans-serif", padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#5B9BD5', margin: '-1.5rem -1.5rem 1.5rem -1.5rem', padding: '1.25rem 1.5rem' },
  backButton: { background: 'none', border: 'none', fontSize: '0.9rem', color: '#fff', cursor: 'pointer', padding: '0.25rem 0', fontWeight: '700', fontFamily: 'inherit' },
  title: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', margin: 0 },
  addButton: { padding: '0.45rem 1rem', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: '20px', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },
  hint: { color: '#aaa', fontSize: '0.95rem', margin: 0 },
  emptyState: { textAlign: 'center', paddingTop: '3rem' },
  emptyIcon: { fontSize: '3rem', margin: '0 0 0.5rem' },
  tagList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  tagCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem' },
  tagImageWrapper: { width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tagImage: { width: '100%', height: '100%', objectFit: 'contain' },
  tagImagePlaceholder: { fontSize: '1.75rem' },
  tagBody: { flex: 1, minWidth: 0 },
  tagName: { fontSize: '1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  tagActions: { display: 'flex', flexDirection: 'column', gap: '0.4rem', flexShrink: 0 },
  editIconButton: { width: '34px', height: '34px', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  deleteIconButton: { width: '34px', height: '34px', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '1.1rem', color: '#aaa', cursor: 'pointer', padding: '0.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  imageUploadArea: { width: '100%', height: '160px', borderRadius: '12px', border: '2px dashed #ddd', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%', objectFit: 'contain' },
  imagePlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' },
  imageUploadHint: { fontSize: '0.85rem', color: '#aaa' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', backgroundColor: '#fff' },
  errorText: { color: '#c62828', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#FFEBEE', borderRadius: '8px' },
  saveButton: { padding: '0.875rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.5rem', fontFamily: 'inherit' },
};
