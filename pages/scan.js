/**
 * pages/scan.js — minimale test zonder imports
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function ScanPage() {
  const router = useRouter();
  const [log, setLog] = useState(['component geladen']);

  useEffect(() => {
    setLog(prev => [...prev, 'useEffect uitgevoerd']);
    setLog(prev => [...prev, 'router.ready=' + router.isReady]);
    setLog(prev => [...prev, 'query=' + JSON.stringify(router.query)]);
  }, [router.isReady]);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#1a1a1a', padding: '1rem', overflow: 'auto' }}>
      <p style={{ color: '#00e676', fontFamily: 'monospace', fontSize: '1rem', margin: '0 0 1rem' }}>
        SCAN TEST PAGINA
      </p>
      {log.map((l, i) => (
        <p key={i} style={{ color: '#fff', fontFamily: 'monospace', fontSize: '0.85rem', margin: '0.2rem 0' }}>
          → {l}
        </p>
      ))}
    </div>
  );
}
