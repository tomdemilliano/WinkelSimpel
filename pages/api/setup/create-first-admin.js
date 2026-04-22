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
 *   FIREBASE_ADMIN_PRIVATE_KEY
 *   NEXT_PUBLIC_SETUP_KEY  (remove after first use)
 */

import { initializeApp, getApps, getApp, deleteApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ADMIN_APP_NAME = 'winkel-simpel-admin';

function parsePrivateKey(raw) {
  console.log('[setup] parsePrivateKey: raw length =', raw?.length);
  console.log('[setup] parsePrivateKey: starts with =', raw?.trim().substring(0, 30));

  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');

  // Remove surrounding quotes if present
  let key = raw.trim().replace(/^["']/g, '').replace(/["']$/g, '');

  // Handle both formats: real newlines or literal \n
  if (!key.includes('\n')) {
    console.log('[setup] parsePrivateKey: no real newlines found, replacing \\n');
    key = key.replace(/\\n/g, '\n');
  } else {
    console.log('[setup] parsePrivateKey: real newlines found, using as-is');
  }

  const hasBegin = key.includes('-----BEGIN PRIVATE KEY-----');
  const hasEnd = key.includes('-----END PRIVATE KEY-----');
  const lineCount = key.split('\n').length;
  console.log('[setup] parsePrivateKey: hasBegin =', hasBegin, '| hasEnd =', hasEnd, '| lines =', lineCount);

  if (!hasBegin || !hasEnd) {
    throw new Error('FIREBASE_ADMIN_PRIVATE_KEY does not look like a valid PEM key');
  }

  return key;
}

function getAdminApp() {
  console.log('[setup] getAdminApp: checking env vars...');
  console.log('[setup] PROJECT_ID =', process.env.FIREBASE_ADMIN_PROJECT_ID);
  console.log('[setup] CLIENT_EMAIL =', process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  console.log('[setup] PRIVATE_KEY set =', !!process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  const privateKey = parsePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  // Use a named app to avoid conflicts with cached default app instances
  // Delete and recreate if it already exists to ensure fresh credentials
  try {
    const existing = getApp(ADMIN_APP_NAME);
    console.log('[setup] getAdminApp: found existing named app, reusing');
    return existing;
  } catch {
    // App does not exist yet — initialize it
    console.log('[setup] getAdminApp: initializing new named app');
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
      }),
    }, ADMIN_APP_NAME);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const SETUP_KEY = process.env.NEXT_PUBLIC_SETUP_KEY;
  console.log('[setup] SETUP_KEY set =', !!SETUP_KEY);

  if (!SETUP_KEY) {
    return res.status(403).json({ message: 'Setup is niet actief.' });
  }

  const { setupKey, firstName, lastName, email, password, orgName } = req.body;
  console.log('[setup] body received: firstName =', firstName, '| email =', email, '| orgName =', orgName);

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
    console.log('[setup] initializing admin app...');
    const adminApp = getAdminApp();
    console.log('[setup] admin app initialized, getting auth and firestore...');

    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);
    console.log('[setup] auth and firestore ready');

    // Safety check: verify no users exist yet
    console.log('[setup] checking existing users...');
    const existingUsers = await adminAuth.listUsers(1);
    console.log('[setup] existing user count =', existingUsers.users.length);

    if (existingUsers.users.length > 0) {
      return res.status(400).json({
        message: 'Er bestaat al een gebruiker. Setup kan maar één keer uitgevoerd worden.',
      });
    }

    // Create Firebase Auth user
    console.log('[setup] creating auth user...');
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });
    console.log('[setup] auth user created, uid =', userRecord.uid);

    // Set custom claims
    console.log('[setup] setting custom claims...');
    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'app_admin',
      orgId: null,
    });
    console.log('[setup] custom claims set');

    let orgId = null;

    if (orgName?.trim()) {
      console.log('[setup] creating organization:', orgName.trim());
      const orgRef = await adminDb.collection('organizations').add({
        name: orgName.trim(),
        createdBy: userRecord.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      orgId = orgRef.id;
      console.log('[setup] organization created, orgId =', orgId);

      await adminAuth.setCustomUserClaims(userRecord.uid, {
        role: 'app_admin',
        orgId,
      });
      console.log('[setup] updated custom claims with orgId');
    }

    // Store member document
    const memberCollection = orgId
      ? adminDb.collection('organizations').doc(orgId).collection('members')
      : adminDb.collection('admins');

    console.log('[setup] writing member document...');
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
    console.log('[setup] member document written — setup complete!');

    return res.status(200).json({
      uid: userRecord.uid,
      orgId,
      message: 'Beheerder aangemaakt.',
    });

  } catch (err) {
    console.error('[setup] ERROR:', {
      message: err.message,
      code: err.code,
      stack: err.stack?.split('\n').slice(0, 3).join(' | '),
    });

    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }

    return res.status(500).json({
      message: `Fout: ${err.message || 'Onbekende fout'}`,
    });
  }
}
