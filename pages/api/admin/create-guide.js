/**
 * pages/api/admin/create-guide.js — Winkel Simpel
 *
 * Server-side API route that creates a Firebase Auth account for a new guide
 * and stores the member document in Firestore.
 *
 * Uses the Firebase Admin SDK (runs server-side only).
 * Requires the following environment variables (server-side, no NEXT_PUBLIC_ prefix):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *
 * Only callable by authenticated app_admins (verified via ID token).
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Initialize Firebase Admin SDK (once)
// ---------------------------------------------------------------------------
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Vercel stores multiline values with literal \n — replace them
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  // Verify the caller is an authenticated app_admin
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Niet geauthenticeerd.' });
  }

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    // Verify ID token of the calling user
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);

    if (decodedToken.role !== 'app_admin') {
      return res.status(403).json({ message: 'Geen toegang.' });
    }

    const { orgId, firstName, lastName, email, password } = req.body;

    if (!orgId || !firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'Ontbrekende velden.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn.' });
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // Set custom claims: role and orgId
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'guide',
      orgId,
    });

    // Create Firestore member document
    await adminDb
      .collection('organizations')
      .doc(orgId)
      .collection('members')
      .doc(userRecord.uid)
      .set({
        role: 'guide',
        firstName,
        lastName,
        email,
        qrToken: null,
        groupIds: [],
        createdBy: decodedToken.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    return res.status(200).json({ uid: userRecord.uid });
  } catch (err) {
    console.error('create-guide error:', err);

    // Firebase Auth specific errors
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }

    return res.status(500).json({ message: 'Er is een fout opgetreden. Probeer opnieuw.' });
  }
}
