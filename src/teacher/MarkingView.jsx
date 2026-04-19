import { useState, useEffect, useRef } from 'react';
import { db, functions } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import '../styles/marking.css';

export default function MarkingView({ submission, assignment, rubric, onClose, nextStudent, onNextStudent }) {
  const [subData, setSubData] = useState(submission); // may be refreshed
  const isDraft = subData.submitted === false || (subData.submitted === undefined && !subData.response && !subData.plainResponse);

  const [selections, setSelections] = useState({});
  const [feedback, setFeedback]     = useState(subData.feedback || '');
  const [sending, setSending]       = useState(false);
  const [sent, setSent]             = useState(subData.emailSent || false);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const [refreshing, setRefreshing] = useState(false);
  const autoSaveTimer               = useRef(null);

  const totalMark = Object.values(selections).reduce((sum, s) => sum + (s?.points || 0), 0);

  // ── Auto-save feedback ────────────────────────────────────────────────────
  useEffect(() => {
    if (sent) return; // don't save after sending
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('saving');
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'submissions', subData.id || submission.id), { feedback: feedback.trim() });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch {
        setSaveStatus('');
      }
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [feedback]);

  const selectDescriptor = (catIdx, descIdx, points) => {
    setSelections(prev => {
      if (prev[catIdx]?.descriptorIndex === descIdx) {
        const next = { ...prev }; delete next[catIdx]; return next;
      }
      return { ...prev, [catIdx]: { descriptorIndex: descIdx, points } };
    });
  };

  const handleSendMark = async () => {
    if (!rubric && !feedback.trim()) return;
    setSending(true);
    try {
      const mark = rubric ? totalMark : null;
      await updateDoc(doc(db, 'submissions', subData.id || submission.id), { mark, feedback: feedback.trim() });
      const sendMark = httpsCallable(functions, 'sendMark');
      await sendMark({
        submissionId:   subData.id || submission.id,
        studentEmail:   subData.studentEmail,
        studentName:    subData.studentName,
        assignmentName: assignment.name,
        mark,
        feedback: feedback.trim(),
      });
      await updateDoc(doc(db, 'submissions', subData.id || submission.id), { emailSent: true });
      setSent(true);
    } catch (err) {
      console.error('Error sending mark:', err);
      alert('Error sending mark. Check console for details.');
    } finally {
      setSending(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const snap = await getDoc(doc(db, 'submissions', subData.id || submission.id));
      if (snap.exists()) {
        const fresh = { id: snap.id, ...snap.data() };
        setSubData(fresh);
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="marking-page">
      <div className="marking-header">
        <button className="btn btn--secondary btn--sm" onClick={onClose}>← Back</button>
        <div>
          <div className="marking-header__title">
            {subData.studentName}
            {subData.isResubmission && <span className="resubmission-badge" style={{ marginLeft: 8 }}>revision</span>}
            {isDraft && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#c8952a', background: 'rgba(255,193,70,0.15)', border: '1px solid rgba(255,193,70,0.3)', borderRadius: 20, padding: '1px 8px' }}>✏️ Draft</span>}
          </div>
          <div className="marking-header__sub">{assignment?.name} · {subData.studentEmail}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveStatus === 'saving' && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Saving…</span>}
          {saveStatus === 'saved'  && <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Saved</span>}
          {sent && <span className="badge badge--sent">Email Sent</span>}
          {isDraft && (
            <button className="btn btn--secondary btn--sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↺ Refresh draft'}
            </button>
          )}
          {nextStudent && (
            <button className="btn btn--secondary btn--sm" onClick={onNextStudent}>
              Next student →
            </button>
          )}
          <button className="btn btn--success" onClick={handleSendMark} disabled={sending || sent}>
            {sent ? '✓ Sent' : sending ? 'Sending…' : 'Send Mark'}
          </button>
        </div>
      </div>

      <div className="marking-split">
        {/* Left — Student response */}
        <div className="marking-pane">
          <div className="marking-pane__label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Student Response
            {subData.wordCount != null && (
              <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(123,143,181,0.2)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20 }}>
                {subData.wordCount} words
              </span>
            )}
            {isDraft && <span style={{ fontSize: 11, color: '#c8952a', fontStyle: 'italic' }}>draft — may not be final</span>}
          </div>
          <div className="marking-response" dangerouslySetInnerHTML={{ __html: subData.response }} />
        </div>

        {/* Right — Rubric + feedback */}
        <div className="marking-pane">
          {rubric ? (
            <>
              <div className="marking-pane__label">
                Rubric — <span className="marking-total">{totalMark} pts</span>
              </div>
              <div className="rubric-categories">
                {rubric.categories?.map((cat, catIdx) => (
                  <div key={catIdx} className="rubric-category">
                    <div className="rubric-category__name">
                      {cat.name}
                      {selections[catIdx] != null && <span className="rubric-category__points">+{selections[catIdx].points}</span>}
                    </div>
                    <div className="rubric-descriptors">
                      {cat.descriptors?.map((desc, descIdx) => (
                        <button
                          key={descIdx}
                          className={`rubric-descriptor ${selections[catIdx]?.descriptorIndex === descIdx ? 'selected' : ''}`}
                          onClick={() => selectDescriptor(catIdx, descIdx, desc.points)}
                        >
                          <span className="rubric-descriptor__points">{desc.points}</span>
                          <span className="rubric-descriptor__text">{desc.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="marking-pane__label">No rubric attached</div>
          )}

          <div className="marking-pane__label" style={{ marginTop: 16 }}>Feedback</div>
          <textarea
            className="marking-feedback"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Write feedback for the student…"
            rows={6}
            disabled={sent}
          />
        </div>
      </div>
    </div>
  );
}
