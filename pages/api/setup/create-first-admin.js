/**
 * pages/api/setup/create-first-admin.js — Winkel Simpel
 *
 * Server-side API route to create the very first app_admin.
 * Protected by a setup key (NEXT_PUBLIC_SETUP_KEY env var).
 *
 * This route checks that no app_admin exists yet before proceeding.
 * After setup, remove NEXT_PUBLIC_SETUP_KEY from environment variables
 * to permanently disable this route.
 *
 * Required server-side environment variables:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *   NEXT_PUBLIC_SETUP_KEY  (remove after first use)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  // Check setup key is still active
  const SETUP_KEY = process.env.NEXT_PUBLIC_SETUP_KEY;
  if (!SETUP_KEY) {
    return res.status(403).json({ message: 'Setup is niet actief.' });
  }

  const { setupKey, firstName, lastName, email, password, orgName } = req.body;

  // Verify setup key
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

    // Safety check: don't allow setup if an app_admin already exists
    // We check by listing users and checking custom claims
    // (Firebase doesn't support querying by custom claims server-side directly,
    //  so we check the organizations collection instead)
    const orgsSnap = await adminDb.collection('organizations').limit(1).get();
    const membersWithAdminRole = await adminDb
      .collectionGroup('members')
      .where('role', '==', 'app_admin')
      .limit(1)
      .get();

    if (!membersWithAdminRole.empty) {
      return res.status(400).json({
        message: 'Er bestaat al een beheerder. Setup kan maar één keer uitgevoerd worden.',
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

    // Create member document
    // For app_admin we store under the first org if available,
    // otherwise under a top-level admins collection
    const memberPath = orgId
      ? adminDb.collection('organizations').doc(orgId).collection('members').doc(userRecord.uid)
      : adminDb.collection('admins').doc(userRecord.uid);

    await memberPath.set({
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
    console.error('create-first-admin error:', err);

    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }

    return res.status(500).json({ message: 'Er is een fout opgetreden. Probeer opnieuw.' });
  }
}
