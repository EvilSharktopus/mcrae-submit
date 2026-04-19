// src/teacher/Dashboard.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, query, where, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { exportCSV, stripHtml } from '../utils/exportUtils';
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
    try {
      const [aSnap, sSnap, rSnap] = await Promise.all([
        getDocs(collection(db, 'assignments')),
        getDocs(collection(db, 'submissions')),
        getDocs(collection(db, 'rubrics')),
      ]);
      setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const subs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      subs.sort((a, b) => (b.timestamp?.seconds || b.lastSaved?.seconds || 0) - (a.timestamp?.seconds || a.lastSaved?.seconds || 0));
      setSubmissions(subs);
      setRubrics(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAccesses([]); // accesses now derived from submissions
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
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

  const handleExport = (asn, subs) => {
    const headers = ['Student Name', 'Email', 'Submitted', 'Words', 'Mark', 'Revision', 'Feedback'];
    const rows = subs.map(s => [
      s.studentName,
      s.studentEmail,
      s.timestamp?.toDate ? s.timestamp.toDate().toLocaleDateString() : '',
      s.wordCount ?? '',
      s.mark ?? '',
      s.isResubmission ? 'Yes' : 'No',
      stripHtml(s.feedback),
    ]);
    exportCSV(`${asn.name.replace(/\s+/g, '_')}_grades.csv`, headers, rows);
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
    // All docs for this assignment (drafts + submitted). Deterministic IDs: {aId}__{email}
    const assignmentSubs = submissions
      .filter(s => s.assignmentId === selectedAssignment.id)
      .sort((a, b) => (a.lastSaved?.seconds || a.timestamp?.seconds || 0) - (b.lastSaved?.seconds || b.timestamp?.seconds || 0));

    // A doc is "submitted" if submitted===true OR if the field is absent (old model compat)
    const isSubmitted = s => s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));

    const students = unmarkedOnly
      ? assignmentSubs.filter(s => isSubmitted(s) && !s.emailSent)
      : assignmentSubs;

    const accessedCount  = assignmentSubs.length;
    const submittedCount = assignmentSubs.filter(isSubmitted).length;

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
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => handleExport(selectedAssignment, assignmentSubs)}
          >
            ↓ Export CSV
          </button>
          <div style={{ display: 'flex', gap: 20 }}>
            <div className="detail-stat">
              <span className="detail-stat__num">{accessedCount}</span>
              <span className="detail-stat__label">opened</span>
            </div>
            <div className="detail-stat">
              <span className="detail-stat__num">{submittedCount}</span>
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
                {students.map(s => {
                  const sub     = s; // each row IS a submission doc
                  const subTime = sub.submittedAt || sub.lastSaved;
                  const subbed  = sub.submitted === true || (!('submitted' in sub) && (sub.response || sub.plainResponse));
                  return (
                    <tr key={sub.studentEmail} className="clickable-row"
                      onClick={() => { setSelectedSubmission(sub); setView('marking'); }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {sub.studentName}
                          {sub.isResubmission && <span className="resubmission-badge" style={{ marginLeft: 6 }}>revision</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{sub.studentEmail}</div>
                      </td>
                      <td style={{ fontSize: 14 }}>
                        {sub.wordCount != null ? <strong>{sub.wordCount}</strong> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        {subTime ? relativeTime(subTime) : '—'}
                      </td>
                      <td>
                        {sub.emailSent   && <span className="badge badge--sent">Marked</span>}
                        {!sub.emailSent && subbed  && <span className="badge badge--pending">Submitted</span>}
                        {!sub.emailSent && !subbed && <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>✏️ Draft</span>}
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
