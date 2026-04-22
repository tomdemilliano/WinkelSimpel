/**
 * pages/guide/library.js — Winkel Simpel
 *
 * Product library for guides. Allows creating, editing and deleting products.
 * Each product has a name, image (uploaded to Firebase Storage) and unit.
 * Products are scoped to the guide's organization.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../lib/auth';
import { ProductFactory, StorageFactory } from '../../lib/dbSchema';

// ---------------------------------------------------------------------------
// ProductImage — toont afbeelding of standaard winkeltas icon
// ---------------------------------------------------------------------------
function ProductImage({ url, alt, style, placeholderSize = '1.75rem' }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <svg width={placeholderSize === '1.75rem' ? 28 : 40} height={placeholderSize === '1.75rem' ? 28 : 40} viewBox="0 0 24 24" fill="none">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt || ''}
      style={style}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
    />
  );
}


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function ProductLibrary({ claims }) {
  const router = useRouter();
  const { orgId } = claims;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null = new product
  const [searchQuery, setSearchQuery] = useState('');

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, [orgId]);

  async function loadProducts() {
    setLoading(true);
    try {
      const snap = await ProductFactory.getAll(orgId);
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(product) {
    setEditingProduct(product);
    setShowForm(true);
  }

  function handleNew() {
    setEditingProduct(null);
    setShowForm(true);
  }

  async function handleDelete(product) {
    if (!confirm(`"${product.name}" verwijderen?`)) return;
    try {
      await ProductFactory.delete(orgId, product.id);
      if (product.imageUrl) {
        await StorageFactory.deleteByUrl(product.imageUrl).catch(() => {});
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      console.error('Failed to delete product:', err);
      alert('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingProduct(null);
  }

  async function handleFormSave(savedProduct) {
    setShowForm(false);
    setEditingProduct(null);
    await loadProducts();
  }

  // Filter products by search query
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.title}>Productbibliotheek</h1>
        <button style={styles.addButton} onClick={handleNew}>
          + Nieuw
        </button>
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Zoeken..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        style={styles.searchInput}
      />

      {/* Product list */}
      {loading ? (
        <div style={styles.centered}>
          <p style={styles.hint}>Laden...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={styles.centered}>
          <p style={styles.hint}>
            {searchQuery ? 'Geen producten gevonden.' : 'Nog geen producten. Voeg er een toe!'}
          </p>
        </div>
      ) : (
        <div style={styles.productGrid}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => handleEdit(product)}
              onDelete={() => handleDelete(product)}
            />
          ))}
        </div>
      )}

      {/* Product form modal */}
      {showForm && (
        <ProductForm
          orgId={orgId}
          product={editingProduct}
          onSave={handleFormSave}
          onClose={handleFormClose}
          claims={claims}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------
function ProductCard({ product, onEdit, onDelete }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardImageWrapper}>
        <ProductImage url={product.imageUrl} alt={product.name} style={styles.cardImage} />
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{product.name}</p>
        <p style={styles.cardUnit}>{product.unit}</p>
      </div>
      <div style={styles.cardActions}>
        <button style={styles.editButton} onClick={onEdit}>Bewerken</button>
        <button style={styles.deleteButton} onClick={onDelete}>Verwijderen</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductForm (modal)
// ---------------------------------------------------------------------------
function ProductForm({ orgId, product, onSave, onClose, claims }) {
  const isEditing = !!product;

  const [name, setName] = useState(product?.name || '');
  const [unit, setUnit] = useState(product?.unit || 'stuks');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.imageUrl || null);
  const [importedImageUrl, setImportedImageUrl] = useState(product?.imageUrl || '');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef();

  async function handleImport(isBarcode = false) {
    const value = importUrl.trim();
    if (!value) return;
    setImporting(true);
    setError('');
    try {
      const body = isBarcode ? { barcode: value } : { url: value };
      const res = await fetch('/api/import-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); setImporting(false); return; }
      if (data.hint) { setError(data.hint); }
      if (data.name) setName(data.name);
      if (data.imageUrl) {
        setImportedImageUrl(data.imageUrl);
        setImagePreview(data.imageUrl);
        setImageFile(null);
      }
      setImportUrl('');
    } catch (err) {
      setError('Import mislukt: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

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
    if (!name.trim()) {
      setError('Vul een productnaam in.');
      return;
    }
    // Image is optional — a placeholder icon will be shown if no image is provided

    setSaving(true);
    setError('');

    try {
      if (isEditing) {
        // Update existing product
        let imageUrl = product.imageUrl;

        if (imageFile) {
          // Upload new image, delete old one
          imageUrl = await StorageFactory.uploadProductImage(orgId, product.id, imageFile);
          if (product.imageUrl) {
            await StorageFactory.deleteByUrl(product.imageUrl).catch(() => {});
          }
        }

        await ProductFactory.update(orgId, product.id, { name: name.trim(), unit, imageUrl });
        onSave({ id: product.id, name: name.trim(), unit, imageUrl });
      } else {
        // Create new product
        if (imageFile) {
          // Upload image if provided
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: '',
            unit,
            createdBy: claims.uid,
          });
          const imageUrl = await StorageFactory.uploadProductImage(orgId, docRef.id, imageFile);
          await ProductFactory.update(orgId, docRef.id, { imageUrl });
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl });
        } else if (importedImageUrl) {
          // Use imported URL directly — no upload needed
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: importedImageUrl,
            unit,
            createdBy: claims.uid,
          });
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl: importedImageUrl });
        } else {
          // No image — save with empty imageUrl
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: '',
            unit,
            createdBy: claims.uid,
          });
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl: '' });
        }
      }
    } catch (err) {
      console.error('Failed to save product:', err);
      setError('Opslaan mislukt. Probeer opnieuw.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {isEditing ? 'Product bewerken' : 'Nieuw product'}
          </h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>

          {/* URL / barcode import */}
          <div style={styles.importSection}>
            <label style={styles.label}>Importeren vanuit webshop of barcode (optioneel)</label>
            <div style={styles.importRow}>
              <input
                type="text"
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                style={{ ...styles.input, flex: 1, fontSize: '0.85rem' }}
                placeholder="URL of barcode (bv. 5410002050042)"
              />
              <button
                type="button"
                onClick={() => {
                  const isBarcode = /^\d{8,14}$/.test(importUrl.trim());
                  handleImport(isBarcode);
                }}
                disabled={importing || !importUrl.trim()}
                style={{ ...styles.importButton, opacity: importing || !importUrl.trim() ? 0.6 : 1 }}
              >
                {importing ? '...' : '↓ Ophalen'}
              </button>
            </div>
            <p style={styles.importHint}>
              Plak een productlink (Delhaize, Colruyt, Albert Heijn, ...) of scan/typ de barcode van het product.
            </p>
          </div>

          {/* Image upload */}
          <div style={styles.imageUploadArea} onClick={() => fileInputRef.current.click()}>
            {imagePreview ? (
              <img src={imagePreview} alt="Voorvertoning" style={styles.imagePreview} onError={(e) => { e.target.style.display='none'; }} referrerPolicy="no-referrer" />
            ) : (
              <div style={styles.imagePlaceholder}>
                <span style={{ fontSize: '2.5rem' }}>📷</span>
                <span style={styles.imageUploadHint}>Tik om een foto te kiezen (optioneel)</span>
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

          {/* Manual image URL */}
          <div style={styles.field}>
            <label style={styles.label}>Of plak een afbeelding-URL</label>
            <div style={styles.importRow}>
              <input
                type="url"
                value={manualImageUrl}
                onChange={e => setManualImageUrl(e.target.value)}
                style={{ ...styles.input, flex: 1, fontSize: '0.85rem' }}
                placeholder="https://..."
              />
              <button
                type="button"
                disabled={!manualImageUrl.trim()}
                style={{ ...styles.importButton, opacity: !manualImageUrl.trim() ? 0.6 : 1 }}
                onClick={() => {
                  setImportedImageUrl(manualImageUrl.trim());
                  setImagePreview(manualImageUrl.trim());
                  setImageFile(null);
                  setManualImageUrl('');
                }}
              >
                ↓ Gebruik
              </button>
            </div>
          </div>

          {/* Name */}
          <div style={styles.field}>
            <label style={styles.label}>Productnaam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="bijv. Melk"
              required
            />
          </div>

          {/* Unit */}
          <div style={styles.field}>
            <label style={styles.label}>Eenheid</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={styles.input}
            >
              <option value="stuks">stuks</option>
              <option value="pak">pak</option>
              <option value="fles">fles</option>
              <option value="blik">blik</option>
              <option value="zak">zak</option>
              <option value="doos">doos</option>
              <option value="pot">pot</option>
              <option value="kg">kg</option>
            </select>
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

export default withRoleGuard(ROLES.GUIDE, ProductLibrary);

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
    marginBottom: '1.25rem',
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
  searchInput: {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #ddd',
    fontSize: '1rem',
    marginBottom: '1.25rem',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  productGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
  },
  cardImageWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '8px',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardImagePlaceholder: {
    fontSize: '1.75rem',
  },
  cardBody: {
    flex: 1,
  },
  cardName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 0.2rem',
  },
  cardUnit: {
    fontSize: '0.8rem',
    color: '#999',
    margin: 0,
  },
  cardActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  editButton: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  deleteButton: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#FFEBEE',
    color: '#c62828',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '600',
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
    padding: '0.25rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  imageUploadArea: {
    width: '100%',
    height: '180px',
    borderRadius: '12px',
    border: '2px dashed #ddd',
    backgroundColor: '#fafafa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  },
  importSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  importRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  importButton: {
    padding: '0.75rem 0.875rem',
    backgroundColor: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.85rem',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  importHint: {
    fontSize: '0.775rem',
    color: '#aaa',
    margin: 0,
  },
  imageUploadHint: {
    fontSize: '0.85rem',
    color: '#aaa',
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
