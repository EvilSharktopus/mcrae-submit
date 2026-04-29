import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';

export default function SynthesisPanel({ activityId, topicId, synthesisQuestions, isComplete }) {
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(isComplete);
  const timerRef = useRef({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, `jigsawActivities/${activityId}/topics/${topicId}`), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setAnswers(data.synthesisAnswers || {});
        if (data.isComplete) setComplete(true);
      }
    });
    return () => unsub();
  }, [activityId, topicId]);

  function handleChange(q, text) {
    setAnswers(prev => ({ ...prev, [q]: text }));
    clearTimeout(timerRef.current[q]);
    timerRef.current[q] = setTimeout(async () => {
      try {
        await updateDoc(doc(db, `jigsawActivities/${activityId}/topics/${topicId}`), {
          [`synthesisAnswers.${q}`]: text
        });
      } catch (err) {
        console.error('Synthesis auto-save failed:', err);
      }
    }, 1500);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, `jigsawActivities/${activityId}/topics/${topicId}`), {
        synthesisAnswers: answers,
        isComplete: true
      });
      setComplete(true);
    } catch (err) {
      console.error('Synthesis submit failed:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const allAnswered = synthesisQuestions.every(q => (answers[q] || '').trim().length > 0);

  if (complete) {
    return (
      <div className="synthesis-panel">
        <h3 className="synthesis-panel__title">✨ Group Synthesis Complete</h3>
        <p className="synthesis-panel__sub" style={{ marginBottom: 0 }}>
          Your group has successfully completed the synthesis phase. Good work!
        </p>
      </div>
    );
  }

  return (
    <div className="synthesis-panel">
      <h3 className="synthesis-panel__title">Group Synthesis</h3>
      <p className="synthesis-panel__sub">
        Work together with your group to answer the following questions based on everyone's research. Anyone can type, and it saves automatically for the whole group.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        {synthesisQuestions.map((q, i) => (
          <div key={i}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{q}</div>
            <textarea
              className="input"
              style={{ minHeight: 80, resize: 'vertical' }}
              placeholder="Type your group's answer..."
              value={answers[q] || ''}
              onChange={e => handleChange(q, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn--primary btn--sm" 
          disabled={!allAnswered || submitting} 
          onClick={handleSubmit}
        >
          {submitting ? 'Submitting...' : 'Submit Group Synthesis'}
        </button>
      </div>
    </div>
  );
}
