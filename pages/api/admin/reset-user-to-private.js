/**
 * pages/api/admin/reset-user-to-private.js — Winkel Simpel
 *
 * Zet een gebruiker terug naar private status:
 *  - Verwijdert het member-document uit de huidige org (als dat bestaat)
 *  - Herstelt de private org claims
 *  - Trekt refresh-tokens in
 *
 * Alleen toegankelijk voor app_admin.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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
  if (req.method !== 'POST') return res.status(405).json({ message: 'Methode niet toegestaan.' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Niet geauthenticeerd.' });

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    const caller = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    if (caller.role !== 'app_admin') return res.status(403).json({ message: 'Geen toegang.' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'E-mailadres vereist.' });

    // Gebruiker opzoeken
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(email);
    } catch {
      return res.status(404).json({ message: 'Geen account gevonden met dit e-mailadres.' });
    }

    const uid = userRecord.uid;
    const currentClaims = userRecord.customClaims || {};
    const currentOrgId = currentClaims.orgId;

    // Verwijder member-document uit huidige org (als die bestaat en niet private is)
    if (currentOrgId && currentClaims.orgType !== 'private') {
      try {
        await adminDb
          .collection('organizations').doc(currentOrgId)
          .collection('members').doc(uid)
          .delete();
      } catch {
        // Geen member-doc aanwezig — OK
      }
    }

    // Zoek de private org van deze gebruiker
    const privateOrgSnap = await adminDb
      .collection('organizations')
      .where('isPrivate', '==', true)
      .where('createdBy', '==', uid)
      .limit(1)
      .get();

    if (!privateOrgSnap.empty) {
      await adminAuth.setCustomUserClaims(uid, {
        role: 'guide',
        orgId: privateOrgSnap.docs[0].id,
        orgType: 'private',
      });
    } else {
      await adminAuth.setCustomUserClaims(uid, { role: 'guide', orgId: null, orgType: 'private' });
    }

    await adminAuth.revokeRefreshTokens(uid);

    return res.status(200).json({
      success: true,
      uid,
      restoredOrgId: privateOrgSnap.empty ? null : privateOrgSnap.docs[0].id,
    });
  } catch (err) {
    console.error('reset-user-to-private error:', err);
    return res.status(500).json({ message: err.message });
  }
}
