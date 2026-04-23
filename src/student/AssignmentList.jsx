// src/student/AssignmentList.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { isPastCutoff, CUTOFF_HOUR, CUTOFF_MIN } from '../utils/cutoff';

export default function AssignmentList({ section }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading,     setLoading]     = useState(true);
  const [wasCutoff,   setWasCutoff]   = useState(false);
  const { user } = useAuth();
  const navigate  = useNavigate();

  // Show banner if kicked out by cutoff timer
  useEffect(() => {
    if (sessionStorage.getItem('cutoffKickout')) {
      sessionStorage.removeItem('cutoffKickout');
      setWasCutoff(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [aSnap, sSnap] = await Promise.all([
          getDocs(collection(db, 'assignments')),
          getDocs(query(collection(db, 'submissions'), where('studentEmail', '==', user.email))),
        ]);

        let all = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Filter to enrolled section + exclude archived assignments
        // Normalize stream: "10-2" → "-2", "-2" → "-2" so both formats match
        if (section) {
          const norm = (s) => s ? (s.startsWith('-') ? s : s.replace(/^\d+/, '')) : '';
          const sStream = norm(section.stream);
          const now = Date.now();
          all = all.filter(a => {
            const aStream = norm(a.stream);
            if (a.archived) return false;
            if (a.isOpen === false) return false;
            if (a.course !== section.course) return false;
            if (aStream && sStream && aStream !== sStream) return false;
            // Schedule enforcement — handles Firestore Timestamps, JS Dates, and datetime-local strings
            const toMs = (v) => {
              if (!v) return null;
              if (v.toDate) return v.toDate().getTime();       // Firestore Timestamp
              const d = new Date(v);
              if (!isNaN(d)) return d.getTime();
              return new Date(String(v).replace('T', ' ')).getTime(); // datetime-local fallback
            };
            const openMs  = toMs(a.openAt);
            const closeMs = toMs(a.closeAt);
            const isTimed = !!(a.openAt || a.closeAt);
            if (openMs  && now < openMs)  return false; // not open yet
            if (closeMs && now > closeMs) return false; // already closed
            // Non-timed assignments still respect the daily cutoff
            if (!isTimed && isPastCutoff()) return false;
            return true;
          });
        }
        setAssignments(all);
        const subMap = {};
        sSnap.docs.forEach(d => { const s = d.data(); subMap[s.assignmentId] = s; });
        setSubmissions(subMap);
      } catch (err) {
        console.error('Failed to load assignments:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.email, section?.sectionId]);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div className="page">
      <h1 className="page-title">Assignments</h1>

      {/* Cutoff banner */}
      {wasCutoff && (
        <div style={{ background: 'rgba(255,180,0,0.12)', border: '1px solid rgba(255,180,0,0.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: 'var(--text)' }}>
          ⏰ <strong>Time's up!</strong> It's past {CUTOFF_HOUR}:{String(CUTOFF_MIN).padStart(2,'0')} — your work was automatically saved before the assignment closed.
        </div>
      )}

      {isPastCutoff() && (
        <div style={{ background: 'rgba(255,100,100,0.10)', border: '1px solid rgba(255,100,100,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: 'var(--text)' }}>
          🔒 Submissions are closed for today ({CUTOFF_HOUR}:{String(CUTOFF_MIN).padStart(2,'0')} cutoff).
        </div>
      )}

      {section && (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20, marginTop: -8 }}>
          {section.displayName}
          {section.stream ? ` · ${section.stream}` : ''}
        </p>
      )}

      {assignments.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">📋</span>
          <p>No assignments posted yet.</p>
        </div>
      ) : (
        <div>
          {assignments.map(a => {
            const sub = submissions[a.id];
            return (
              <div
                key={a.id}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}
                onClick={() => navigate(`/submit/${a.id}`)}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{a.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {a.stream && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.stream}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {(() => {
                    const actuallySubmitted = sub && (sub.submitted === true || !('submitted' in sub));
                    const isDraft = sub && sub.submitted === false;
                    if (sub?.emailSent)    return <span className="badge badge--sent">Marked</span>;
                    if (actuallySubmitted) return <span className="badge badge--pending">Submitted</span>;
                    if (isDraft)           return <span className="badge" style={{ background: 'rgba(123,143,181,0.15)', color: 'var(--text-dim)' }}>In progress</span>;
                    return <span className="badge badge--pending">Open</span>;
                  })()}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
