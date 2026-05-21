/**
 * pages/api/auth/register.js — Winkel Simpel
 *
 * Zelfregistratie: maakt een Firebase Auth gebruiker aan, een privé-organisatie,
 * een member-document en stelt custom claims in.
 * Publieke route — geen auth vereist.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ADMIN_APP_NAME = 'winkel-simpel-admin';

function parsePrivateKey(raw) {
  if (!raw) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY is not set');
  let key = raw.trim().replace(/^["']/g, '').replace(/["']$/g, '');
  if (!key.includes('\n')) key = key.replace(/\\n/g, '\n');
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
  if (req.method !== 'POST') return res.status(405).json({ message: 'Methode niet toegestaan.' });

  const { firstName, lastName, email, password } = req.body;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ message: 'Vul alle velden in.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Wachtwoord moet minimaal 8 tekens zijn.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
  }

  let userRecord;
  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    userRecord = await adminAuth.createUser({
      email: email.trim(),
      password,
      displayName: `${firstName.trim()} ${lastName.trim()}`,
    });

    const orgRef = await adminDb.collection('organizations').add({
      name: `${firstName.trim()} ${lastName.trim()}`,
      createdBy: userRecord.uid,
      isPrivate: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    const orgId = orgRef.id;

    await adminAuth.setCustomUserClaims(userRecord.uid, {
      role: 'guide',
      orgId,
      orgType: 'private',
    });

    await adminDb
      .collection('organizations').doc(orgId)
      .collection('members').doc(userRecord.uid)
      .set({
        role: 'guide',
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        qrToken: null,
        groupIds: [],
        mustChangePassword: false,
        createdBy: userRecord.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    return res.status(201).json({ uid: userRecord.uid, orgId });

  } catch (err) {
    if (userRecord) {
      const adminApp = getAdminApp();
      await getAuth(adminApp).deleteUser(userRecord.uid).catch(() => {});
    }
    console.error('register error:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    if (err.code === 'auth/invalid-email') {
      return res.status(400).json({ message: 'Ongeldig e-mailadres.' });
    }
    if (err.code === 'auth/weak-password') {
      return res.status(400).json({ message: 'Wachtwoord is te zwak. Gebruik minimaal 8 tekens.' });
    }
    return res.status(500).json({ message: 'Er is een fout opgetreden. Probeer opnieuw.' });
  }
}
