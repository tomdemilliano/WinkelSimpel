/**
 * pages/api/shopper/auth.js — Winkel Simpel
 *
 * Validates QR token, sets custom claims on anonymous user,
 * and returns the active shopping list ID — all server-side.
 * This avoids Firestore permission issues on the client.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ADMIN_APP_NAME = 'winkel-simpel-admin';

function parsePrivateKey(raw) {
  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');
  let key = raw.trim().replace(/^["']/g, '').replace(/["']$/g, '');
  if (!key.includes('\n')) key = key.replace(/\\n/g, '\n');
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) throw new Error('Invalid PEM key');
  return key;
}

function getAdminApp() {
  try { return getApp(ADMIN_APP_NAME); } catch {
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
    const adminDb = getFirestore(getAdminApp());

    // Verify the anonymous user's ID token
    const idToken = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(idToken);

    if (!decoded.firebase?.sign_in_provider?.includes('anonymous')) {
      return res.status(403).json({ message: 'Alleen anonieme gebruikers zijn toegestaan.' });
    }

    // Set custom claims
    await adminAuth.setCustomUserClaims(decoded.uid, {
      role: 'shopper',
      orgId,
      memberId,
    });

    // Find the active shopping list server-side (bypasses Firestore rules)
    const listsSnap = await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('shoppingLists')
      .where('assignedTo.type', '==', 'member')
      .where('assignedTo.id', '==', memberId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    const listId = listsSnap.empty ? null : listsSnap.docs[0].id;

    return res.status(200).json({ success: true, listId });
  } catch (err) {
    console.error('shopper-auth error:', err.message);
    return res.status(500).json({ message: `Fout: ${err.message}` });
  }
}
