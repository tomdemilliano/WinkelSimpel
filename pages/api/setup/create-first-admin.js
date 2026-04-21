/**
 * pages/api/setup/create-first-admin.js — Winkel Simpel
 *
 * Server-side API route to create the very first app_admin.
 * Protected by a setup key (NEXT_PUBLIC_SETUP_KEY env var).
 *
 * After setup, remove NEXT_PUBLIC_SETUP_KEY from environment variables
 * to permanently disable this route.
 *
 * Required server-side environment variables:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY  (paste with real newlines in Vercel, not \n)
 *   NEXT_PUBLIC_SETUP_KEY  (remove after first use)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function parsePrivateKey(raw) {
  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');

  // Remove surrounding quotes if present
  let key = raw.trim().replace(/^["']/g, '').replace(/["']$/g, '');

  // Vercel may store the key with real newlines (after auto-converting \n on paste)
  // or with literal \n sequences. Handle both cases:
  if (!key.includes('\n')) {
    // No real newlines found — replace literal \n with real newlines
    key = key.replace(/\\n/g, '\n');
  }

  // Verify the key has the expected PEM structure
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY does not look like a valid PEM key');
  }

  return key;
}

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: parsePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const SETUP_KEY = process.env.NEXT_PUBLIC_SETUP_KEY;
  if (!SETUP_KEY) {
    return res.status(403).json({ message: 'Setup is niet actief.' });
  }

  const { setupKey, firstName, lastName, email, password, orgName } = req.body;

  if (setupKey !== SETUP_KEY) {
    return res.status(403).json({ message: 'Ongeldige setup-sleutel.' });
  }

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'Ontbrekende velden.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn.' });
  }

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    // Safety check: verify no users exist yet in Firebase Auth
    const existingUsers = await adminAuth.listUsers(1);
    if (existingUsers.users.length > 0) {
      return res.status(400).json({
        message: 'Er bestaat al een gebruiker. Setup kan maar één keer uitgevoerd worden.',
      });
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    // Set custom claims
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'app_admin',
      orgId: null,
    });

    let orgId = null;

    // Optionally create the first organization
    if (orgName?.trim()) {
      const orgRef = await adminDb.collection('organizations').add({
        name: orgName.trim(),
        createdBy: userRecord.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      orgId = orgRef.id;

      // Update claims with orgId
      await adminAuth.setCustomUserClaims(userRecord.uid, {
        role: 'app_admin',
        orgId,
      });
    }

    // Store member document
    const memberCollection = orgId
      ? adminDb.collection('organizations').doc(orgId).collection('members')
      : adminDb.collection('admins');

    await memberCollection.doc(userRecord.uid).set({
      role: 'app_admin',
      firstName,
      lastName,
      email,
      qrToken: null,
      groupIds: [],
      createdBy: userRecord.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      uid: userRecord.uid,
      orgId,
      message: 'Beheerder aangemaakt.',
    });

  } catch (err) {
    console.error('create-first-admin error:', err.message);

    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }
    if (err.message?.includes('FIREBASE_ADMIN_PRIVATE_KEY')) {
      return res.status(500).json({ message: `Configuratiefout: ${err.message}` });
    }

    return res.status(500).json({ message: 'Er is een fout opgetreden.' });
  }
}
