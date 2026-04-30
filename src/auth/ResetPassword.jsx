// src/auth/ResetPassword.jsx
// Custom password-reset handler.
// Firebase sends the student here (via the action URL configured in Firebase Console).
// The oobCode sits in the URL as a query param. The school's email scanner can fetch
// this page freely — it's just a form. The code is only consumed when the student
// submits their new password.

import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import '../styles/login.css';

export default function ResetPassword() {
  const [searchParams]              = useSearchParams();
  const navigate                    = useNavigate();
  const oobCode                     = searchParams.get('oobCode');

  const [password,    setPassword]  = useState('');
  const [confirm,     setConfirm]   = useState('');
  const [error,       setError]     = useState('');
  const [loading,     setLoading]   = useState(false);
  const [done,        setDone]      = useState(false);

  // Guard: no oobCode in URL
  if (!oobCode) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src="/mcrae-marks.png" alt="McRae Marks" style={{ height: '56px', width: 'auto', display: 'block', margin: '0 auto 12px' }} />
          <p className="login-error" style={{ textAlign: 'center' }}>
            This reset link is invalid or missing. Please request a new one from the login page.
          </p>
          <button className="login-btn" onClick={() => navigate('/')}>
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Verify the code is still valid before consuming it
      await verifyPasswordResetCode(auth, oobCode);
      // Consume the code and set the new password
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (err) {
      switch (err.code) {
        case 'auth/expired-action-code':
          setError('This reset link has expired. Please request a new one.');
          break;
        case 'auth/invalid-action-code':
          setError('This reset link is invalid or has already been used. Please request a new one.');
          break;
        case 'auth/weak-password':
          setError('Password must be at least 6 characters.');
          break;
        default:
          setError('Something went wrong. Please try again or request a new reset link.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <img src="/mcrae-marks.png" alt="McRae Marks" style={{ height: '56px', width: 'auto' }} />
        </div>
        <p className="login-subtitle">
          {done ? 'Password updated!' : 'Choose a new password'}
        </p>

        {done ? (
          <div>
            <p className="login-success" style={{ textAlign: 'center', marginBottom: '16px' }}>
              Your password has been reset successfully.
            </p>
            <button className="login-btn" onClick={() => navigate('/')}>
              Sign In
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={handleSubmit}>
            <input
              className="login-input"
              type="password"
              placeholder="New password (6+ characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <input
              className="login-input"
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <p className="login-error">{error}</p>}
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
            <button
              type="button"
              className="login-link"
              onClick={() => navigate('/')}
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>

      <div className="login-page-logo">
        <a href="https://mcraesocial.com" target="_blank" rel="noreferrer">
          <img src="/logo.png" alt="McRae Social" className="login-page-logo__img" />
        </a>
      </div>
    </div>
  );
}
