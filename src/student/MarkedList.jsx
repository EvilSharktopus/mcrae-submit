// src/student/MarkedList.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';

export default function MarkedList() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate  = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'submissions'),
            where('studentEmail', '==', user.email),
            where('emailSent',    '==', true),
          )
        );

        const rows = await Promise.all(
          snap.docs.map(async d => {
            const sub = { id: d.id, ...d.data() };
            let assignmentName = sub.assignmentId || 'Assignment';
            try {
              const aSnap = await getDoc(doc(db, 'assignments', sub.assignmentId));
              if (aSnap.exists()) assignmentName = aSnap.data().name;
            } catch {}
            return { ...sub, assignmentName };
          })
        );

        // Most recently submitted first
        rows.sort((a, b) =>
          (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0)
        );
        setItems(rows);
      } catch (err) {
        console.error('Failed to load marked submissions:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user.email]);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div className="page">
      <h1 className="page-title">Marked Assignments</h1>

      {items.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">📋</span>
          <p>No marked assignments yet — check back after Mr. McRae has marked your work.</p>
        </div>
      ) : (
        <div>
          {items.map(sub => {
            const isNew = !sub.markedViewed;
            return (
              <div
                key={sub.id}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}
                onClick={() => navigate(`/marked/${sub.id}`)}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>{sub.assignmentName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {sub.submittedAt?.toDate?.()?.toLocaleDateString?.('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) || ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {isNew && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      background: 'rgba(72,199,142,0.15)', color: '#48c78e',
                      border: '1px solid rgba(72,199,142,0.35)',
                      borderRadius: 99, padding: '2px 8px',
                    }}>NEW</span>
                  )}
                  <span className="badge badge--sent">Marked</span>
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
