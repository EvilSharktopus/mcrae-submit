// src/teacher/TeacherApp.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import Dashboard from './Dashboard';
import Setup from './Setup';
import HelpRequests from './HelpRequests';
import JigsawAdmin from './jigsaw/JigsawAdmin';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import '../styles/globals.css';

export default function TeacherApp() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [helpCount, setHelpCount] = useState(0);
  const [jigsawAvailable, setJigsawAvailable] = useState(false);

  // Live count of unresolved help requests
  useEffect(() => {
    const q = query(collection(db, 'help_requests'), where('resolved', '==', false));
    const unsub = onSnapshot(q, snap => setHelpCount(snap.size));
    return () => unsub();
  }, []);

  // Check if jigsaw has ever been set up
  useEffect(() => {
    async function checkJigsaw() {
      try {
        const snap = await getDocs(query(collection(db, 'jigsawActivities'), limit(1)));
        setJigsawAvailable(!snap.empty);
      } catch { setJigsawAvailable(false); }
    }
    checkJigsaw();
  }, []);

  return (
    <>
      <nav className="app-nav">
        <a href="https://submit.mcraesocial.com" className="app-nav__brand" style={{display:'flex',alignItems:'center'}}>
          <img src="/mcrae-marks.png" alt="McRae Marks" style={{height:'36px', width:'auto', display:'block'}} />
        </a>
        <div className="app-nav__right">
          <div className="app-nav__tabs">
            <button className={`app-nav__tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
              Submissions
            </button>
            <button
              className={`app-nav__tab ${tab === 'help' ? 'active' : ''}`}
              onClick={() => setTab('help')}
              style={{ position: 'relative' }}
            >
              Help Requests
              {helpCount > 0 && (
                <span style={{
                  position: 'absolute', top: 3, right: 3,
                  background: 'var(--danger)', color: '#fff',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  {helpCount > 9 ? '9+' : helpCount}
                </span>
              )}
            </button>
            {jigsawAvailable && (
              <button className={`app-nav__tab ${tab === 'jigsaw' ? 'active' : ''}`} onClick={() => setTab('jigsaw')}>
                🧩 Jigsaw
              </button>
            )}
            <button className={`app-nav__tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>
              Setup
            </button>
          </div>
          <span className="app-nav__user">{user.displayName}</span>
          <button className="app-nav__signout" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'help' && <HelpRequests />}
      {tab === 'setup' && <Setup />}
      {tab === 'jigsaw' && <JigsawAdmin />}
    </>
  );
}
