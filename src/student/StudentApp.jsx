// src/student/StudentApp.jsx
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useNavigate, useMatch } from 'react-router-dom';
import AssignmentList from './AssignmentList';
import SubmissionPage from './SubmissionPage';
import DebatePage from './DebatePage';
import SectionPicker from './SectionPicker';
import MarkedList     from './MarkedList';
import MarkedDetail   from './MarkedDetail';
import JigsawApp      from './jigsaw/JigsawApp';
import '../styles/globals.css';
import { limit } from 'firebase/firestore';

function NavTab({ to, label, badge }) {
  const navigate = useNavigate();
  const match    = useMatch(to === '/' ? '/' : `${to}/*`);
  const active   = !!match;
  return (
    <button
      onClick={() => navigate(to)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '10px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
      }}
    >
      {label}
      {badge > 0 && (
        <span style={{
          background: '#48c78e', color: '#fff', borderRadius: 99,
          fontSize: 10, fontWeight: 700, padding: '1px 6px', minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      )}
    </button>
  );
}

export default function StudentApp() {
  const { user, signOut, isTeacher } = useAuth();
  const [enrollment,    setEnrollment]    = useState(undefined);
  const [showPicker,    setShowPicker]    = useState(false);
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [jigsawActive,  setJigsawActive]  = useState(false);

  useEffect(() => { loadEnrollment(); }, [user.email]);
  useEffect(() => { loadUnviewed(); },  [user.email]);
  useEffect(() => { checkJigsaw(); }, []);

  async function checkJigsaw() {
    try {
      const snap = await getDocs(query(collection(db, 'jigsawActivities'), where('isActive', '==', true), limit(1)));
      setJigsawActive(!snap.empty);
    } catch { setJigsawActive(false); }
  }

  async function loadUnviewed() {
    try {
      const snap = await getDocs(
        query(collection(db, 'submissions'),
          where('studentEmail', '==', user.email),
          where('emailSent',    '==', true),
        )
      );
      setUnviewedCount(snap.docs.filter(d => !d.data().markedViewed).length);
    } catch {}
  }

  async function loadEnrollment() {
    try {
      const snap = await getDocs(
        query(collection(db, 'enrollments'), where('studentEmail', '==', user.email))
      );
      setEnrollment(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
    } catch (err) {
      console.error('Enrollment check failed:', err);
      setEnrollment(null);
    }
  }

  const handleEnrolled = (newEnrollment) => {
    setEnrollment(newEnrollment);
    setShowPicker(false);
  };

  if (enrollment === undefined) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  const sectionLabel = enrollment
    ? (enrollment.displayName || `${enrollment.course} ${enrollment.stream || ''}`.trim())
    : null;

  return (
    <>
      <nav className="app-nav">
        <a href="https://submit.mcraesocial.com" className="app-nav__brand" style={{display:'flex',alignItems:'center'}}>
          <img src="/mcrae-marks.png" alt="McRae Marks" style={{height:'36px', width:'auto', display:'block'}} />
        </a>
        <div className="app-nav__right">
          {sectionLabel && !showPicker && (
            <span style={{
              fontSize: 12, color: 'var(--text-dim)', padding: '4px 10px',
              background: 'var(--bg-card)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', whiteSpace: 'nowrap',
            }}>
              {sectionLabel}
            </span>
          )}
          <span className="app-nav__user">{user.displayName}</span>
          {enrollment && !showPicker && (
            <button
              className="app-nav__signout"
              style={{ fontSize: 11 }}
              onClick={() => setShowPicker(true)}
            >
              Change class
            </button>
          )}
          {isTeacher ? (
            <button className="app-nav__signout" style={{ color: '#ffb9b9', fontWeight: 'bold' }} onClick={() => {
              localStorage.removeItem('studentView');
              window.location.href = '/';
            }}>
              Exit Student View
            </button>
          ) : (
            <button className="app-nav__signout" onClick={signOut}>Sign out</button>
          )}
        </div>
      </nav>

      {(!enrollment || showPicker) ? (
        <SectionPicker
          currentEnrollment={enrollment}
          onEnrolled={handleEnrolled}
        />
      ) : (
        <>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', padding: '0 16px' }}>
            <NavTab to="/" label="Assignments" />
            <NavTab to="/marked" label="Marked" badge={unviewedCount} />
            {jigsawActive && <NavTab to="/jigsaw" label="🧩 Jigsaw" />}
          </div>

          <Routes>
            <Route path="/"                      element={<AssignmentList section={enrollment} jigsawActive={jigsawActive} />} />
            <Route path="/submit/:assignmentId"  element={<SubmissionPage />} />
            <Route path="/debate/:assignmentId"  element={<DebatePage />} />
            <Route path="/marked"                element={<MarkedList />} />
            <Route path="/marked/:submissionId"  element={<MarkedDetail />} />
            {jigsawActive && <Route path="/jigsaw/*" element={<JigsawApp />} />}
            <Route path="*"                      element={<Navigate to="/" />} />
          </Routes>
        </>
      )}
    </>
  );
}
