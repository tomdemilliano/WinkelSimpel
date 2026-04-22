/**
 * pages/api/shopper/auth.js — Winkel Simpel
 *
 * Valideert QR token en geeft de actieve listId terug.
 * Geen Firebase Auth nodig — de QR token is de authenticatie.
 * Gebruikt Admin SDK — geen Firestore rules.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const { orgId, token } = req.body;
  if (!orgId || !token) {
    return res.status(400).json({ message: 'orgId en token zijn verplicht.' });
  }

  try {
    const db = getFirestore(getAdminApp());

    // Stap 1: valideer QR token
    const membersSnap = await db
      .collection('organizations').doc(orgId)
      .collection('members')
      .where('qrToken', '==', token)
      .where('role', '==', 'shopper')
      .limit(1)
      .get();

    if (membersSnap.empty) {
      return res.status(403).json({ message: 'Ongeldige QR-code. Vraag een nieuwe aan je begeleider.' });
    }

    const member = { id: membersSnap.docs[0].id, ...membersSnap.docs[0].data() };

    // Stap 2: zoek actief lijstje
    const listsSnap = await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists')
      .where('assignedTo.type', '==', 'member')
      .where('assignedTo.id', '==', member.id)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    const listId = listsSnap.empty ? null : listsSnap.docs[0].id;

    return res.status(200).json({
      success: true,
      listId,
      member: {
        id: member.id,
        firstName: member.firstName,
        lastName: member.lastName,
      },
    });
  } catch (err) {
    console.error('shopper/auth error:', err.message);
    return res.status(500).json({ message: `Serverfout: ${err.message}` });
  }
}
