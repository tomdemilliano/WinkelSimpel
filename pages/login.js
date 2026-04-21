/**
 * pages/login.js — Winkel Simpel
 *
 * Login page for guides and app admins.
 * Shoppers do not use this page — they log in via QR scan (/scan).
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { signIn, useAuthUser, getCurrentUserClaims, ROLES } from '../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuthUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect already-authenticated users to their dashboard
  useEffect(() => {
    if (loading || !user) return;
    getCurrentUserClaims().then((claims) => {
      if (!claims) return;
      if (claims.role === ROLES.APP_ADMIN) router.replace('/admin');
      else if (claims.role === ROLES.GUIDE) router.replace('/guide');
    });
  }, [user, loading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      const claims = await getCurrentUserClaims();
      if (!claims?.role) {
        setError('Je account heeft geen geldige rol. Neem contact op met een beheerder.');
        setSubmitting(false);
        return;
      }
      if (claims.role === ROLES.APP_ADMIN) router.replace('/admin');
      else if (claims.role === ROLES.GUIDE) router.replace('/guide');
      else {
        setError('Dit account heeft geen toegang tot deze pagina.');
        setSubmitting(false);
      }
    } catch (err) {
      setError(getErrorMessage(err.code));
      setSubmitting(false);
    }
  }

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Logo / titel */}
        <div style={styles.header}>
          <div style={styles.logo}>🛒</div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Aanmelden voor begeleiders</p>
        </div>

        {/* Formulier */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="naam@organisatie.be"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{ ...styles.button, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Aanmelden...' : 'Aanmelden'}
          </button>
        </form>

        <p style={styles.hint}>
          Ben je een shopper? Vraag je begeleider om de QR-code.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error messages in Dutch
// ---------------------------------------------------------------------------
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
  page: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  logo: {
    fontSize: '3rem',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 0.25rem',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#888',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#444',
  },
  input: {
    padding: '0.75rem 1rem',
    borderRadius: '10px',
    border: '1.5px solid #ddd',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    color: '#d93025',
    fontSize: '0.875rem',
    margin: '0',
    padding: '0.6rem 0.8rem',
    backgroundColor: '#fdecea',
    borderRadius: '8px',
  },
  button: {
    padding: '0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem',
    transition: 'background-color 0.2s',
  },
  hint: {
    textAlign: 'center',
    fontSize: '0.8rem',
    color: '#aaa',
    marginTop: '1.5rem',
  },
  centered: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
  },
};
