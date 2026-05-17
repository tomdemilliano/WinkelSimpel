/**
 * pages/api/org/handle-access-request.js — Winkel Simpel
 *
 * Keurt een toegangsverzoek goed of weigert het.
 * Bij goedkeuring: maakt member-doc aan in doelorg, werkt claims bij en
 * trekt refresh-tokens in zodat de gebruiker opnieuw moet inloggen.
 * Toegankelijk voor org_admin (eigen org) en app_admin.
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
    const isAppAdmin = caller.role === 'app_admin';
    const isOrgAdmin = caller.role === 'org_admin';

    if (!isAppAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Geen toegang.' });
    }

    const { requestId, action } = req.body;
    if (!requestId || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Ongeldige aanvraag.' });
    }

    const requestDoc = await adminDb.collection('accessRequests').doc(requestId).get();
    if (!requestDoc.exists || requestDoc.data().status !== 'pending') {
      return res.status(404).json({ message: 'Verzoek niet gevonden of al verwerkt.' });
    }

    const requestData = requestDoc.data();

    if (isOrgAdmin && caller.orgId !== requestData.targetOrgId) {
      return res.status(403).json({ message: 'Geen toegang tot dit verzoek.' });
    }

    if (action === 'reject') {
      await adminDb.collection('accessRequests').doc(requestId).update({
        status: 'rejected',
        processedAt: FieldValue.serverTimestamp(),
        processedBy: caller.uid,
      });
      return res.status(200).json({ success: true });
    }

    // action === 'approve'
    const { requestingUserId, requestingUserEmail, targetOrgId } = requestData;

    const requesterRecord = await adminAuth.getUser(requestingUserId);
    const currentClaims = requesterRecord.customClaims || {};
    const privateOrgId = currentClaims.orgId;

    let firstName = '';
    let lastName = '';
    if (privateOrgId) {
      const memberDoc = await adminDb
        .collection('organizations').doc(privateOrgId)
        .collection('members').doc(requestingUserId)
        .get();
      if (memberDoc.exists) {
        firstName = memberDoc.data().firstName || '';
        lastName = memberDoc.data().lastName || '';
      }
    }

    await adminDb
      .collection('organizations').doc(targetOrgId)
      .collection('members').doc(requestingUserId)
      .set({
        role: 'guide',
        firstName,
        lastName,
        email: requestingUserEmail,
        qrToken: null,
        groupIds: [],
        mustChangePassword: false,
        createdBy: caller.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    await adminAuth.setCustomUserClaims(requestingUserId, {
      role: 'guide',
      orgId: targetOrgId,
      orgType: 'organization',
    });

    await adminAuth.revokeRefreshTokens(requestingUserId);

    await adminDb.collection('accessRequests').doc(requestId).update({
      status: 'approved',
      processedAt: FieldValue.serverTimestamp(),
      processedBy: caller.uid,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('handle-access-request error:', err);
    return res.status(500).json({ message: err.message });
  }
}
