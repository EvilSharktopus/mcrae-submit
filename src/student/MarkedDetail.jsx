// src/student/MarkedDetail.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import DOMPurify from 'dompurify';

export default function MarkedDetail() {
  const { submissionId } = useParams();
  const { user }         = useAuth();
  const navigate         = useNavigate();
  const [sub,    setSub]    = useState(null);
  const [aName,  setAName]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, 'submissions', submissionId));
        if (!snap.exists() || snap.data().studentEmail !== user.email) {
          navigate('/marked', { replace: true });
          return;
        }
        const data = { id: snap.id, ...snap.data() };

        // Fetch assignment name
        if (data.assignmentId) {
          try {
            const aSnap = await getDoc(doc(db, 'assignments', data.assignmentId));
            if (aSnap.exists()) setAName(aSnap.data().name);
          } catch {}
        }

        setSub(data);

        // Mark as viewed on first open
        if (!data.markedViewed) {
          updateDoc(doc(db, 'submissions', submissionId), { markedViewed: true }).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load marked submission:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [submissionId, user.email]);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;
  if (!sub) return null;

  const { rubricBreakdown, feedback, response, plainResponse } = sub;
  const totalScore = rubricBreakdown?.reduce((s, r) => s + (r.points ?? 0), 0) ?? 0;
  const totalMax   = rubricBreakdown?.reduce((s, r) => s + (r.maxPts  ?? 0), 0) ?? 0;

  return (
    <div className="page" style={{ maxWidth: 700, margin: '0 auto' }}>
      <button
        className="btn btn--secondary btn--sm"
        style={{ marginBottom: 20 }}
        onClick={() => navigate('/marked')}
      >
        ← Back
      </button>

      <div className="card" style={{ padding: '28px 32px' }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>{aName}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 28px' }}>
          Your marked submission
        </p>

        {/* ── Rubric breakdown ── */}
        {rubricBreakdown?.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>
              Rubric Breakdown
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {rubricBreakdown.map((r, i) => (
                <div key={i} style={{ borderBottom: i < rubricBreakdown.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--bg-card)' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{r.category}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.label && (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.label}</span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
                        {r.points != null ? `${r.points}${r.maxPts ? `/${r.maxPts}` : ''}` : '—'}
                      </span>
                    </span>
                  </div>
                  {r.text && (
                    <div style={{ padding: '2px 16px 10px', fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                      {r.text}
                    </div>
                  )}
                </div>
              ))}
              {totalMax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{totalScore}/{totalMax}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Feedback ── */}
        {feedback && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8, fontWeight: 600 }}>
              Feedback
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
              {feedback}
            </div>
          </div>
        )}

        {/* ── Their submission ── */}
        {(response || plainResponse) && (
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 8, fontWeight: 600 }}>
              Your Submission
            </div>
            <div
              className="editor-body"
              style={{ minHeight: 'auto', maxHeight: '55vh', overflowY: 'auto', padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'default' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(response || plainResponse) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
