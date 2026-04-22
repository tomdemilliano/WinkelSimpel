/**
 * pages/scan.js — Winkel Simpel
 * SSR uitgeschakeld — Firebase werkt alleen client-side
 */

import dynamic from 'next/dynamic';

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
