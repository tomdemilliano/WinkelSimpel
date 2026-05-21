/**
 * pages/api/shopper/status.js — Winkel Simpel
 *
 * Lightweight endpoint that returns the checked status of all items
 * in a shopping list. Used by shoppers to poll for real-time updates
 * when multiple shoppers share the same list.
 * Uses Admin SDK — bypasses Firestore rules.
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
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const { orgId, listId, token } = req.query;
  if (!orgId || !listId || !token) {
    return res.status(400).json({ message: 'orgId, listId en token zijn verplicht.' });
  }

  try {
    const db = getFirestore(getAdminApp());

    const listDoc = await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists').doc(listId)
      .get();

    if (!listDoc.exists) {
      return res.status(404).json({ message: 'Lijstje niet gevonden.' });
    }

    const list = listDoc.data();

    // Validate token: individual shopper QR token or group token on the list
    let tokenValid = false;

    if (list.assignedTo?.type === 'member') {
      const membersSnap = await db
        .collection('organizations').doc(orgId)
        .collection('members')
        .where('qrToken', '==', token)
        .where('role', '==', 'shopper')
        .limit(1)
        .get();

      if (!membersSnap.empty && list.assignedTo.id === membersSnap.docs[0].id) {
        tokenValid = true;
      }
    } else if (list.assignedTo?.type === 'group') {
      if (list.groupToken && list.groupToken === token) {
        tokenValid = true;
      }
    }

    if (!tokenValid) {
      return res.status(403).json({ message: 'Ongeldige QR-code.' });
    }

    const itemsSnap = await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists').doc(listId)
      .collection('items')
      .get();

    const items = itemsSnap.docs.map(d => ({ id: d.id, checked: d.data().checked ?? false }));

    return res.status(200).json({ items });
  } catch (err) {
    console.error('shopper/status error:', err.message);
    return res.status(500).json({ message: err.message });
  }
}
