/**
 * pages/login.js — Winkel Simpel
 *
 * Login pagina met:
 * - E-mail + wachtwoord aanmelden
 * - Wachtwoord vergeten flow
 * - Verplicht wachtwoord wijzigen bij eerste aanmelding
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  signIn,
  useAuthUser,
  getCurrentUserClaims,
  ROLES,
} from '../lib/auth';
import {
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { MemberFactory } from '../lib/dbSchema';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Scherm-types
const SCREEN = {
  LOGIN: 'login',
  FORGOT: 'forgot',
  FORGOT_SENT: 'forgot_sent',
  CHANGE_PASSWORD: 'change_password',
};

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const [screen, setScreen] = useState(SCREEN.LOGIN);
  const redirectingRef = React.useRef(false);

  // Redirect al ingelogde gebruikers
  useEffect(() => {
    if (loading || !user) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    getCurrentUserClaims().then(async (claims) => {
      if (!claims) { redirectingRef.current = false; return; }
      // Check of wachtwoord gewijzigd moet worden
      if (claims.orgId) {
        const memberSnap = await MemberFactory.getById(claims.orgId, claims.uid).catch(() => null);
        if (memberSnap?.exists() && memberSnap.data().mustChangePassword) {
          redirectingRef.current = false;
          setScreen(SCREEN.CHANGE_PASSWORD);
          return;
        }
      }
      redirectByRole(claims.role, router);
    }).catch(() => { redirectingRef.current = false; });
  }, [user, loading]);

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>🛒</div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          {screen === SCREEN.LOGIN && <p style={styles.subtitle}>Aanmelden voor begeleiders</p>}
          {screen === SCREEN.FORGOT && <p style={styles.subtitle}>Wachtwoord vergeten</p>}
          {screen === SCREEN.FORGOT_SENT && <p style={styles.subtitle}>E-mail verstuurd</p>}
          {screen === SCREEN.CHANGE_PASSWORD && <p style={styles.subtitle}>Kies een nieuw wachtwoord</p>}
        </div>

        {screen === SCREEN.LOGIN && (
          <LoginForm
            onForgot={() => setScreen(SCREEN.FORGOT)}
            onMustChange={() => setScreen(SCREEN.CHANGE_PASSWORD)}
            router={router}
          />
        )}
        {screen === SCREEN.FORGOT && (
          <ForgotForm
            onBack={() => setScreen(SCREEN.LOGIN)}
            onSent={() => setScreen(SCREEN.FORGOT_SENT)}
          />
        )}
        {screen === SCREEN.FORGOT_SENT && (
          <ForgotSent onBack={() => setScreen(SCREEN.LOGIN)} />
        )}
        {screen === SCREEN.CHANGE_PASSWORD && (
          <ChangePasswordForm router={router} />
        )}

        {screen === SCREEN.LOGIN && (
          <>
            <p style={styles.hint}>Ben je een shopper? Vraag je begeleider om de QR-code.</p>
            <p style={{ ...styles.hint, marginTop: '0.5rem' }}>
              Nieuw hier?{' '}
              <a href="/register" style={{ color: '#4CAF50', fontWeight: '600', textDecoration: 'none' }}>
                Maak een account aan
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoginForm
// ---------------------------------------------------------------------------
function LoginForm({ onForgot, onMustChange, router }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      // Wacht even zodat de token met claims beschikbaar is
      await new Promise(r => setTimeout(r, 500));
      const claims = await getCurrentUserClaims();
      if (!claims?.role) {
        setError('Je account heeft geen geldige rol.');
        setSubmitting(false);
        return;
      }
      // Check mustChangePassword
      if (claims.orgId) {
        const memberSnap = await MemberFactory.getById(claims.orgId, claims.uid).catch(() => null);
        if (memberSnap?.exists() && memberSnap.data().mustChangePassword) {
          onMustChange();
          return;
        }
      }
      redirectByRole(claims.role, router);
    } catch (err) {
      setError(getErrorMessage(err.code));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.field}>
        <label style={styles.label}>E-mailadres</label>
        <input type="email" autoComplete="email" required value={email}
          onChange={e => setEmail(e.target.value)} style={styles.input}
          placeholder="naam@organisatie.be" />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Wachtwoord</label>
        <input type="password" autoComplete="current-password" required value={password}
          onChange={e => setPassword(e.target.value)} style={styles.input}
          placeholder="••••••••" />
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={submitting}
        style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Aanmelden...' : 'Aanmelden'}
      </button>
      <button type="button" onClick={onForgot} style={styles.linkButton}>
        Wachtwoord vergeten?
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ForgotForm
// ---------------------------------------------------------------------------
function ForgotForm({ onBack, onSent }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      onSent();
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Geen info geven of mail bestaat — altijd "verstuurd" tonen
        onSent();
      } else {
        setError('Er is een fout opgetreden. Probeer opnieuw.');
        setSending(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <p style={styles.formHint}>
        Vul je e-mailadres in. Als er een account bestaat, ontvang je een link om je wachtwoord te resetten.
      </p>
      <div style={styles.field}>
        <label style={styles.label}>E-mailadres</label>
        <input type="email" required value={email}
          onChange={e => setEmail(e.target.value)} style={styles.input}
          placeholder="naam@organisatie.be" autoFocus />
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={sending}
        style={{ ...styles.button, opacity: sending ? 0.7 : 1 }}>
        {sending ? 'Versturen...' : 'Reset-link versturen'}
      </button>
      <button type="button" onClick={onBack} style={styles.linkButton}>
        ← Terug naar aanmelden
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ForgotSent
// ---------------------------------------------------------------------------
function ForgotSent({ onBack }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '3rem', margin: '0 0 1rem' }}>📬</p>
      <p style={{ color: '#555', lineHeight: 1.6, marginBottom: '1.5rem' }}>
        Als er een account bestaat voor dit e-mailadres, heb je een reset-link ontvangen. Controleer ook je spam-map.
      </p>
      <button onClick={onBack} style={styles.button}>← Terug naar aanmelden</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChangePasswordForm — verplicht bij eerste aanmelding
// ---------------------------------------------------------------------------
function ChangePasswordForm({ router }) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPw.length < 8) { setError('Nieuw wachtwoord moet minimaal 8 tekens zijn.'); return; }
    if (newPw !== confirm) { setError('Wachtwoorden komen niet overeen.'); return; }
    setSaving(true);
    setError('');
    try {
      const user = auth.currentUser;
      // Herauthenticeer met huidig (tijdelijk) wachtwoord
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      // Wijzig wachtwoord
      await updatePassword(user, newPw);
      // Verwijder mustChangePassword vlag
      const claims = await getCurrentUserClaims();
      if (claims?.orgId) {
        await updateDoc(doc(db, 'organizations', claims.orgId, 'members', user.uid), {
          mustChangePassword: false,
        });
      }
      redirectByRole(claims.role, router);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Huidig wachtwoord is onjuist.');
      } else {
        setError('Er is een fout opgetreden: ' + err.message);
      }
      setSaving(false);
    }
  }

  return (
    <>
      <div style={styles.changePasswordNotice}>
        🔐 Kies een persoonlijk wachtwoord om verder te gaan.
      </div>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>Tijdelijk wachtwoord</label>
          <input type="password" required value={current}
            onChange={e => setCurrent(e.target.value)} style={styles.input}
            placeholder="Je tijdelijk wachtwoord" autoFocus />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Nieuw wachtwoord</label>
          <input type="password" required value={newPw}
            onChange={e => setNewPw(e.target.value)} style={styles.input}
            placeholder="Minimaal 8 tekens" />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Bevestig nieuw wachtwoord</label>
          <input type="password" required value={confirm}
            onChange={e => setConfirm(e.target.value)} style={styles.input}
            placeholder="Herhaal nieuw wachtwoord" />
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" disabled={saving}
          style={{ ...styles.button, opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Opslaan...' : 'Wachtwoord instellen'}
        </button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function redirectByRole(role, router) {
  if (role === ROLES.APP_ADMIN) router.replace('/admin');
  else if (role === ROLES.GUIDE || role === ROLES.ORG_ADMIN) router.replace('/guide');
  else router.replace('/login');
}

function getErrorMessage(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mailadres of wachtwoord is onjuist.';
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het later opnieuw.';
    case 'auth/user-disabled':
      return 'Dit account is uitgeschakeld.';
    default:
      return 'Er is een fout opgetreden. Probeer het opnieuw.';
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'system-ui, sans-serif' },
  card: { backgroundColor: '#fff', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '400px', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  header: { textAlign: 'center', marginBottom: '2rem' },
  logo: { fontSize: '3rem', marginBottom: '0.5rem' },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#1a1a1a', margin: '0 0 0.25rem' },
  subtitle: { fontSize: '0.9rem', color: '#888', margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', outline: 'none' },
  error: { color: '#d93025', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#fdecea', borderRadius: '8px' },
  button: { display: 'block', padding: '0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: '0.25rem', textAlign: 'center', textDecoration: 'none' },
  linkButton: { background: 'none', border: 'none', color: '#4CAF50', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', padding: '0.25rem 0', textAlign: 'center' },
  formHint: { fontSize: '0.875rem', color: '#666', lineHeight: 1.5, margin: 0 },
  changePasswordNotice: { backgroundColor: '#FFF3E0', color: '#E65100', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: '600', marginBottom: '1rem', textAlign: 'center' },
  hint: { textAlign: 'center', fontSize: '0.8rem', color: '#aaa', marginTop: '1.5rem' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' },
};
