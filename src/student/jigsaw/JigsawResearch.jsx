import { useState, useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { collection, doc, onSnapshot, updateDoc, runTransaction, serverTimestamp, increment } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthContext';
import GroupSidebar from './GroupSidebar';
import SynthesisPanel from './SynthesisPanel';

export default function JigsawResearch({ activityId, assignment, setAssignment }) {
  const { user } = useAuth();
  const [topicDoc, setTopicDoc] = useState(null);
  const [responses, setResponses] = useState(assignment?.promptResponses || {});
  const [groupSubs, setGroupSubs] = useState([]);
  const [status, setStatus] = useState('idle');
  const [lastSaved, setLastSaved] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const timerRef = useRef(null);

  const subRef = doc(db, `jigsawActivities/${activityId}/submissions/${user.uid}`);
  const topicRef = doc(db, `jigsawActivities/${activityId}/topics/${assignment.topicId}`);
  const storageKey = `jigsaw_draft_${activityId}_${user.uid}`;

  useEffect(() => {
    if (!assignment?.promptResponses && !assignment?.isSubmitted) {
      try {
        const local = JSON.parse(localStorage.getItem(storageKey));
        if (local) setResponses(local);
      } catch {}
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(topicRef, (snap) => {
      if (snap.exists()) setTopicDoc({ id: snap.id, ...snap.data() });
    });
    return () => unsub();
  }, [activityId, assignment.topicId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, `jigsawActivities/${activityId}/submissions`), (snap) => {
      const subs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.topicId === assignment.topicId);
      setGroupSubs(subs);
      const mine = subs.find(s => s.userId === user.uid);
      if (mine?.isSubmitted && !assignment.isSubmitted) {
        setAssignment(mine);
        setResponses(mine.promptResponses || {});
      }
    });
    return () => unsub();
  }, [activityId, assignment.topicId, assignment.isSubmitted]);

  const compileResponse = (resps) => {
    return Object.values(resps).filter(r => r.trim()).map(r => `<p>${r}</p>`).join('');
  };

  const saveDraft = async (newResps) => {
    try {
      await updateDoc(subRef, {
        promptResponses: newResps,
        response: compileResponse(newResps),
        lastSaved: serverTimestamp()
      });
      setLastSaved(new Date());
      setStatus('saved');
      localStorage.setItem(storageKey, JSON.stringify(newResps));
    } catch (err) {
      console.error('Jigsaw auto-save failed:', err);
      setStatus('offline');
      localStorage.setItem(storageKey, JSON.stringify(newResps));
    }
  };

  const handleChange = (promptIdx, content) => {
    const newResps = { ...responses, [promptIdx]: content };
    setResponses(newResps);
    localStorage.setItem(storageKey, JSON.stringify(newResps));
    
    if (!assignment.isSubmitted) {
      setStatus('saving');
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveDraft(newResps), 1500);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      clearTimeout(timerRef.current);
      await updateDoc(subRef, {
        promptResponses: responses,
        response: compileResponse(responses),
        isSubmitted: true,
        submittedAt: serverTimestamp(),
        lastSaved: serverTimestamp()
      });
      setAssignment(prev => ({ ...prev, isSubmitted: true }));
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.error('Jigsaw submit failed:', err);
      alert('Submit failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async () => {
    if (releasing) return;
    setReleasing(true);
    try {
      await runTransaction(db, async (t) => {
        const tSnap = await t.get(topicRef);
        if (!tSnap.exists()) throw new Error('TOPIC_MISSING');
        const data = tSnap.data();
        const newSubtopics = data.subtopics.map(s => 
          s.index === assignment.subtopicIndex ? { ...s, takenBy: null } : s
        );
        t.update(topicRef, { enrolledCount: increment(-1), subtopics: newSubtopics });
        t.delete(subRef);
      });
      localStorage.removeItem(storageKey);
      setAssignment(null);
    } catch (err) {
      console.error('Release failed:', err);
      alert('Could not release slot. Try again or ask Mr. McRae.');
      setReleasing(false);
    }
  };

  const allSubmitted = groupSubs.length === 5 && groupSubs.every(s => s.isSubmitted);
  const prompts = topicDoc?.subtopics?.find(s => s.index === assignment.subtopicIndex)?.guidingPrompts || [];
  const hasContent = Object.values(responses).some(r => r.replace(/<[^>]*>?/gm, '').trim().length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', background: 'var(--bg)' }}>
      <div style={{ padding: '12px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: topicDoc?.color || 'var(--accent)' }} />
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Topic {assignment.topicId.replace('t','')} · {assignment.topicTitle}</h2>
          {assignment.isSubmitted ? (
            <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(72,199,142,0.15)', color: '#48c78e', padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Submitted</span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {status === 'saving' ? 'Saving...' : status === 'saved' ? `Saved at ${lastSaved?.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : status === 'offline' ? 'Unsaved (Offline)' : 'Draft'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
          <div className="research-question-panel">
            <div className="research-question-panel__eyebrow" style={{ '--topic-color': topicDoc?.color || 'var(--accent)' }}>
              Subtopic {assignment.subtopicIndex}
            </div>
            <div className="research-question-panel__question">{assignment.subtopicQuestion}</div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {assignment.isSubmitted ? (
              <div style={{ maxWidth: 700 }}>
                {prompts.length > 0 ? prompts.map((p, i) => (
                  <div key={i} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}>{p}</div>
                    <div className="editor-body" dangerouslySetInnerHTML={{ __html: responses[i] || '(No response)' }} />
                  </div>
                )) : (
                  <div className="editor-body" dangerouslySetInnerHTML={{ __html: assignment.response || '(No response)' }} />
                )}
              </div>
            ) : (
              <div style={{ maxWidth: 700 }}>
                {prompts.map((p, i) => (
                  <div key={i} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{p}</div>
                    <textarea 
                      className="input"
                      value={responses[i] || ''} 
                      onChange={e => handleChange(i, e.target.value)} 
                      style={{ background: 'var(--bg-card)', minHeight: 120, resize: 'vertical' }}
                      placeholder="Enter your research findings here..."
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 32 }}>
                  <button 
                    onClick={() => confirmRelease ? handleRelease() : setConfirmRelease(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                    disabled={releasing}
                  >
                    {confirmRelease ? 'Click again to confirm' : releasing ? 'Going back...' : '← Wrong subtopic? Go back'}
                  </button>
                  <button 
                    className="btn btn--primary btn--sm" 
                    onClick={handleSubmit} 
                    disabled={!hasContent || submitting}
                  >
                    {submitting ? 'Submitting...' : 'Submit Research'}
                  </button>
                </div>
              </div>
            )}
            
            {allSubmitted && (
              <div style={{ marginTop: 40 }}>
                <SynthesisPanel 
                  activityId={activityId} 
                  topicId={assignment.topicId} 
                  synthesisQuestions={topicDoc?.synthesisQuestions || []}
                  isComplete={topicDoc?.isComplete || false}
                />
              </div>
            )}
          </div>
        </div>
        
        <GroupSidebar 
          activityId={activityId} 
          topicId={assignment.topicId} 
          myUserId={user.uid} 
          mySubtopicIndex={assignment.subtopicIndex} 
        />
      </div>
    </div>
  );
}
