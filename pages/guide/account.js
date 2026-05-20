import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import { auth } from '../../lib/firebase';
import { MemberFactory, OrganizationFactory } from '../../lib/dbSchema';

function AccountPage({ claims }) {
  const router = useRouter();
  const { orgId, orgType, uid } = claims;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');

  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  const [leavingOrg, setLeavingOrg] = useState(false);
  const [leaveError, setLeaveError] = useState('');

  useEffect(() => {
    const user = auth.currentUser;
    if (user) setEmail(user.email || '');

    MemberFactory.getById(orgId, uid)
      .then((snap) => {
        if (snap.exists()) {
          setFirstName(snap.data().firstName || '');
          setLastName(snap.data().lastName || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false));

    if (orgType === 'organization') {
      OrganizationFactory.getById(orgId)
        .then((snap) => { if (snap.exists()) setOrgName(snap.data().name || ''); })
        .catch(() => {});
    }
  }, [orgId, uid, orgType]);

  async function handleSaveName(e) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setNameError('Vul voor- en achternaam in.');
      return;
    }
    setSavingName(true);
    setNameError('');
    setNameSaved(false);
    try {
      await MemberFactory.update(orgId, uid, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      const user = auth.currentUser;
      if (user) {
        await updateProfile(user, { displayName: `${firstName.trim()} ${lastName.trim()}` });
      }
      setNameSaved(true);
    } catch {
      setNameError('Opslaan mislukt. Probeer opnieuw.');
    } finally {
      setSavingName(false);
    }
  }

  async function handlePasswordReset() {
    if (!email) return;
    setSendingReset(true);
    setResetError('');
    setResetSent(false);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch {
      setResetError('Versturen mislukt. Probeer opnieuw.');
    } finally {
      setSendingReset(false);
    }
  }

  async function handleLeaveOrg() {
    if (!confirm('Weet je zeker dat je de organisatie wil verlaten? Je wordt uitgelogd en moet opnieuw inloggen.')) return;
    setLeavingOrg(true);
    setLeaveError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Niet ingelogd.');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/org/leave-org', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setLeaveError(data.message || 'Er is een fout opgetreden.');
        return;
      }
      await signOut();
      router.replace('/login');
    } catch {
      setLeaveError('Er is een fout opgetreden. Probeer opnieuw.');
    } finally {
      setLeavingOrg(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerBand}>
        <button style={styles.backButton} onClick={() => router.push('/guide')}>
          ← Terug
        </button>
        <h1 style={styles.headerTitle}>Account</h1>
        <div style={{ width: 48 }} />
      </div>

      <div style={styles.content}>
        {/* Naam */}
        <div style={styles.section}>
          <p style={styles.sectionTitle}>Persoonlijke gegevens</p>
          {loadingProfile ? (
            <p style={styles.hint}>Laden...</p>
          ) : (
            <form onSubmit={handleSaveName} style={styles.form}>
              <div style={styles.fieldRow}>
                <div style={styles.field}>
                  <label style={styles.label}>Voornaam</label>
                  <input
                    style={styles.input}
                    value={firstName}
                    onChange={(e) => { setFirstName(e.target.value); setNameSaved(false); }}
                    placeholder="Voornaam"
                    required
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Achternaam</label>
                  <input
                    style={styles.input}
                    value={lastName}
                    onChange={(e) => { setLastName(e.target.value); setNameSaved(false); }}
                    placeholder="Achternaam"
                    required
                  />
                </div>
              </div>
              {nameError && <p style={styles.errorText}>{nameError}</p>}
              {nameSaved && <p style={styles.successText}>Naam opgeslagen.</p>}
              <button
                type="submit"
                disabled={savingName}
                style={{ ...styles.primaryButton, opacity: savingName ? 0.6 : 1 }}
              >
                {savingName ? 'Opslaan...' : 'Opslaan'}
              </button>
            </form>
          )}
        </div>

        {/* Wachtwoord */}
        <div style={styles.section}>
          <p style={styles.sectionTitle}>Wachtwoord</p>
          <p style={styles.sectionHint}>
            Er wordt een reset-link verstuurd naar <strong>{email}</strong>.
          </p>
          {resetError && <p style={styles.errorText}>{resetError}</p>}
          {resetSent ? (
            <p style={styles.successText}>Reset-link verstuurd. Controleer je inbox.</p>
          ) : (
            <button
              style={{ ...styles.secondaryButton, opacity: sendingReset ? 0.6 : 1 }}
              disabled={sendingReset}
              onClick={handlePasswordReset}
            >
              {sendingReset ? 'Versturen...' : 'Verstuur reset-link'}
            </button>
          )}
        </div>

        {/* Organisatie */}
        <div style={styles.section}>
          <p style={styles.sectionTitle}>Organisatie</p>
          {orgType === 'organization' ? (
            <>
              <div style={styles.orgRow}>
                <span style={styles.orgBadge}>{orgName || 'Organisatie'}</span>
              </div>
              {leaveError && <p style={styles.errorText}>{leaveError}</p>}
              <button
                style={{ ...styles.leaveButton, opacity: leavingOrg ? 0.6 : 1 }}
                disabled={leavingOrg}
                onClick={handleLeaveOrg}
              >
                {leavingOrg ? 'Bezig...' : 'Organisatie verlaten'}
              </button>
            </>
          ) : (
            <>
              <p style={styles.sectionHint}>Je bent momenteel niet aangesloten bij een organisatie.</p>
              <button
                style={styles.secondaryButton}
                onClick={() => router.push('/guide/request-access')}
              >
                Aansluiten bij organisatie
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default withRoleGuard([ROLES.GUIDE, ROLES.ORG_ADMIN], AccountPage);

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#F4F8FC',
    fontFamily: "'Nunito', system-ui, sans-serif",
  },
  headerBand: {
    background: 'linear-gradient(135deg, #5B9BD5 0%, #3A7FC1 100%)',
    padding: '1.75rem 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.9)',
    fontSize: '0.95rem',
    fontWeight: '700',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  headerTitle: {
    fontSize: '1.1rem',
    fontWeight: '800',
    color: '#fff',
    margin: 0,
  },
  content: {
    padding: '1.25rem',
    maxWidth: '600px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '16px',
    padding: '1.25rem',
    border: '1.5px solid #D0E8FA',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: '800',
    color: '#9EB3C8',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    margin: 0,
  },
  sectionHint: {
    fontSize: '0.875rem',
    color: '#6B7E91',
    margin: 0,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  fieldRow: {
    display: 'flex',
    gap: '0.75rem',
  },
  field: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: '700',
    color: '#4A6070',
  },
  input: {
    padding: '0.7rem 0.875rem',
    borderRadius: '10px',
    border: '1.5px solid #D0E8FA',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    backgroundColor: '#F4F8FC',
    color: '#1A2B3C',
    outline: 'none',
  },
  primaryButton: {
    padding: '0.75rem',
    backgroundColor: '#3A7FC1',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryButton: {
    padding: '0.7rem 1rem',
    backgroundColor: '#EBF4FF',
    color: '#3A7FC1',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
  leaveButton: {
    padding: '0.7rem 1rem',
    backgroundColor: '#FFF0F0',
    color: '#C62828',
    border: 'none',
    borderRadius: '10px',
    fontSize: '0.875rem',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
  orgRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  orgBadge: {
    fontSize: '0.95rem',
    fontWeight: '700',
    color: '#1A2B3C',
    backgroundColor: '#EBF4FF',
    padding: '0.4rem 0.875rem',
    borderRadius: '20px',
  },
  hint: {
    fontSize: '0.875rem',
    color: '#aaa',
    margin: 0,
  },
  errorText: {
    color: '#C62828',
    fontSize: '0.825rem',
    margin: 0,
    padding: '0.5rem 0.75rem',
    backgroundColor: '#FDECEA',
    borderRadius: '8px',
  },
  successText: {
    color: '#2E7D32',
    fontSize: '0.825rem',
    margin: 0,
    padding: '0.5rem 0.75rem',
    backgroundColor: '#E8F5E9',
    borderRadius: '8px',
  },
};
