import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, functions } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth/AuthContext';
import '../styles/debate.css'; // We'll create this or use inline styles for now

function wc(text) {
  return text && text.trim() ? text.trim().split(/\s+/).length : 0;
}

function applyAntiPaste(el) {
  if (!el) return;
  const prevent = e => e.preventDefault();
  ['paste', 'copy', 'cut', 'drop', 'contextmenu'].forEach(ev => {
    el.addEventListener(ev, prevent);
  });
  return () => {
    ['paste', 'copy', 'cut', 'drop', 'contextmenu'].forEach(ev => {
      el.removeEventListener(ev, prevent);
    });
  };
}

export default function DebatePage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [assignment, setAssignment] = useState(null);
  const [subDocId, setSubDocId] = useState(null);
  const [data, setData] = useState({
    debateStages: {
      1: { unlocked: true, approved: false },
      2: { unlocked: false, approved: false },
      3: { unlocked: false, approved: false },
      4: { unlocked: false, approved: false },
      5: { unlocked: false, approved: false },
    },
    debateContent: {
      s1_what: '', s1_sides: '', s1_stake: '',
      s1_position: '', s1_point1: '', s1_point2: '', s1_point3: '',
      s2_devil: '',
      s2_sources: [{url:'',takeaway:''},{url:'',takeaway:''},{url:'',takeaway:''}],
      s3_opening: '',
      rounds: [
        { studentArg:'', geminiRebuttal:'', studentResp1:'', geminiChallenge:'', studentResp2:'', done:false },
        { studentArg:'', geminiRebuttal:'', studentResp1:'', geminiChallenge:'', studentResp2:'', done:false },
        { studentArg:'', geminiRebuttal:'', studentResp1:'', geminiChallenge:'', studentResp2:'', done:false },
      ],
      s5_closing: '',
    },
    debateTopic: '',
    geminiPromptOverride: '',
    currentRound: 0,
    roundStep: {0:1, 1:0, 2:0}
  });

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const autoSaveTimer = useRef(null);

  // Initialize and listen to submission doc
  useEffect(() => {
    let unsub = () => {};
    
    async function init() {
      if (!user) return;
      try {
        const aSnap = await getDoc(doc(db, 'assignments', assignmentId));
        if (aSnap.exists()) {
          setAssignment({ id: aSnap.id, ...aSnap.data() });
        } else {
          navigate('/');
          return;
        }

        const sid = `${user.uid}_${assignmentId}`;
        setSubDocId(sid);
        
        const subSnap = await getDoc(doc(db, 'submissions', sid));
        if (!subSnap.exists()) {
          // Create initial doc
          await setDoc(doc(db, 'submissions', sid), {
            studentEmail: user.email,
            studentName: user.displayName,
            assignmentId: assignmentId,
            assignmentName: aSnap.data().name,
            course: aSnap.data().course,
            stream: aSnap.data().stream,
            userId: user.uid,
            debateStages: data.debateStages,
            debateContent: data.debateContent,
            debateTopic: '',
            currentRound: 0,
            roundStep: {0:1, 1:0, 2:0},
            timestamp: new Date()
          });
        }
        
        unsub = onSnapshot(doc(db, 'submissions', sid), (docSnap) => {
          if (docSnap.exists()) {
            const d = docSnap.data();
            setData(prev => ({
              ...prev,
              debateStages: d.debateStages || prev.debateStages,
              debateContent: d.debateContent || prev.debateContent,
              debateTopic: d.debateTopic || '',
              geminiPromptOverride: d.geminiPromptOverride || '',
              currentRound: d.currentRound ?? prev.currentRound,
              roundStep: d.roundStep || prev.roundStep
            }));
          }
          setLoading(false);
        });

      } catch (err) {
        console.error('Error init debate:', err);
        setLoading(false);
      }
    }
    
    init();
    return () => unsub();
  }, [user, assignmentId]);

  const scheduleSave = (newData) => {
    setData(newData);
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateDoc(doc(db, 'submissions', subDocId), {
          debateContent: newData.debateContent,
          currentRound: newData.currentRound,
          roundStep: newData.roundStep,
          lastSaved: new Date()
        });
        setTimeout(() => setSaving(false), 1000);
      } catch (err) {
        console.error('Save error', err);
        setSaving(false);
      }
    }, 2000);
  };

  const updateContent = (key, value) => {
    scheduleSave({
      ...data,
      debateContent: { ...data.debateContent, [key]: value }
    });
  };

  const updateSource = (index, field, value) => {
    const newSources = [...data.debateContent.s2_sources];
    newSources[index][field] = value;
    scheduleSave({
      ...data,
      debateContent: { ...data.debateContent, s2_sources: newSources }
    });
  };

  const updateRound = (index, field, value) => {
    const newRounds = [...data.debateContent.rounds];
    newRounds[index][field] = value;
    scheduleSave({
      ...data,
      debateContent: { ...data.debateContent, rounds: newRounds }
    });
  };

  const fireGeminiRebuttal = async (roundIdx, type) => {
    setAiLoading(true);
    const round = data.debateContent.rounds[roundIdx];
    const intensity = ['moderate', 'strong', 'hardest possible'];
    
    let prompt = '';
    if (type === 'rebuttal') {
      prompt = `Round ${roundIdx+1} — ${intensity[roundIdx]} difficulty. The student just argued: "${round.studentArg}". Give a two-sentence rebuttal attacking their argument directly.`;
    } else {
      prompt = `Round ${roundIdx+1} — this is your hardest challenge yet. The student responded: "${round.studentResp1}". Hit them with your strongest two-sentence counter. Find a weakness they haven't addressed.`;
    }

    const defaultSystem = `You are a debate opponent challenging a high school student.\nTopic: "${data.debateTopic}"\nStudent position: "${data.debateContent.s1_position}"\n\nChallenge the student's position with sharp, focused two-sentence rebuttals. Escalate difficulty across rounds. No encouragement — just argue the opposing side.`;
    const systemContext = data.geminiPromptOverride || defaultSystem;

    try {
      const getRebuttal = httpsCallable(functions, 'debateGeminiRebuttal');
      const res = await getRebuttal({ systemContext, prompt });
      const responseText = res.data.text;

      const newRounds = [...data.debateContent.rounds];
      if (type === 'rebuttal') newRounds[roundIdx].geminiRebuttal = responseText;
      else newRounds[roundIdx].geminiChallenge = responseText;

      const newStep = { ...data.roundStep, [roundIdx]: type === 'rebuttal' ? 3 : 5 };
      
      await updateDoc(doc(db, 'submissions', subDocId), {
        debateContent: { ...data.debateContent, rounds: newRounds },
        roundStep: newStep
      });
      
    } catch (err) {
      console.error('Gemini error:', err);
      alert('Error connecting to AI. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const completeRound = async (idx) => {
    const newRounds = [...data.debateContent.rounds];
    newRounds[idx].done = true;
    
    let nextRound = data.currentRound;
    let newStep = { ...data.roundStep };
    
    if (idx < 2) {
      nextRound = idx + 1;
      newStep[idx+1] = 1;
    }

    const newStages = { ...data.debateStages };
    if (idx === 2) {
      // Stage 5 remains locked until teacher unlocks it, but we can set 4 to ready essentially
      // Actually prototype says "Once that's done, Stage 5 will unlock" but it's done via teacher approveStage(4)
    }

    await updateDoc(doc(db, 'submissions', subDocId), {
      debateContent: { ...data.debateContent, rounds: newRounds },
      currentRound: nextRound,
      roundStep: newStep,
      debateStages: newStages
    });
  };

  if (loading) return <div style={{padding: 40}}>Loading...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>{assignment?.name}</h2>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          {saving ? 'Saving...' : 'All changes saved'}
        </div>
      </div>

      {data.debateTopic && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 14, color: 'var(--text)', marginBottom: 24, fontWeight: 500 }}>
          Topic: {data.debateTopic}
        </div>
      )}
      {!data.debateTopic && (
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'rgba(255,193,70,0.1)', color: '#c8952a', border: '1px solid rgba(255,193,70,0.3)', marginBottom: 24, fontSize: 14 }}>
          Your teacher has not set a topic yet. Please wait.
        </div>
      )}

      {/* STAGE 1 */}
      <div className="debate-stage">
        <div className="stage-header">
          <span className="stage-num">Stage 1</span>
          {data.debateStages[1].approved ? <span style={{fontSize: 11, color: 'var(--success)', fontWeight: 600}}>Approved</span> : null}
        </div>
        <div className="stage-title">Understanding Your Topic</div>
        <div className="stage-desc">Before you argue anything, you need to understand what you're arguing about. Explain the topic in your own words.</div>
        
        <label>What is this topic about? Explain it in your own words.</label>
        <textarea rows="4" value={data.debateContent.s1_what} onChange={e => updateContent('s1_what', e.target.value)} disabled={data.debateStages[1].approved} ref={applyAntiPaste} />
        <div className="word-count">{wc(data.debateContent.s1_what)} words</div>
        
        <label>Who are the two sides of this debate? What do they each believe?</label>
        <textarea rows="3" value={data.debateContent.s1_sides} onChange={e => updateContent('s1_sides', e.target.value)} disabled={data.debateStages[1].approved} ref={applyAntiPaste} />
        
        <label>Why does this topic matter? What's at stake?</label>
        <textarea rows="3" value={data.debateContent.s1_stake} onChange={e => updateContent('s1_stake', e.target.value)} disabled={data.debateStages[1].approved} ref={applyAntiPaste} />
      </div>

      {/* STAGE 2 */}
      <div className="debate-stage">
        <div className="stage-header">
          <span className="stage-num">Stage 2</span>
          {data.debateStages[2].approved ? <span style={{fontSize: 11, color: 'var(--success)', fontWeight: 600}}>Approved</span> : !data.debateStages[2].unlocked ? <span style={{fontSize: 11, color: 'var(--text-dim)'}}>Locked</span> : null}
        </div>
        <div className="stage-title">Your Position & Sources</div>
        <div className="stage-desc">Take a clear position and back it up. Find real sources.</div>
        
        {!data.debateStages[2].unlocked ? (
          <div className="locked-msg">This stage is locked. Wait for teacher approval of Stage 1.</div>
        ) : (
          <>
            <label>What is your position on this topic?</label>
            <textarea rows="2" value={data.debateContent.s1_position} onChange={e => updateContent('s1_position', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} />
            
            <label>Your three strongest supporting arguments</label>
            <textarea rows="2" value={data.debateContent.s1_point1} onChange={e => updateContent('s1_point1', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} placeholder="Point 1..." style={{marginBottom:8}}/>
            <textarea rows="2" value={data.debateContent.s1_point2} onChange={e => updateContent('s1_point2', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} placeholder="Point 2..." style={{marginBottom:8}}/>
            <textarea rows="2" value={data.debateContent.s1_point3} onChange={e => updateContent('s1_point3', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} placeholder="Point 3..."/>
            
            <label>Devil's advocate — what's the strongest argument against your position?</label>
            <textarea rows="2" value={data.debateContent.s2_devil} onChange={e => updateContent('s2_devil', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} />
            
            <hr style={{borderTop: '1px solid var(--border)', margin: '20px 0'}} />
            <div style={{fontSize:13, fontWeight:600, marginBottom:4}}>Sources</div>
            <div style={{fontSize:12, color:'var(--text-dim)', marginBottom:12}}>You may paste URLs here. For the takeaway box, type what you actually learned from that site — no pasting.</div>
            
            {[0, 1, 2].map(i => (
              <div key={i} style={{padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12}}>
                <label>Source {i+1} URL</label>
                <input type="url" value={data.debateContent.s2_sources[i]?.url || ''} onChange={e => updateSource(i, 'url', e.target.value)} disabled={data.debateStages[2].approved} />
                <label style={{marginTop: 8}}>What did you learn from this source?</label>
                <textarea rows="2" value={data.debateContent.s2_sources[i]?.takeaway || ''} onChange={e => updateSource(i, 'takeaway', e.target.value)} disabled={data.debateStages[2].approved} ref={applyAntiPaste} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* STAGE 3 */}
      <div className="debate-stage">
        <div className="stage-header">
          <span className="stage-num">Stage 3</span>
          {data.debateStages[3].approved ? <span style={{fontSize: 11, color: 'var(--success)', fontWeight: 600}}>Approved</span> : !data.debateStages[3].unlocked ? <span style={{fontSize: 11, color: 'var(--text-dim)'}}>Locked</span> : null}
        </div>
        <div className="stage-title">Opening Argument</div>
        <div className="stage-desc">Write your formal opening argument. This is what you'd say to open the debate.</div>
        
        {!data.debateStages[3].unlocked ? (
          <div className="locked-msg">This stage is locked. Wait for teacher approval of Stage 2.</div>
        ) : (
          <>
            <label>Opening argument — minimum 80 words</label>
            <textarea rows="8" value={data.debateContent.s3_opening} onChange={e => updateContent('s3_opening', e.target.value)} disabled={data.debateStages[3].approved} ref={applyAntiPaste} />
            <div className="word-count" style={{color: wc(data.debateContent.s3_opening) < 80 ? 'var(--danger)' : 'var(--text-dim)'}}>
              {wc(data.debateContent.s3_opening)} words {wc(data.debateContent.s3_opening) < 80 && '(need 80)'}
            </div>
          </>
        )}
      </div>

      {/* STAGE 4 */}
      <div className="debate-stage">
        <div className="stage-header">
          <span className="stage-num">Stage 4</span>
          {data.debateStages[4].approved ? <span style={{fontSize: 11, color: 'var(--success)', fontWeight: 600}}>Approved</span> : !data.debateStages[4].unlocked ? <span style={{fontSize: 11, color: 'var(--text-dim)'}}>Locked</span> : null}
        </div>
        <div className="stage-title">AI Practice Rounds</div>
        <div className="stage-desc">Three rounds of back-and-forth with an AI opponent. It will push back hard.</div>
        
        {!data.debateStages[4].unlocked ? (
          <div className="locked-msg">This stage is locked. Wait for teacher approval of Stage 3.</div>
        ) : (
          <div>
            {[0, 1, 2].map((r) => {
              const round = data.debateContent.rounds[r];
              const step = data.roundStep[r] || (r === 0 ? 1 : 0);
              const isActive = r === data.currentRound && !round.done;
              const isPast = round.done;
              const labels = ['Round 1 — moderate pressure', 'Round 2 — ramping up', 'Round 3 — hardest challenge'];

              return (
                <div key={r} style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, opacity: (!isPast && !isActive) ? 0.4 : 1, pointerEvents: (!isPast && !isActive) ? 'none' : 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)', marginBottom: 12 }}>{labels[r]}</div>
                  
                  {isPast ? (
                    <div style={{ fontSize: 13, color: 'var(--success)', fontWeight: 500 }}>Round complete</div>
                  ) : isActive ? (
                    <>
                      <label style={{marginTop:0}}>4.1 — State your argument for this round</label>
                      <textarea rows="3" value={round.studentArg} onChange={e => updateRound(r, 'studentArg', e.target.value)} disabled={step > 1} ref={applyAntiPaste} />
                      
                      {step === 1 && (
                        <button className="btn btn--primary btn--sm" style={{marginTop: 8}} onClick={() => {
                          const newStep = {...data.roundStep, [r]: 2};
                          setData({...data, roundStep: newStep});
                          fireGeminiRebuttal(r, 'rebuttal');
                        }} disabled={!round.studentArg.trim()}>Submit argument</button>
                      )}

                      {(round.geminiRebuttal || step >= 2) && (
                        <>
                          <label style={{marginTop:16}}>4.2 — Gemini fires back</label>
                          <div style={{ padding: 14, background: 'var(--bg-card)', borderLeft: '3px solid #4285f4', borderRadius: '0 8px 8px 0', fontSize: 14, lineHeight: 1.5, color: step === 2 ? 'var(--text-dim)' : 'var(--text)' }}>
                            {step === 2 && aiLoading ? <span style={{fontStyle:'italic'}}>Gemini is thinking...</span> : round.geminiRebuttal}
                          </div>
                        </>
                      )}

                      {step >= 3 && (
                        <>
                          <label style={{marginTop:16}}>4.3 — Your response to the rebuttal</label>
                          <textarea rows="3" value={round.studentResp1} onChange={e => updateRound(r, 'studentResp1', e.target.value)} disabled={step > 3} ref={applyAntiPaste} />
                          {step === 3 && (
                            <button className="btn btn--primary btn--sm" style={{marginTop: 8}} onClick={() => {
                              const newStep = {...data.roundStep, [r]: 4};
                              setData({...data, roundStep: newStep});
                              fireGeminiRebuttal(r, 'challenge');
                            }} disabled={!round.studentResp1.trim()}>Submit response</button>
                          )}
                        </>
                      )}

                      {(round.geminiChallenge || step >= 4) && (
                        <>
                          <label style={{marginTop:16}}>4.4 — Gemini's hardest challenge</label>
                          <div style={{ padding: 14, background: 'var(--bg-card)', borderLeft: '3px solid #db4437', borderRadius: '0 8px 8px 0', fontSize: 14, lineHeight: 1.5, color: step === 4 ? 'var(--text-dim)' : 'var(--text)' }}>
                            {step === 4 && aiLoading ? <span style={{fontStyle:'italic'}}>Gemini is thinking...</span> : round.geminiChallenge}
                          </div>
                        </>
                      )}

                      {step >= 5 && (
                        <>
                          <label style={{marginTop:16}}>4.5 — Final response this round</label>
                          <textarea rows="3" value={round.studentResp2} onChange={e => updateRound(r, 'studentResp2', e.target.value)} ref={applyAntiPaste} />
                          <button className="btn btn--primary btn--sm" style={{marginTop: 8}} onClick={() => completeRound(r)} disabled={!round.studentResp2.trim()}>Complete round</button>
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Locked — complete previous round first</div>
                  )}
                </div>
              );
            })}
            {data.debateContent.rounds[2]?.done && (
              <div style={{ padding: 16, background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, fontSize: 14, marginTop: 16 }}>
                All three rounds complete. Your teacher will schedule your hallway challenge. Once that's done, Stage 5 will unlock.
              </div>
            )}
          </div>
        )}
      </div>

      {/* STAGE 5 */}
      <div className="debate-stage">
        <div className="stage-header">
          <span className="stage-num">Stage 5</span>
          {data.debateStages[5].approved ? <span style={{fontSize: 11, color: 'var(--success)', fontWeight: 600}}>Approved</span> : !data.debateStages[5].unlocked ? <span style={{fontSize: 11, color: 'var(--text-dim)'}}>Locked</span> : null}
        </div>
        <div className="stage-title">Closing Argument</div>
        <div className="stage-desc">You've argued with an AI, you've argued with your teacher. Now write your final position.</div>
        
        {!data.debateStages[5].unlocked ? (
          <div className="locked-msg">This stage is locked. Complete the hallway challenge and wait for teacher approval.</div>
        ) : (
          <>
            <label>Closing argument — minimum 100 words</label>
            <textarea rows="8" value={data.debateContent.s5_closing} onChange={e => updateContent('s5_closing', e.target.value)} disabled={data.debateStages[5].approved} ref={applyAntiPaste} />
            <div className="word-count" style={{color: wc(data.debateContent.s5_closing) < 100 ? 'var(--danger)' : 'var(--text-dim)'}}>
              {wc(data.debateContent.s5_closing)} words {wc(data.debateContent.s5_closing) < 100 && '(need 100)'}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
