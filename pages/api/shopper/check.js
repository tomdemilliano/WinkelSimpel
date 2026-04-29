/**
 * pages/api/shopper/check.js — Winkel Simpel
 *
 * Marks an item as checked (or unchecked) for a shopper.
 * Also marks the list as completed if all items are checked.
 * Validates either a member QR token or a group token on the list.
 * Uses Admin SDK — bypasses Firestore rules.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
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
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const { orgId, listId, itemId, token, complete } = req.body;
  if (!orgId || !listId || !itemId || !token) {
    return res.status(400).json({ message: 'Verplichte velden ontbreken.' });
  }

  try {
    const db = getFirestore(getAdminApp());

    // Valideer het token: ofwel individuele shopper QR-token, ofwel groepstoken
    let tokenValid = false;

    // Probeer eerst als individuele shopper QR-token
    const membersSnap = await db
      .collection('organizations').doc(orgId)
      .collection('members')
      .where('qrToken', '==', token)
      .where('role', '==', 'shopper')
      .limit(1)
      .get();

    if (!membersSnap.empty) {
      tokenValid = true;
    } else {
      // Probeer als groepstoken op het lijstje zelf
      const listDoc = await db
        .collection('organizations').doc(orgId)
        .collection('shoppingLists').doc(listId)
        .get();

      if (listDoc.exists && listDoc.data().groupToken === token) {
        tokenValid = true;
      }
    }

    if (!tokenValid) {
      return res.status(403).json({ message: 'Ongeldige QR-code.' });
    }

    // Mark item as checked
    await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists').doc(listId)
      .collection('items').doc(itemId)
      .update({ checked: true });

    // If complete flag is set, mark list as completed
    if (complete) {
      await db
        .collection('organizations').doc(orgId)
        .collection('shoppingLists').doc(listId)
        .update({ status: 'completed', completedAt: FieldValue.serverTimestamp() });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('shopper/check error:', err.message);
    return res.status(500).json({ message: err.message });
  }
}
