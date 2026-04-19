// src/student/SectionPicker.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import '../styles/section.css';

export default function SectionPicker({ currentEnrollment, onEnrolled }) {
  const { user } = useAuth();
  const [sections,  setSections]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [enrolling, setEnrolling] = useState(null); // sectionId being enrolled

  useEffect(() => {
    getDocs(collection(db, 'sections'))
      .then(snap => setSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (section) => {
    // If switching from an existing section, confirm
    if (currentEnrollment && currentEnrollment.sectionId !== section.id) {
      const currentName = currentEnrollment.displayName
        || `${currentEnrollment.course} ${currentEnrollment.stream || ''}`.trim();
      if (!window.confirm(
        `You are currently in "${currentName}".\n\nLeave and join "${section.displayName}"?`
      )) return;
    }

    setEnrolling(section.id);
    try {
      // Remove old enrollment if switching
      if (currentEnrollment && currentEnrollment.sectionId !== section.id) {
        await deleteDoc(doc(db, 'enrollments', `${currentEnrollment.sectionId}__${user.email}`));
      }
      // Upsert new enrollment (deterministic ID — no duplicates)
      const enrollRef  = doc(db, 'enrollments', `${section.id}__${user.email}`);
      const enrollData = {
        sectionId:    section.id,
        course:       section.course,
        stream:       section.stream || '',
        displayName:  section.displayName,
        studentName:  user.displayName,
        studentEmail: user.email,
        enrolledAt:   serverTimestamp(),
      };
      await setDoc(enrollRef, enrollData, { merge: true });
      onEnrolled({ ...enrollData, id: `${section.id}__${user.email}` });
    } catch (err) {
      console.error('Enrollment error:', err);
      alert('Something went wrong. Please try again.');
    } finally {
      setEnrolling(null);
    }
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  const activeSections = sections.filter(s => !s.archived);

  return (
    <div className="section-picker">
      <div className="section-picker__header">
        <h1 className="section-picker__title">
          Welcome, {user.displayName.split(' ')[0]}!
        </h1>
        <p className="section-picker__subtitle">Pick your class to get started</p>
      </div>

      {activeSections.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🏫</span>
          <p>No classes have been set up yet — check back soon!</p>
        </div>
      ) : (
        <div className="section-grid">
          {activeSections.map(s => (
            <button
              key={s.id}
              className={`section-card ${currentEnrollment?.sectionId === s.id ? 'section-card--current' : ''} ${enrolling === s.id ? 'section-card--loading' : ''}`}
              onClick={() => handlePick(s)}
              disabled={!!enrolling}
            >
              <div className="section-card__course">{s.course}</div>
              <div className="section-card__name">{s.displayName}</div>
              {s.stream && <div className="section-card__stream">{s.stream}</div>}
              {currentEnrollment?.sectionId === s.id && (
                <div className="section-card__badge">Current</div>
              )}
              {enrolling === s.id && (
                <div className="section-card__spinner"><span className="spinner" /></div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
