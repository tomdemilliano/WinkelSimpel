/**
 * pages/scan.js — stap voor stap flow test
 * Gebruik dynamic import met ssr:false om client-only rendering te forceren
 */

import dynamic from 'next/dynamic';

// Laad de echte component alleen client-side — Firebase werkt niet server-side
const ScanPageClient = dynamic(() => import('../components/ScanPageClient'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '56px', height: '56px', border: '5px solid #eee', borderTop: '5px solid #4CAF50', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function ScanPage() {
  return <ScanPageClient />;
}
