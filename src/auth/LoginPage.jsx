// src/auth/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from './AuthContext';
import '../styles/login.css';

// ── Policy text ──────────────────────────────────────────────────────────────

const TERMS_CONTENT = `
## Terms of Use

**McRae Submit** is a classroom assignment submission tool operated by Adam McRae, a teacher at Springbank Community High School, Rocky View School Division No. 41.

### Authorized Users
Access is restricted to students currently enrolled in Mr. McRae's classes and to Mr. McRae in his instructional capacity.

### Authentication
Sign-in requires a valid account. Students must use the same email address they registered with.

### Acceptable Use
By signing in, you agree to:
- Use this application only for submitting genuine, original academic work.
- Not attempt to access or alter another student's submissions.
- Not attempt to circumvent the application's copy or paste restrictions, which exist to support academic integrity.

### Academic Integrity
Paste and drag-and-drop functionality in the text editor is intentionally disabled. Students are expected to complete all work themselves in accordance with Rocky View Schools' Academic Integrity Policy.

### No Guarantee of Availability
This application is provided as a convenience tool. Mr. McRae is not liable for assignment loss due to technical failure. Students are encouraged to retain copies of completed work.

_Last updated: April 2026_
`;

const PRIVACY_CONTENT = `
## Privacy Policy

**Operator:** Adam McRae — Springbank Community High School, Rocky View Schools
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

This application does **not** collect passwords, phone numbers, home addresses, photos, microphone or camera data, or location data.

### Who Can See Your Data
Your submission and feedback are visible only to **you and Mr. McRae**. No other student or staff member can access your data.

### Third-Party Services
| Service | Provider | Data location |
|---|---|---|
| Firebase Auth / Firestore | Google LLC | Canada (Toronto) |
| Cloud Functions | Google LLC | Iowa, USA (processing only — no data retained) |
| Vercel | Vercel Inc. | Global CDN |
| Resend | Resend Inc. | USA (email delivery only) |

All student data is stored in **Canada**.

### Data Retention
Data is retained for the current school year and may be archived by Mr. McRae. You may request access to or deletion of your data by emailing **amcrae@rvschools.ab.ca**.

### FOIP Rights (Alberta)
Under Alberta's _Freedom of Information and Protection of Privacy Act_, you have the right to request access to or correction of your information. Contact Mr. McRae or Rocky View Schools' FOIP Coordinator (403-945-4000).

_Last updated: April 2026_
`;

// ── Policy Modal ─────────────────────────────────────────────────────────────

function PolicyModal({ title, content, onClose }) {
  // Convert the markdown-ish text to basic HTML for display
  const lines = content.trim().split('\n');
  return (
    <div className="policy-overlay" onClick={onClose}>
      <div className="policy-modal" onClick={e => e.stopPropagation()}>
        <div className="policy-modal__header">
          <h2 className="policy-modal__title">{title}</h2>
          <button className="policy-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="policy-modal__body">
          {lines.map((line, i) => {
            if (line.startsWith('## '))  return <h2 key={i}>{line.slice(3)}</h2>;
            if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
            if (line.startsWith('| '))   return null; // handled below as table
            if (line.startsWith('_'))    return <p key={i} className="policy-modal__fine">{line.replace(/_/g, '')}</p>;
            if (line.trim() === '' || line.trim() === '|---|---|---|' || line.trim() === '|---|---|' || line.trim() === '|---|---|---|---|') return null;
            // Bold inline
            const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>');
            return <p key={i} dangerouslySetInnerHTML={{ __html: formatted }} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Login Page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { signIn } = useAuth();
  const [modal, setModal] = useState(null); // null | 'terms' | 'privacy'

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="McRae Social" className="login-logo__img" />
        </div>
        <h1 className="login-title">McRae Submit</h1>
        <p className="login-subtitle">Sign in to submit or review assignments</p>
        <button className="login-btn" onClick={signIn}>
          <svg className="login-btn__icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="login-policy-links">
          <button className="login-policy-btn" onClick={() => setModal('terms')}>Terms of Use</button>
          <span className="login-policy-sep">·</span>
          <button className="login-policy-btn" onClick={() => setModal('privacy')}>Privacy</button>
        </div>
      </div>

      {modal === 'terms'   && <PolicyModal title="Terms of Use" content={TERMS_CONTENT}   onClose={() => setModal(null)} />}
      {modal === 'privacy' && <PolicyModal title="Privacy Policy" content={PRIVACY_CONTENT} onClose={() => setModal(null)} />}
    </div>
  );
}
