// src/teacher/Dashboard.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, query, orderBy, where, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import MarkingView from './MarkingView';
import '../styles/dashboard.css';

// ── helpers ──────────────────────────────────────────────────────────────────
function relativeTime(ts) {
  if (!ts) return '';
  const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  const diff = Date.now() - ms;
  if (diff < 60000)  return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return ts.toDate ? ts.toDate().toLocaleDateString() : new Date(ts).toLocaleDateString();
}

export default function Dashboard() {
  const [view, setView] = useState('grid'); // 'grid' | 'detail' | 'marking'
  const [assignments,  setAssignments]  = useState([]);
  const [submissions,  setSubmissions]  = useState([]);
  const [rubrics,      setRubrics]      = useState([]);
  const [accesses,     setAccesses]     = useState([]);
  const [helpRequests, setHelpRequests] = useState([]);
  const [selectedAssignment,  setSelectedAssignment]  = useState(null);
  const [selectedSubmission,  setSelectedSubmission]  = useState(null);
  const [unmarkedOnly, setUnmarkedOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const [aSnap, sSnap, rSnap, accSnap] = await Promise.all([
      getDocs(collection(db, 'assignments')),
      getDocs(query(collection(db, 'submissions'), orderBy('timestamp', 'desc'))),
      getDocs(collection(db, 'rubrics')),
      getDocs(collection(db, 'accesses')),
    ]);
    setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setSubmissions(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setRubrics(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setAccesses(accSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const unsub = onSnapshot(
      query(collection(db, 'help_requests'), where('resolved', '==', false)),
      snap => setHelpRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, []);

  const toggleOpen = async (a, e) => {
    e.stopPropagation();
    await updateDoc(doc(db, 'assignments', a.id), { isOpen: !(a.isOpen !== false) });
    setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, isOpen: !(a.isOpen !== false) } : x));
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // ── Marking view ────────────────────────────────────────────────────────────
  if (view === 'marking' && selectedSubmission) {
    // Build ordered student list for "next student" nav
    const assignmentSubs = submissions
      .filter(s => s.assignmentId === selectedAssignment.id)
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    const currentIdx = assignmentSubs.findIndex(s => s.id === selectedSubmission.id);
    const nextSub    = assignmentSubs.find((s, i) => i > currentIdx && !s.emailSent) || null;

    return (
      <MarkingView
        submission={selectedSubmission}
        assignment={selectedAssignment}
        rubric={rubrics.find(r => r.id === selectedAssignment?.rubricId)}
        nextStudent={nextSub}
        onNextStudent={() => setSelectedSubmission(nextSub)}
        onClose={() => { setView('detail'); loadData(); }}
      />
    );
  }

  // ── Detail view (one assignment) ─────────────────────────────────────────────
  if (view === 'detail' && selectedAssignment) {
    const assignmentAccesses = accesses.filter(a => a.assignmentId === selectedAssignment.id);
    const assignmentSubs = submissions
      .filter(s => s.assignmentId === selectedAssignment.id)
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

    const studentMap = {};
    assignmentAccesses.forEach(a => {
      studentMap[a.studentEmail] = { studentName: a.studentName, studentEmail: a.studentEmail, wordCount: null, status: 'opened', submission: null, timestamp: null };
    });
    assignmentSubs.forEach(s => {
      studentMap[s.studentEmail] = {
        ...studentMap[s.studentEmail],
        studentName: s.studentName, studentEmail: s.studentEmail,
        wordCount: s.wordCount ?? null,
        status: s.emailSent ? 'marked' : 'submitted',
        submission: s,
        timestamp: s.timestamp,
        isResubmission: s.isResubmission || false,
      };
    });
    let students = Object.values(studentMap);
    if (unmarkedOnly) students = students.filter(s => s.status === 'submitted');

    return (
      <div className="page-wide">
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button className="btn btn--secondary btn--sm" onClick={() => setView('grid')}>← Assignments</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{selectedAssignment.name}</h1>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>
              {selectedAssignment.course}{selectedAssignment.stream ? ` · ${selectedAssignment.stream}` : ''}
            </div>
          </div>
          <label className="filter-toggle">
            <input type="checkbox" checked={unmarkedOnly} onChange={e => setUnmarkedOnly(e.target.checked)} />
            Unmarked only
          </label>
          <div style={{ display: 'flex', gap: 20 }}>
            <div className="detail-stat">
              <span className="detail-stat__num">{assignmentAccesses.length}</span>
              <span className="detail-stat__label">accessed</span>
            </div>
            <div className="detail-stat">
              <span className="detail-stat__num">{assignmentSubs.length}</span>
              <span className="detail-stat__label">submitted</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {students.length === 0 ? (
            <div className="empty">
              <span className="empty__icon">{unmarkedOnly ? '🎉' : '👀'}</span>
              <p>{unmarkedOnly ? 'All submissions marked!' : 'No students have opened this assignment yet.'}</p>
            </div>
          ) : (
            <table className="student-table">
              <thead>
                <tr><th>Student</th><th>Words</th><th>Submitted</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.studentEmail} className={s.submission ? 'clickable-row' : ''}
                    onClick={s.submission ? () => { setSelectedSubmission(s.submission); setView('marking'); } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {s.studentName}
                        {s.isResubmission && <span className="resubmission-badge">revision</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.studentEmail}</div>
                    </td>
                    <td style={{ fontSize: 14 }}>
                      {s.wordCount != null ? <strong>{s.wordCount}</strong> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {s.timestamp ? relativeTime(s.timestamp) : '—'}
                    </td>
                    <td>
                      {s.status === 'marked'    && <span className="badge badge--sent">Marked</span>}
                      {s.status === 'submitted' && <span className="badge badge--pending">Needs marking</span>}
                      {s.status === 'opened'    && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Opened</span>}
                    </td>
                    <td style={{ width: 24 }}>
                      {s.submission && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Grid view ────────────────────────────────────────────────────────────────
  const helpByAssignment = {};
  helpRequests.forEach(h => {
    if (!helpByAssignment[h.assignmentId]) helpByAssignment[h.assignmentId] = [];
    helpByAssignment[h.assignmentId].push(h);
  });

  // Sort assignments by most recent submission (descending)
  const activeAssignments = assignments.filter(a => !a.archived);
  const sortedAssignments = [...activeAssignments].sort((a, b) => {
    const latestA = Math.max(...submissions.filter(s => s.assignmentId === a.id).map(s => s.timestamp?.seconds || 0), 0);
    const latestB = Math.max(...submissions.filter(s => s.assignmentId === b.id).map(s => s.timestamp?.seconds || 0), 0);
    return latestB - latestA;
  });

  return (
    <div style={{ padding: '24px' }}>
      <h1 className="page-title" style={{ marginBottom: 24 }}>Assignments</h1>
      {sortedAssignments.length === 0 ? (
        <div className="empty"><span className="empty__icon">📋</span><p>No assignments yet. Add one in Setup.</p></div>
      ) : (
        <div className="assignment-grid">
          {sortedAssignments.map(a => {
            const subs    = submissions.filter(s => s.assignmentId === a.id);
            const acc     = accesses.filter(ac => ac.assignmentId === a.id);
            const helps   = helpByAssignment[a.id] || [];
            const unmarked = subs.filter(s => !s.emailSent && s.mark == null).length;
            const isOpen  = a.isOpen !== false;

            return (
              <div key={a.id} className={`acard ${!isOpen ? 'acard--closed' : ''}`}
                onClick={() => { setSelectedAssignment(a); setView('detail'); }}>

                <div className="acard__top">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
                    <div className="acard__name">{a.name}</div>
                    {/* Open/close toggle */}
                    <button
                      className={`open-toggle ${isOpen ? 'open-toggle--open' : 'open-toggle--closed'}`}
                      onClick={e => toggleOpen(a, e)}
                      title={isOpen ? 'Close assignment' : 'Open assignment'}
                    >
                      {isOpen ? 'Open' : 'Closed'}
                    </button>
                  </div>
                  <div className="acard__course">{a.course}{a.stream ? ` · ${a.stream}` : ''}</div>
                </div>

                <div className="acard__stats">
                  <div className="stat-pill">
                    <span className="stat-pill__num">{acc.length}</span>
                    <span className="stat-pill__label">accessed</span>
                  </div>
                  <div className="stat-pill">
                    <span className="stat-pill__num">{subs.length}</span>
                    <span className="stat-pill__label">submitted</span>
                  </div>
                  {unmarked > 0 && (
                    <div className="stat-pill stat-pill--alert">
                      <span className="stat-pill__num">{unmarked}</span>
                      <span className="stat-pill__label">to mark</span>
                    </div>
                  )}
                </div>

                {helps.length > 0 && (
                  <div className="acard__helps">
                    {helps.map(h => (
                      <span key={h.id} className="help-chip">
                        🙋 {h.studentName.split(' ')[0]}
                        {h.timestamp && <span className="help-chip__time">{relativeTime(h.timestamp)}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
