// src/teacher/HelpRequests.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function HelpRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'help_requests'),
      where('resolved', '==', false),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const resolve = async (id) => {
    await updateDoc(doc(db, 'help_requests', id), { resolved: true });
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="page-title">Help Requests</h1>
      {requests.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🎉</span>
          <p>No pending help requests.</p>
        </div>
      ) : (
        <div>
          {requests.map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{r.studentName}</strong>
                  <span className={`badge ${r.type === 'come' ? 'badge--pending' : 'badge--marked'}`}>
                    {r.type === 'come' ? '📍 Come see me' : '💬 Answer here'}
                  </span>
                  {r.timestamp && (
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                      {(() => {
                        const ms = r.timestamp.toDate ? r.timestamp.toDate().getTime() : new Date(r.timestamp).getTime();
                        const d = Date.now() - ms;
                        if (d < 60000) return 'just now';
                        if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
                        if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
                        return r.timestamp.toDate ? r.timestamp.toDate().toLocaleDateString() : '';
                      })()}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: r.message ? 8 : 0 }}>
                  {r.assignmentName} · {r.studentEmail}
                </div>
                {r.message && (
                  <div style={{
                    fontSize: 13, background: 'var(--bg-input)', padding: '8px 12px',
                    borderRadius: 6, border: '1px solid var(--border)', marginTop: 6,
                    lineHeight: 1.5,
                  }}>
                    {r.message}
                  </div>
                )}
              </div>
              <button className="btn btn--success btn--sm" onClick={() => resolve(r.id)} style={{ flexShrink: 0 }}>
                Resolve ✓
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
