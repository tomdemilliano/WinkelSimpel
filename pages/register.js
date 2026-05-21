/**
 * pages/register.js — Winkel Simpel
 *
 * Zelfregistratie voor stand-alone gebruikers.
 * Maakt een account aan met een privé-organisatie.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { signIn, useAuthUser, getCurrentUserClaims, ROLES } from '../lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (loading || !user) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    getCurrentUserClaims().then((claims) => {
      if (!claims?.role) { redirectingRef.current = false; return; }
      if (claims.role === ROLES.APP_ADMIN) router.replace('/admin');
      else router.replace('/guide');
    });
  }, [user, loading, router]);

  if (loading) {
    return <div style={styles.centered}><p style={{ color: '#888' }}>Laden...</p></div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <img src="/icons/icon-192.png" alt="Winkel Simpel" style={styles.logoImg} />
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Maak een account aan</p>
        </div>
        <RegisterForm router={router} />
        <p style={styles.hint}>
          Al een account?{' '}
          <a href="/login" style={{ color: '#5B9BD5', fontWeight: '600', textDecoration: 'none' }}>
            Aanmelden
          </a>
        </p>
      </div>
    </div>
  );
}

function RegisterForm({ router }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Er is een fout opgetreden.');
        setSubmitting(false);
        return;
      }

      await signIn(email, password);
      // Wacht op claims
      await new Promise((r) => setTimeout(r, 800));
      const claims = await getCurrentUserClaims();
      if (!claims?.role) {
        setError('Account aangemaakt, maar kon niet automatisch aanmelden. Probeer handmatig aan te melden.');
        setSubmitting(false);
        return;
      }
      router.replace('/guide');
    } catch {
      setError('Er is een fout opgetreden. Probeer opnieuw.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.row}>
        <div style={{ ...styles.field, flex: '1 1 120px' }}>
          <label style={styles.label}>Voornaam</label>
          <input
            type="text"
            required
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            style={styles.input}
            placeholder="Jan"
            autoFocus
          />
        </div>
        <div style={{ ...styles.field, flex: '1 1 120px' }}>
          <label style={styles.label}>Achternaam</label>
          <input
            type="text"
            required
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            style={styles.input}
            placeholder="Janssen"
          />
        </div>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>E-mailadres</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
          placeholder="jan@voorbeeld.be"
        />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Wachtwoord</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
          placeholder="Minimaal 8 tekens"
        />
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Wachtwoord bevestigen</label>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={styles.input}
          placeholder="Herhaal je wachtwoord"
        />
      </div>
      {error && <p style={styles.error}>{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? 'Account aanmaken...' : 'Account aanmaken'}
      </button>
    </form>
  );
}

const styles = {
  page: { minHeight: '100vh', backgroundColor: '#F4F8FC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: "'Nunito', system-ui, sans-serif" },
  card: { backgroundColor: '#fff', borderRadius: '20px', padding: '2rem', width: '100%', maxWidth: '420px', boxShadow: '0 4px 24px rgba(91,155,213,0.12)', borderTop: '4px solid #5B9BD5' },
  header: { textAlign: 'center', marginBottom: '2rem' },
  logoImg: { width: '72px', height: '72px', borderRadius: '16px', marginBottom: '0.75rem' },
  title: { fontSize: '1.5rem', fontWeight: '800', color: '#1A2B3C', margin: '0 0 0.25rem' },
  subtitle: { fontSize: '0.9rem', color: '#6B7E91', margin: 0, fontWeight: '600' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 },
  label: { fontSize: '0.875rem', fontWeight: '700', color: '#1A2B3C' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #D8E5EF', fontSize: '1rem', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  error: { color: '#d93025', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#fdecea', borderRadius: '8px' },
  button: { display: 'block', padding: '0.875rem', backgroundColor: '#5B9BD5', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', marginTop: '0.25rem', textAlign: 'center', fontFamily: 'inherit' },
  hint: { textAlign: 'center', fontSize: '0.8rem', color: '#aaa', marginTop: '1.5rem' },
  centered: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Nunito', system-ui, sans-serif" },
};
