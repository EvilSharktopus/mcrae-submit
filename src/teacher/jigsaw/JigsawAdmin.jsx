import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore';

export default function JigsawAdmin() {
  const [activityId, setActivityId] = useState(null);
  const [activity, setActivity] = useState(null);
  const [topics, setTopics] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        let snap = await getDocs(query(collection(db, 'jigsawActivities'), where('isActive', '==', true), limit(1)));
        if (snap.empty) {
          snap = await getDocs(query(collection(db, 'jigsawActivities'), limit(1)));
        }
        if (snap.empty) {
          setLoading(false);
          return;
        }
        const docSnap = snap.docs[0];
        setActivityId(docSnap.id);
        setActivity({ id: docSnap.id, ...docSnap.data() });
      } catch (err) {
        console.error('Failed to load jigsaw activity:', err);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!activityId) return;
    const unsubTopics = onSnapshot(collection(db, `jigsawActivities/${activityId}/topics`), (snap) => {
      setTopics(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.id.localeCompare(b.id)));
      setLoading(false);
    });
    const unsubSubs = onSnapshot(collection(db, `jigsawActivities/${activityId}/submissions`), (snap) => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubTopics(); unsubSubs(); };
  }, [activityId]);

  async function handleToggle() {
    if (!activityId || toggling) return;
    setToggling(true);
    try {
      const newState = !activity.isActive;
      await updateDoc(doc(db, 'jigsawActivities', activityId), { isActive: newState });
      setActivity(prev => ({ ...prev, isActive: newState }));
    } catch (err) {
      console.error('Failed to toggle activity:', err);
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  if (!activityId) {
    return (
      <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 className="page-title">Jigsaw</h1>
        <div className="empty">
          <span className="empty__icon">🧩</span>
          <p>No jigsaw activity found. Run the seed script first.</p>
        </div>
      </div>
    );
  }

  const enrolledCount = topics.reduce((sum, t) => sum + (t.enrolledCount || 0), 0);
  const submittedCount = submissions.filter(s => s.isSubmitted).length;
  const completeCount = topics.filter(t => t.isComplete).length;

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>🧩 {activity?.title || 'Economic Globalization Jigsaw'}</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{activity?.course}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right', marginRight: 16 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--text)' }}><strong style={{ color: 'var(--accent)' }}>{enrolledCount}</strong> enrolled</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}><strong style={{ color: '#48c78e' }}>{submittedCount}</strong> submitted</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}><strong>{completeCount}/{topics.length}</strong> synthesis complete</div>
            </div>
          </div>
          <button 
            onClick={handleToggle}
            disabled={toggling}
            style={{ 
              background: activity?.isActive ? 'rgba(224,92,92,0.15)' : 'rgba(76,175,130,0.15)',
              color: activity?.isActive ? 'var(--danger)' : 'var(--success)',
              border: `1px solid ${activity?.isActive ? 'rgba(224,92,92,0.4)' : 'rgba(76,175,130,0.4)'}`,
              padding: '8px 16px',
              borderRadius: 'var(--radius)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {toggling ? '...' : activity?.isActive ? '🔴 Pause Activity' : '🟢 Resume Activity'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {topics.map(t => {
          const topicSubs = submissions.filter(s => s.topicId === t.id);
          const topicSubsCount = topicSubs.filter(s => s.isSubmitted).length;
          const enrolled = t.enrolledCount || 0;
          const pct = Math.min(100, (enrolled / 5) * 100);
          const isExpanded = expandedTopic === t.id;

          return (
            <div key={t.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div 
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', cursor: 'pointer' }}
                onClick={() => setExpandedTopic(isExpanded ? null : t.id)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 12 }}>
                    <span>{topicSubsCount}/5 submitted</span>
                    {t.isComplete && <span style={{ color: '#48c78e', fontWeight: 600 }}>Synthesis Complete ✓</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 140 }}>
                    <div style={{ flex: 1, height: 6, background: 'var(--bg-input)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: enrolled >= 5 ? 'var(--text-dim)' : 'var(--accent)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 60, textAlign: 'right' }}>
                      {enrolled >= 5 ? 'Full' : `${5 - enrolled} open`}
                    </span>
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {t.subtopics?.map(sub => {
                    const studentSub = topicSubs.find(s => s.subtopicIndex === sub.index);
                    return (
                      <div key={sub.index} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 140px 90px', alignItems: 'start', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
                          {sub.index}
                        </span>
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>{sub.question}</div>
                          {studentSub && studentSub.isSubmitted && (
                            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {studentSub.response?.replace(/<[^>]*>?/gm, '') || '(Empty response)'}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: studentSub ? 'var(--text)' : 'var(--text-dim)' }}>
                          {studentSub ? (studentSub.studentName || 'Student') : 'Empty'}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {studentSub ? (
                            studentSub.isSubmitted ? (
                              <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(72,199,142,0.15)', color: '#48c78e', padding: '2px 8px', borderRadius: 20 }}>Submitted</span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>Working...</span>
                            )
                          ) : (
                            <span style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: 20 }}>Open</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
