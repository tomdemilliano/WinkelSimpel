/**
 * pages/api/org/leave-org.js — Winkel Simpel
 *
 * Laat een begeleider/org_admin zichzelf verwijderen uit hun organisatie.
 *  1. Verwijdert het member-document uit de huidige org
 *  2. Zoekt de private org op (voor zelfgeregistreerde gebruikers)
 *  3. Reset claims (terug naar private, of null als er geen private org is)
 *  4. Trekt refresh-tokens in → directe uitlog
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

    if (caller.orgType !== 'organization') {
      return res.status(400).json({ message: 'Je bent niet aangesloten bij een organisatie.' });
    }

    const orgId = caller.orgId;

    await adminDb
      .collection('organizations').doc(orgId)
      .collection('members').doc(caller.uid)
      .delete();

    // Zoek de private org van deze gebruiker (aangemaakt bij registratie)
    const privateOrgSnap = await adminDb
      .collection('organizations')
      .where('isPrivate', '==', true)
      .where('createdBy', '==', caller.uid)
      .limit(1)
      .get();

    if (!privateOrgSnap.empty) {
      const privateOrgId = privateOrgSnap.docs[0].id;
      await adminAuth.setCustomUserClaims(caller.uid, {
        role: 'guide',
        orgId: privateOrgId,
        orgType: 'private',
      });
    } else {
      await adminAuth.setCustomUserClaims(caller.uid, { role: null, orgId: null, orgType: null });
    }

    await adminAuth.revokeRefreshTokens(caller.uid);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('leave-org error:', err);
    return res.status(500).json({ message: err.message });
  }
}
