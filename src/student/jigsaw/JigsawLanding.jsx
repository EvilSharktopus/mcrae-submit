import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const TOPIC_COLORS = ['#e57c5b','#c45e9e','#4e9cd4','#6aab7f','#9b7bd4','#d4a24c'];

export default function JigsawLanding({ activityId, onTopicSelect }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `jigsawActivities/${activityId}/topics`), (snap) => {
      setTopics(snap.docs.map((d, i) => ({
        id: d.id,
        color: TOPIC_COLORS[i] || '#7b8fb5',
        ...d.data()
      })));
      setLoading(false);
    }, (err) => {
      console.error('JigsawLanding snapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [activityId]);

  if (loading) {
    return <div className="loading-screen"><span className="spinner" /></div>;
  }

  return (
    <div className="jigsaw-page">
      <div className="jigsaw-header">
        <div className="jigsaw-header__eyebrow">Social 10-1 · Economic Globalization</div>
        <h1 className="jigsaw-header__title">Choose Your Research Topic</h1>
        <p className="jigsaw-header__sub">Each topic has 5 spots. Select a topic, then choose your subtopic.</p>
      </div>
      <div className="topic-grid">
        {topics.map((t, i) => {
          const enrolled = t.enrolledCount ?? 0;
          const isFull = enrolled >= 5;
          const pct = Math.min(100, (enrolled / 5) * 100);
          
          return (
            <button 
              key={t.id}
              id={`topic-card-${t.id}`}
              className={`topic-card ${isFull ? 'topic-card--full' : ''}`}
              style={{ '--topic-color': t.color }}
              onClick={() => { if (!isFull) onTopicSelect(t); }}
              disabled={isFull}
              aria-label={`${t.title}${isFull ? ' — full' : ''}`}
            >
              <div className="topic-card__number">Topic {i + 1}</div>
              <div className="topic-card__title">{t.title}</div>
              <div className="topic-card__enrollment">
                <div className="topic-card__spots-bar">
                  <div className="topic-card__spots-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="topic-card__spots-label">{isFull ? 'Full' : `${enrolled}/5`}</span>
              </div>
              {isFull && <span className="topic-card__full-badge">Full</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
