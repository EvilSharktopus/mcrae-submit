// src/student/StudentApp.jsx
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import AssignmentList from './AssignmentList';
import SubmissionPage from './SubmissionPage';
import SectionPicker  from './SectionPicker';
import '../styles/globals.css';

export default function StudentApp() {
  const { user, signOut, isTeacher } = useAuth();
  const [enrollment,  setEnrollment]  = useState(undefined); // undefined = loading
  const [showPicker,  setShowPicker]  = useState(false);

  useEffect(() => { loadEnrollment(); }, [user.email]);

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
        <span className="app-nav__brand">McRae Submit</span>
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
        <Routes>
          <Route path="/"                     element={<AssignmentList section={enrollment} />} />
          <Route path="/submit/:assignmentId" element={<SubmissionPage />} />
          <Route path="*"                     element={<Navigate to="/" />} />
        </Routes>
      )}
    </>
  );
}
