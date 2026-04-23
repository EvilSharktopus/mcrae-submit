// src/auth/LoginPage.jsx
import { useState } from 'react';
import { auth } from '../firebase';
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { useAuth } from './AuthContext';
import '../styles/login.css';

// â”€â”€ Policy text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TERMS_CONTENT = `
## Terms of Use

**McRae Submit** is a classroom assignment submission tool operated by Adam McRae, a teacher at Springbank Community High School, Rocky View School Division No. 41.

### Authorized Users
Access is restricted to students currently enrolled in Mr. McRae's classes and to Mr. McRae in his instructional capacity.

### Authentication
Sign-in requires a valid @rvschools.ab.ca school email address.

### Acceptable Use
By signing in, you agree to:
- Use this application only for submitting genuine, original academic work.
- Not attempt to access or alter another student's submissions.
- Not attempt to circumvent the application's copy or paste restrictions, which exist to support academic integrity.

### Academic Integrity
Paste and drag-and-drop functionality in the text editor is intentionally disabled. Students are expected to complete all work themselves in accordance with Rocky View Schools' Academic Integrity Policy.

### No Guarantee of Availability
This application is provided as a convenience tool. Mr. McRae is not liable for assignment loss due to technical failure. Students are encouraged to retain copies of completed work.

### Parental Consent
Student access to this application must be supported by written consent from a parent or guardian.

_Last updated: April 2026_
`;

const PRIVACY_CONTENT = `
## Privacy Policy

**Operator:** Adam McRae â€” Springbank Community High School, Rocky View Schools
**Data location:** Toronto, Canada (northamerica-northeast2)

### Information Collected
When you sign in and use this application, the following is collected and stored:

| Data | Purpose |
|---|---|
| Full name | Identify you in submissions and help requests |
| Email address | Authenticate you; link submissions to your account |
| Assignment responses | Record your work for marking |
| Submission timestamps | Track when work was saved and submitted |
| Mark and feedback | Return assessment results from your teacher |
| Help requests | Allow you to request teacher assistance |
| Section enrollment | Associate you with your class |
| Access logs | Allow teacher to see assignment access |

This application does not collect passwords, phone numbers, home addresses, photos, microphone or camera data, or location data.

### Who Can See Your Data
Your submission and feedback are visible only to you and Mr. McRae. No other student or staff member can access your data.

### Third-Party Services
| Service | Provider | Data location |
|---|---|---|
| Firebase Auth / Firestore | Google LLC | Canada (Toronto) |
| Cloud Functions | Google LLC | Iowa, USA (processing only) |
| Vercel | Vercel Inc. | Global CDN |
| Resend | Resend Inc. | USA (email delivery only) |

All student data is stored in Canada.

### Data Retention
Data is retained for the current school year and may be archived by Mr. McRae. You may request access to or deletion of your data by emailing amcrae@rvschools.ab.ca.

### POPA Rights (Alberta)
Under Alberta's Protection of Privacy Act (POPA), you have the right to request access to or correction of your information. Contact Mr. McRae or Rocky View Schools' Privacy Officer (403-945-4000).

_Last updated: April 2026_
`;

// â”€â”€ Policy Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PolicyModal({ title, content, onClose }) {
  const lines = content.trim().split('\n');
  return (
    <div className="policy-overlay" onClick={onClose}>
      <div className="policy-modal" onClick={e => e.stopPropagation()}>
        <div className="policy-modal__header">
          <h2 className="policy-modal__title">{title}</h2>
          <button className="policy-modal__close" onClick={onClose} aria-label="Close">âœ•</button>
        </div>
        <div className="policy-modal__body">
          {lines.map((line, i) => {
            if (line.startsWith('## '))  return <h2 key={i}>{line.slice(3)}</h2>;
            if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
            if (line.startsWith('| ') || line.startsWith('|---')) return null;
            if (line.startsWith('_'))    return <p key={i} className="policy-modal__fine">{line.replace(/_/g, '')}</p>;
            if (line.trim() === '')     return null;
            const formatted = line
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/_(.*?)_/g, '<em>$1</em>');
            return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
          })}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Login Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const VIEWS = { signin: 'signin', signup: 'signup', reset: 'reset' };

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();

  const [view,        setView]        = useState(VIEWS.signin);
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error,       setError]       = useState('');
  const [resetSent,   setResetSent]   = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState(null);
  const [rememberMe,  setRememberMe]  = useState(true);

  const clearForm = (nextView) => {
    setError(''); setResetSent(false);
    setEmail(''); setPassword(''); setDisplayName('');
    setView(nextView);
  };

  const friendlyError = (code) => {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':    return 'Incorrect email or password.';
      case 'auth/email-already-in-use': return 'An account with that email already exists.';
      case 'auth/weak-password':     return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':     return 'Please enter a valid email address.';
      case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
      default:                       return 'Something went wrong. Please try again.';
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signIn(email, password);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await signUp(email, password, displayName);
    } catch (err) {
      setError(err.message.startsWith('Please use') ? err.message : friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{textAlign:'center', marginBottom:'8px'}}>
          <img src="/mcrae-marks.png" alt="McRae Marks" style={{height:'56px', width:'auto'}} />
        </div>
        <p className="login-subtitle">
          {view === VIEWS.signin ? 'Sign in to submit or review assignments'
           : view === VIEWS.signup ? 'Create your student account'
           : 'Reset your password'}
        </p>

        {/* â”€â”€ Sign In â”€â”€ */}
        {view === VIEWS.signin && (
          <form className="login-form" onSubmit={handleSignIn}>
            <input
              className="login-input"
              type="email"
              placeholder="School email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="login-remember">
              <label className="login-remember__label">
                <input
                  type="checkbox"
                  className="login-remember__check"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
            </div>
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="login-links">
              <button type="button" className="login-link" onClick={() => clearForm(VIEWS.reset)}>
                Forgot password?
              </button>
              <button type="button" className="login-link" onClick={() => clearForm(VIEWS.signup)}>
                Create account
              </button>
            </div>
          </form>
        )}

        {/* â”€â”€ Sign Up â”€â”€ */}
        {view === VIEWS.signup && (
          <form className="login-form" onSubmit={handleSignUp}>
            <input
              className="login-input"
              type="text"
              placeholder="Full name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
              required
            />
            <input
              className="login-input"
              type="email"
              placeholder="School email (@rvschools.ab.ca)"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <input
              className="login-input"
              type="password"
              placeholder="Choose a password (6+ characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            <button type="button" className="login-link" onClick={() => clearForm(VIEWS.signin)}>
              â†  Back to sign in
            </button>
          </form>
        )}

        {/* â”€â”€ Password Reset â”€â”€ */}
        {view === VIEWS.reset && (
          <form className="login-form" onSubmit={handleReset}>
            {resetSent ? (
              <p className="login-success">Check your email for a reset link.</p>
            ) : (
              <>
                <input
                  className="login-input"
                  type="email"
                  placeholder="Your school email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                {error && <p className="login-error">{error}</p>}
                <button className="login-btn" type="submit" disabled={loading}>
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </>
            )}
            <button type="button" className="login-link" onClick={() => clearForm(VIEWS.signin)}>
              â†  Back to sign in
            </button>
          </form>
        )}

        <div className="login-policy-links">
          <button className="login-policy-btn" onClick={() => setModal('terms')}>Terms of Use</button>
          <span className="login-policy-sep">Â·</span>
          <button className="login-policy-btn" onClick={() => setModal('privacy')}>Privacy</button>
        </div>
      </div>

      {modal === 'terms'   && <PolicyModal title="Terms of Use"   content={TERMS_CONTENT}   onClose={() => setModal(null)} />}
      {modal === 'privacy' && <PolicyModal title="Privacy Policy" content={PRIVACY_CONTENT} onClose={() => setModal(null)} />}

      {/* Bottom-centre logo */}
      <div className="login-page-logo">
        <a href="https://mcraesocial.com" target="_blank" rel="noreferrer">
          <img src="/logo.png" alt="McRae Social" className="login-page-logo__img" />
        </a>
      </div>
    </div>
  );
}
