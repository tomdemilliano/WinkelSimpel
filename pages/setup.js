/**
 * pages/setup.js — Winkel Simpel
 *
 * One-time setup page to create the first app_admin account.
 * IMPORTANT: Delete this page (or protect it with NEXT_PUBLIC_SETUP_KEY)
 * after the first admin has been created.
 *
 * Protected by a setup key defined in environment variables:
 *   NEXT_PUBLIC_SETUP_KEY=some-secret-string
 *
 * If no setup key is configured, the page is disabled.
 */


import { useState } from 'react';

const SETUP_KEY = process.env.NEXT_PUBLIC_SETUP_KEY;

export default function SetupPage() {
  const [step, setStep] = useState('key'); // key | form | done | disabled
  const [enteredKey, setEnteredKey] = useState('');
  const [keyError, setKeyError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // If no setup key is configured, disable the page
  if (!SETUP_KEY) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.icon}>🔒</p>
          <h1 style={styles.title}>Setup niet beschikbaar</h1>
          <p style={styles.hint}>
            Stel <code>NEXT_PUBLIC_SETUP_KEY</code> in als environment variabele om setup te activeren.
          </p>
        </div>
      </div>
    );
  }

  // Step 1: verify setup key
  function handleKeySubmit(e) {
    e.preventDefault();
    if (enteredKey !== SETUP_KEY) {
      setKeyError('Ongeldige setup-sleutel.');
      return;
    }
    setStep('form');
  }

  // Step 2: create first admin
  async function handleSetup(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 8) {
      setError('Vul alle velden in. Wachtwoord minimaal 8 tekens.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch('/api/setup/create-first-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupKey: SETUP_KEY,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          orgName: orgName.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Aanmaken mislukt.');
        setSaving(false);
        return;
      }

      setResult(data);
      setStep('done');
    } catch (err) {
      console.error('Setup error:', err);
      setError('Er is een fout opgetreden.');
      setSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* Step 1: key */}
        {step === 'key' && (
          <>
            <p style={styles.icon}>🔑</p>
            <h1 style={styles.title}>Winkel Simpel Setup</h1>
            <p style={styles.subtitle}>Voer de setup-sleutel in om verder te gaan.</p>
            <form onSubmit={handleKeySubmit} style={styles.form}>
              <input
                type="password"
                value={enteredKey}
                onChange={(e) => setEnteredKey(e.target.value)}
                style={styles.input}
                placeholder="Setup-sleutel"
                autoFocus
              />
              {keyError && <p style={styles.errorText}>{keyError}</p>}
              <button type="submit" style={styles.button}>Verder</button>
            </form>
          </>
        )}

        {/* Step 2: form */}
        {step === 'form' && (
          <>
            <p style={styles.icon}>👤</p>
            <h1 style={styles.title}>Eerste beheerder aanmaken</h1>
            <p style={styles.subtitle}>
              Dit account krijgt de rol <strong>app_admin</strong> en heeft toegang tot alle organisaties.
            </p>

            <form onSubmit={handleSetup} style={styles.form}>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>Voornaam</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    style={styles.input}
                    placeholder="Jan"
                    required
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Achternaam</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    style={styles.input}
                    placeholder="Janssen"
                    required
                  />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>E-mailadres</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  placeholder="admin@organisatie.be"
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Wachtwoord</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  placeholder="Minimaal 8 tekens"
                  required
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Eerste organisatie (optioneel)</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  style={styles.input}
                  placeholder="bijv. De Regenboog vzw"
                />
                <p style={styles.fieldHint}>Laat leeg als je later een organisatie wil aanmaken.</p>
              </div>

              {error && <p style={styles.errorText}>{error}</p>}

              <button
                type="submit"
                disabled={saving}
                style={{ ...styles.button, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Aanmaken...' : 'Beheerder aanmaken'}
              </button>
            </form>
          </>
        )}

        {/* Step 3: done */}
        {step === 'done' && (
          <>
            <p style={styles.icon}>✅</p>
            <h1 style={styles.title}>Klaar!</h1>
            <p style={styles.subtitle}>
              De eerste beheerder is aangemaakt. Je kan nu aanmelden via de loginpagina.
            </p>
            {result?.orgId && (
              <p style={styles.infoBox}>
                Organisatie aangemaakt met ID: <code>{result.orgId}</code>
              </p>
            )}
            <div style={styles.warningBox}>
              ⚠️ Verwijder nu de <code>NEXT_PUBLIC_SETUP_KEY</code> environment variabele
              in Vercel om deze pagina te deactiveren.
            </div>
            <a href="/login" style={styles.button}>
              Naar aanmelden →
            </a>
          </>
        )}

      </div>
    </div>
  );
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
    padding: '1.5rem',
    fontFamily: 'system-ui, sans-serif',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '2rem',
    width: '100%',
    maxWidth: '440px',
    boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  icon: {
    fontSize: '2.5rem',
    margin: '0 0 0.5rem',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#1a1a1a',
    margin: '0 0 0.5rem',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#666',
    margin: '0 0 1.5rem',
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    textAlign: 'left',
  },
  fieldRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  field: {
    flex: 1,
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
    backgroundColor: '#fff',
    width: '100%',
    boxSizing: 'border-box',
  },
  fieldHint: {
    fontSize: '0.775rem',
    color: '#aaa',
    margin: 0,
  },
  button: {
    display: 'block',
    padding: '0.875rem',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
    marginTop: '0.5rem',
  },
  errorText: {
    color: '#c62828',
    fontSize: '0.875rem',
    margin: 0,
    padding: '0.6rem 0.8rem',
    backgroundColor: '#FFEBEE',
    borderRadius: '8px',
  },
  infoBox: {
    fontSize: '0.85rem',
    color: '#555',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    padding: '0.75rem',
    margin: '0 0 1rem',
    wordBreak: 'break-all',
  },
  warningBox: {
    fontSize: '0.85rem',
    color: '#E65100',
    backgroundColor: '#FFF3E0',
    borderRadius: '8px',
    padding: '0.75rem',
    margin: '0 0 1rem',
    lineHeight: 1.5,
    textAlign: 'left',
  },
  hint: {
    color: '#aaa',
    fontSize: '0.9rem',
  },
};
