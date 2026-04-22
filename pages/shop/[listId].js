/**
 * pages/shop/[listId].js — Winkel Simpel
 * SSR uitgeschakeld — Firebase werkt alleen client-side
 */

import dynamic from 'next/dynamic';

const ShopPageClient = dynamic(() => import('../../components/ShopPageClient'), {
  ssr: false,
  loading: () => (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '60px', height: '60px', border: '6px solid #eee', borderTop: '6px solid #4CAF50', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function ShopPage() {
  return <ShopPageClient />;
}
