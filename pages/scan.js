/**
 * pages/scan.js — import test
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

// Test imports één voor één
let importError = null;
let firebaseOk = false;
let authOk = false;
let dbOk = false;

try {
  require('../lib/firebase');
  firebaseOk = true;
} catch(e) {
  importError = 'firebase.js: ' + e.message;
}

if (firebaseOk) {
  try {
    require('../lib/auth');
    authOk = true;
  } catch(e) {
    importError = 'auth.js: ' + e.message;
  }
}

if (authOk) {
  try {
    require('../lib/dbSchema');
    dbOk = true;
  } catch(e) {
    importError = 'dbSchema.js: ' + e.message;
  }
}

export default function ScanPage() {
  const router = useRouter();
  const [log, setLog] = useState([
    'firebase.js: ' + (firebaseOk ? '✓ OK' : '✗ FOUT'),
    'auth.js: ' + (authOk ? '✓ OK' : '✗ FOUT'),
    'dbSchema.js: ' + (dbOk ? '✓ OK' : '✗ FOUT'),
    importError ? 'FOUT: ' + importError : 'alle imports OK',
  ]);

  useEffect(() => {
    if (!router.isReady) return;
    const { org, token } = router.query;
    setLog(prev => [...prev,
      `router ready`,
      `org=${org?.slice(0,8)}`,
      `token=${token?.slice(0,8)}`,
    ]);
  }, [router.isReady]);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#1a1a1a', padding: '1.5rem', overflow: 'auto' }}>
      <p style={{ color: '#00e676', fontFamily: 'monospace', fontSize: '1.1rem', margin: '0 0 1rem', fontWeight: 'bold' }}>
        Import test
      </p>
      {log.map((l, i) => (
        <p key={i} style={{
          color: l.includes('FOUT') ? '#ff5252' : '#fff',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          margin: '0.25rem 0',
          wordBreak: 'break-all',
        }}>
          {l}
        </p>
      ))}
    </div>
  );
}
