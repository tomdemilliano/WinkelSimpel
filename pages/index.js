// pages/index.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useUserClaims, getShopperSession, ROLES } from '../lib/auth';

export default function Home() {
  const router = useRouter();
  const { claims, loading } = useUserClaims();

  useEffect(() => {
    if (loading) return;
    if (claims?.role === ROLES.APP_ADMIN) router.replace('/admin');
    else if (claims?.role === ROLES.GUIDE) router.replace('/guide');
    else if (getShopperSession()) router.replace('/scan');
    else router.replace('/login');
  }, [claims, loading, router]);

  return null;
}
