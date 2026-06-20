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
import { ProductFactory, StorageFactory, CentralProductFactory, ProductSubmissionFactory, CategoryFactory, CentralCategoryFactory, TagFactory } from '../../lib/dbSchema';

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
    />
  );
}


// ---------------------------------------------------------------------------
// Fuzzy match — zelfde logica als in de ProductPicker
// ---------------------------------------------------------------------------
function fuzzyScore(needle, haystack) {
  if (!needle) return 0;
  const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = normalize(needle);
  const h = normalize(haystack);
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  const needleWords = n.split(/\s+/).filter(Boolean);
  const haystackWords = h.split(/[\s/,()\-]+/).filter(Boolean);
  if (!needleWords.every(nw => haystackWords.some(hw => hw.includes(nw)))) return 0;
  return needleWords.every(nw => haystackWords.some(hw => hw.startsWith(nw))) ? 40 : 20;
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState(null);
  const [centralProducts, setCentralProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [centralCategories, setCentralCategories] = useState([]);
  const [tags, setTags] = useState([]);

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, [orgId]);

  async function loadProducts() {
    setLoading(true);
    try {
      const [orgSnap, centralSnap, catSnap, centralCatSnap, tagSnap] = await Promise.all([
        ProductFactory.getAll(orgId),
        CentralProductFactory.getAll(),
        CategoryFactory.getAll(orgId),
        CentralCategoryFactory.getAll(),
        TagFactory.getAll(orgId),
      ]);
      setProducts(orgSnap.docs.map((d) => ({ id: d.id, ...d.data(), _source: 'org' })));
      setCentralProducts(centralSnap.docs.map((d) => ({ id: d.id, ...d.data(), _source: 'central' })));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCentralCategories(centralCatSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTags(tagSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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

  async function handleCopyFromCentral(centralProduct) {
    try {
      await ProductFactory.create(orgId, {
        name: centralProduct.name,
        imageUrl: centralProduct.imageUrl,
        unit: centralProduct.unit,
        categoryId: null,
        centralProductId: centralProduct.id,
        createdBy: claims.uid,
      });
      await loadProducts();
    } catch (err) {
      console.error('Failed to copy product:', err);
      alert('Kopiëren mislukt. Probeer opnieuw.');
    }
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

  // Deduplicatie: org-producten met centralProductId verbergen het centrale product.
  // Fallback op naam voor bestaande org-producten zonder expliciete koppeling.
  const explicitLinkedIds = new Set(
    products.filter(p => p.centralProductId).map(p => p.centralProductId)
  );
  const orgNamesWithoutLink = new Set(
    products.filter(p => !p.centralProductId).map(p => p.name.toLowerCase().trim())
  );
  const unlinkedCentralProducts = centralProducts.filter(
    c => !explicitLinkedIds.has(c.id) && !orgNamesWithoutLink.has(c.name.toLowerCase().trim())
  );
  const allProducts = [
    ...products.map(p => ({
      ...p,
      _source: 'org',
      _centralProduct: p.centralProductId
        ? centralProducts.find(c => c.id === p.centralProductId) || null
        : centralProducts.find(c => c.name.toLowerCase().trim() === p.name.toLowerCase().trim()) || null,
    })),
    ...unlinkedCentralProducts.map(c => ({ ...c, _source: 'central' })),
  ];

  // Bouw een unieke categorielijst voor het zijpaneel
  const usedCategoryKeys = new Set();
  const sidebarCategories = [];
  allProducts.forEach(p => {
    const key = p._source === 'central' && p.centralCategoryId
      ? `central:${p.centralCategoryId}`
      : p._source === 'org' && p.categoryId
        ? `org:${p.categoryId}`
        : null;
    if (!key || usedCategoryKeys.has(key)) return;
    const cat = p._source === 'central'
      ? centralCategories.find(c => c.id === p.centralCategoryId)
      : categories.find(c => c.id === p.categoryId);
    if (cat) {
      usedCategoryKeys.add(key);
      sidebarCategories.push({ ...cat, _key: key });
    }
  });
  sidebarCategories.sort((a, b) => a.name.localeCompare(b.name, 'nl'));

  const filteredProducts = (() => {
    const withScore = allProducts.map((p) => {
      const cat = p._source === 'central'
        ? centralCategories.find(c => c.id === p.centralCategoryId)
        : categories.find(c => c.id === p.categoryId);
      const score = searchQuery
        ? Math.max(fuzzyScore(searchQuery, p.name), cat ? fuzzyScore(searchQuery, cat.name) : 0)
        : 0;
      return { ...p, _score: score };
    });
    return withScore
      .filter((p) => {
        if (searchQuery && p._score === 0) return false;
        if (!selectedCategoryKey) return true;
        const [src, catId] = selectedCategoryKey.split(':');
        if (src === 'org') return p._source === 'org' && p.categoryId === catId;
        if (src === 'central') return p._source === 'central' && p.centralCategoryId === catId;
        return true;
      })
      .sort((a, b) => searchQuery ? b._score - a._score : 0);
  })();

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

      {/* Search + sidebar toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        {sidebarCategories.length > 0 && (
          <button
            onClick={() => setSidebarOpen(prev => !prev)}
            style={{ ...styles.sidebarToggleBtn, ...(sidebarOpen ? styles.sidebarToggleBtnActive : {}) }}
            title={sidebarOpen ? 'Categorieën verbergen' : 'Filteren op categorie'}
          >
            <svg width="22" height="22" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="8" width="20" height="17" rx="4" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2"/>
              <rect x="28" y="8" width="20" height="17" rx="4" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
              <rect x="4" y="29" width="20" height="15" rx="4" fill="#EBF4FF" stroke="#5B9BD5" strokeWidth="2"/>
              <rect x="28" y="29" width="20" height="15" rx="4" fill="#D0E8FA" stroke="#5B9BD5" strokeWidth="2"/>
              <circle cx="14" cy="16" r="3.5" fill="#5B9BD5"/>
              <circle cx="38" cy="16" r="3.5" fill="#5B9BD5" opacity="0.5"/>
              <circle cx="14" cy="36" r="3.5" fill="#5B9BD5" opacity="0.5"/>
              <circle cx="38" cy="36" r="3.5" fill="#5B9BD5"/>
            </svg>
          </button>
        )}
        <input
          type="search"
          placeholder="Zoeken op naam of categorie..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ ...styles.searchInput, marginBottom: 0, flex: 1, width: 'auto' }}
        />
      </div>

      {/* Product list */}
      {loading ? (
        <div style={{ ...styles.centered, flex: 1 }}>
          <p style={styles.hint}>Laden...</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, overflow: 'hidden' }}>
          {/* Zijpaneel categorieën */}
          {sidebarOpen && sidebarCategories.length > 0 && (
            <div style={{ ...styles.sidebar, overflowY: 'auto' }}>
              <button
                style={{ ...styles.sidebarItem, ...(selectedCategoryKey === null ? styles.sidebarItemActive : {}) }}
                onClick={() => setSelectedCategoryKey(null)}
              >
                <span style={styles.sidebarItemLabel}>Alle</span>
              </button>
              {sidebarCategories.map(cat => (
                <button
                  key={cat._key}
                  style={{ ...styles.sidebarItem, ...(selectedCategoryKey === cat._key ? styles.sidebarItemActive : {}) }}
                  onClick={() => setSelectedCategoryKey(selectedCategoryKey === cat._key ? null : cat._key)}
                >
                  {cat.iconUrl
                    ? <img src={cat.iconUrl} alt="" style={styles.sidebarItemIcon} referrerPolicy="no-referrer" />
                    : <span style={{ fontSize: '1rem', flexShrink: 0 }}>🏷️</span>
                  }
                  <span style={styles.sidebarItemLabel}>{cat.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Producten */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', paddingBottom: '1.5rem' }}>
            {!loading && filteredProducts.length > 0 && (
              <p style={styles.productCount}>
                {(searchQuery || selectedCategoryKey)
                  ? `${filteredProducts.length} van ${allProducts.length} producten`
                  : `${allProducts.length} ${allProducts.length === 1 ? 'product' : 'producten'}`
                }
              </p>
            )}
            {filteredProducts.length === 0 ? (
              <div style={styles.centered}>
                <p style={styles.hint}>
                  {searchQuery || selectedCategoryKey ? 'Geen producten gevonden.' : 'Nog geen producten. Voeg er een toe!'}
                </p>
              </div>
            ) : (
              <div style={styles.productGrid}>
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={`${product._source}-${product.id}`}
                    product={product}
                    category={
                      product._source === 'central'
                        ? (centralCategories.find(c => c.id === product.centralCategoryId) || null)
                        : (categories.find(c => c.id === product.categoryId) || null)
                    }
                    productTags={product._source === 'org' ? (product.tagIds || []).map(id => tags.find(t => t.id === id)).filter(Boolean) : []}
                    onEdit={() => handleEdit(product)}
                    onDelete={() => handleDelete(product)}
                    onCopy={() => handleCopyFromCentral(product)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product form modal */}
      {showForm && (
        <ProductForm
          orgId={orgId}
          product={editingProduct}
          categories={categories}
          tags={tags}
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
function ProductCard({ product, category, productTags = [], onEdit, onDelete, onCopy }) {
  const isCentral = product._source === 'central';
  const isLinkedToCentral = product._source === 'org' && !!product._centralProduct;
  return (
    <div style={styles.card}>
      <div style={styles.cardImageWrapper}>
        <ProductImage url={product.imageUrl} alt={product.name} style={styles.cardImage} />
      </div>
      <div style={styles.cardBody}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <p style={styles.cardName}>{product.name}</p>
          {(isCentral || isLinkedToCentral) && (
            <span style={styles.centralBadge}>Centraal</span>
          )}
        </div>
        <p style={styles.cardUnit}>{product.unit}</p>
        {category && (
          <div style={styles.categoryBadge}>
            {category.iconUrl && (
              <img src={category.iconUrl} alt="" style={styles.categoryBadgeIcon} referrerPolicy="no-referrer" />
            )}
            <span style={styles.categoryBadgeLabel}>{category.name}</span>
          </div>
        )}
        {productTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
            {productTags.map(tag => (
              <span key={tag.id} style={styles.tagChip}>
                {tag.imageUrl && <img src={tag.imageUrl} alt="" style={styles.tagChipIcon} referrerPolicy="no-referrer" />}
                <span>{tag.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={styles.cardActions}>
        {!isCentral && (
          <button style={styles.editIconButton} onClick={onEdit} aria-label="Bewerken">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
        {!isCentral && (
          <button style={styles.deleteIconButton} onClick={onDelete} aria-label="Verwijderen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
        {isCentral && (
          <button style={styles.copyIconButton} onClick={onCopy} aria-label="Kopiëren naar mijn bibliotheek">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        )}
        {isCentral && <span style={{ fontSize: '0.65rem', color: '#aaa', textAlign: 'center' }}>Lees-only</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductForm (modal)
// ---------------------------------------------------------------------------
function ProductForm({ orgId, product, categories, tags, onSave, onClose, claims }) {
  const isEditing = !!product;

  const [name, setName] = useState(product?.name || '');
  const [unit, setUnit] = useState(product?.unit || 'stuks');
  const [categoryId, setCategoryId] = useState(product?.categoryId || '');
  const [tagIds, setTagIds] = useState(product?.tagIds || []);
  const [imageFile, setImageFile] = useState(null);
  // imagePreview toont altijd de meest recente afbeelding (upload, import of bestaande URL)
  const [imagePreview, setImagePreview] = useState(product?.imageUrl || null);
  const [importedImageUrl, setImportedImageUrl] = useState(product?.imageUrl || '');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [centralMatch, setCentralMatch] = useState(null); // central product met zelfde naam
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

  // Dien product in bij admin voor centrale library (transparant voor gebruiker)
  async function submitToCentral(orgProductId, name, imageUrl, unit) {
    // Niet indienen als het al in de centrale library staat
    if (centralMatch) return;
    const selectedCategory = categories.find(c => c.id === categoryId) || null;
    try {
      await ProductSubmissionFactory.create({
        name, imageUrl, unit, orgId, orgProductId,
        orgCategoryId: categoryId || null,
        orgCategoryName: selectedCategory?.name || null,
        orgCategoryIconUrl: selectedCategory?.iconUrl || null,
        orgCategoryColor: selectedCategory?.color || null,
        orgCategoryCentralId: selectedCategory?.centralCategoryId || null,
      });
    } catch (err) {
      console.error('Submission to central failed:', err.message, err);
    }
  }

  // Check of naam al in centrale library bestaat
  async function checkCentralName(value) {
    if (!value.trim() || value.trim().length < 3) { setCentralMatch(null); return; }
    try {
      const snap = await CentralProductFactory.getByName(value.trim());
      setCentralMatch(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch { setCentralMatch(null); }
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

  function toggleTag(tagId) {
    setTagIds(prev => {
      if (prev.includes(tagId)) return prev.filter(id => id !== tagId);
      if (prev.length >= 3) return prev;
      return [...prev, tagId];
    });
  }

  function moveTag(index, direction) {
    setTagIds(prev => {
      const next = [...prev];
      const swapIdx = index + direction;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
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
          // Nieuwe afbeelding geüpload — upload naar Storage
          imageUrl = await StorageFactory.uploadProductImage(orgId, product.id, imageFile);
          if (product.imageUrl && product.imageUrl.includes('firebasestorage')) {
            await StorageFactory.deleteByUrl(product.imageUrl).catch(() => {});
          }
        } else if (importedImageUrl && importedImageUrl !== product.imageUrl) {
          // Nieuwe URL ingevoerd via import of handmatig URL-veld
          imageUrl = importedImageUrl;
        }

        await ProductFactory.update(orgId, product.id, { name: name.trim(), unit, imageUrl, categoryId: categoryId || null, tagIds });
        onSave({ id: product.id, name: name.trim(), unit, imageUrl, categoryId: categoryId || null, tagIds });
      } else {
        // Create new product
        const catId = categoryId || null;
        if (imageFile) {
          // Upload image if provided
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: '',
            unit,
            categoryId: catId,
            tagIds,
            createdBy: claims.uid,
          });
          const imageUrl = await StorageFactory.uploadProductImage(orgId, docRef.id, imageFile);
          await ProductFactory.update(orgId, docRef.id, { imageUrl });
          await submitToCentral(docRef.id, name.trim(), imageUrl, unit);
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl, categoryId: catId, tagIds });
        } else if (importedImageUrl?.trim()) {
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: importedImageUrl.trim(),
            unit,
            categoryId: catId,
            tagIds,
            createdBy: claims.uid,
          });
          await submitToCentral(docRef.id, name.trim(), importedImageUrl.trim(), unit);
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl: importedImageUrl.trim(), categoryId: catId, tagIds });
        } else {
          const docRef = await ProductFactory.create(orgId, {
            name: name.trim(),
            imageUrl: '',
            unit,
            categoryId: catId,
            tagIds,
            createdBy: claims.uid,
          });
          await submitToCentral(docRef.id, name.trim(), '', unit);
          onSave({ id: docRef.id, name: name.trim(), unit, imageUrl: '', categoryId: catId, tagIds });
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
              onChange={(e) => { setName(e.target.value); checkCentralName(e.target.value); }}
              style={styles.input}
              placeholder="bijv. Melk"
              required
            />
            {centralMatch && (
              <div style={styles.centralWarning}>
                <strong>"{centralMatch.name}"</strong> staat al in de centrale bibliotheek en is beschikbaar voor jouw organisatie. Je kan dit product toch apart opslaan als je een eigen versie wil bijhouden.
              </div>
            )}
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

          {/* Categorie */}
          <div style={styles.field}>
            <label style={styles.label}>Categorie (optioneel)</label>
            {categories.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#aaa', margin: 0 }}>
                Nog geen categorieën aangemaakt. Ga naar <strong>Categorieën</strong> in het dashboard.
              </p>
            ) : (
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                style={styles.input}
              >
                <option value="">— Geen categorie —</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div style={styles.field}>
              <label style={styles.label}>Tags (optioneel, max. 3)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {tags.map(tag => {
                  const isSelected = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.35rem 0.65rem', borderRadius: '20px',
                        border: `1.5px solid ${isSelected ? '#5B9BD5' : '#ddd'}`,
                        backgroundColor: isSelected ? '#EBF4FF' : '#f9f9f9',
                        color: isSelected ? '#1565C0' : '#555',
                        fontSize: '0.82rem', fontWeight: '600',
                        cursor: tagIds.length >= 3 && !isSelected ? 'not-allowed' : 'pointer',
                        opacity: tagIds.length >= 3 && !isSelected ? 0.45 : 1,
                        fontFamily: 'inherit',
                      }}
                    >
                      {tag.imageUrl && <img src={tag.imageUrl} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} referrerPolicy="no-referrer" />}
                      {tag.name}
                      {isSelected && <span style={{ fontWeight: '700' }}>✓</span>}
                    </button>
                  );
                })}
              </div>
              {/* Volgorde van geselecteerde tags */}
              {tagIds.length > 1 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 0.3rem' }}>Volgorde (gebruik pijlen om te wijzigen):</p>
                  {tagIds.map((id, idx) => {
                    const tag = tags.find(t => t.id === id);
                    if (!tag) return null;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#444', flex: 1 }}>
                          {idx + 1}. {tag.name}
                        </span>
                        <button type="button" onClick={() => moveTag(idx, -1)} disabled={idx === 0}
                          style={{ padding: '0.1rem 0.4rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f5f5f5', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                        <button type="button" onClick={() => moveTag(idx, 1)} disabled={idx === tagIds.length - 1}
                          style={{ padding: '0.1rem 0.4rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f5f5f5', cursor: idx === tagIds.length - 1 ? 'default' : 'pointer', opacity: idx === tagIds.length - 1 ? 0.3 : 1 }}>↓</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], ProductLibrary);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#F4F8FC',
    fontFamily: "'Nunito', system-ui, sans-serif",
    padding: '1.5rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#5B9BD5',
    margin: '-1.5rem -1.5rem 1.25rem -1.5rem',
    padding: '1.25rem 1.5rem',
  },
  backButton: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    color: '#fff',
    cursor: 'pointer',
    padding: '0.25rem 0',
    fontWeight: '700',
    fontFamily: 'inherit',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: '800',
    color: '#fff',
    margin: 0,
  },
  addButton: {
    padding: '0.45rem 1rem',
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: '#fff',
    border: '1.5px solid rgba(255,255,255,0.5)',
    borderRadius: '20px',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
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
    minWidth: 0,
  },
  cardName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: '0 0 0.2rem',
    wordBreak: 'break-word',
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
    flexShrink: 0,
    alignItems: 'center',
  },
  editIconButton: {
    width: '34px',
    height: '34px',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  centralWarning: {
    fontSize: '0.8rem',
    color: '#1565C0',
    backgroundColor: '#E3F2FD',
    padding: '0.6rem 0.8rem',
    borderRadius: '8px',
    lineHeight: 1.4,
    marginTop: '0.25rem',
  },
  centralBadge: {
    fontSize: '0.7rem',
    fontWeight: '700',
    color: '#1565C0',
    backgroundColor: '#E3F2FD',
    padding: '0.15rem 0.5rem',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  deleteIconButton: {
    width: '34px',
    height: '34px',
    backgroundColor: '#FFEBEE',
    color: '#c62828',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  copyIconButton: {
    width: '34px',
    height: '34px',
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
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
    boxSizing: 'border-box',
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
    backgroundColor: '#5B9BD5',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  sidebarToggleBtn: {
    padding: '0.75rem',
    backgroundColor: '#f5f5f5',
    border: '1.5px solid #ddd',
    borderRadius: '10px',
    cursor: 'pointer',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '46px',
    height: '46px',
  },
  sidebarToggleBtnActive: {
    backgroundColor: '#EBF4FF',
    borderColor: '#5B9BD5',
    color: '#1565C0',
  },
  sidebar: {
    width: '120px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  sidebarItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.5rem 0.6rem',
    borderRadius: '8px',
    border: '1.5px solid #eee',
    backgroundColor: '#fff',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    fontFamily: 'inherit',
  },
  sidebarItemActive: {
    backgroundColor: '#EBF4FF',
    borderColor: '#5B9BD5',
  },
  sidebarItemIcon: {
    width: '18px',
    height: '18px',
    objectFit: 'contain',
    flexShrink: 0,
  },
  sidebarItemLabel: {
    fontSize: '0.72rem',
    fontWeight: '600',
    color: '#444',
    lineHeight: 1.2,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  productCount: {
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#aaa',
    margin: '0 0 0.6rem',
  },
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    backgroundColor: '#FFF8E1',
    border: '1px solid #FFE082',
    borderRadius: '20px',
    padding: '0.15rem 0.55rem',
    marginTop: '0.3rem',
  },
  categoryBadgeIcon: {
    width: '16px',
    height: '16px',
    objectFit: 'contain',
    flexShrink: 0,
  },
  categoryBadgeLabel: {
    fontSize: '0.72rem',
    fontWeight: '600',
    color: '#795548',
    whiteSpace: 'nowrap',
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    backgroundColor: '#E8F5E9',
    border: '1px solid #A5D6A7',
    borderRadius: '20px',
    padding: '0.15rem 0.55rem',
    fontSize: '0.72rem',
    fontWeight: '600',
  },
  tagChipIcon: {
    width: '14px',
    height: '14px',
    objectFit: 'contain',
    flexShrink: 0,
  },
};
