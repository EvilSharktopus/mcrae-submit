// src/teacher/TeacherApp.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import Dashboard from './Dashboard';
import Setup from './Setup';
import HelpRequests from './HelpRequests';
import Grades from './Grades';
import JigsawAdmin from './jigsaw/JigsawAdmin';
import LiteracyAudit from './LiteracyAudit';
import Comments from './Comments';
import ToMark from './ToMark';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import '../styles/globals.css';

export default function TeacherApp() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [helpCount,   setHelpCount]   = useState(0);
  const [toMarkCount, setToMarkCount] = useState(0);
  const [jigsawAvailable, setJigsawAvailable] = useState(false);

  // Live count of unresolved help requests
  useEffect(() => {
    const q = query(collection(db, 'help_requests'), where('resolved', '==', false));
    const unsub = onSnapshot(q, snap => setHelpCount(snap.size));
    return () => unsub();
  }, []);

  // Live count of submitted-but-unmarked submissions
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'submissions'), snap => {
      const count = snap.docs.filter(d => {
        const s = d.data();
        const submitted = s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));
        return submitted && !s.emailSent && s.mark == null;
      }).length;
      setToMarkCount(count);
    });
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
            {/* To Mark — inbox with live badge */}
            <button
              className={`app-nav__tab ${tab === 'tomark' ? 'active' : ''}`}
              onClick={() => setTab('tomark')}
              style={{ position: 'relative' }}
            >
              To Mark
              {toMarkCount > 0 && (
                <span style={{
                  position: 'absolute', top: 3, right: 3,
                  background: 'var(--danger)', color: '#fff',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  {toMarkCount > 9 ? '9+' : toMarkCount}
                </span>
              )}
            </button>
            <button className={`app-nav__tab ${tab === 'grades' ? 'active' : ''}`} onClick={() => setTab('grades')}>
              Grades
            </button>
            {/* Help Requests — now just a hand emoji */}
            <button
              className={`app-nav__tab ${tab === 'help' ? 'active' : ''}`}
              onClick={() => setTab('help')}
              style={{ position: 'relative' }}
              title="Help Requests"
            >
              🖐️
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
            <button className={`app-nav__tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>
              📊 Literacy Audit
            </button>
            <button className={`app-nav__tab ${tab === 'comments' ? 'active' : ''}`} onClick={() => setTab('comments')}>
              💬 Comments
            </button>
            <button className={`app-nav__tab ${tab === 'setup' ? 'active' : ''}`} onClick={() => setTab('setup')}>
              Setup
            </button>
          </div>
          <button className="app-nav__signout" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      {tab === 'dashboard' && <Dashboard />}
      {tab === 'tomark'    && <ToMark />}
      {tab === 'grades'    && <Grades />}
      {tab === 'help'      && <HelpRequests />}
      {tab === 'setup'     && <Setup />}
      {tab === 'jigsaw'    && <JigsawAdmin />}
      {tab === 'audit'     && <LiteracyAudit />}
      {tab === 'comments'  && <Comments />}
    </>
  );
}
