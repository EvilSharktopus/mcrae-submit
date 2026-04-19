import { useState, useEffect, useRef } from 'react';
import { db, functions } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import '../styles/marking.css';

// Group descriptors by their label field (E, Pf, S, L, P, INS)
// Falls back to ungrouped if no labels exist (old rubrics)
function groupByLabel(descriptors) {
  const hasLabels = descriptors.some(d => d.label);
  if (!hasLabels) return null; // signal legacy mode
  const groups = [];
  const seen = new Map();
  descriptors.forEach((d, i) => {
    const key = d.label || 'Other';
    if (!seen.has(key)) {
      const g = { label: key, text: d.text, entries: [] };
      seen.set(key, g);
      groups.push(g);
    }
    seen.get(key).entries.push({ idx: i, points: d.points, descriptor: d });
  });
  return groups;
}

export default function MarkingView({ submission, assignment, rubric, onClose, nextStudent, onNextStudent }) {
  const [subData, setSubData] = useState(submission);
  const isDraft = subData.submitted === false ||
    (subData.submitted === undefined && !subData.response && !subData.plainResponse);

  const [selections,  setSelections]  = useState({}); // catIdx → { descriptorIndex, points, label, text }
  const [feedback,    setFeedback]    = useState(subData.feedback || '');
  const [sending,     setSending]     = useState(false);
  const [sent,        setSent]        = useState(subData.emailSent || false);
  const [saveStatus,  setSaveStatus]  = useState('');
  const [refreshing,  setRefreshing]  = useState(false);
  const autoSaveTimer = useRef(null);

  const totalMark = Object.values(selections).reduce((sum, s) => sum + (s?.points || 0), 0);

  const submissionDocId = subData.id || submission.id;

  // ── Auto-save feedback ────────────────────────────────────────────────────
  useEffect(() => {
    if (sent) return;
    clearTimeout(autoSaveTimer.current);
    setSaveStatus('saving');
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'submissions', submissionDocId), { feedback: feedback.trim() });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch { setSaveStatus(''); }
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [feedback]);

  // ── Descriptor selection ──────────────────────────────────────────────────
  const selectDescriptor = (catIdx, descIdx, descriptor) => {
    setSelections(prev => {
      if (prev[catIdx]?.descriptorIndex === descIdx) {
        const next = { ...prev }; delete next[catIdx]; return next;
      }
      return {
        ...prev,
        [catIdx]: {
          descriptorIndex: descIdx,
          points: descriptor.points,
          label:  descriptor.label || '',
          text:   descriptor.text  || '',
        },
      };
    });
  };

  // ── INS override — sets all categories to 0/INS ───────────────────────────
  const isIns = rubric?.categories?.length > 0 &&
    Object.keys(selections).length === rubric.categories.length &&
    Object.values(selections).every(s => s.label === 'INS');

  const handleInsOverride = () => {
    if (isIns) { setSelections({}); return; }
    const overrides = {};
    rubric.categories.forEach((cat, catIdx) => {
      const insIdx = (cat.descriptors || []).findIndex(d => d.label === 'INS');
      if (insIdx !== -1) {
        const d = cat.descriptors[insIdx];
        overrides[catIdx] = { descriptorIndex: insIdx, points: 0, label: 'INS', text: d.text };
      }
    });
    setSelections(overrides);
  };

  // ── Send mark ─────────────────────────────────────────────────────────────
  const handleSendMark = async () => {
    if (!rubric && !feedback.trim()) return;
    setSending(true);
    try {
      const mark = rubric ? totalMark : null;
      // Build rubric breakdown for email
      const rubricBreakdown = rubric?.categories?.map((cat, catIdx) => ({
        category: cat.name,
        label:    selections[catIdx]?.label  ?? null,
        points:   selections[catIdx]?.points ?? null,
        maxPts:   Math.max(...(cat.descriptors || []).map(d => d.points), 0),
        text:     selections[catIdx]?.text   ?? null,
      })) || [];

      await updateDoc(doc(db, 'submissions', submissionDocId), {
        mark,
        feedback: feedback.trim(),
        rubricBreakdown: rubricBreakdown.length > 0 ? rubricBreakdown : null,
      });
      const sendMark = httpsCallable(functions, 'sendMark');
      await sendMark({
        submissionId:   submissionDocId,
        studentEmail:   subData.studentEmail,
        studentName:    subData.studentName,
        assignmentName: assignment.name,
        mark, feedback: feedback.trim(),
        rubricBreakdown,
      });
      await updateDoc(doc(db, 'submissions', submissionDocId), { emailSent: true });
      setSent(true);
    } catch (err) {
      console.error('Error sending mark:', err);
      alert('Error sending mark. Check console for details.');
    } finally { setSending(false); }
  };

  // ── Refresh draft ─────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const snap = await getDoc(doc(db, 'submissions', submissionDocId));
      if (snap.exists()) setSubData({ id: snap.id, ...snap.data() });
    } finally { setRefreshing(false); }
  };

  // ── Rubric render helper ──────────────────────────────────────────────────
  const renderRubricCategory = (cat, catIdx) => {
    const groups = groupByLabel(cat.descriptors || []);
    const sel = selections[catIdx];

    return (
      <div key={catIdx} className="rubric-category">
        <div className="rubric-category__name">
          {cat.name}
          {sel != null && <span className="rubric-category__points">+{sel.points}</span>}
          {sel?.label && <span className="rubric-category__tier-badge">{sel.label}</span>}
        </div>

        {groups ? (
          // ── Tier-grouped mode (labelled descriptors) ──
          <div className="rubric-tiers">
            {groups.filter(g => g.label !== 'INS').map(group => (
              <div key={group.label} className="rubric-tier">
                <span className="rubric-tier__label">{group.label}</span>
                <div className="rubric-tier__btns">
                  {group.entries.map(e => (
                    <button
                      key={e.idx}
                      className={`rubric-pt-btn ${sel?.descriptorIndex === e.idx ? 'selected' : ''}`}
                      onClick={() => selectDescriptor(catIdx, e.idx, e.descriptor)}
                    >
                      {e.points}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Legacy mode (no labels — show full descriptor text) ──
          <div className="rubric-descriptors">
            {(cat.descriptors || []).map((desc, descIdx) => (
              <button
                key={descIdx}
                className={`rubric-descriptor ${sel?.descriptorIndex === descIdx ? 'selected' : ''}`}
                onClick={() => selectDescriptor(catIdx, descIdx, desc)}
              >
                <span className="rubric-descriptor__points">{desc.points}</span>
                <span className="rubric-descriptor__text">{desc.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const hasInsOption = rubric?.categories?.some(c =>
    c.descriptors?.some(d => d.label === 'INS')
  );

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
                Rubric — <span className="marking-total">{totalMark} / {
                  rubric.categories?.reduce((sum, cat) =>
                    sum + Math.max(...(cat.descriptors || [{ points: 0 }]).filter(d => d.label !== 'INS').map(d => d.points)), 0
                  )
                } pts</span>
              </div>

              <div className="rubric-categories">
                {hasInsOption && (
                  <button className={`rubric-ins-btn ${isIns ? 'rubric-ins-btn--active' : ''}`} onClick={handleInsOverride}>
                    <span className="rubric-ins-label">INS</span>
                    <span className="rubric-ins-text">
                      {isIns ? 'Click to clear INS override' : 'Does not attempt — set all categories to 0'}
                    </span>
                  </button>
                )}
                {rubric.categories?.map((cat, catIdx) => renderRubricCategory(cat, catIdx))}
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
