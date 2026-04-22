/**
 * pages/shop/[listId].js — Winkel Simpel
 *
 * The shopper interface.
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { signInAnonymously, getIdToken } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { saveShopperSession, getShopperSession } from '../../lib/auth';
import { ShoppingListFactory, ListItemFactory, MemberFactory } from '../../lib/dbSchema';

export default function ShopPage() {
  const router = useRouter();

  const [phase, setPhase] = useState('booting');
  const [errorMsg, setErrorMsg] = useState('');
  const [debugLog, setDebugLog] = useState([]);
  const [items, setItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [shopperName, setShopperName] = useState('');

  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const bootedRef = useRef(false);

  function addLog(msg) {
    console.log('[shop]', msg);
    setDebugLog(prev => [...prev.slice(-10), msg]);
  }

  // Wait until router is ready before doing anything
  useEffect(() => {
    if (!router.isReady) return;
    if (bootedRef.current) return;
    bootedRef.current = true;

    const { listId, org, token } = router.query;
    addLog(`ready: listId=${listId} org=${org} token=${token ? token.slice(0,8) : 'geen'}`);
    boot(listId, org, token);
  }, [router.isReady]);

  async function boot(listId, org, token) {
    try {
      const session = getShopperSession();
      addLog(`sessie: ${session ? `org=${session.orgId?.slice(0,8)} lid=${session.memberId?.slice(0,8)}` : 'geen'}`);

      if (session?.orgId && session?.memberId) {
        addLog('sessie OK → items laden');
        setShopperName(session.firstName || '');
        await loadItems(session.orgId, listId);
      } else if (org && token) {
        addLog('geen sessie, org+token aanwezig → auth');
        await authenticateAndLoad(org, token, listId);
      } else {
        addLog('geen sessie, geen token');
        setPhase('no-session');
      }
    } catch (err) {
      addLog(`boot fout: ${err.message}`);
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function authenticateAndLoad(orgId, qrToken, listId) {
    setPhase('loading');
    try {
      addLog('token valideren...');
      const snap = await MemberFactory.getByQrToken(orgId, qrToken);
      if (snap.empty) {
        addLog('token ONGELDIG');
        setErrorMsg('Ongeldige QR-code.');
        setPhase('error');
        return;
      }
      const member = { memberId: snap.docs[0].id, ...snap.docs[0].data() };
      addLog(`lid: ${member.firstName}`);

      addLog('anoniem inloggen...');
      const cred = await signInAnonymously(auth);
      addLog(`uid: ${cred.user.uid.slice(0,8)}`);

      const idToken = await getIdToken(cred.user);
      addLog('claims instellen...');
      const res = await fetch('/api/shopper/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orgId, memberId: member.memberId }),
      });
      addLog(`API: ${res.status}`);

      if (!res.ok) {
        const d = await res.json();
        setErrorMsg(d.message || 'Auth mislukt');
        setPhase('error');
        return;
      }

      addLog('token refresh...');
      await cred.user.getIdToken(true);

      saveShopperSession({ orgId, memberId: member.memberId, firstName: member.firstName });
      setShopperName(member.firstName || '');

      await loadItems(orgId, listId);
    } catch (err) {
      addLog(`auth fout: ${err.message}`);
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function loadItems(orgId, listId) {
    setPhase('loading');
    addLog(`items laden: org=${orgId?.slice(0,8)} list=${listId}`);
    try {
      const snap = await ListItemFactory.getAll(orgId, listId);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      addLog(`${all.length} items`);
      setItems(all);

      if (all.length === 0 || all.every(i => i.checked)) {
        setCompleted(true);
      } else {
        const first = all.findIndex(i => !i.checked);
        setCurrentIndex(first >= 0 ? first : 0);
      }
      setPhase('ready');
      addLog('klaar!');
    } catch (err) {
      addLog(`fout: ${err.code} — ${err.message}`);
      setErrorMsg(err.code === 'permission-denied'
        ? 'Geen toegang. Scan opnieuw.'
        : err.message);
      setPhase('error');
    }
  }

  async function handleTaken() {
    if (marking) return;
    const item = items[currentIndex];
    if (!item || item.checked) return;
    const session = getShopperSession();
    if (!session) return;
    const { listId } = router.query;

    setMarking(true);
    const updated = items.map((i, idx) => idx === currentIndex ? { ...i, checked: true } : i);
    setItems(updated);

    try {
      await ListItemFactory.check(session.orgId, listId, item.id);
    } catch (err) {
      setItems(items);
      setMarking(false);
      return;
    }

    if (updated.every(i => i.checked)) {
      setTimeout(async () => {
        try { await ShoppingListFactory.complete(session.orgId, listId); } catch {}
        setCompleted(true);
        setMarking(false);
      }, 400);
    } else {
      const next = updated.findIndex((i, idx) => idx > currentIndex && !i.checked);
      const fallback = updated.findIndex(i => !i.checked);
      setTimeout(() => { setCurrentIndex(next >= 0 ? next : fallback); setMarking(false); }, 300);
    }
  }

  function goNext() { if (currentIndex < items.length - 1) setCurrentIndex(i => i + 1); }
  function goPrev() { if (currentIndex > 0) setCurrentIndex(i => i - 1); }

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy) { dx < 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  }

  // ---- DEBUG PANEL (always visible during loading/booting) ----
  const DebugPanel = () => (
    <div style={styles.debugPanel}>
      <p style={styles.debugTitle}>📋 Debug ({phase})</p>
      {debugLog.map((l, i) => <p key={i} style={styles.debugLine}>→ {l}</p>)}
    </div>
  );

  if (phase === 'booting' || phase === 'loading') {
    return (
      <div style={{ ...styles.fullScreen, justifyContent: 'flex-start', paddingTop: '3rem' }}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>{phase === 'booting' ? 'Opstarten...' : 'Laden...'}</p>
        <DebugPanel />
      </div>
    );
  }

  if (phase === 'no-session') {
    return (
      <div style={styles.fullScreen}>
        <div style={styles.messageContent}>
          <p style={styles.messageIcon}>🔑</p>
          <p style={styles.messageText}>Scan je QR-kaartje om verder te gaan.</p>
          <button style={styles.actionButton} onClick={() => router.push('/scan')}>
            QR-code scannen
          </button>
          <DebugPanel />
        </div>
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
          <DebugPanel />
        </div>
      </div>
    );
  }

  if (completed) return <CompletionScreen firstName={shopperName} />;

  if (items.length === 0) {
    return <div style={styles.fullScreen}><p style={styles.loadingText}>Geen producten.</p></div>;
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
        <p style={styles.productQuantity}>{currentItem.quantity} {currentItem.quantity === 1 ? 'stuk' : 'stuks'}</p>
      </div>
      <div style={styles.navRow}>
        <button style={{ ...styles.navButton, opacity: currentIndex === 0 ? 0.2 : 1 }} onClick={goPrev} disabled={currentIndex === 0}>←</button>
        <div style={styles.dots}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ ...styles.dot, backgroundColor: item.checked ? '#4CAF50' : idx === currentIndex ? '#1a1a1a' : '#ddd', transform: idx === currentIndex ? 'scale(1.3)' : 'scale(1)' }} />
          ))}
        </div>
        <button style={{ ...styles.navButton, opacity: currentIndex === items.length - 1 ? 0.2 : 1 }} onClick={goNext} disabled={currentIndex === items.length - 1}>→</button>
      </div>
      {!currentItem.checked ? (
        <button style={{ ...styles.takenButton, opacity: marking ? 0.7 : 1 }} onClick={handleTaken} disabled={marking}>✓ Genomen!</button>
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
        <div style={styles.completionEmojis}><span style={styles.bigEmoji}>{emoji1}</span><span style={styles.bigEmoji}>{emoji2}</span></div>
        <p style={styles.completionMessage}>{message}</p>
        {firstName && <p style={styles.completionName}>{firstName}</p>}
        <p style={styles.completionSub}>Alle boodschappen zijn gedaan!</p>
        <div style={styles.completionStars}>{'⭐'.repeat(5)}</div>
      </div>
    </div>
  );
}

const styles = {
  fullScreen: { position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', userSelect: 'none' },
  spinner: { width: '60px', height: '60px', border: '6px solid #eee', borderTop: '6px solid #4CAF50', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
  loadingText: { fontSize: '1.1rem', color: '#aaa', margin: 0 },
  messageContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center', width: '100%' },
  messageIcon: { fontSize: '4rem', margin: 0 },
  messageText: { fontSize: '1.2rem', color: '#555', maxWidth: '300px', lineHeight: '1.6', margin: 0 },
  actionButton: { padding: '1rem 2rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer' },
  debugPanel: { position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.9)', padding: '0.75rem 1rem', maxHeight: '50vh', overflowY: 'auto' },
  debugTitle: { color: '#fff', fontSize: '0.8rem', fontWeight: '700', margin: '0 0 0.4rem', fontFamily: 'monospace' },
  debugLine: { color: '#00e676', fontSize: '0.75rem', fontFamily: 'monospace', margin: '0.15rem 0', wordBreak: 'break-all' },
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
  completionEmojis: { display: 'flex', gap: '1rem', marginBottom: '0.5rem' },
  bigEmoji: { fontSize: '5rem' },
  completionMessage: { fontSize: '3rem', fontWeight: '900', color: '#fff', margin: 0, lineHeight: 1.1 },
  completionName: { fontSize: '2rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)', margin: 0 },
  completionSub: { fontSize: '1.4rem', fontWeight: '600', color: 'rgba(255,255,255,0.85)', margin: 0 },
  completionStars: { fontSize: '2.5rem', marginTop: '0.5rem' },
};
