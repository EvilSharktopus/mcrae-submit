// src/teacher/HelpRequests.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';

export default function HelpRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replies, setReplies] = useState({});

  useEffect(() => {
    const q = query(
      collection(db, 'help_requests'),
      where('resolved', '==', false)
    );
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
      setRequests(docs);
      setLoading(false);
      // Update tab title with unread count
      const count = docs.length;
      document.title = count > 0 ? `(${count}) Help Requests — McRae Submit` : 'McRae Submit';
    });
    return () => {
      unsub();
      document.title = 'McRae Submit'; // reset on unmount
    };
  }, []);

  const resolve = async (id, reply = '') => {
    await updateDoc(doc(db, 'help_requests', id), { 
      resolved: true, 
      ...(reply.trim() ? { reply: reply.trim() } : {}) 
    });
    setReplies(p => { const next = {...p}; delete next[id]; return next; });
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
                {r.type === 'answer' && (
                  <textarea
                    style={{
                      width: '100%', marginTop: 8, padding: '8px 10px', fontSize: 13,
                      borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', minHeight: 60
                    }}
                    placeholder="Type your answer here..."
                    value={replies[r.id] || ''}
                    onChange={e => setReplies(p => ({ ...p, [r.id]: e.target.value }))}
                  />
                )}
              </div>
              <button 
                className="btn btn--success btn--sm" 
                onClick={() => resolve(r.id, replies[r.id])} 
                style={{ flexShrink: 0, marginTop: r.type === 'answer' ? 24 : 0 }}
              >
                {(replies[r.id] || '').trim() ? 'Send & Resolve ✓' : 'Resolve ✓'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
