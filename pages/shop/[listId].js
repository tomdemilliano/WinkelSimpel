/**
 * pages/shop/[listId].js — Winkel Simpel
 *
 * The shopper interface. This is the most important page in the app.
 * Designed for people with disabilities who often cannot read.
 *
 * Design principles:
 * - Product image fills at least 60% of the screen
 * - Product name in very large text
 * - Quantity displayed prominently
 * - One big "Genomen!" button at the bottom
 * - Swipe left/right or large arrow buttons to navigate
 * - Completion screen with encouraging message and image
 * - No distracting elements, no small text, no navigation bar
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withShopperGuard } from '../../lib/auth';
import { ShoppingListFactory, ListItemFactory } from '../../lib/dbSchema';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function ShopPage({ shopperSession }) {
  const router = useRouter();
  const { listId } = router.query;
  const { orgId, firstName } = shopperSession;

  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);

  // Touch/swipe support
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  useEffect(() => {
    if (!listId) return;
    loadItems();
  }, [listId]);

  async function loadItems() {
    setLoading(true);
    try {
      const snap = await ListItemFactory.getAll(orgId, listId);
      const allItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Start at the first unchecked item
      const firstUnchecked = allItems.findIndex((item) => !item.checked);
      setItems(allItems);

      if (allItems.length === 0 || allItems.every((i) => i.checked)) {
        setCompleted(true);
      } else {
        setCurrentIndex(firstUnchecked >= 0 ? firstUnchecked : 0);
      }
    } catch (err) {
      console.error('Failed to load items:', err);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Mark current item as taken
  // -------------------------------------------------------------------------
  async function handleTaken() {
    if (marking) return;
    const item = items[currentIndex];
    if (!item || item.checked) return;

    setMarking(true);

    // Optimistic update
    const updatedItems = items.map((i, idx) =>
      idx === currentIndex ? { ...i, checked: true } : i
    );
    setItems(updatedItems);

    try {
      await ListItemFactory.check(orgId, listId, item.id);
    } catch (err) {
      console.error('Failed to check item:', err);
      // Revert on error
      setItems(items);
    }

    // Check if all items are done
    const allDone = updatedItems.every((i) => i.checked);
    if (allDone) {
      // Short pause before showing completion screen
      setTimeout(async () => {
        try {
          await ShoppingListFactory.complete(orgId, listId);
        } catch (err) {
          console.error('Failed to complete list:', err);
        }
        setCompleted(true);
        setMarking(false);
      }, 400);
    } else {
      // Move to next unchecked item
      const nextIndex = updatedItems.findIndex(
        (item, idx) => idx > currentIndex && !item.checked
      );
      const fallbackIndex = updatedItems.findIndex((item) => !item.checked);
      const goTo = nextIndex >= 0 ? nextIndex : fallbackIndex;

      setTimeout(() => {
        setCurrentIndex(goTo);
        setMarking(false);
      }, 300);
    }
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  function goNext() {
    if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1);
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  // -------------------------------------------------------------------------
  // Swipe handling
  // -------------------------------------------------------------------------
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);

    // Only trigger swipe if horizontal movement > 50px and not primarily vertical
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // -------------------------------------------------------------------------
  // Render: loading
  // -------------------------------------------------------------------------
  if (loading) {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.loadingSpinner} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: completed
  // -------------------------------------------------------------------------
  if (completed) {
    return <CompletionScreen firstName={firstName} />;
  }

  // -------------------------------------------------------------------------
  // Render: empty list
  // -------------------------------------------------------------------------
  if (items.length === 0) {
    return (
      <div style={styles.fullScreen}>
        <p style={styles.emptyText}>Er zijn nog geen producten op je lijstje.</p>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const checkedCount = items.filter((i) => i.checked).length;
  const totalCount = items.length;
  const progressPct = (checkedCount / totalCount) * 100;

  // -------------------------------------------------------------------------
  // Render: main shopper view
  // -------------------------------------------------------------------------
  return (
    <div
      style={styles.fullScreen}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar — top of screen */}
      <div style={styles.progressBarWrapper}>
        <div style={{ ...styles.progressBarFill, width: `${progressPct}%` }} />
      </div>

      {/* Counter — e.g. "2 / 5" */}
      <div style={styles.counter}>
        <span style={styles.counterText}>{checkedCount + 1} / {totalCount}</span>
      </div>

      {/* Product image — fills most of the screen */}
      <div style={styles.imageContainer}>
        {currentItem.productImageUrl ? (
          <img
            key={currentItem.id}
            src={currentItem.productImageUrl}
            alt={currentItem.productName}
            style={styles.productImage}
          />
        ) : (
          <div style={styles.imagePlaceholder}>
            <span style={styles.imagePlaceholderIcon}>🛍️</span>
          </div>
        )}

        {/* Already checked indicator */}
        {currentItem.checked && (
          <div style={styles.checkedOverlay}>
            <span style={styles.checkedIcon}>✓</span>
          </div>
        )}
      </div>

      {/* Product info */}
      <div style={styles.productInfo}>
        <p style={styles.productName}>{currentItem.productName}</p>
        <p style={styles.productQuantity}>
          {currentItem.quantity} {currentItem.quantity === 1 ? 'stuk' : 'stuks'}
        </p>
      </div>

      {/* Navigation arrows */}
      <div style={styles.navRow}>
        <button
          style={{
            ...styles.navButton,
            opacity: currentIndex === 0 ? 0.2 : 1,
          }}
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="Vorig product"
        >
          ←
        </button>

        {/* Dot indicators */}
        <div style={styles.dots}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                ...styles.dot,
                backgroundColor: item.checked
                  ? '#4CAF50'
                  : idx === currentIndex
                  ? '#1a1a1a'
                  : '#ddd',
                transform: idx === currentIndex ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <button
          style={{
            ...styles.navButton,
            opacity: currentIndex === items.length - 1 ? 0.2 : 1,
          }}
          onClick={goNext}
          disabled={currentIndex === items.length - 1}
          aria-label="Volgend product"
        >
          →
        </button>
      </div>

      {/* Main action button */}
      {!currentItem.checked ? (
        <button
          style={{
            ...styles.takenButton,
            opacity: marking ? 0.7 : 1,
            transform: marking ? 'scale(0.97)' : 'scale(1)',
          }}
          onClick={handleTaken}
          disabled={marking}
        >
          ✓ Genomen!
        </button>
      ) : (
        <div style={styles.alreadyTakenBadge}>
          ✓ Al genomen
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompletionScreen
// ---------------------------------------------------------------------------
function CompletionScreen({ firstName }) {
  const messages = [
    'Super gedaan!',
    'Geweldig!',
    'Fantastisch!',
    'Goed bezig!',
    'Wauw, perfect!',
  ];
  const emojis = ['🎉', '⭐', '🏆', '🎊', '👏', '🌟'];

  // Pick a random message and set of emojis deterministically
  const message = messages[Math.floor(Math.random() * messages.length)];
  const emoji1 = emojis[Math.floor(Math.random() * emojis.length)];
  const emoji2 = emojis[Math.floor(Math.random() * emojis.length)];

  return (
    <div style={styles.completionScreen}>
      <div style={styles.completionContent}>
        <div style={styles.completionEmojis}>
          <span style={styles.bigEmoji}>{emoji1}</span>
          <span style={styles.bigEmoji}>{emoji2}</span>
        </div>

        <p style={styles.completionMessage}>{message}</p>

        {firstName && (
          <p style={styles.completionName}>{firstName}</p>
        )}

        <p style={styles.completionSub}>
          Alle boodschappen zijn gedaan!
        </p>

        <div style={styles.completionStars}>
          {'⭐'.repeat(5)}
        </div>
      </div>
    </div>
  );
}

export default withShopperGuard(ShopPage);

// ---------------------------------------------------------------------------
// Styles — maximally visual, accessible first
// ---------------------------------------------------------------------------
const styles = {
  fullScreen: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    userSelect: 'none',
  },

  // Progress
  progressBarWrapper: {
    height: '6px',
    backgroundColor: '#eee',
    flexShrink: 0,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.4s ease',
  },

  // Counter
  counter: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '0.75rem',
    flexShrink: 0,
  },
  counterText: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#aaa',
    letterSpacing: '0.05em',
  },

  // Image
  imageContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    margin: '0.75rem',
    borderRadius: '20px',
    backgroundColor: '#f9f9f9',
    minHeight: 0,
  },
  productImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderIcon: {
    fontSize: '6rem',
  },
  checkedOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(76, 175, 80, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '20px',
  },
  checkedIcon: {
    fontSize: '6rem',
    color: '#4CAF50',
    fontWeight: '900',
    textShadow: '0 2px 12px rgba(0,0,0,0.15)',
  },

  // Product info
  productInfo: {
    padding: '0.5rem 1.25rem 0',
    textAlign: 'center',
    flexShrink: 0,
  },
  productName: {
    fontSize: '2rem',
    fontWeight: '800',
    color: '#1a1a1a',
    margin: '0 0 0.25rem',
    lineHeight: 1.15,
  },
  productQuantity: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#4CAF50',
    margin: 0,
  },

  // Navigation
  navRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    flexShrink: 0,
  },
  navButton: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid #eee',
    backgroundColor: '#fff',
    fontSize: '1.5rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#1a1a1a',
    flexShrink: 0,
    transition: 'opacity 0.2s',
  },
  dots: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '200px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },

  // Action button
  takenButton: {
    margin: '0 1rem 1.5rem',
    padding: '1.25rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '18px',
    fontSize: '1.5rem',
    fontWeight: '800',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'transform 0.15s, opacity 0.15s',
    boxShadow: '0 4px 16px rgba(76, 175, 80, 0.4)',
    letterSpacing: '0.02em',
  },
  alreadyTakenBadge: {
    margin: '0 1rem 1.5rem',
    padding: '1.25rem',
    backgroundColor: '#E8F5E9',
    color: '#4CAF50',
    borderRadius: '18px',
    fontSize: '1.4rem',
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 0,
  },

  // Loading
  loadingSpinner: {
    width: '60px',
    height: '60px',
    border: '6px solid #eee',
    borderTop: '6px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  emptyText: {
    fontSize: '1.25rem',
    color: '#aaa',
    textAlign: 'center',
    padding: '2rem',
  },

  // Completion screen
  completionScreen: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#4CAF50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif',
  },
  completionContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '2rem',
    textAlign: 'center',
  },
  completionEmojis: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '0.5rem',
  },
  bigEmoji: {
    fontSize: '5rem',
    animation: 'none',
  },
  completionMessage: {
    fontSize: '3rem',
    fontWeight: '900',
    color: '#fff',
    margin: 0,
    lineHeight: 1.1,
    textShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  completionName: {
    fontSize: '2rem',
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    margin: 0,
  },
  completionSub: {
    fontSize: '1.4rem',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    margin: 0,
  },
  completionStars: {
    fontSize: '2.5rem',
    marginTop: '0.5rem',
    letterSpacing: '0.1em',
  },
};
