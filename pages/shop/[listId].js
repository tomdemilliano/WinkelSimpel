/**
 * pages/shop/[listId].js — Winkel Simpel
 *
 * The shopper interface. Designed for people with disabilities.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withShopperGuard } from '../../lib/auth';
import { ShoppingListFactory, ListItemFactory } from '../../lib/dbSchema';

function ShopPage({ shopperSession }) {
  const router = useRouter();
  const { listId } = router.query;
  const { orgId, firstName } = shopperSession;

  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  function addLog(msg) {
    console.log('[shop]', msg);
    setDebugLogs(prev => [...prev.slice(-8), msg]);
  }

  useEffect(() => {
    addLog('mount — isReady:' + router.isReady + ' listId:' + listId + ' orgId:' + orgId);
    if (!router.isReady || !listId) return;
    loadItems();
  }, [router.isReady, listId]);

  async function loadItems() {
    setLoading(true);
    setError('');
    try {
      addLog('loading items for list:' + listId);
      const snap = await ListItemFactory.getAll(orgId, listId);
      const allItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      addLog('loaded ' + allItems.length + ' items');

      setItems(allItems);

      if (allItems.length === 0 || allItems.every((i) => i.checked)) {
        setCompleted(true);
      } else {
        const firstUnchecked = allItems.findIndex((item) => !item.checked);
        setCurrentIndex(firstUnchecked >= 0 ? firstUnchecked : 0);
      }
    } catch (err) {
      addLog('ERROR: ' + err.code + ' — ' + err.message);
      if (err.code === 'permission-denied') {
        setError('Geen toegang. Scan opnieuw je QR-code.');
      } else {
        setError('Fout: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTaken() {
    if (marking) return;
    const item = items[currentIndex];
    if (!item || item.checked) return;

    setMarking(true);
    const updatedItems = items.map((i, idx) =>
      idx === currentIndex ? { ...i, checked: true } : i
    );
    setItems(updatedItems);

    try {
      await ListItemFactory.check(orgId, listId, item.id);
    } catch (err) {
      console.error('[shop] Failed to check item:', err);
      setItems(items);
      setMarking(false);
      return;
    }

    const allDone = updatedItems.every((i) => i.checked);
    if (allDone) {
      setTimeout(async () => {
        try {
          await ShoppingListFactory.complete(orgId, listId);
        } catch (err) {
          console.error('[shop] Failed to complete list:', err);
        }
        setCompleted(true);
        setMarking(false);
      }, 400);
    } else {
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

  function goNext() {
    if (currentIndex < items.length - 1) setCurrentIndex((i) => i + 1);
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
      if (dx < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // Loading
  if (loading) {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.loadingSpinner} />
        <p style={styles.loadingText}>Lijstje laden...</p>
        <div style={styles.debugPanel}>
          {debugLogs.map((log, i) => <p key={i} style={styles.debugLine}>{log}</p>)}
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.errorContent}>
          <p style={styles.errorIcon}>😕</p>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryButton} onClick={loadItems}>
            Opnieuw proberen
          </button>
        </div>
      </div>
    );
  }

  // Completed
  if (completed) {
    return <CompletionScreen firstName={firstName} />;
  }

  // Empty list
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

  return (
    <div
      style={styles.fullScreen}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar */}
      <div style={styles.progressBarWrapper}>
        <div style={{ ...styles.progressBarFill, width: `${progressPct}%` }} />
      </div>

      {/* Counter */}
      <div style={styles.counter}>
        <span style={styles.counterText}>{checkedCount + 1} / {totalCount}</span>
      </div>

      {/* Product image */}
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

      {/* Navigation */}
      <div style={styles.navRow}>
        <button
          style={{ ...styles.navButton, opacity: currentIndex === 0 ? 0.2 : 1 }}
          onClick={goPrev}
          disabled={currentIndex === 0}
        >←</button>

        <div style={styles.dots}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                ...styles.dot,
                backgroundColor: item.checked ? '#4CAF50' : idx === currentIndex ? '#1a1a1a' : '#ddd',
                transform: idx === currentIndex ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        <button
          style={{ ...styles.navButton, opacity: currentIndex === items.length - 1 ? 0.2 : 1 }}
          onClick={goNext}
          disabled={currentIndex === items.length - 1}
        >→</button>
      </div>

      {/* Action button */}
      {!currentItem.checked ? (
        <button
          style={{ ...styles.takenButton, opacity: marking ? 0.7 : 1, transform: marking ? 'scale(0.97)' : 'scale(1)' }}
          onClick={handleTaken}
          disabled={marking}
        >
          ✓ Genomen!
        </button>
      ) : (
        <div style={styles.alreadyTakenBadge}>✓ Al genomen</div>
      )}
    </div>
  );
}

function CompletionScreen({ firstName }) {
  const messages = ['Super gedaan!', 'Geweldig!', 'Fantastisch!', 'Goed bezig!', 'Wauw, perfect!'];
  const emojis = ['🎉', '⭐', '🏆', '🎊', '👏', '🌟'];
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
        {firstName && <p style={styles.completionName}>{firstName}</p>}
        <p style={styles.completionSub}>Alle boodschappen zijn gedaan!</p>
        <div style={styles.completionStars}>{'⭐'.repeat(5)}</div>
      </div>
    </div>
  );
}

export default withShopperGuard(ShopPage);

const styles = {
  fullScreen: {
    position: 'fixed',
    inset: 0,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    userSelect: 'none',
  },
  loadingSpinner: {
    width: '60px',
    height: '60px',
    border: '6px solid #eee',
    borderTop: '6px solid #4CAF50',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '1rem',
  },
  loadingText: {
    fontSize: '1.1rem',
    color: '#aaa',
    margin: 0,
  },
  errorContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '2rem',
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: '4rem',
    margin: 0,
  },
  errorText: {
    fontSize: '1.1rem',
    color: '#c62828',
    maxWidth: '300px',
    lineHeight: '1.6',
    margin: 0,
  },
  retryButton: {
    padding: '1rem 2rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '1.1rem',
    fontWeight: '700',
    cursor: 'pointer',
  },
  emptyText: {
    fontSize: '1.25rem',
    color: '#aaa',
    textAlign: 'center',
    padding: '2rem',
  },
  progressBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '6px',
    backgroundColor: '#eee',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.4s ease',
  },
  counter: {
    position: 'absolute',
    top: '14px',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
  },
  counterText: {
    fontSize: '1rem',
    fontWeight: '700',
    color: '#aaa',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    margin: '2.5rem 0.75rem 0.75rem',
    borderRadius: '20px',
    backgroundColor: '#f9f9f9',
    minHeight: 0,
    alignSelf: 'stretch',
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
  },
  productInfo: {
    padding: '0.5rem 1.25rem 0',
    textAlign: 'center',
    flexShrink: 0,
    width: '100%',
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
  navRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    flexShrink: 0,
    width: '100%',
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
    width: 'calc(100% - 2rem)',
    transition: 'transform 0.15s, opacity 0.15s',
    boxShadow: '0 4px 16px rgba(76, 175, 80, 0.4)',
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
    width: 'calc(100% - 2rem)',
  },
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
  },
  completionMessage: {
    fontSize: '3rem',
    fontWeight: '900',
    color: '#fff',
    margin: 0,
    lineHeight: 1.1,
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
  },
  debugPanel: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: '0.5rem',
    maxHeight: '40vh',
    overflowY: 'auto',
  },
  debugLine: {
    color: '#00ff88',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    margin: '0.15rem 0',
    wordBreak: 'break-all',
  },
};
