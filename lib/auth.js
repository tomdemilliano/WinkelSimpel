/**
 * auth.js — Winkel Simpel
 *
 * Authentication helpers and role-based access control.
 * Uses Firebase Auth for guides and app_admins.
 * Shoppers authenticate via QR token stored in localStorage.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase';
import { MemberFactory } from './dbSchema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ROLES = {
  APP_ADMIN: 'app_admin',
  ORG_ADMIN: 'org_admin',
  GUIDE: 'guide',
  SHOPPER: 'shopper',
};

const SHOPPER_SESSION_KEY = 'ws_shopper_session';

// ---------------------------------------------------------------------------
// Guide / App admin auth
// ---------------------------------------------------------------------------

/**
 * Sign in with email and password.
 * Returns the Firebase user object.
 */
export async function signIn(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * Sign out the current Firebase user.
 */
export async function signOut() {
  return firebaseSignOut(auth);
}

/**
 * Get the role and orgId from the current user's ID token claims.
 * Returns null if not authenticated.
 */
export async function getCurrentUserClaims() {
  const user = auth.currentUser;
  if (!user) return null;
  const idTokenResult = await user.getIdTokenResult();
  return {
    uid: user.uid,
    email: user.email,
    role: idTokenResult.claims.role || null,
    orgId: idTokenResult.claims.orgId || null,
  };
}

// ---------------------------------------------------------------------------
// Shopper session (QR-token based, stored in localStorage)
// ---------------------------------------------------------------------------

/**
 * Save a shopper session to localStorage after successful QR scan.
 */
export function saveShopperSession({ orgId, memberId, firstName }) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    SHOPPER_SESSION_KEY,
    JSON.stringify({ orgId, memberId, firstName })
  );
}

/**
 * Retrieve the current shopper session from localStorage.
 * Returns null if no session exists.
 */
export function getShopperSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SHOPPER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the shopper session from localStorage.
 */
export function clearShopperSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SHOPPER_SESSION_KEY);
}

/**
 * Validate a QR token against Firestore.
 * Returns the member data if valid, null otherwise.
 */
export async function validateQrToken(orgId, token) {
  const snap = await MemberFactory.getByQrToken(orgId, token);
  if (snap.empty) return null;
  const memberDoc = snap.docs[0];
  return { memberId: memberDoc.id, ...memberDoc.data() };
}

// ---------------------------------------------------------------------------
// React hooks
// ---------------------------------------------------------------------------

/**
 * Hook: returns the current Firebase auth user and loading state.
 */
export function useAuthUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

/**
 * Hook: returns the current user's claims (role, orgId) and loading state.
 */
export function useUserClaims() {
  const [claims, setClaims] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setClaims(null);
        setLoading(false);
        return;
      }
      const idTokenResult = await firebaseUser.getIdTokenResult();
      setClaims({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: idTokenResult.claims.role || null,
        orgId: idTokenResult.claims.orgId || null,
      });
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { claims, loading };
}

// ---------------------------------------------------------------------------
// Higher-order component: role guard
// ---------------------------------------------------------------------------

/**
 * withRoleGuard(allowedRole, PageComponent)
 *
 * Wraps a page component and redirects unauthenticated or unauthorized users.
 *
 * Usage:
 *   export default withRoleGuard(ROLES.GUIDE, MyPage);
 *
 * For shopper pages, use withShopperGuard instead.
 */
export function withRoleGuard(allowedRoles, PageComponent) {
  // Accepteer zowel een string als een array van rollen
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  function GuardedPage(props) {
    const router = useRouter();
    const { claims, loading } = useUserClaims();

    useEffect(() => {
      if (loading) return;
      if (!claims) {
        router.replace('/login');
        return;
      }
      if (!roles.includes(claims.role)) {
        if (claims.role === ROLES.APP_ADMIN) router.replace('/admin');
        else if (claims.role === ROLES.GUIDE || claims.role === ROLES.ORG_ADMIN) router.replace('/guide');
        else router.replace('/login');
      }
    }, [claims, loading, router]);

    if (loading || !claims || !roles.includes(claims.role)) {
      return (
        <div style={loadingStyle}>
          <p style={{ color: '#888', fontSize: '1rem' }}>Laden...</p>
        </div>
      );
    }

    return <PageComponent {...props} claims={claims} />;
  }

  GuardedPage.displayName = `withRoleGuard(${roles.join(',')})`;
  return GuardedPage;
}

/**
 * withShopperGuard(PageComponent)
 *
 * Wraps a shopper page. Validates the localStorage session.
 * Redirects to /scan if no valid session is found.
 */
export function withShopperGuard(PageComponent) {
  function GuardedShopperPage(props) {
    const router = useRouter();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const stored = getShopperSession();
      if (!stored) {
        router.replace('/scan');
        return;
      }
      setSession(stored);
      setLoading(false);
    }, [router]);

    if (loading || !session) {
      return (
        <div style={loadingStyle}>
          <p style={{ color: '#888', fontSize: '1rem' }}>Laden...</p>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Geen sessie gevonden?{' '}
            <a href="/scan" style={{ color: '#4CAF50' }}>Scan opnieuw</a>
          </p>
        </div>
      );
    }

    return <PageComponent {...props} shopperSession={session} />;
  }

  GuardedShopperPage.displayName = 'withShopperGuard';
  return GuardedShopperPage;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const loadingStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  backgroundColor: '#fff',
};
