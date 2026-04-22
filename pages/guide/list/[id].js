/**
 * pages/guide/list/[id].js — Winkel Simpel
 *
 * Shopping list detail page for guides.
 * Allows adding products from the library, setting quantities,
 * reordering items, and activating or deactivating the list.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, ROLES } from '../../../lib/auth';
import { buildQrUrl } from '../../../lib/qr';
import {
  ShoppingListFactory,
  ListItemFactory,
  ProductFactory,
  MemberFactory,
  GroupFactory,
} from '../../../lib/dbSchema';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function ListDetail({ claims }) {
  const router = useRouter();
  const { id: listId } = router.query;
  const { orgId } = claims;

  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [assignedLabel, setAssignedLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!listId) return;
    loadAll();
  }, [listId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [listSnap, itemsSnap] = await Promise.all([
        ShoppingListFactory.getById(orgId, listId),
        ListItemFactory.getAll(orgId, listId),
      ]);

      if (!listSnap.exists()) {
        router.replace('/guide/lists');
        return;
      }

      const listData = { id: listSnap.id, ...listSnap.data() };
      setList(listData);
      setItems(itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      // Resolve assigned label
      if (listData.assignedTo?.type === 'member') {
        const memberSnap = await MemberFactory.getById(orgId, listData.assignedTo.id);
        if (memberSnap.exists()) {
          const m = memberSnap.data();
          setAssignedLabel(`${m.firstName} ${m.lastName}`);
        }
      } else if (listData.assignedTo?.type === 'group') {
        const groupSnap = await GroupFactory.getById(orgId, listData.assignedTo.id);
        if (groupSnap.exists()) {
          setAssignedLabel(`Groep: ${groupSnap.data().name}`);
        }
      }
    } catch (err) {
      console.error('Failed to load list:', err);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Add products from picker
  // -------------------------------------------------------------------------
  async function handleAddProducts(selectedProducts) {
    setShowProductPicker(false);
    const startOrder = items.length;

    try {
      const newItems = await Promise.all(
        selectedProducts.map((product, index) =>
          ListItemFactory.create(orgId, listId, {
            productId: product.id,
            productName: product.name,
            productImageUrl: product.imageUrl,
            quantity: 1,
            order: startOrder + index,
          }).then((ref) => ({
            id: ref.id,
            productId: product.id,
            productName: product.name,
            productImageUrl: product.imageUrl,
            quantity: 1,
            order: startOrder + index,
            checked: false,
          }))
        )
      );
      setItems((prev) => [...prev, ...newItems]);
    } catch (err) {
      console.error('Failed to add products:', err);
      alert('Toevoegen mislukt. Probeer opnieuw.');
    }
  }

  // -------------------------------------------------------------------------
  // Update quantity
  // -------------------------------------------------------------------------
  async function handleQuantityChange(itemId, newQty) {
    const qty = Math.max(1, parseInt(newQty) || 1);
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity: qty } : item))
    );
    try {
      await ListItemFactory.update(orgId, listId, itemId, { quantity: qty });
    } catch (err) {
      console.error('Failed to update quantity:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Remove item
  // -------------------------------------------------------------------------
  async function handleRemoveItem(itemId) {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    try {
      await ListItemFactory.delete(orgId, listId, itemId);
    } catch (err) {
      console.error('Failed to remove item:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Move item up or down (reorder)
  // -------------------------------------------------------------------------
  async function handleMove(index, direction) {
    const newItems = [...items];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newItems.length) return;

    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];

    // Reassign order values
    const updated = newItems.map((item, i) => ({ ...item, order: i }));
    setItems(updated);

    // Persist new order
    try {
      await Promise.all(
        updated.map((item) =>
          ListItemFactory.update(orgId, listId, item.id, { order: item.order })
        )
      );
    } catch (err) {
      console.error('Failed to reorder items:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Activate / deactivate list
  // -------------------------------------------------------------------------
  async function handleActivate() {
    if (items.length === 0) {
      alert('Voeg eerst producten toe aan het lijstje.');
      return;
    }
    setSaving(true);
    try {
      await ShoppingListFactory.update(orgId, listId, { status: 'active' });
      setList((prev) => ({ ...prev, status: 'active' }));
    } catch (err) {
      console.error('Failed to activate list:', err);
      alert('Activeren mislukt. Probeer opnieuw.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm('Lijstje terugzetten naar concept?')) return;
    setSaving(true);
    try {
      await ShoppingListFactory.update(orgId, listId, { status: 'draft' });
      setList((prev) => ({ ...prev, status: 'draft' }));
    } catch (err) {
      console.error('Failed to deactivate list:', err);
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={styles.centered}>
        <p style={styles.hint}>Laden...</p>
      </div>
    );
  }

  if (!list) return null;

  const isEditable = list.status === 'draft';
  const isActive = list.status === 'active';
  const isCompleted = list.status === 'completed';

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backButton} onClick={() => router.push('/guide/lists')}>
          ← Terug
        </button>
        <div style={styles.headerCenter}>
          <h1 style={styles.title}>{list.title}</h1>
          <p style={styles.assignedLabel}>{assignedLabel}</p>
        </div>
        <StatusBadge status={list.status} />
      </div>

      {/* Completed notice */}
      {isCompleted && (
        <div style={styles.completedBanner}>
          ✅ Dit lijstje is afgerond door de shopper.
        </div>
      )}

      {/* Items list */}
      {items.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyIcon}>🛒</p>
          <p style={styles.hint}>Nog geen producten. Voeg er toe via de knop hieronder.</p>
        </div>
      ) : (
        <div style={styles.itemList}>
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              isEditable={isEditable}
              onQuantityChange={(qty) => handleQuantityChange(item.id, qty)}
              onRemove={() => handleRemoveItem(item.id)}
              onMoveUp={() => handleMove(index, -1)}
              onMoveDown={() => handleMove(index, 1)}
            />
          ))}
        </div>
      )}

      {/* Actions */}
      {isEditable && (
        <div style={styles.actions}>
          <button style={styles.addProductsButton} onClick={() => setShowProductPicker(true)}>
            + Producten toevoegen
          </button>
          <button
            style={{ ...styles.activateButton, opacity: saving ? 0.7 : 1 }}
            onClick={handleActivate}
            disabled={saving}
          >
            {saving ? 'Bezig...' : '▶ Activeren voor shopper'}
          </button>
        </div>
      )}

      {isActive && (
        <div style={styles.actions}>
          <div style={styles.activeBanner}>
            ✅ Dit lijstje is actief. De shopper kan het nu gebruiken.
          </div>
          {list.assignedTo?.type === 'member' && (
            <button
              style={styles.qrButton}
              onClick={() => router.push(`/guide/qr/${list.assignedTo.id}`)}
            >
              📱 QR-kaartje tonen
            </button>
          )}
          <button
            style={{ ...styles.deactivateButton, opacity: saving ? 0.7 : 1 }}
            onClick={handleDeactivate}
            disabled={saving}
          >
            Terugzetten naar concept
          </button>
        </div>
      )}

      {/* Product picker modal */}
      {showProductPicker && (
        <ProductPicker
          orgId={orgId}
          existingProductIds={items.map((i) => i.productId)}
          onAdd={handleAddProducts}
          onClose={() => setShowProductPicker(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemRow
// ---------------------------------------------------------------------------
function ItemRow({ item, index, total, isEditable, onQuantityChange, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div style={styles.itemRow}>
      {/* Image */}
      <div style={styles.itemImageWrapper}>
        {item.productImageUrl ? (
          <img src={item.productImageUrl} alt={item.productName} style={styles.itemImage} />
        ) : (
          <div style={styles.itemImagePlaceholder}>🛍️</div>
        )}
      </div>

      {/* Name */}
      <div style={styles.itemBody}>
        <p style={styles.itemName}>{item.productName}</p>
        {item.checked && <p style={styles.itemChecked}>✓ Genomen</p>}
      </div>

      {/* Quantity */}
      {isEditable ? (
        <div style={styles.qtyControl}>
          <button
            style={styles.qtyButton}
            onClick={() => onQuantityChange(item.quantity - 1)}
          >−</button>
          <span style={styles.qtyValue}>{item.quantity}</span>
          <button
            style={styles.qtyButton}
            onClick={() => onQuantityChange(item.quantity + 1)}
          >+</button>
        </div>
      ) : (
        <span style={styles.qtyDisplay}>× {item.quantity}</span>
      )}

      {/* Reorder & delete */}
      {isEditable && (
        <div style={styles.itemControls}>
          <button
            style={{ ...styles.moveButton, opacity: index === 0 ? 0.3 : 1 }}
            onClick={onMoveUp}
            disabled={index === 0}
          >↑</button>
          <button
            style={{ ...styles.moveButton, opacity: index === total - 1 ? 0.3 : 1 }}
            onClick={onMoveDown}
            disabled={index === total - 1}
          >↓</button>
          <button style={styles.removeButton} onClick={onRemove}>✕</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
const STATUS_CONFIG = {
  draft: { label: 'Concept', color: '#FF9800', background: '#FFF3E0' },
  active: { label: 'Actief', color: '#4CAF50', background: '#E8F5E9' },
  completed: { label: 'Klaar', color: '#9E9E9E', background: '#F5F5F5' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span style={{ ...styles.statusBadge, color: cfg.color, backgroundColor: cfg.background }}>
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProductPicker (modal)
// ---------------------------------------------------------------------------
function ProductPicker({ orgId, existingProductIds, onAdd, onClose }) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ProductFactory.getAll(orgId).then((snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [orgId]);

  function toggleProduct(product) {
    setSelected((prev) =>
      prev.find((p) => p.id === product.id)
        ? prev.filter((p) => p.id !== product.id)
        : [...prev, product]
    );
  }

  const filtered = products.filter(
    (p) =>
      !existingProductIds.includes(p.id) &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Producten toevoegen</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <input
          type="search"
          placeholder="Zoeken..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...styles.searchInput, marginBottom: '0.75rem', flexShrink: 0 }}
        />

        {/* Scrollbare lijst met vaste hoogte */}
        <div style={styles.pickerScrollArea}>
          {loading ? (
            <p style={styles.hint}>Laden...</p>
          ) : filtered.length === 0 ? (
            <p style={styles.hint}>
              {search ? 'Geen producten gevonden.' : 'Alle producten zijn al toegevoegd.'}
            </p>
          ) : (
            <div style={styles.pickerList}>
              {filtered.map((product) => {
                const isSelected = !!selected.find((p) => p.id === product.id);
                return (
                  <div
                    key={product.id}
                    style={{
                      ...styles.pickerRow,
                      backgroundColor: isSelected ? '#E8F5E9' : '#fff',
                      borderColor: isSelected ? '#4CAF50' : '#eee',
                    }}
                    onClick={() => toggleProduct(product)}
                  >
                    <div style={styles.pickerImageWrapper}>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} style={styles.itemImage} />
                      ) : (
                        <div style={styles.itemImagePlaceholder}>🛍️</div>
                      )}
                    </div>
                    <p style={styles.pickerName}>{product.name}</p>
                    <div style={{
                      ...styles.checkbox,
                      backgroundColor: isSelected ? '#4CAF50' : '#fff',
                      borderColor: isSelected ? '#4CAF50' : '#ccc',
                    }}>
                      {isSelected && <span style={styles.checkmark}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Knop altijd zichtbaar onderaan */}
        <div style={styles.pickerFooter}>
          {selected.length > 0 ? (
            <button style={styles.addButton} onClick={() => onAdd(selected)}>
              {selected.length === 1 ? '1 product toevoegen' : `${selected.length} producten toevoegen`}
            </button>
          ) : (
            <p style={{ ...styles.hint, textAlign: 'center', margin: 0 }}>
              Tik op een product om het te selecteren
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default withRoleGuard(ROLES.GUIDE, ListDetail);

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
    paddingBottom: '6rem',
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
    padding: '0.25rem 0',
    fontWeight: '600',
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
  assignedLabel: {
    fontSize: '0.8rem',
    color: '#888',
    margin: 0,
  },
  statusBadge: {
    fontSize: '0.75rem',
    fontWeight: '700',
    padding: '0.25rem 0.6rem',
    borderRadius: '20px',
    whiteSpace: 'nowrap',
  },
  completedBanner: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    marginBottom: '1rem',
  },
  activeBanner: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    fontWeight: '600',
  },
  emptyState: {
    textAlign: 'center',
    paddingTop: '3rem',
  },
  emptyIcon: {
    fontSize: '3rem',
    margin: '0 0 0.5rem',
  },
  hint: {
    color: '#aaa',
    fontSize: '0.95rem',
    margin: 0,
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    marginBottom: '1.5rem',
  },
  itemRow: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    border: '1.5px solid #eee',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0.75rem',
  },
  itemImageWrapper: {
    width: '52px',
    height: '52px',
    borderRadius: '8px',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  itemImagePlaceholder: {
    fontSize: '1.5rem',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontSize: '0.95rem',
    fontWeight: '600',
    color: '#1a1a1a',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemChecked: {
    fontSize: '0.75rem',
    color: '#4CAF50',
    margin: '0.1rem 0 0',
    fontWeight: '600',
  },
  qtyControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  },
  qtyButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1.5px solid #ddd',
    backgroundColor: '#f5f5f5',
    fontSize: '1rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    color: '#444',
    padding: 0,
  },
  qtyValue: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#1a1a1a',
    minWidth: '20px',
    textAlign: 'center',
  },
  qtyDisplay: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#888',
  },
  itemControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  moveButton: {
    width: '26px',
    height: '22px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: '#f5f5f5',
    fontSize: '0.75rem',
    cursor: 'pointer',
    color: '#666',
    padding: 0,
  },
  removeButton: {
    width: '26px',
    height: '22px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#FFEBEE',
    fontSize: '0.7rem',
    cursor: 'pointer',
    color: '#c62828',
    padding: 0,
    marginTop: '0.1rem',
  },
  actions: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTop: '1px solid #eee',
    padding: '1rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  addProductsButton: {
    padding: '0.75rem',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  activateButton: {
    padding: '0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
  qrButton: {
    padding: '0.75rem',
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  deactivateButton: {
    padding: '0.75rem',
    backgroundColor: '#FFF3E0',
    color: '#E65100',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
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
    maxHeight: '85vh',
    overflowY: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
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
  searchInput: {
    width: '100%',
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #ddd',
    fontSize: '1rem',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  pickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  pickerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.6rem 0.75rem',
    borderRadius: '10px',
    border: '1.5px solid',
    cursor: 'pointer',
  },
  pickerImageWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '6px',
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerName: {
    flex: 1,
    fontSize: '0.95rem',
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
  pickerScrollArea: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    marginBottom: '0.75rem',
  },
  pickerFooter: {
    flexShrink: 0,
    paddingTop: '0.5rem',
    borderTop: '1px solid #f0f0f0',
  },
  addButton: {
    width: '100%',
    padding: '0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
};
