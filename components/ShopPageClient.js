/**
 * components/ShopPageClient.js — Winkel Simpel
 *
 * Shopperinterface — gebruikt server-side API routes voor alle data.
 * Geen directe Firestore toegang — omzeilt permission problemen.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

export default function ShopPageClient() {
  const router = useRouter();

  const [phase, setPhase] = useState('booting');
  const [errorMsg, setErrorMsg] = useState('');
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [shopperName, setShopperName] = useState('');

  // Bewaar org, listId en token in state voor gebruik bij afvinken
  const sessionRef = useRef({ orgId: null, listId: null, token: null });

  const touchStartX = useRef(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (bootedRef.current) return;
    bootedRef.current = true;

    const { listId, org, token } = router.query;

    if (!org || !token || !listId) {
      setErrorMsg('Ongeldige URL. Scan opnieuw je QR-code.');
      setPhase('error');
      return;
    }

    sessionRef.current = { orgId: org, listId, token };
    loadList(org, listId, token);
  }, [router.isReady]);

  async function loadList(orgId, listId, token) {
    setPhase('loading');
    try {
      const res = await fetch(
        `/api/shopper/list?orgId=${orgId}&listId=${listId}&token=${token}`
      );
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.message || 'Kon het lijstje niet laden.');
        setPhase('error');
        return;
      }

      setShopperName(data.member.firstName || '');
      setItems(data.items);

      if (data.items.length === 0 || data.items.every(i => i.checked)) {
        setCompleted(true);
      } else {
        const first = data.items.findIndex(i => !i.checked);
        setCurrentIndex(first >= 0 ? first : 0);
      }
      setPhase('ready');
    } catch (err) {
      setErrorMsg('Fout bij laden: ' + err.message);
      setPhase('error');
    }
  }

  async function handleTaken() {
    if (marking) return;
    const item = items[currentIndex];
    if (!item || item.checked) return;

    const { orgId, listId, token } = sessionRef.current;

    setMarking(true);
    const updated = items.map((i, idx) =>
      idx === currentIndex ? { ...i, checked: true } : i
    );
    setItems(updated);

    const allDone = updated.every(i => i.checked);

    try {
      await fetch('/api/shopper/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId, listId, itemId: item.id, token,
          complete: allDone,
        }),
      });
    } catch (err) {
      console.error('check error:', err);
      setItems(items);
      setMarking(false);
      return;
    }

    if (allDone) {
      setTimeout(() => { setCompleted(true); setMarking(false); }, 400);
    } else {
      const next = updated.findIndex((i, idx) => idx > currentIndex && !i.checked);
      const fallback = updated.findIndex(i => !i.checked);
      setTimeout(() => {
        setCurrentIndex(next >= 0 ? next : fallback);
        setMarking(false);
      }, 300);
    }
  }

  function goNext() { if (currentIndex < items.length - 1) setCurrentIndex(i => i + 1); }
  function goPrev() { if (currentIndex > 0) setCurrentIndex(i => i - 1); }

  function handleTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) { dx < 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  }

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
          <button style={styles.actionButton} onClick={() => router.push('/scan')}>
            Opnieuw scannen
          </button>
        </div>
      </div>
    );
  }

  if (completed) return <CompletionScreen firstName={shopperName} />;

  if (items.length === 0) {
    return (
      <div style={styles.fullScreen}>
        <p style={styles.loadingText}>Geen producten op dit lijstje.</p>
      </div>
    );
  }

  const currentItem = items[currentIndex];
  const checkedCount = items.filter(i => i.checked).length;
  const progressPct = (checkedCount / items.length) * 100;

  return (
    <div style={styles.fullScreen} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div style={styles.progressBarWrapper}>
        <div style={{ ...styles.progressBarFill, width: `${progressPct}%` }} />
      </div>
      <div style={styles.counter}>
        <span style={styles.counterText}>{checkedCount + 1} / {items.length}</span>
      </div>
      <div style={styles.imageContainer}>
        {currentItem.productImageUrl ? (
          <img key={currentItem.id} src={currentItem.productImageUrl} alt={currentItem.productName} style={styles.productImage} />
        ) : (
          <div style={styles.imagePlaceholder}>
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="12" fill="#E8F5E9"/>
              <path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9.8-3h11.4c.7 0 1.4-.4 1.7-1l3.4-6.2A1 1 0 0023 6H5.2L4.3 4H1v2h2l3.6 7.6L5.2 16c-.5.8.1 2 1.3 2H21v-2H7.4l.8-1z" fill="#4CAF50"/>
            </svg>
            <p style={styles.imagePlaceholderText}>{currentItem.productName}</p>
          </div>
        )}
        {currentItem.checked && (
          <div style={styles.checkedOverlay}><span style={styles.checkedIcon}>✓</span></div>
        )}
      </div>
      <div style={styles.productInfo}>
        <p style={styles.productName}>{currentItem.productName}</p>
        <p style={styles.productQuantity}>
          {currentItem.quantity} {currentItem.quantity === 1 ? 'stuk' : 'stuks'}
        </p>
      </div>
      <div style={styles.navRow}>
        <button style={{ ...styles.navButton, opacity: currentIndex === 0 ? 0.2 : 1 }} onClick={goPrev} disabled={currentIndex === 0}>←</button>
        <div style={styles.dots}>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              ...styles.dot,
              backgroundColor: item.checked ? '#4CAF50' : idx === currentIndex ? '#1a1a1a' : '#ddd',
              transform: idx === currentIndex ? 'scale(1.3)' : 'scale(1)',
            }} />
          ))}
        </div>
        <button style={{ ...styles.navButton, opacity: currentIndex === items.length - 1 ? 0.2 : 1 }} onClick={goNext} disabled={currentIndex === items.length - 1}>→</button>
      </div>
      {!currentItem.checked ? (
        <button style={{ ...styles.takenButton, opacity: marking ? 0.7 : 1 }} onClick={handleTaken} disabled={marking}>
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

const styles = {
  fullScreen: { position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', userSelect: 'none' },
  spinner: { width: '60px', height: '60px', border: '6px solid #eee', borderTop: '6px solid #4CAF50', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
  loadingText: { fontSize: '1.1rem', color: '#aaa', margin: 0 },
  messageContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center' },
  messageIcon: { fontSize: '4rem', margin: 0 },
  messageText: { fontSize: '1.2rem', color: '#555', maxWidth: '300px', lineHeight: '1.6', margin: 0 },
  actionButton: { padding: '1rem 2rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer' },
  progressBarWrapper: { position: 'absolute', top: 0, left: 0, right: 0, height: '6px', backgroundColor: '#eee' },
  progressBarFill: { height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.4s ease' },
  counter: { position: 'absolute', top: '14px', left: 0, right: 0, display: 'flex', justifyContent: 'center' },
  counterText: { fontSize: '1rem', fontWeight: '700', color: '#aaa' },
  imageContainer: { flex: 1, position: 'relative', width: 'calc(100% - 1.5rem)', overflow: 'hidden', margin: '2.5rem 0.75rem 0.75rem', borderRadius: '20px', backgroundColor: '#f9f9f9', minHeight: 0 },
  productImage: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  imagePlaceholder: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1.5rem' },
  imagePlaceholderText: { fontSize: '1.5rem', fontWeight: '700', color: '#4CAF50', textAlign: 'center', margin: 0 },
  checkedOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(76,175,80,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '20px' },
  checkedIcon: { fontSize: '6rem', color: '#4CAF50', fontWeight: '900' },
  productInfo: { padding: '0.5rem 1.25rem 0', textAlign: 'center', flexShrink: 0, width: '100%' },
  productName: { fontSize: '2rem', fontWeight: '800', color: '#1a1a1a', margin: '0 0 0.25rem', lineHeight: 1.15 },
  productQuantity: { fontSize: '1.4rem', fontWeight: '700', color: '#4CAF50', margin: 0 },
  navRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', flexShrink: 0, width: '100%' },
  navButton: { width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #eee', backgroundColor: '#fff', fontSize: '1.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1a1a', flexShrink: 0 },
  dots: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '200px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', transition: 'all 0.2s ease', flexShrink: 0 },
  takenButton: { margin: '0 1rem 1.5rem', padding: '1.25rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '18px', fontSize: '1.5rem', fontWeight: '800', cursor: 'pointer', flexShrink: 0, width: 'calc(100% - 2rem)', transition: 'transform 0.15s, opacity 0.15s', boxShadow: '0 4px 16px rgba(76,175,80,0.4)' },
  alreadyTakenBadge: { margin: '0 1rem 1.5rem', padding: '1.25rem', backgroundColor: '#E8F5E9', color: '#4CAF50', borderRadius: '18px', fontSize: '1.4rem', fontWeight: '800', textAlign: 'center', flexShrink: 0, width: 'calc(100% - 2rem)' },
  completionScreen: { position: 'fixed', inset: 0, backgroundColor: '#4CAF50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  completionContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' },
  completionMessage: { fontSize: '3rem', fontWeight: '900', color: '#fff', margin: 0, lineHeight: 1.1 },
  completionName: { fontSize: '2rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)', margin: 0 },
  completionSub: { fontSize: '1.4rem', fontWeight: '600', color: 'rgba(255,255,255,0.85)', margin: 0 },
};
