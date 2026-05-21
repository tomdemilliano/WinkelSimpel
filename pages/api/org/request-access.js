/**
 * pages/api/org/request-access.js — Winkel Simpel
 *
 * Maakt een toegangsverzoek aan voor een stand-alone gebruiker die zich wil
 * aansluiten bij een bestaande organisatie.
 * Alleen toegankelijk voor gebruikers met orgType: 'private'.
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

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Niet geauthenticeerd.' });

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    const caller = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);

    if (caller.orgType !== 'private') {
      return res.status(403).json({ message: 'Alleen zelfstandige gebruikers kunnen toegang aanvragen.' });
    }

    const { targetOrgId, targetOrgName } = req.body;
    if (!targetOrgId || !targetOrgName) {
      return res.status(400).json({ message: 'Ontbrekende velden.' });
    }

    const orgDoc = await adminDb.collection('organizations').doc(targetOrgId).get();
    if (!orgDoc.exists || orgDoc.data().isPrivate === true) {
      return res.status(404).json({ message: 'Organisatie niet gevonden.' });
    }

    const existing = await adminDb.collection('accessRequests')
      .where('requestingUserId', '==', caller.uid)
      .where('targetOrgId', '==', targetOrgId)
      .where('status', '==', 'pending')
      .get();

    if (!existing.empty) {
      return res.status(409).json({ message: 'Je hebt al een openstaand verzoek voor deze organisatie.' });
    }

    const memberDoc = await adminDb
      .collection('organizations').doc(caller.orgId)
      .collection('members').doc(caller.uid)
      .get();
    const memberData = memberDoc.exists ? memberDoc.data() : {};
    const requestingUserName =
      `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim() || caller.email;

    await adminDb.collection('accessRequests').add({
      requestingUserId: caller.uid,
      requestingUserEmail: caller.email,
      requestingUserName,
      targetOrgId,
      targetOrgName,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      processedAt: null,
      processedBy: null,
    });

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error('request-access error:', err);
    return res.status(500).json({ message: err.message });
  }
}
