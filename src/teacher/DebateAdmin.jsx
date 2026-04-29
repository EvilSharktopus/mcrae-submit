import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';

function wc(text) {
  return text && text.trim() ? text.trim().split(/\s+/).length : 0;
}

export default function DebateAdmin({ submission, assignment, prevStudent, onPrevStudent, nextStudent, onNextStudent, onClose }) {
  const [activeTab, setActiveTab] = useState('student');
  const [subData, setSubData] = useState(submission);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const promptRef = useRef(null);
  
  // Setup real-time listener for this submission to catch student updates while viewing
  useEffect(() => {
    if (!submission?.id) return;
    const unsub = onSnapshot(doc(db, 'submissions', submission.id), (snap) => {
      if (snap.exists()) {
        setSubData({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsub();
  }, [submission?.id]);

  const stages = subData.debateStages || {
    1: { unlocked: true, approved: false },
    2: { unlocked: false, approved: false },
    3: { unlocked: false, approved: false },
    4: { unlocked: false, approved: false },
    5: { unlocked: false, approved: false },
  };
  const debateContent = subData.debateContent || {};
  const topic = subData.debateTopic || '';
  const geminiPromptOverride = subData.geminiPromptOverride || '';

  const defaultPrompt = `You are a debate opponent challenging a high school student.\nTopic: "${topic || '[topic not set by teacher]'}"\nStudent position: "${debateContent.s1_position || '[student has not stated position yet]'}"\n\nChallenge the student's position with sharp, focused two-sentence rebuttals. Escalate difficulty across rounds. No encouragement — just argue the opposing side.`;

  const handleUpdateTopic = async (newTopic) => {
    await updateDoc(doc(db, 'submissions', subData.id), { debateTopic: newTopic });
  };

  const savePrompt = async () => {
    if (!promptRef.current) return;
    setSavingPrompt(true);
    await updateDoc(doc(db, 'submissions', subData.id), { geminiPromptOverride: promptRef.current.value });
    setTimeout(() => setSavingPrompt(false), 1200);
  };

  const resetPrompt = async () => {
    if (!promptRef.current) return;
    promptRef.current.value = defaultPrompt;
    await updateDoc(doc(db, 'submissions', subData.id), { geminiPromptOverride: '' });
  };

  const approveStage = async (s) => {
    const newStages = { ...stages };
    newStages[s] = { ...newStages[s], approved: true };
    if (s < 5) {
      newStages[s + 1] = { ...newStages[s + 1], unlocked: true };
    }
    await updateDoc(doc(db, 'submissions', subData.id), { debateStages: newStages });
  };

  const stageNames = ['', 'Understanding the Topic', 'Position & Sources', 'Opening Argument', 'AI Practice Rounds', 'Closing Argument'];

  return (
    <div className="marking-page" style={{ overflowY: 'auto', background: 'var(--bg-primary)' }}>
      <div className="marking-header">
        <button className="btn btn--secondary btn--sm" onClick={onClose}>← Back</button>
        <div>
          <div className="marking-header__title">{subData.studentName}</div>
          <div className="marking-header__sub">{assignment?.name} · {subData.studentEmail}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {prevStudent && <button className="btn btn--secondary btn--sm" onClick={onPrevStudent}>← Previous</button>}
          {nextStudent && <button className="btn btn--secondary btn--sm" onClick={onNextStudent}>Next →</button>}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          <div style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', borderBottom: activeTab === 'student' ? '2px solid var(--text)' : '2px solid transparent', color: activeTab === 'student' ? 'var(--text)' : 'var(--text-dim)', fontWeight: activeTab === 'student' ? 600 : 400 }} onClick={() => setActiveTab('student')}>Student Progress</div>
          <div style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', borderBottom: activeTab === 'setup' ? '2px solid var(--text)' : '2px solid transparent', color: activeTab === 'setup' ? 'var(--text)' : 'var(--text-dim)', fontWeight: activeTab === 'setup' ? 600 : 400 }} onClick={() => setActiveTab('setup')}>Assignment Setup</div>
        </div>

        {activeTab === 'setup' && (
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Assignment Setup</h3>
            <div className="field">
              <label>Debate Topic (set this before the student begins Stage 2)</label>
              <input type="text" value={topic} onChange={(e) => handleUpdateTopic(e.target.value)} placeholder="e.g. Should school uniforms be mandatory?" />
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Gemini Prompt for AI Rounds</label>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Auto-generated from topic & position — edit if needed.</div>
              <textarea 
                ref={promptRef}
                defaultValue={geminiPromptOverride || defaultPrompt} 
                rows={6} 
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13, padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn--secondary btn--sm" onClick={resetPrompt}>Reset to default</button>
              <button className="btn btn--primary btn--sm" onClick={savePrompt} disabled={savingPrompt}>
                {savingPrompt ? 'Saved!' : 'Save prompt'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'student' && (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{subData.studentName}</span>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Topic: {topic || 'Not set'}</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[1, 2, 3, 4, 5].map((s) => {
                  const st = stages[s];
                  let statusColor = 'var(--text-dim)';
                  let statusText = 'Locked';
                  if (st.approved) { statusColor = 'var(--success)'; statusText = 'Approved'; }
                  else if (st.unlocked) { statusColor = '#f59e0b'; statusText = 'Awaiting review'; }
                  
                  const isStage4Ready = s === 4 && st.unlocked && debateContent.rounds && debateContent.rounds[2]?.done;
                  if (isStage4Ready && !st.approved) {
                    statusColor = '#3b82f6';
                    statusText = 'Ready for hallway';
                  }

                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: s < 5 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, opacity: st.unlocked ? 1 : 0.4 }} />
                        <span style={{ fontSize: 14, color: st.unlocked ? 'var(--text)' : 'var(--text-dim)' }}>Stage {s}: {stageNames[s]}</span>
                      </div>
                      
                      {st.unlocked && !st.approved && s !== 4 && (
                        <button className="btn btn--primary btn--sm" onClick={() => approveStage(s)}>Approve →</button>
                      )}
                      {isStage4Ready && !st.approved && (
                        <button className="btn btn--primary btn--sm" style={{ background: '#3b82f6', borderColor: '#3b82f6' }} onClick={() => approveStage(s)}>Unlock Stage 5</button>
                      )}
                      {st.approved && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)' }}>Approved</span>
                      )}
                      {!st.approved && (!st.unlocked || (s === 4 && !isStage4Ready)) && (
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{statusText}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Student Responses</h3>
            
            {debateContent.s1_what && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage 1 — Topic explanation</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{debateContent.s1_what}</div>
              </div>
            )}
            
            {debateContent.s1_position && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage 2 — Position</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{debateContent.s1_position}</div>
              </div>
            )}
            
            {debateContent.s3_opening && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage 3 — Opening argument ({wc(debateContent.s3_opening)} words)</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{debateContent.s3_opening}</div>
              </div>
            )}
            
            {debateContent.s5_closing && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage 5 — Closing argument ({wc(debateContent.s5_closing)} words)</div>
                <div style={{ fontSize: 14, lineHeight: 1.6 }}>{debateContent.s5_closing}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
