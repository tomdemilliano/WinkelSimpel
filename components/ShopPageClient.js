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
  const [voiceName, setVoiceName] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState(false);

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

  function speakItem(item) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const qty = item.quantity;
    const text = qty > 1 ? `${qty} ${item.productName}` : item.productName;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'nl-BE';
    utt.rate = 0.88;
    const voices = window.speechSynthesis.getVoices();
    const voice = voiceName
      ? (voices.find(v => v.name === voiceName) || voices.find(v => v.lang === 'nl-BE') || voices.find(v => v.lang.startsWith('nl')))
      : (voices.find(v => v.lang === 'nl-BE') || voices.find(v => v.lang.startsWith('nl')));
    if (voice) utt.voice = voice;
    window.speechSynthesis.speak(utt);
  }

  async function loadList(orgId, listId, token) {
    setPhase('loading');
    try {
      const res = await fetch(`/api/shopper/list?orgId=${orgId}&listId=${listId}&token=${token}`);
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.message || 'Kon het lijstje niet laden.'); setPhase('error'); return; }
      setShopperName(data.member.firstName || '');
      setItems(data.items);
      const activeVoice = data.voiceSettings?.shopperVoiceName || data.voiceSettings?.defaultVoiceName || null;
      setVoiceName(activeVoice);
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

  if (completed && checkoutStep) return <CheckoutStepsScreen />;
  if (completed) return <CompletionScreen firstName={shopperName} onContinue={() => setCheckoutStep(true)} />;
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
                {!item.checked && (item.categoryIconUrl || (item.tags && item.tags.some(t => t.tagImageUrl))) && (
                  <div style={styles.overviewCategoryIconOverlay}>
                    {item.categoryIconUrl && (
                      <img src={item.categoryIconUrl} alt={item.categoryName || ''} style={styles.overviewCategoryIconOverlayImg} referrerPolicy="no-referrer" />
                    )}
                    {(item.tags || []).filter(t => t.tagImageUrl).map(tag => (
                      <img key={tag.tagId} src={tag.tagImageUrl} alt={tag.tagName || ''} style={styles.overviewCategoryIconOverlayImg} referrerPolicy="no-referrer" />
                    ))}
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
          <div style={{ display: 'flex', gap: '0.1rem', alignItems: 'center' }}>
            <button style={{ ...styles.viewToggleBtn, color: '#5B9BD5' }} onClick={() => speakItem(currentItem)}>
              <SpeakerOnIcon />
            </button>
            <button style={styles.viewToggleBtn} onClick={() => setView('overview')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
          </div>
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
        {(currentItem.categoryIconUrl || (currentItem.tags && currentItem.tags.some(t => t.tagImageUrl))) && (
          <div style={styles.categoryIconOverlay}>
            {currentItem.categoryIconUrl && (
              <img src={currentItem.categoryIconUrl} alt={currentItem.categoryName || ''} style={styles.categoryIconOverlayImg} referrerPolicy="no-referrer" />
            )}
            {(currentItem.tags || []).filter(t => t.tagImageUrl).map(tag => (
              <img key={tag.tagId} src={tag.tagImageUrl} alt={tag.tagName || ''} style={styles.categoryIconOverlayImg} referrerPolicy="no-referrer" />
            ))}
          </div>
        )}
        {currentItem.checked && (
          <div style={styles.checkedOverlay}>
            <CheckIcon size={120} />
          </div>
        )}
      </div>

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
              backgroundColor: item.checked ? '#5B9BD5' : idx === currentIndex ? '#1A2B3C' : '#ddd',
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

function SpeakerOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
  );
}


// ---- Completion screen ----
function CelebrationIllustration() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Basket body */}
      <rect x="30" y="62" width="80" height="50" rx="10" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.8)" strokeWidth="3"/>
      {/* Basket handle */}
      <path d="M50 62 Q50 36 70 36 Q90 36 90 62" stroke="rgba(255,255,255,0.8)" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Basket weave lines */}
      <line x1="30" y1="78" x2="110" y2="78" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <line x1="30" y1="94" x2="110" y2="94" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
      <line x1="55" y1="62" x2="55" y2="112" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
      <line x1="85" y1="62" x2="85" y2="112" stroke="rgba(255,255,255,0.3)" strokeWidth="2"/>
      {/* Checkmark circle */}
      <circle cx="98" cy="56" r="22" fill="#3A7FC1" stroke="rgba(255,255,255,0.9)" strokeWidth="3"/>
      <polyline points="88,56 96,64 110,48" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Sparkles */}
      <line x1="20" y1="28" x2="20" y2="40" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="14" y1="34" x2="26" y2="34" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="118" y1="20" x2="118" y2="30" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="113" y1="25" x2="123" y2="25" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="28" cy="105" r="4" fill="rgba(255,255,255,0.3)"/>
      <circle cx="115" cy="90" r="3" fill="rgba(255,255,255,0.25)"/>
      <circle cx="40" cy="22" r="3" fill="rgba(255,255,255,0.35)"/>
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 4l2.94 8.26H28l-7.27 5.48 2.77 8.26L16 21.01l-7.5 5L11.27 17.74 4 12.26h9.06z" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
    </svg>
  );
}

// ---- Animated Completion Screen ----

const ANIMATIONS = [
  ThumbsUpAnimation,
  CartFillAnimation,
  StarBurstAnimation,
];

function CompletionScreen({ firstName, onContinue }) {
  const messages = ['Super gedaan!', 'Geweldig!', 'Fantastisch!', 'Goed bezig!', 'Wauw, perfect!'];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const AnimComp = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)];

  return (
    <div style={styles.completionScreen}>
      <div style={styles.completionContent}>
        <AnimComp />
        <p style={styles.completionMessage}>{msg}</p>
        {firstName && <p style={styles.completionName}>{firstName}</p>}
        <p style={styles.completionSub}>Alle boodschappen zijn gedaan!</p>
        <div style={{ display: 'flex', gap: '0.25rem', margin: '0.25rem 0 1.5rem' }}>
          {[1,2,3,4,5].map(i => <StarIcon key={i} />)}
        </div>
        <button style={styles.completionNextButton} onClick={onContinue}>
          Wat nu? →
        </button>
      </div>
      <style>{completionKeyframes}</style>
    </div>
  );
}

const completionKeyframes = `
  @keyframes thumbPop {
    0% { transform: scale(0) rotate(-20deg); opacity: 0; }
    60% { transform: scale(1.2) rotate(5deg); opacity: 1; }
    80% { transform: scale(0.95) rotate(-2deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes cartBounce {
    0% { transform: translateY(60px); opacity: 0; }
    50% { transform: translateY(-12px); opacity: 1; }
    70% { transform: translateY(5px); }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes itemDrop1 {
    0% { transform: translateY(-80px) rotate(-30deg); opacity: 0; }
    40% { opacity: 1; }
    60% { transform: translateY(0px) rotate(5deg); }
    100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
  }
  @keyframes itemDrop2 {
    0% { transform: translateY(-80px) rotate(20deg); opacity: 0; }
    20% { opacity: 0; }
    70% { opacity: 1; }
    80% { transform: translateY(0px) rotate(-5deg); }
    100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
  }
  @keyframes itemDrop3 {
    0% { transform: translateY(-80px) rotate(-10deg); opacity: 0; }
    40% { opacity: 0; }
    90% { opacity: 1; }
    95% { transform: translateY(0px) rotate(8deg); }
    100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
  }
  @keyframes starBurst {
    0% { transform: scale(0) rotate(-45deg); opacity: 0; }
    50% { transform: scale(1.3) rotate(10deg); opacity: 1; }
    75% { transform: scale(0.9) rotate(-5deg); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; }
  }
  @keyframes sparkle {
    0%, 100% { opacity: 0; transform: scale(0); }
    50% { opacity: 1; transform: scale(1); }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }
`;

// Animation 1: Thumbs up
function ThumbsUpAnimation() {
  return (
    <div style={{ animation: 'thumbPop 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards', marginBottom: '0.5rem' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" strokeWidth="3"/>
        {/* Thumb */}
        <path d="M38 68h8V52c0-2 1.5-4 4-4h4c1 0 2 0.5 2.5 1.5L62 58h12c3 0 5 2 5 5 0 1-0.3 2-0.8 2.8l-6 14c-0.7 1.5-2.2 2.5-3.8 2.5H46c-2.2 0-4-1.8-4-4v-2H38c-2.2 0-4-1.8-4-4v-6c0-2.2 1.8-4 4-4z" fill="white"/>
        {/* Sparkles */}
        <circle cx="88" cy="32" r="4" fill="rgba(255,255,255,0.8)" style={{ animation: 'sparkle 1.5s 0.3s ease-in-out infinite' }}/>
        <circle cx="28" cy="40" r="3" fill="rgba(255,255,255,0.6)" style={{ animation: 'sparkle 1.5s 0.7s ease-in-out infinite' }}/>
        <circle cx="92" cy="75" r="3" fill="rgba(255,255,255,0.7)" style={{ animation: 'sparkle 1.5s 1s ease-in-out infinite' }}/>
      </svg>
    </div>
  );
}

// Animation 2: Items falling into cart
function CartFillAnimation() {
  return (
    <div style={{ position: 'relative', width: 140, height: 140, marginBottom: '0.5rem' }}>
      {/* Apple */}
      <div style={{ position: 'absolute', top: 0, left: 20, animation: 'itemDrop1 1s 0.1s cubic-bezier(0.34,1.2,0.64,1) both' }}>
        <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#FF6B6B"/><path d="M16 8 Q18 4 22 5" stroke="#4CAF50" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
      </div>
      {/* Milk */}
      <div style={{ position: 'absolute', top: 0, left: 90, animation: 'itemDrop2 1s 0.3s cubic-bezier(0.34,1.2,0.64,1) both' }}>
        <svg width="28" height="36" viewBox="0 0 28 36"><rect x="6" y="8" width="16" height="24" rx="3" fill="white" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/><path d="M8 8 L6 2h16l-2 6z" fill="white"/><text x="14" y="24" textAnchor="middle" fontSize="10" fill="#5B9BD5">🥛</text></svg>
      </div>
      {/* Bread */}
      <div style={{ position: 'absolute', top: 0, left: 55, animation: 'itemDrop3 1s 0.5s cubic-bezier(0.34,1.2,0.64,1) both' }}>
        <svg width="34" height="28" viewBox="0 0 34 28"><ellipse cx="17" cy="16" rx="14" ry="10" fill="#F4A261"/><ellipse cx="17" cy="10" rx="12" ry="8" fill="#E9C46A"/></svg>
      </div>
      {/* Cart */}
      <div style={{ position: 'absolute', bottom: 0, left: 10, animation: 'cartBounce 0.6s 0.05s cubic-bezier(0.34,1.2,0.64,1) both' }}>
        <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
          <rect x="15" y="22" width="90" height="42" rx="6" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5"/>
          <path d="M15 22L22 8h76l7 14" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinejoin="round"/>
          <line x1="15" y1="22" x2="105" y2="22" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>
          <circle cx="35" cy="68" r="6" fill="rgba(255,255,255,0.9)"/>
          <circle cx="85" cy="68" r="6" fill="rgba(255,255,255,0.9)"/>
        </svg>
      </div>
    </div>
  );
}

// Animation 3: Star burst / confetti
function StarBurstAnimation() {
  const stars = [
    { x: 60, y: 60, r: 28, delay: '0s', color: 'rgba(255,255,255,0.95)' },
    { x: 22, y: 30, r: 12, delay: '0.15s', color: 'rgba(255,220,100,0.9)' },
    { x: 98, y: 28, r: 10, delay: '0.25s', color: 'rgba(255,180,100,0.9)' },
    { x: 15, y: 75, r: 8, delay: '0.35s', color: 'rgba(255,255,255,0.7)' },
    { x: 105, y: 80, r: 9, delay: '0.45s', color: 'rgba(255,220,100,0.8)' },
    { x: 60, y: 10, r: 7, delay: '0.1s', color: 'rgba(255,255,255,0.8)' },
  ];
  return (
    <div style={{ marginBottom: '0.5rem', animation: 'pulse 2s 1s ease-in-out infinite' }}>
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        {stars.map((s, i) => (
          <polygon key={i}
            points={starPoints(s.x, s.y, s.r, s.r * 0.4, 5)}
            fill={s.color}
            style={{ animation: `starBurst 0.6s ${s.delay} cubic-bezier(0.34,1.56,0.64,1) both` }}
          />
        ))}
        {/* Checkmark circle */}
        <circle cx="60" cy="60" r="24" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" style={{ animation: 'starBurst 0.5s 0s cubic-bezier(0.34,1.56,0.64,1) both' }}/>
        <polyline points="50,60 58,68 72,52" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ animation: 'starBurst 0.4s 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}/>
      </svg>
    </div>
  );
}

function starPoints(cx, cy, outer, inner, points) {
  let path = '';
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    path += (i === 0 ? '' : ' ') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  return path;
}

// ---- Checkout Steps Screen ----
function CheckoutStepsScreen() {
  const steps = [
    {
      icon: '🏪',
      title: 'Ga naar de kassa',
      desc: 'Loop naar de kassa met je volle winkelmandje.',
      color: '#5B9BD5',
      bg: 'rgba(91,155,213,0.18)',
    },
    {
      icon: '📦',
      title: 'Leg producten op de band',
      desc: 'Haal alle producten uit je mandje en leg ze op de lopende band.',
      color: '#4CAF50',
      bg: 'rgba(76,175,80,0.18)',
    },
    {
      icon: '💳',
      title: 'Betaal de producten',
      desc: 'Betaal met je kaart of cash. Vergeet niet je bonnetje!',
      color: '#FF9800',
      bg: 'rgba(255,152,0,0.18)',
    },
  ];

  return (
    <div style={checkoutStyles.screen}>
      <div style={checkoutStyles.header}>
        <p style={checkoutStyles.title}>Bijna klaar!</p>
        <p style={checkoutStyles.subtitle}>Volg deze stappen:</p>
      </div>
      <div style={checkoutStyles.steps}>
        {steps.map((step, i) => (
          <div key={i} style={{ ...checkoutStyles.stepCard, borderLeftColor: step.color }}>
            <div style={{ ...checkoutStyles.stepNum, backgroundColor: step.bg, color: step.color }}>
              {i + 1}
            </div>
            <div style={checkoutStyles.stepIcon}>{step.icon}</div>
            <div style={checkoutStyles.stepBody}>
              <p style={{ ...checkoutStyles.stepTitle, color: step.color }}>{step.title}</p>
              <p style={checkoutStyles.stepDesc}>{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div style={checkoutStyles.footer}>
        <p style={checkoutStyles.footerText}>Goed gedaan vandaag! 🎉</p>
      </div>
    </div>
  );
}

const checkoutStyles = {
  screen: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(160deg, #1A2B3C 0%, #2C4A6E 100%)',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Nunito', system-ui, sans-serif",
    padding: '2rem 1.5rem',
    overflowY: 'auto',
  },
  header: {
    textAlign: 'center', marginBottom: '2rem', flexShrink: 0,
  },
  title: {
    fontSize: '2.25rem', fontWeight: '900', color: '#fff', margin: '0 0 0.25rem',
  },
  subtitle: {
    fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)', margin: 0, fontWeight: '600',
  },
  steps: {
    display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1,
  },
  stepCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: '16px',
    borderLeft: '5px solid',
    padding: '1.25rem',
    display: 'flex', alignItems: 'center', gap: '1rem',
    backdropFilter: 'blur(4px)',
  },
  stepNum: {
    width: '36px', height: '36px', borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: '900', fontSize: '1.1rem', flexShrink: 0,
  },
  stepIcon: {
    fontSize: '2.5rem', flexShrink: 0,
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    fontSize: '1.15rem', fontWeight: '800', margin: '0 0 0.3rem',
  },
  stepDesc: {
    fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', margin: 0, lineHeight: 1.4,
  },
  footer: {
    textAlign: 'center', paddingTop: '1.5rem', flexShrink: 0,
  },
  footerText: {
    fontSize: '1.5rem', fontWeight: '800', color: 'rgba(255,255,255,0.85)', margin: 0,
  },
};

// ---- Styles ----
const styles = {
  fullScreen: { position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden', fontFamily: "'Nunito', system-ui, sans-serif", userSelect: 'none', padding: '0.5rem 0 0' },
  spinner: { width: '60px', height: '60px', border: '6px solid #eee', borderTop: '6px solid #5B9BD5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '1rem' },
  loadingText: { fontSize: '1.1rem', color: '#aaa', margin: 0 },
  messageContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', padding: '2rem', textAlign: 'center' },
  messageIcon: { fontSize: '4rem', margin: 0 },
  messageText: { fontSize: '1.2rem', color: '#555', maxWidth: '300px', lineHeight: '1.6', margin: 0 },
  actionButton: { padding: '1rem 2rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' },

  // Progress
  progressSection: { flexShrink: 0, width: '100%', paddingTop: '0.5rem' },
  progressBarWrapper: { width: '100%', height: '12px', backgroundColor: '#eee', borderRadius: '6px', overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#5B9BD5', transition: 'width 0.4s ease', borderRadius: '6px' },
  progressLabelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0.25rem 0' },
  progressLabel: { fontSize: '0.9rem', fontWeight: '700', color: '#5B9BD5' },
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
  takenButton: { margin: '0 1rem 0.5rem', padding: '1rem 1.5rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '18px', fontSize: '1.3rem', fontWeight: '800', cursor: 'pointer', flexShrink: 0, width: 'calc(100% - 2rem)', transition: 'transform 0.15s, opacity 0.15s', boxShadow: '0 4px 16px rgba(91,155,213,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontFamily: 'inherit' },
  uncheckButton: { margin: '0 1rem 0.5rem', padding: '1rem 1.5rem', backgroundColor: '#fff', color: '#888', border: '2px solid #ddd', borderRadius: '18px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0, width: 'calc(100% - 2rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' },

  // Thumbnail strip
  stripWrapper: { flexShrink: 0, width: '100%', paddingBottom: '0.75rem' },
  strip: { display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1rem', scrollbarWidth: 'none' },
  stripItem: { flexShrink: 0, width: '60px', height: '60px', borderRadius: '10px', border: '2px solid #eee', backgroundColor: '#f9f9f9', cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.2s' },
  stripItemActive: { border: '3px solid #5B9BD5' },
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
  completionScreen: { position: 'fixed', inset: 0, background: 'linear-gradient(160deg, #5B9BD5 0%, #3A7FC1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Nunito', system-ui, sans-serif" },
  completionContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' },
  completionMessage: { fontSize: '3rem', fontWeight: '900', color: '#fff', margin: 0, lineHeight: 1.1 },
  completionName: { fontSize: '2rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)', margin: 0 },
  completionSub: { fontSize: '1.4rem', fontWeight: '600', color: 'rgba(255,255,255,0.85)', margin: 0 },
  completionNextButton: { padding: '1rem 2.5rem',  backgroundColor: 'rgba(255,255,255,0.2)',  color: '#fff',  border: '2px solid rgba(255,255,255,0.6)',  borderRadius: '16px',  fontSize: '1.25rem',  fontWeight: '800',  cursor: 'pointer',  fontFamily: "'Nunito', system-ui, sans-serif",  backdropFilter: 'blur(4px)'},

  storeRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.4rem' },
  storeLogoSmall: { width: '20px', height: '20px', objectFit: 'contain', borderRadius: '4px' },
  storeName: { fontSize: '0.9rem', color: '#888', fontWeight: '500' },
  overviewItemStore: { fontSize: '0.72rem', color: '#888', margin: 0, fontWeight: '500' },

  // Categorie + tag overlay — detail view (rechts boven in afbeelding)
  categoryIconOverlay: { position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: '10px', padding: '5px', boxShadow: '0 1px 5px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 1 },
  categoryIconOverlayImg: { width: '44px', height: '44px', objectFit: 'contain', display: 'block' },

  // Categorie + tag overlay — overzichtsview (rechts boven in kaartafbeelding)
  overviewCategoryIconOverlay: { position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: '6px', padding: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', zIndex: 1 },
  overviewCategoryIconOverlayImg: { width: '22px', height: '22px', objectFit: 'contain', display: 'block' },
};
