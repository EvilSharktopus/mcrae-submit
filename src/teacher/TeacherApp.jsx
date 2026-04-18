// src/teacher/TeacherApp.jsx
import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Dashboard from './Dashboard';
import MarkingView from './MarkingView';
import Setup from './Setup';
import '../styles/globals.css';

export default function TeacherApp() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard'); // 'dashboard' | 'setup'

  return (
    <>
      <nav className="app-nav">
        <span className="app-nav__brand">McRae Submit</span>
        <div className="app-nav__right">
          <div className="app-nav__tabs">
            <button className={`app-nav__tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
              Submissions
            </button>
            <button className={`app-nav__tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>
              Setup
            </button>
          </div>
          <span className="app-nav__user">{user.displayName}</span>
          <button className="app-nav__signout" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'setup' && <Setup />}
    </>
  );
}
