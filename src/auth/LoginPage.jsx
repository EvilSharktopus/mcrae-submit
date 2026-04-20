// src/auth/LoginPage.jsx
import { useState } from 'react';
import { useAuth } from './AuthContext';
import '../styles/login.css';

const DOMAIN = 'rvschools.ab.ca';

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();

  // 'login' | 'signup' | 'reset'
  const [mode, setMode] = useState('login');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [info, setInfo]       = useState('');
  const [loading, setLoading] = useState(false);

  const clear = () => { setError(''); setInfo(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clear();
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password, name);
      } else if (mode === 'reset') {
        await resetPassword(email);
        setInfo(`Password reset email sent to ${email}. Check your inbox.`);
        setMode('login');
      }
    } catch (err) {
      const msg = err.code === 'auth/user-not-found'    ? 'No account found with that email.' :
                  err.code === 'auth/wrong-password'    ? 'Incorrect password.' :
                  err.code === 'auth/email-already-in-use' ? 'An account with this email already exists.' :
                  err.code === 'auth/weak-password'     ? 'Password must be at least 6 characters.' :
                  err.code === 'auth/invalid-email'     ? 'Please enter a valid email address.' :
                  err.message || 'Something went wrong. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="McRae Social" className="login-logo__img" />
        </div>
        <h1 className="login-title">McRae Submit</h1>
        <p className="login-subtitle">
          {mode === 'login'  && 'Sign in to submit or review assignments'}
          {mode === 'signup' && `Create your account using your @${DOMAIN} email`}
          {mode === 'reset'  && 'Enter your school email to reset your password'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <input
              className="login-input"
              type="text"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoComplete="name"
            />
          )}

          <input
            className="login-input"
            type="email"
            placeholder={`Email (${DOMAIN})`}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {mode !== 'reset' && (
            <input
              className="login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          )}

          {error && <div className="login-error">{error}</div>}
          {info  && <div className="login-info">{info}</div>}

          <button className="login-btn login-btn--primary" type="submit" disabled={loading}>
            {loading ? 'Please wait…' :
             mode === 'login'  ? 'Sign In' :
             mode === 'signup' ? 'Create Account' :
             'Send Reset Email'}
          </button>
        </form>

        <div className="login-links">
          {mode === 'login' && (
            <>
              <button className="login-link" onClick={() => { setMode('signup'); clear(); }}>
                New student? Create an account
              </button>
              <button className="login-link" onClick={() => { setMode('reset'); clear(); }}>
                Forgot password?
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button className="login-link" onClick={() => { setMode('login'); clear(); }}>
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
