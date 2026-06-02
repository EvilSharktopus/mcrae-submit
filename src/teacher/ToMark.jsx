// src/teacher/ToMark.jsx
// A flat inbox of every submitted-but-unmarked submission, across all assignments.
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import MarkingView from './MarkingView';
import DebateAdmin from './DebateAdmin';

function relativeTime(ts) {
  if (!ts) return '';
  const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return ts.toDate ? ts.toDate().toLocaleDateString() : new Date(ts).toLocaleDateString();
}

const isSubmitted = s =>
  s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));

export default function ToMark() {
  const [assignments,  setAssignments]  = useState([]);
  const [submissions,  setSubmissions]  = useState([]);
  const [rubrics,      setRubrics]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [marking,      setMarking]      = useState(null); // { submission, assignment, rubric }

  async function load() {
    try {
      const [aSnap, sSnap, rSnap] = await Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'rubrics')),
      ]);
      setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSubmissions(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRubrics(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('ToMark load error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // Build the flat list: submitted, not emailed (marked), sorted oldest-first
  const queue = submissions
    .filter(s => isSubmitted(s) && !s.emailSent && s.mark == null)
    .map(s => {
      const assignment = assignments.find(a => a.id === s.assignmentId);
      const rubric     = assignment ? rubrics.find(r => r.id === assignment.rubricId) : null;
      return { ...s, _assignment: assignment, _rubric: rubric };
    })
    .filter(s => s._assignment && !s._assignment.archived)
    .sort((a, b) => {
      const ta = (a.submittedAt || a.timestamp)?.seconds || 0;
      const tb = (b.submittedAt || b.timestamp)?.seconds || 0;
      return ta - tb; // oldest first
    });

  // ── Marking view ─────────────────────────────────────────────────────────
  if (marking) {
    const { submission, assignment } = marking;
    const currentIdx = queue.findIndex(s => s.id === submission.id);
    const prevSub    = currentIdx > 0 ? queue[currentIdx - 1] : null;
    const nextSub    = currentIdx >= 0 && currentIdx < queue.length - 1 ? queue[currentIdx + 1] : null;

    const goTo = sub => {
      if (!sub) return;
      setMarking({ submission: sub, assignment: sub._assignment, rubric: sub._rubric });
    };

    if (assignment?.type === 'solo_debate') {
      return (
        <DebateAdmin
          submission={submission}
          assignment={assignment}
          prevStudent={prevSub}
          onPrevStudent={() => goTo(prevSub)}
          nextStudent={nextSub}
          onNextStudent={() => goTo(nextSub)}
          onClose={() => { setMarking(null); load(); }}
        />
      );
    }

    return (
      <MarkingView
        submission={submission}
        assignment={assignment}
        rubric={marking.rubric}
        prevStudent={prevSub}
        onPrevStudent={() => goTo(prevSub)}
        nextStudent={nextSub}
        onNextStudent={() => goTo(nextSub)}
        onClose={() => { setMarking(null); load(); }}
      />
    );
  }

  // ── Queue view ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0, flex: 1 }}>To Mark</h1>
        <button
          className="btn btn--secondary btn--sm"
          onClick={() => { setLoading(true); load(); }}
        >
          ↻ Refresh
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">🎉</span>
          <p>All caught up — nothing left to mark!</p>
        </div>
      ) : (
        <table className="student-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Assignment</th>
              <th>Course</th>
              <th>Words</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {queue.map(s => {
              const subTime = s.submittedAt || s.timestamp;
              return (
                <tr
                  key={s.id}
                  className="clickable-row"
                  onClick={() => setMarking({ submission: s, assignment: s._assignment, rubric: s._rubric })}
                >
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {s.studentName}
                      {s.isResubmission && <span className="resubmission-badge" style={{ marginLeft: 6 }}>revision</span>}
                      {s.integrityLog?.anomalies?.length > 0 && <span style={{ marginLeft: 6, fontSize: '0.9em' }} title="Anomalies detected">⚠️</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.studentEmail}</div>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>{s._assignment?.name ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {s._assignment?.course}{s._assignment?.stream ? ` ${s._assignment.stream}` : ''}
                  </td>
                  <td style={{ fontSize: 14 }}>
                    {s.wordCount != null ? <strong>{s.wordCount}</strong> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    {subTime ? relativeTime(subTime) : '—'}
                  </td>
                  <td style={{ width: 24 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
