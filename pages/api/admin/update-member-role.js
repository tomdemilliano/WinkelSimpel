/**
 * pages/api/admin/update-member-role.js — Winkel Simpel
 *
 * Update de Firebase Auth custom claims van een bestaand lid.
 * Nodig wanneer de rol van een begeleider gewijzigd wordt,
 * zodat de nieuwe rol ook in het ID token zit.
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
    const adminAuth = getAuth(getAdminApp());
    const caller = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);

    if (caller.role !== 'app_admin') {
      return res.status(403).json({ message: 'Geen toegang.' });
    }

    const { uid, role, orgId } = req.body;
    if (!uid || !role || !orgId) return res.status(400).json({ message: 'Ontbrekende velden.' });

    const allowedRoles = ['guide', 'org_admin'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ message: 'Ongeldige rol.' });

    await adminAuth.setCustomUserClaims(uid, { role, orgId });

    // Revoke refresh tokens zodat de nieuwe claims meteen actief zijn
    await adminAuth.revokeRefreshTokens(uid);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('update-member-role error:', err);
    return res.status(500).json({ message: err.message });
  }
}
