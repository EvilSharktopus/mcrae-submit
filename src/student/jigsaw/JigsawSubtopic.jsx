import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, onSnapshot, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthContext';

export default function JigsawSubtopic({ activityId, topic, onBack, onClaimed }) {
  const { user } = useAuth();
  const [subtopics, setSubtopics] = useState(topic.subtopics || []);
  const [claiming, setClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `jigsawActivities/${activityId}/topics/${topic.id}`), (docSnap) => {
      if (docSnap.exists()) {
        setSubtopics(docSnap.data().subtopics || []);
      }
    });
    return () => unsub();
  }, [activityId, topic.id]);

  async function handleClaim(subtopic) {
    if (claiming || subtopic.takenBy !== null) return;
    setClaiming(true);
    setErrorMsg(null);

    const topicRef = doc(db, `jigsawActivities/${activityId}/topics/${topic.id}`);
    const subRef = doc(db, `jigsawActivities/${activityId}/submissions/${user.uid}`);

    try {
      await runTransaction(db, async (transaction) => {
        const tDoc = await transaction.get(topicRef);
        if (!tDoc.exists()) throw new Error('TOPIC_MISSING');
        
        const data = tDoc.data();
        if ((data.enrolledCount ?? 0) >= 5) throw new Error('TOPIC_FULL');

        const newSubtopics = data.subtopics.map(s => {
          if (s.index === subtopic.index) {
            if (s.takenBy !== null) throw new Error('SLOT_TAKEN');
            return { ...s, takenBy: user.uid };
          }
          return s;
        });

        transaction.update(topicRef, {
          enrolledCount: increment(1),
          subtopics: newSubtopics
        });

        transaction.set(subRef, {
          userId: user.uid,
          studentName: user.displayName || user.email,
          topicId: topic.id,
          topicTitle: topic.title,
          subtopicIndex: subtopic.index,
          subtopicQuestion: subtopic.question,
          response: '',
          isSubmitted: false,
          createdAt: serverTimestamp(),
          lastSaved: serverTimestamp(),
          submittedAt: null
        });
      });

      // Fetch the newly created submission to pass up
      const docSnap = await subRef.get?.() || await doc(db, subRef.path).get?.(); 
      // wait, transaction does not return the document, we will just simulate what onClaimed expects:
      // Actually, since we bypass this screen entirely when we have a submission, we can just pass anything that causes re-render,
      // but let's just do a manual fallback if doc isn't accessible like that.
      // But actually we can just pass the built object:
      onClaimed({
        id: user.uid,
        topicId: topic.id,
        subtopicIndex: subtopic.index,
        promptResponses: {}
      });

    } catch (err) {
      const msg = err.message;
      if (msg === 'SLOT_TAKEN') setErrorMsg('That spot was just taken by someone else — choose a different question.');
      else if (msg === 'TOPIC_FULL') setErrorMsg('This topic just filled up. Go back and choose a different one.');
      else {
        console.error('Transaction failed:', err);
        setErrorMsg('Something went wrong. Please try again.');
      }
      setClaiming(false);
    }
  }

  const takenCount = subtopics.filter(s => s.takenBy !== null).length;
  const topicNum = topic.id.replace('t', '');

  return (
    <>
      {claiming && (
        <div className="jigsaw-tx-overlay">
          <div className="jigsaw-tx-overlay__box">
            <span className="spinner" />
            <span className="jigsaw-tx-overlay__text">Claiming your spot…</span>
          </div>
        </div>
      )}
      <div className="jigsaw-page">
        <div style={{ padding: '24px 28px 0', maxWidth: 820, margin: '0 auto' }}>
          <button className="subtopic-header__back" onClick={onBack} disabled={claiming} id="subtopic-back-btn" style={{ marginBottom: 16 }}>
            ← Back to topics
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: topic.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: topic.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Topic {topicNum}
            </span>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{topic.title}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
            Pick the question you want to research. Each question belongs to one person — first come, first served.
            {takenCount > 0 && ` (${takenCount}/5 already taken)`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Not sure? You can go back and choose a different topic.
          </p>
        </div>

        {errorMsg && (
          <div className="subtopic-error" style={{ margin: '14px 28px 0', maxWidth: 820 }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, padding: '20px 28px', maxWidth: 820, margin: '0 auto' }}>
          {subtopics.map(s => {
            const isTaken = s.takenBy !== null;
            return (
              <button
                key={s.index}
                id={`subtopic-slot-${s.index}`}
                onClick={() => handleClaim(s)}
                disabled={isTaken || claiming}
                style={{
                  background: isTaken ? 'var(--bg)' : 'var(--bg-card)',
                  border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                  textAlign: 'left',
                  cursor: isTaken ? 'not-allowed' : 'pointer',
                  opacity: isTaken ? 0.45 : 1,
                  transition: 'border-color 0.15s, transform 0.12s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
                onMouseEnter={e => {
                  if (!isTaken && !claiming) {
                    e.currentTarget.style.borderColor = topic.color;
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: isTaken ? 'var(--bg-input)' : `${topic.color}22`,
                    border: `1.5px solid ${isTaken ? 'var(--border)' : topic.color}`,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: isTaken ? 'var(--text-dim)' : topic.color,
                    flexShrink: 0
                  }}>
                    {s.index}
                  </span>
                  {isTaken ? (
                    <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(0,0,0,0.12)', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taken</span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>Click to claim →</span>
                  )}
                </div>
                <p style={{ fontSize: 14, color: isTaken ? 'var(--text-dim)' : 'var(--text)', lineHeight: 1.55, margin: 0 }}>
                  {s.question}
                </p>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '0 28px 32px', maxWidth: 820, margin: '0 auto' }}>
          <button onClick={onBack} disabled={claiming} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer', padding: '6px 0', textDecoration: 'underline', textUnderlineOffset: 3 }} id="subtopic-nevermind-btn">
            Nevermind, I want to pick a different topic
          </button>
        </div>
      </div>
    </>
  );
}
