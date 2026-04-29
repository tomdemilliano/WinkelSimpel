/**
 * pages/api/shopper/list.js — Winkel Simpel
 *
 * Returns the items of a shopping list for a shopper.
 * Uses Admin SDK — bypasses Firestore rules entirely.
 * Validates either a member QR token or a group token.
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

    // Haal het lijstje op
    const listDoc = await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists').doc(listId)
      .get();

    if (!listDoc.exists) {
      return res.status(404).json({ message: 'Lijstje niet gevonden.' });
    }

    const list = listDoc.data();

    // Valideer het token: ofwel individuele shopper QR-token, ofwel groepstoken op het lijstje
    let memberInfo = { id: '', firstName: '', lastName: '' };
    let tokenValid = false;

    if (list.assignedTo?.type === 'member') {
      // Individuele shopper — valideer via qrToken op het member document
      const membersSnap = await db
        .collection('organizations').doc(orgId)
        .collection('members')
        .where('qrToken', '==', token)
        .where('role', '==', 'shopper')
        .limit(1)
        .get();

      if (!membersSnap.empty) {
        const member = membersSnap.docs[0].data();
        const memberId = membersSnap.docs[0].id;
        // Controleer of dit lijstje ook echt voor deze shopper is
        if (list.assignedTo.id === memberId) {
          tokenValid = true;
          memberInfo = { id: memberId, firstName: member.firstName, lastName: member.lastName };
        }
      }
    } else if (list.assignedTo?.type === 'group') {
      // Groepslijstje — valideer via groupToken op het lijstje zelf
      if (list.groupToken && list.groupToken === token) {
        tokenValid = true;
        memberInfo = { id: list.assignedTo.id, firstName: '', lastName: '' };
      }
    }

    if (!tokenValid) {
      return res.status(403).json({ message: 'Ongeldige QR-code.' });
    }

    // Haal de items op
    const itemsSnap = await db
      .collection('organizations').doc(orgId)
      .collection('shoppingLists').doc(listId)
      .collection('items')
      .orderBy('order', 'asc')
      .get();

    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({
      member: memberInfo,
      list: { id: listDoc.id, title: list.title, status: list.status },
      items,
    });
  } catch (err) {
    console.error('shopper/list error:', err.message);
    return res.status(500).json({ message: err.message });
  }
}
