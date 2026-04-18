// src/student/AssignmentList.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';

export default function AssignmentList() {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [aSnap, sSnap] = await Promise.all([
          getDocs(query(collection(db, 'assignments'), orderBy('course'))),
          getDocs(query(collection(db, 'submissions'), where('studentEmail', '==', user.email))),
        ]);
        setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const subMap = {};
        sSnap.docs.forEach(d => {
          const s = d.data();
          subMap[s.assignmentId] = s;
        });
        setSubmissions(subMap);
      } catch (err) {
        console.error('Failed to load assignments:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.email]);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // Group by course
  const grouped = assignments.reduce((acc, a) => {
    const key = a.course || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="page">
      <h1 className="page-title">Assignments</h1>
      {Object.keys(grouped).length === 0 && (
        <div className="empty">
          <span className="empty__icon">📋</span>
          <p>No assignments posted yet.</p>
        </div>
      )}
      {Object.entries(grouped).map(([course, items]) => (
        <div key={course} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>{course}</h2>
          {items.map(a => {
            const sub = submissions[a.id];
            return (
              <div
                key={a.id}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                onClick={() => navigate(`/submit/${a.id}`)}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{a.name}</div>
                  {a.stream && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{a.stream}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {sub ? (
                    sub.emailSent
                      ? <span className="badge badge--sent">Marked</span>
                      : <span className="badge badge--pending">Submitted</span>
                  ) : (
                    <span className="badge badge--pending">Open</span>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
