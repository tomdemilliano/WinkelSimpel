/**
 * pages/api/org/invite-guide.js — Winkel Simpel
 *
 * Maakt een nieuwe begeleider aan en stuurt optioneel een uitnodigingsmail.
 * Aanroepbaar door app_admin én org_admin (binnen hun eigen organisatie).
 *
 * Vereiste env vars:
 *   RESEND_API_KEY        → Resend API sleutel
 *   NEXT_PUBLIC_APP_URL   → basis-URL voor de loginlink
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

// Genereer een veilig tijdelijk wachtwoord
function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Methode niet toegestaan.' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ message: 'Niet geauthenticeerd.' });

  try {
    const adminApp = getAdminApp();
    const adminAuth = getAuth(adminApp);
    const adminDb = getFirestore(adminApp);

    const idToken = authHeader.split('Bearer ')[1];
    const caller = await adminAuth.verifyIdToken(idToken);

    const isAppAdmin = caller.role === 'app_admin';
    const isOrgAdmin = caller.role === 'org_admin';

    if (!isAppAdmin && !isOrgAdmin) {
      return res.status(403).json({ message: 'Geen toegang.' });
    }

    const { orgId, firstName, lastName, email, role = 'guide', sendInvite } = req.body;

    // org_admin mag alleen binnen zijn eigen organisatie
    if (isOrgAdmin && caller.orgId !== orgId) {
      return res.status(403).json({ message: 'Je kan alleen begeleiders toevoegen aan je eigen organisatie.' });
    }

    // Valideer rol — org_admin mag geen andere org_admins aanmaken
    const allowedRoles = isAppAdmin ? ['guide', 'org_admin'] : ['guide'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Ongeldige rol.' });
    }

    if (!orgId || !firstName || !lastName || !email) {
      return res.status(400).json({ message: 'Ontbrekende velden.' });
    }

    const tempPassword = generateTempPassword();

    // Maak Firebase Auth gebruiker aan
    const userRecord = await adminAuth.createUser({
      email,
      password: tempPassword,
      displayName: `${firstName} ${lastName}`,
    });

    // Stel custom claims in
    await adminAuth.setCustomUserClaims(userRecord.uid, { role, orgId, orgType: 'organization' });

    // Maak Firestore member document aan
    await adminDb
      .collection('organizations').doc(orgId)
      .collection('members').doc(userRecord.uid)
      .set({
        role,
        firstName,
        lastName,
        email,
        qrToken: null,
        groupIds: [],
        mustChangePassword: true,
        createdBy: caller.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

    // Stuur uitnodigingsmail via Resend
    if (sendInvite) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const roleLabel = role === 'org_admin' ? 'organisatiebeheerder' : 'begeleider';

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || `Winkel Simpel <noreply@${new URL(appUrl).hostname}>`,
          to: email,
          subject: `Welkom bij Winkel Simpel — jouw account is aangemaakt`,
          html: `
            <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
              <h1 style="color: #4CAF50; margin: 0 0 0.5rem;">🛒 Winkel Simpel</h1>
              <p style="color: #555;">Hallo ${firstName},</p>
              <p style="color: #555;">Je account als <strong>${roleLabel}</strong> is aangemaakt. Je kan nu aanmelden met onderstaande gegevens.</p>
              <div style="background: #f5f5f5; border-radius: 10px; padding: 1.25rem; margin: 1.5rem 0;">
                <p style="margin: 0 0 0.5rem; color: #888; font-size: 0.85rem;">E-mailadres</p>
                <p style="margin: 0 0 1rem; font-weight: 700; color: #1a1a1a;">${email}</p>
                <p style="margin: 0 0 0.5rem; color: #888; font-size: 0.85rem;">Tijdelijk wachtwoord</p>
                <p style="margin: 0; font-weight: 700; color: #1a1a1a; font-size: 1.25rem; letter-spacing: 0.05em;">${tempPassword}</p>
              </div>
              <p style="color: #e65100; font-size: 0.875rem;">⚠️ Je wordt gevraagd om dit wachtwoord te wijzigen bij je eerste aanmelding.</p>
              <a href="${appUrl}/login" style="display: inline-block; margin-top: 1rem; padding: 0.875rem 1.5rem; background: #4CAF50; color: white; text-decoration: none; border-radius: 10px; font-weight: 700;">
                Aanmelden →
              </a>
              <p style="color: #aaa; font-size: 0.8rem; margin-top: 2rem;">
                Als je dit niet verwachtte, kan je deze mail negeren.
              </p>
            </div>
          `,
        }),
      });
      if (!resendRes.ok) {
        const resendError = await resendRes.json().catch(() => ({}));
        console.error('Resend fout:', JSON.stringify(resendError));
        // Niet fataal — de gebruiker is aangemaakt, alleen de mail mislukte
      }
    }

    return res.status(200).json({
      uid: userRecord.uid,
      tempPassword: sendInvite ? null : tempPassword, // alleen tonen als geen mail gestuurd
    });

  } catch (err) {
    console.error('invite-guide error:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ message: 'Dit e-mailadres is al in gebruik.' });
    }
    return res.status(500).json({ message: `Fout: ${err.message}` });
  }
}
