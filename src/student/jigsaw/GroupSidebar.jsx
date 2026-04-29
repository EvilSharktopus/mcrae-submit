import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function GroupSidebar({ activityId, topicId, myUserId, mySubtopicIndex }) {
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, `jigsawActivities/${activityId}/submissions`),
      where('topicId', '==', topicId)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSubmissions(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.subtopicIndex ?? 0) - (b.subtopicIndex ?? 0))
      );
    }, (err) => {
      console.error('GroupSidebar snapshot error:', err);
    });
    return () => unsub();
  }, [activityId, topicId]);

  const submittedCount = submissions.filter(s => s.isSubmitted).length;

  return (
    <div className="group-sidebar">
      <div className="group-sidebar__header">Group ({submittedCount}/5 submitted)</div>
      <div className="group-sidebar__list">
        {submissions.length === 0 && (
          <div className="group-sidebar__waiting">Waiting for your group members to join…</div>
        )}
        {submissions.map(sub => {
          const isMine = sub.userId === myUserId;
          return (
            <div key={sub.id} className={`group-submission-card ${isMine ? 'group-submission-card--mine' : ''}`}>
              <div className="group-submission-card__header">
                <span className="group-submission-card__name">{isMine ? 'You' : sub.studentName || 'Student'}</span>
                <span className="group-submission-card__subtopic">#{sub.subtopicIndex}</span>
              </div>
              {sub.isSubmitted ? (
                <p className="group-submission-card__text">{sub.response || '(empty)'}</p>
              ) : (
                <p className="group-submission-card__pending">{isMine ? 'Your work (not submitted yet)' : 'Working…'}</p>
              )}
            </div>
          );
        })}
        {submissions.length > 0 && submittedCount < 5 && (
          <div className="group-sidebar__waiting">
            Waiting for {5 - submittedCount} more submission{5 - submittedCount === 1 ? '' : 's'} before synthesis unlocks.
          </div>
        )}
        <div style={{ margin: '8px 0 4px', padding: '12px 14px', background: 'rgba(91,141,238,0.08)', border: '1px solid rgba(91,141,238,0.2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: 'var(--accent-bright)', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📢 Future class reminder
          </div>
          You will need to share your findings with a new group. Make sure your research is clear!
        </div>
      </div>
    </div>
  );
}
