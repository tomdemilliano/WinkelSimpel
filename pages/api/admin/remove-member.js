/**
 * pages/api/admin/remove-member.js — Winkel Simpel
 *
 * Verwijdert een begeleider/org_admin uit een organisatie:
 *  1. Verwijdert het member-document uit Firestore
 *  2. Reset de custom claims (orgId/orgType verwijderd)
 *  3. Trekt refresh-tokens in zodat de gebruiker direct uitgelogd wordt
 *
 * Toegankelijk voor app_admin (elke org) en org_admin (alleen eigen org).
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
    const isAppAdmin = caller.role === 'app_admin';
    const isOrgAdmin = caller.role === 'org_admin';

    if (!isAppAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Geen toegang.' });
    }

    const { orgId, memberId } = req.body;
    if (!orgId || !memberId) return res.status(400).json({ message: 'Ontbrekende velden.' });

    if (isOrgAdmin && caller.orgId !== orgId) {
      return res.status(403).json({ message: 'Geen toegang tot deze organisatie.' });
    }

    // Voorkom dat een beheerder zichzelf verwijdert
    if (caller.uid === memberId) {
      return res.status(400).json({ message: 'Je kan jezelf niet verwijderen.' });
    }

    await adminDb.collection('organizations').doc(orgId).collection('members').doc(memberId).delete();

    // Claims resetten en refresh-tokens intrekken zodat de gebruiker direct uitgelogd wordt
    try {
      // Zoek de private org van deze gebruiker (zelfgeregistreerde gebruikers)
      const privateOrgSnap = await adminDb
        .collection('organizations')
        .where('isPrivate', '==', true)
        .where('createdBy', '==', memberId)
        .limit(1)
        .get();

      if (!privateOrgSnap.empty) {
        await adminAuth.setCustomUserClaims(memberId, {
          role: 'guide',
          orgId: privateOrgSnap.docs[0].id,
          orgType: 'private',
        });
      } else {
        await adminAuth.setCustomUserClaims(memberId, { role: null, orgId: null, orgType: null });
      }

      await adminAuth.revokeRefreshTokens(memberId);
    } catch {
      // Auth-account bestaat mogelijk niet meer (bijv. al eerder verwijderd)
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('remove-member error:', err);
    return res.status(500).json({ message: err.message });
  }
}
