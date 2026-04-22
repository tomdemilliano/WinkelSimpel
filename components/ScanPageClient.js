/**
 * components/ScanPageClient.js — stap voor stap flow test
 * Dit component wordt alleen client-side geladen (geen SSR)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { validateQrToken, saveShopperSession } from '../lib/auth';
import { signInAnonymously, getIdToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { ShoppingListFactory } from '../lib/dbSchema';

export default function ScanPageClient() {
  const router = useRouter();
  const [log, setLog] = useState(['client geladen']);
  const [done, setDone] = useState(false);

  function addLog(msg) {
    console.log('[scan]', msg);
    setLog(prev => [...prev, msg]);
  }

  useEffect(() => {
    if (!router.isReady) return;
    const { org, token } = router.query;
    if (!org || !token) {
      addLog('geen org/token → keuze tonen');
      return;
    }
    addLog(`starten: org=${org.slice(0,8)} token=${token.slice(0,8)}`);
    runFlow(org, token);
  }, [router.isReady]);

  async function runFlow(orgId, token) {
    try {
      addLog('stap 1: validateQrToken...');
      const member = await validateQrToken(orgId, token);
      addLog(`stap 1: ${member ? 'OK — ' + member.firstName : 'NIET GEVONDEN'}`);
      if (!member) return;

      addLog('stap 2: signInAnonymously...');
      const cred = await signInAnonymously(auth);
      addLog(`stap 2: OK — uid=${cred.user.uid.slice(0,8)}`);

      addLog('stap 3: getIdToken...');
      const idToken = await getIdToken(cred.user);
      addLog('stap 3: OK');

      addLog('stap 4: POST /api/shopper/auth...');
      const res = await fetch('/api/shopper/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ orgId, memberId: member.memberId }),
      });
      addLog(`stap 4: status=${res.status}`);
      if (!res.ok) {
        const d = await res.json();
        addLog(`stap 4 FOUT: ${d.message}`);
        return;
      }

      addLog('stap 5: token refresh...');
      await cred.user.getIdToken(true);
      addLog('stap 5: OK');

      addLog('stap 6: sessie opslaan...');
      saveShopperSession({ orgId, memberId: member.memberId, firstName: member.firstName });
      addLog('stap 6: OK');

      addLog('stap 7: getActiveForMember...');
      const listSnap = await ShoppingListFactory.getActiveForMember(orgId, member.memberId);
      addLog(`stap 7: ${listSnap.docs.length} lijstjes`);

      if (!listSnap.empty) {
        const listId = listSnap.docs[0].id;
        addLog(`redirect → /shop/${listId}`);
        setDone(true);
        router.replace(`/shop/${listId}?org=${orgId}&token=${token}`);
      } else {
        addLog('GEEN actief lijstje gevonden voor dit lid');
      }
    } catch (err) {
      addLog(`EXCEPTION: ${err.code || ''} — ${err.message}`);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#1a1a1a', padding: '1.5rem', overflow: 'auto' }}>
      <p style={{ color: '#00e676', fontFamily: 'monospace', fontSize: '1rem', fontWeight: 'bold', margin: '0 0 1rem' }}>
        {done ? '✓ Redirecting...' : 'Scan flow test'}
      </p>
      {log.map((l, i) => (
        <p key={i} style={{
          color: l.includes('FOUT') || l.includes('EXCEPTION') || l.includes('NIET') ? '#ff5252'
               : l.includes('OK') ? '#69f0ae' : '#fff',
          fontFamily: 'monospace',
          fontSize: '0.82rem',
          margin: '0.2rem 0',
          wordBreak: 'break-all',
        }}>
          → {l}
        </p>
      ))}
    </div>
  );
}
