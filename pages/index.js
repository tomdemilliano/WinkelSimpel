// pages/index.js
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useUserClaims, getShopperSession, ROLES } from '../lib/auth';

export default function Home() {
  const router = useRouter();
  const { claims, loading } = useUserClaims();
  const redirectingRef = useRef(false);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; });

  useEffect(() => {
    if (loading) return;
    if (redirectingRef.current) return;
    // Wacht als claims geladen zijn maar role nog null is
    if (claims !== null && !claims?.role) return;
    redirectingRef.current = true;
    if (claims?.role === ROLES.APP_ADMIN) routerRef.current.replace('/admin');
    else if (claims?.role === ROLES.GUIDE || claims?.role === ROLES.ORG_ADMIN) routerRef.current.replace('/guide');
    else if (getShopperSession()) routerRef.current.replace('/scan');
    else routerRef.current.replace('/login');
  // router bewust NIET in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, loading]);

  return null;
}
