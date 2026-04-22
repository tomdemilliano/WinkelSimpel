/**
 * qr.js — Winkel Simpel
 *
 * Utilities for generating and working with QR tokens for shoppers.
 *
 * QR flow:
 *   1. Guide creates a shopper member → generateQrToken() produces a unique token
 *   2. Token is saved to the member document in Firestore (qrToken field)
 *   3. Guide prints the QR card via /guide/qr/[shopperId]
 *   4. QR code encodes: https://{APP_URL}/scan?org={orgId}&token={qrToken}
 *   5. Shopper scans → /scan validates token → session saved → redirect to active list
 */

/**
 * Generate a cryptographically random QR token.
 * Uses the Web Crypto API (available in browser and Node 15+).
 * Returns a 32-character hex string.
 */
export function generateQrToken() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build the full QR scan URL for a shopper.
 *
 * @param {string} orgId
 * @param {string} qrToken
 * @returns {string} Full URL encoded in the QR code
 */
export function buildQrUrl(orgId, qrToken) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  // URL points to /scan which handles auth and redirects to the active list.
  // The org and token params allow direct browser opening without camera.
  return `${base}/scan?org=${orgId}&token=${qrToken}`;
}

/**
 * Build a direct shop URL that includes org and token as parameters.
 * Used on the QR card so guides can click the link to test on laptop.
 * The shop page handles its own auth when these params are present.
 */
export function buildDirectShopUrl(orgId, qrToken, listId) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/shop/${listId}?org=${orgId}&token=${qrToken}`;
}

/**
 * Parse the QR scan URL parameters from a Next.js router query.
 * Returns { orgId, token } or null if parameters are missing.
 *
 * @param {{ org?: string, token?: string }} query
 */
export function parseQrQuery(query) {
  const { org, token } = query;
  if (!org || !token) return null;
  return { orgId: org, token };
}
