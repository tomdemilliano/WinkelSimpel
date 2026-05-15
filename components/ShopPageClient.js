/**
 * components/ShopPageClient.js — Winkel Simpel
 *
 * Shopperinterface met:
 * - Leg-in-mandje knop met icon
 * - Kleur overlay bij genomen items
 * - Horizontale thumbnail strip onderaan (genomen items verdwijnen)
 * - Toggle tussen detail view en overzicht (2 kolommen)
 * - Alles via server-side API routes
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { ListItemFactory } from '../lib/dbSchema';

export default function ShopPageClient() {
  const router = useRouter();

  const [phase, setPhase] = useState('booting');
  const [errorMsg, setErrorMsg] = useState('');
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [shopperName, setShopperName] = useState('');
  const [view, setView] = useState('detail'); // 'detail' | 'overview'

  const sessionRef = useRef({ orgId: null, listId: null, token: null });
  const touchStartX = useRef(null);
  const bootedRef = useRef(false);
  const stripRef = useRef(null);

  useEffect(() => {
    if (!router.isReady) return;
    if (bootedRef.current) return;
    bootedRef.current = true;
    const { listId, org, token } = router.query;
    if (!org || !token || !listId) { setErrorMsg('Ongeldige URL.'); setPhase('error'); return; }
    sessionRef.current = { orgId: org, listId, token };
    loadList(org, listId, token);
  }, [router.isReady]);

  async function loadList(orgId, listId, token) {
    setPhase('loading');
    try {
      const res = await fetch(`/api/shopper/list?orgId=${orgId}&listId=${listId}&token=${token}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.message || 'Kon het lijstje niet laden.'); setPhase('error'); return; }
      setShopperName(data.member.firstName || '');
      setItems(data.items);
      if (data.items.length === 0 || data.items.every(i => i.checked)) {
        setCompleted(true);
      } else {
        const first = data.items.findIndex(i => !i.checked);
        setCurrentIndex(first >= 0 ? first : 0);
      }
      setPhase('ready');
    } catch (err) { setErrorMsg('Fout bij laden: ' + err.message); setPhase('error'); }
  }

  async function handleTaken(indexToTake) {
    if (marking) return;
    const idx = indexToTake ?? currentIndex;
    const item = items[idx];
    if (!item || item.checked) return;
    const { orgId, listId, token } = sessionRef.current;

    setMarking(true);
    const updated = items.map((i, n) => n === idx ? { ...i, checked: true } : i);
    setItems(updated);
    const allDone = updated.every(i => i.checked);

    try {
      await fetch('/api/shopper/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, listId, itemId: item.id, token, complete: allDone }),
      });
    } catch { setItems(items); setMarking(false); return; }

    if (allDone) {
      setTimeout(() => { setCompleted(true); setMarking(false); }, 400);
    } else {
      // In detail view: spring naar volgend ongenomen item
      if (view === 'detail') {
        const next = updated.findIndex((i, n) => n > idx && !i.checked);
        const fallback = updated.findIndex(i => !i.checked);
        setTimeout(() => { setCurrentIndex(next >= 0 ? next : fallback); setMarking(false); }, 300);
      } else {
        setMarking(false);
      }
    }
  }

  async function handleUncheck(indexToUncheck) {
    if (marking) return;
    const idx = indexToUncheck ?? currentIndex;
    const item = items[idx];
    if (!item || !item.checked) return;
    const { orgId, listId, token } = sessionRef.current;

    setMarking(true);
    const prevItems = items;
    const updated = items.map((i, n) => n === idx ? { ...i, checked: false } : i);
    setItems(updated);
    if (completed) { setCompleted(false); setCurrentIndex(idx); }

    try {
      await fetch('/api/shopper/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, listId, itemId: item.id, token, checked: false }),
      });
    } catch {
      setItems(prevItems);
      if (completed) setCompleted(true);
    }
    setMarking(false);
  }

  function goNext() {
    const next = items.findIndex((i, n) => n > currentIndex && !i.checked);
    if (next >= 0) setCurrentIndex(next);
    else if (currentIndex < items.length - 1) setCurrentIndex(i => i + 1);
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) { dx < 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  }

  // Scroll thumbnail strip zodat huidig item zichtbaar is
  useEffect(() => {
    if (stripRef.current && view === 'detail') {
      const el = stripRef.current.querySelector(`[data-idx="${currentIndex}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex, view]);

  // Realtime sync met andere shoppers via Firestore onSnapshot
  useEffect(() => {
    if (phase !== 'ready') return;
    const { orgId, listId } = sessionRef.current;

    const unsubscribe = ListItemFactory.subscribe(orgId, listId, (serverItems) => {
      setItems(prev => {
        let changed = false;
        const merged = prev.map(item => {
          const s = serverItems.find(x => x.id === item.id);
          if (s && s.checked !== item.checked) { changed = true; return { ...item, checked: s.checked }; }
          return item;
        });
        if (!changed) return prev;
        if (merged.every(i => i.checked)) setTimeout(() => setCompleted(true), 400);
        return merged;
      });
    });

    return unsubscribe;
  }, [phase]);

  if (phase === 'booting' || phase === 'loading') {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>{phase === 'booting' ? 'Opstarten...' : 'Laden...'}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.messageContent}>
          <p style={styles.messageIcon}>😕</p>
          <p style={styles.messageText}>{errorMsg}</p>
          <button style={styles.actionButton} onClick={() => router.push('/scan')}>Opnieuw scannen</button>
        </div>
      </div>
    );
  }

  if (completed) return <CompletionScreen firstName={shopperName} />;
  if (items.length === 0) return <div style={styles.fullScreen}><p style={styles.loadingText}>Geen producten.</p></div>;

  const uncheckedItems = items.filter(i => !i.checked);
  const checkedCount = items.length - uncheckedItems.length;
  const progressPct = (checkedCount / items.length) * 100;
  const currentItem = items[currentIndex];

  // ---- OVERZICHTSVIEW ----
  if (view === 'overview') {
    return (
      <div style={styles.fullScreen}>
        {/* Header */}
        <div style={styles.overviewHeader}>
          <p style={styles.overviewTitle}>
            {checkedCount} / {items.length} genomen
          </p>
          <button style={styles.viewToggleBtn} onClick={() => setView('detail')}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ ...styles.progressBarWrapper, flexShrink: 0, margin: '0 0.75rem' }}>
          <div style={{ ...styles.progressBarFill, width: `${progressPct}%` }} />
        </div>
        {/* Grid */}
        <div style={styles.overviewGrid}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{ ...styles.overviewCard, ...(item.checked ? styles.overviewCardDone : {}) }}
              onClick={() => item.checked ? handleUncheck(idx) : handleTaken(idx)}
            >
              {/* Afbeelding */}
              <div style={styles.overviewImageWrapper}>
                {item.productImageUrl ? (
                  <img src={item.productImageUrl} alt={item.productName} style={styles.overviewImage} />
                ) : (
                  <div style={styles.overviewImagePlaceholder}>
                    <CartIcon size={36} color={item.checked ? '#aaa' : '#4CAF50'} />
                  </div>
                )}
                {item.checked && (
                  <div style={styles.overviewCheckedOverlay}>
                    <CheckIcon size={40} />
                  </div>
                )}
              </div>
              {/* Naam */}
              <p style={{ ...styles.overviewItemName, ...(item.checked ? styles.overviewItemNameDone : {}) }}>
                {item.productName}
              </p>
              {!item.checked && item.categoryIconUrl && (
                <div style={styles.overviewCategoryRow}>
                  <img src={item.categoryIconUrl} alt={item.categoryName || ''} style={styles.overviewCategoryIcon} referrerPolicy="no-referrer" />
                  {item.categoryName && <span style={styles.overviewCategoryName}>{item.categoryName}</span>}
                </div>
              )}
              {!item.checked && item.storeName && (
                <p style={styles.overviewItemStore}>
                  {item.storeType === 'chain' ? '🏪' : '📍'} {item.storeName}
                </p>
              )}
              {!item.checked && (
                <p style={styles.overviewItemQty}>× {item.quantity}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- DETAILVIEW ----
  return (
    <div style={styles.fullScreen} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Progress bar + teller */}
      <div style={styles.progressSection}>
        <div style={styles.progressBarWrapper}>
          <div style={{ ...styles.progressBarFill, width: `${progressPct}%` }} />
        </div>
        <div style={styles.progressLabelRow}>
          <span style={styles.progressLabel}>
            {uncheckedItems.length === 0 ? 'Alles genomen! 🎉' : `Nog ${uncheckedItems.length} product${uncheckedItems.length === 1 ? '' : 'en'}`}
          </span>
          <button style={styles.viewToggleBtn} onClick={() => setView('overview')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        </div>
      </div>

      {/* Product afbeelding */}
      <div style={{ ...styles.imageContainer, ...(currentItem.checked ? styles.imageContainerDone : {}) }}>
        {currentItem.productImageUrl ? (
          <img key={currentItem.id} src={currentItem.productImageUrl} alt={currentItem.productName} style={styles.productImage} />
        ) : (
          <div style={styles.imagePlaceholder}>
            <CartIcon size={100} color={currentItem.checked ? '#aaa' : '#4CAF50'} />
            <p style={{ ...styles.imagePlaceholderText, color: currentItem.checked ? '#aaa' : '#4CAF50' }}>
              {currentItem.productName}
            </p>
          </div>
        )}
        {currentItem.checked && (
          <div style={styles.checkedOverlay}>
            <CheckIcon size={120} />
          </div>
        )}
      </div>

      {/* Categoriepictogram + naam (detail view) */}
      {currentItem.categoryIconUrl && (
        <div style={styles.categoryRow}>
          <img
            src={currentItem.categoryIconUrl}
            alt={currentItem.categoryName || ''}
            style={styles.categoryIcon}
            referrerPolicy="no-referrer"
          />
          {currentItem.categoryName && (
            <span style={styles.categoryName}>{currentItem.categoryName}</span>
          )}
        </div>
      )}

      {/* Product info */}
      <div style={styles.productInfo}>
        <p style={styles.productName}>{currentItem.productName}</p>
          {currentItem.storeName && (
          <div style={styles.storeRow}>
            {currentItem.storeLogoUrl ? (
              <img src={currentItem.storeLogoUrl} alt={currentItem.storeName}
                style={styles.storeLogoSmall}
                onError={e => e.target.style.display = 'none'}
                referrerPolicy="no-referrer" />
            ) : (
              <span style={{ fontSize: '0.9rem' }}>
                {currentItem.storeType === 'chain' ? '🏪' : '📍'}
              </span>
            )}
            <span style={styles.storeName}>{currentItem.storeName}</span>
          </div>
        )}
        <div style={styles.quantityBadge}>
          <span style={styles.quantityNumber}>{currentItem.quantity}</span>
          <span style={styles.quantityUnit}>{currentItem.quantity === 1 ? 'stuk' : 'stuks'}</span>
        </div>
      </div>

      {/* Navigatie pijlen */}
      <div style={styles.navRow}>
        <button style={{ ...styles.navButton, opacity: currentIndex === 0 ? 0.2 : 1 }} onClick={goPrev} disabled={currentIndex === 0}>←</button>
        <div style={styles.navDots}>
          {items.map((item, idx) => (
            <div key={item.id} onClick={() => setCurrentIndex(idx)} style={{
              ...styles.dot,
              backgroundColor: item.checked ? '#4CAF50' : idx === currentIndex ? '#1a1a1a' : '#ddd',
              transform: idx === currentIndex ? 'scale(1.4)' : 'scale(1)',
              cursor: 'pointer',
            }} />
          ))}
        </div>
        <button style={{ ...styles.navButton, opacity: currentIndex === items.length - 1 ? 0.2 : 1 }} onClick={goNext} disabled={currentIndex === items.length - 1}>→</button>
      </div>

      {/* Actieknop */}
      {!currentItem.checked ? (
        <button style={{ ...styles.takenButton, opacity: marking ? 0.7 : 1 }} onClick={() => handleTaken()} disabled={marking}>
          <CartAddIcon />
          <span>Leg in mandje</span>
        </button>
      ) : (
        <button style={{ ...styles.uncheckButton, opacity: marking ? 0.7 : 1 }} onClick={() => handleUncheck()} disabled={marking}>
          <UndoIcon />
          <span>Terugleggen</span>
        </button>
      )}

      {/* Thumbnail strip — alleen ongenomen items */}
      {uncheckedItems.length > 0 && (
        <div style={styles.stripWrapper}>
          <div style={styles.strip} ref={stripRef}>
            {items.map((item, idx) => {
              if (item.checked) return null;
              return (
                <button
                  key={item.id}
                  data-idx={idx}
                  style={{
                    ...styles.stripItem,
                    ...(idx === currentIndex ? styles.stripItemActive : {}),
                  }}
                  onClick={() => setCurrentIndex(idx)}
                >
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt={item.productName} style={styles.stripImage} />
                  ) : (
                    <div style={styles.stripPlaceholder}>
                      <CartIcon size={20} color="#4CAF50" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SVG Icons ----
function CartAddIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M12 11v6M9 14h6"/>
    </svg>
  );
}

function CartIcon({ size = 24, color = '#4CAF50' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#E8F5E9"/>
      <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9.8-3h11.4c.7 0 1.4-.4 1.7-1l3.4-6.2A1 1 0 0023 6H5.2L4.3 4H1v2h2l3.6 7.6L5.2 16c-.5.8.1 2 1.3 2H21v-2H7.4l.8-1z" fill={color}/>
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6"/>
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
    </svg>
  );
}

function CheckIcon({ size = 60, color = '#4CAF50' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

// ---- Completion screen ----
function CompletionScreen({ firstName }) {
  const messages = ['Super gedaan!', 'Geweldig!', 'Fantastisch!', 'Goed bezig!', 'Wauw, perfect!'];
  const emojis = ['🎉', '⭐', '🏆', '🎊', '👏', '🌟'];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const e1 = emojis[Math.floor(Math.random() * emojis.length)];
  const e2 = emojis[Math.floor(Math.random() * emojis.length)];
  return (
    <div style={styles.completionScreen}>
      <div style={styles.completionContent}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '5rem' }}>{e1}</span>
          <span style={{ fontSize: '5rem' }}>{e2}</span>
        </div>
        <p style={styles.completionMessage}>{msg}</p>
        {firstName && <p style={styles.completionName}>{firstName}</p>}
        <p style={styles.completionSub}>Alle boodschappen zijn gedaan!</p>
        <div style={{ fontSize: '2.5rem', marginTop: '0.5rem' }}>{'⭐'.repeat(5)}</div>
      </div>
    </div>
  );
}

// ---- Styles ----
const styles = {
  fullScreen: { position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', userSelect: 'none', padding: '0.5rem 0 0' },
  spinner: { width: '60px', height: '60px', border: '6px solid #eee', borderTop: '6px solid #4CAF50', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
  loadingText: { fontSize: '1.1rem', color: '#aaa', margin: 0 },
  messageContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center' },
  messageIcon: { fontSize: '4rem', margin: 0 },
  messageText: { fontSize: '1.2rem', color: '#555', maxWidth: '300px', lineHeight: '1.6', margin: 0 },
  actionButton: { padding: '1rem 2rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer' },

  // Progress
  progressSection: { flexShrink: 0, width: '100%', paddingTop: '0.5rem' },
  progressBarWrapper: { width: '100%', height: '12px', backgroundColor: '#eee', borderRadius: '6px', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.4s ease', borderRadius: '6px' },
  progressLabelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.25rem 0' },
  progressLabel: { fontSize: '0.9rem', fontWeight: '700', color: '#4CAF50' },
  viewToggleBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: '0.25rem', display: 'flex', alignItems: 'center' },

  // Image
  imageContainer: { flex: 1, position: 'relative', width: 'calc(100% - 1.5rem)', overflow: 'hidden', margin: '0 0.75rem 0.5rem', borderRadius: '20px', backgroundColor: '#f9f9f9', minHeight: 0, transition: 'background-color 0.3s' },
  imageContainerDone: { backgroundColor: '#E8F5E9' },
  productImage: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  imagePlaceholder: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem' },
  imagePlaceholderText: { fontSize: '1.5rem', fontWeight: '700', textAlign: 'center', margin: 0 },
  checkedOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px' },

  // Product info
  productInfo: { padding: '0.4rem 1.25rem 0', textAlign: 'center', flexShrink: 0, width: '100%' },
  productName: { fontSize: '1.3rem', fontWeight: '700', color: '#555', margin: '0 0 0.4rem', lineHeight: 1.2 },
  quantityBadge: { display: 'inline-flex', alignItems: 'baseline', gap: '0.3rem', backgroundColor: '#E8F5E9', border: '2px solid #4CAF50', borderRadius: '14px', padding: '0.4rem 1.1rem', justifyContent: 'center' },
  quantityNumber: { fontSize: '2.5rem', fontWeight: '900', color: '#2E7D32', lineHeight: 1 },
  quantityUnit: { fontSize: '1rem', fontWeight: '600', color: '#4CAF50' },

  // Nav
  navRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', flexShrink: 0, width: '100%' },
  navButton: { width: '48px', height: '48px', borderRadius: '50%', border: '2px solid #eee', backgroundColor: '#fff', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1a1a', flexShrink: 0 },
  navDots: { display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '180px' },
  dot: { width: '9px', height: '9px', borderRadius: '50%', transition: 'all 0.2s ease', flexShrink: 0 },

  // Action button
  takenButton: { margin: '0 1rem 0.5rem', padding: '1rem 1.5rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '18px', fontSize: '1.3rem', fontWeight: '800', cursor: 'pointer', flexShrink: 0, width: 'calc(100% - 2rem)', transition: 'transform 0.15s, opacity 0.15s', boxShadow: '0 4px 16px rgba(76,175,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' },
  uncheckButton: { margin: '0 1rem 0.5rem', padding: '1rem 1.5rem', backgroundColor: '#fff', color: '#888', border: '2px solid #ddd', borderRadius: '18px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0, width: 'calc(100% - 2rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' },

  // Thumbnail strip
  stripWrapper: { flexShrink: 0, width: '100%', paddingBottom: '0.75rem' },
  strip: { display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1rem', scrollbarWidth: 'none' },
  stripItem: { flexShrink: 0, width: '60px', height: '60px', borderRadius: '10px', border: '2px solid #eee', backgroundColor: '#f9f9f9', cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.2s' },
  stripItemActive: { border: '3px solid #4CAF50' },
  stripImage: { width: '100%', height: '100%', objectFit: 'cover' },
  stripPlaceholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' },

  // Overview
  overviewHeader: { flexShrink: 0, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1rem 0.5rem' },
  overviewTitle: { fontSize: '1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  overviewGrid: { flex: 1, width: '100%', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.75rem 0.75rem 1rem' },
  overviewCard: { borderRadius: '14px', border: '2px solid #eee', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem 0.5rem', cursor: 'pointer', transition: 'all 0.2s', gap: '0.4rem' },
  overviewCardDone: { backgroundColor: '#F1F8F1', border: '2px solid #C8E6C9', opacity: 0.65 },
  overviewImageWrapper: { position: 'relative', width: '100%', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#f9f9f9' },
  overviewImage: { width: '100%', height: '100%', objectFit: 'contain' },
  overviewImagePlaceholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overviewCheckedOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  overviewItemName: { fontSize: '0.85rem', fontWeight: '700', color: '#1a1a1a', textAlign: 'center', margin: 0, lineHeight: 1.2 },
  overviewItemNameDone: { color: '#aaa', textDecoration: 'line-through' },
  overviewItemQty: { fontSize: '0.8rem', color: '#4CAF50', fontWeight: '600', margin: 0 },

  // Completion
  completionScreen: { position: 'fixed', inset: 0, backgroundColor: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  completionContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' },
  completionMessage: { fontSize: '3rem', fontWeight: '900', color: '#fff', margin: 0, lineHeight: 1.1 },
  completionName: { fontSize: '2rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)', margin: 0 },
  completionSub: { fontSize: '1.4rem', fontWeight: '600', color: 'rgba(255,255,255,0.85)', margin: 0 },

  storeRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.4rem' },
  storeLogoSmall: { width: '20px', height: '20px', objectFit: 'contain', borderRadius: '4px' },
  storeName: { fontSize: '0.9rem', color: '#888', fontWeight: '500' },
  overviewItemStore: { fontSize: '0.72rem', color: '#888', margin: 0, fontWeight: '500' },

  // Categorie — detail view
  categoryRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem 0', flexShrink: 0 },
  categoryIcon: { width: '52px', height: '52px', objectFit: 'contain', flexShrink: 0 },
  categoryName: { fontSize: '0.82rem', color: '#aaa', fontWeight: '500', letterSpacing: '0.02em' },

  // Categorie — overzichtsview
  overviewCategoryRow: { display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center', marginBottom: '0.15rem' },
  overviewCategoryIcon: { width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 },
  overviewCategoryName: { fontSize: '0.65rem', color: '#aaa', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' },
};
