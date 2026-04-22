/**
 * pages/api/shopper/auth.js — Winkel Simpel
 *
 * Server-side API route that assigns orgId and memberId as custom claims
 * to an anonymous Firebase Auth user after a successful QR scan.
 *
 * Flow:
 *   1. Client validates QR token against Firestore (client-side)
 *   2. Client signs in anonymously via Firebase Auth (client-side)
 *   3. Client calls this route with the anonymous user's ID token
 *   4. This route sets custom claims: { role: 'shopper', orgId, memberId }
 *   5. Client forces a token refresh to get the new claims
 *   6. Firestore rules now recognize the shopper via orgId claim
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const ADMIN_APP_NAME = 'winkel-simpel-admin';

function parsePrivateKey(raw) {
  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');
  let key = raw.trim().replace(/^["']/g, '').replace(/["']$/g, '');
  if (!key.includes('\n')) {
    key = key.replace(/\\n/g, '\n');
  }
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not a valid PEM key');
  }
  return key;
}

function getAdminApp() {
  try {
    return getApp(ADMIN_APP_NAME);
  } catch {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: parsePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
      }),
    }, ADMIN_APP_NAME);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Geen token meegegeven.' });
  }

  const { orgId, memberId } = req.body;
  if (!orgId || !memberId) {
    return res.status(400).json({ message: 'orgId en memberId zijn verplicht.' });
  }

  try {
    const adminAuth = getAuth(getAdminApp());

    // Verify the anonymous user's ID token
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(idToken);

    // Only allow anonymous users (not existing guides/admins)
    if (!decoded.firebase?.sign_in_provider?.includes('anonymous')) {
      return res.status(403).json({ message: 'Alleen anonieme gebruikers zijn toegestaan.' });
    }

    // Set custom claims on the anonymous user
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: 'shopper',
      orgId,
      memberId,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('shopper-auth error:', err.message);
    return res.status(500).json({ message: `Fout: ${err.message}` });
  }
}
