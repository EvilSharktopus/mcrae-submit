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
  const [openGroups, setOpenGroups] = useState({});
  const toggleGroup = key => setOpenGroups(p => ({ ...p, [key]: !p[key] }));

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

  const closeAll = async () => {
    const open = assignments.filter(a => a.isOpen !== false && !a.archived);
    if (open.length === 0) { alert('No open assignments to close.'); return; }
    if (!window.confirm(`Close all ${open.length} open assignment(s) now?`)) return;
    await Promise.all(open.map(a => updateDoc(doc(db, 'assignments', a.id), { isOpen: false })));
    setAssignments(prev => prev.map(a => open.find(o => o.id === a.id) ? { ...a, isOpen: false } : a));
  };

  const handleExport = (asn, subs) => {
    const rubric   = rubrics.find(r => r.id === asn.rubricId);
    const catNames = rubric?.categories?.map(c => c.name) || [];

    const headers = [
      'Student Name', 'Email', 'Date Submitted',
      ...catNames,
      'Total Mark', 'Revision', 'Feedback',
    ];

    const rows = subs.map(s => {
      const catCols = catNames.map((name, i) => {
        const bd = s.rubricBreakdown;
        if (!bd) return '';
        const cat = bd.find(b => b.category === name) ?? bd[i];
        if (!cat || cat.points == null) return '';
        return cat.label ? `${cat.label} \u2013 ${cat.points}` : cat.points;
      });
      const dateStr = s.submittedAt?.toDate
        ? s.submittedAt.toDate().toLocaleDateString()
        : s.timestamp?.toDate
        ? s.timestamp.toDate().toLocaleDateString()
        : '';
      return [
        s.studentName,
        s.studentEmail,
        dateStr,
        ...catCols,
        s.mark ?? '',
        s.isResubmission ? 'Yes' : 'No',
        stripHtml(s.feedback),
      ];
    });

    exportCSV(`${asn.name.replace(/\s+/g, '_')}_grades.csv`, headers, rows);
  };

  const handleExportAiAccuracy = (asn, subs) => {
    const rubric   = rubrics.find(r => r.id === asn.rubricId);
    const cats     = rubric?.categories || [];

    // Only include submissions that have BOTH ai draft and final selections
    const comparable = subs.filter(s => s.aiDraftSelections && s.finalSelections);
    if (comparable.length === 0) {
      alert('No submissions with both AI draft and final marks yet.');
      return;
    }

    const headers = ['Student', 'Email', 'Category', 'AI Label', 'AI Score', 'Teacher Label', 'Teacher Score', 'Exact Match', 'Point Diff'];
    const rows = [];

    comparable.forEach(s => {
      cats.forEach((cat, i) => {
        const ai  = s.aiDraftSelections[i];
        const fin = s.finalSelections[i];
        if (!ai && !fin) return;
        const aiLabel    = ai?.label  ?? '—';
        const aiScore    = ai?.points ?? '';
        const finLabel   = fin?.label ?? '—';
        const finScore   = fin?.points ?? '';
        const match      = ai?.descriptorIndex === fin?.descriptorIndex ? 'Y' : 'N';
        const diff       = (fin?.points != null && ai?.points != null) ? fin.points - ai.points : '';
        rows.push([s.studentName, s.studentEmail, cat.name, aiLabel, aiScore, finLabel, finScore, match, diff]);
      });
    });

    // Summary row
    const totalRows   = rows.length;
    const exactMatch  = rows.filter(r => r[7] === 'Y').length;
    rows.push([]);
    rows.push(['SUMMARY', '', `${comparable.length} submissions`, '', '', '', '', `${exactMatch}/${totalRows} exact (${Math.round(exactMatch/totalRows*100)}%)`, '']);

    exportCSV(`${asn.name.replace(/\s+/g, '_')}_ai_accuracy.csv`, headers, rows);
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // ── Compute current assignment students list ──────────────────────────────
  const isSubmitted = s => s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));
  
  const assignmentSubs = selectedAssignment
    ? submissions
        .filter(s => s.assignmentId === selectedAssignment.id)
        .sort((a, b) => (a.lastSaved?.seconds || a.timestamp?.seconds || 0) - (b.lastSaved?.seconds || b.timestamp?.seconds || 0))
    : [];

  const students = unmarkedOnly
    ? assignmentSubs.filter(s => isSubmitted(s) && !s.emailSent)
    : assignmentSubs;

  // ── Marking view ────────────────────────────────────────────────────────────
  if (view === 'marking' && selectedSubmission) {
    const currentIdx = students.findIndex(s => s.id === selectedSubmission.id);
    const prevSub    = currentIdx > 0 ? students[currentIdx - 1] : null;
    const nextSub    = currentIdx >= 0 && currentIdx < students.length - 1 ? students[currentIdx + 1] : null;

    return (
      <MarkingView
        submission={selectedSubmission}
        assignment={selectedAssignment}
        rubric={rubrics.find(r => r.id === selectedAssignment?.rubricId)}
        prevStudent={prevSub}
        onPrevStudent={() => setSelectedSubmission(prevSub)}
        nextStudent={nextSub}
        onNextStudent={() => setSelectedSubmission(nextSub)}
        onClose={() => { setView('detail'); loadData(); }}
      />
    );
  }

  // ── Detail view (one assignment) ─────────────────────────────────────────────
  if (view === 'detail' && selectedAssignment) {

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
            onClick={async (e) => {
              const btn = e.target;
              const original = btn.innerText;
              btn.innerText = '↻ Refreshing...';
              await loadData();
              btn.innerText = original;
            }}
          >
            ↻ Refresh
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => handleExport(selectedAssignment, assignmentSubs)}
          >
            ↓ Export CSV
          </button>
          <button
            className="btn btn--secondary btn--sm"
            title="Compare AI draft marks vs your final marks"
            onClick={() => handleExportAiAccuracy(selectedAssignment, assignmentSubs)}
          >
            🤖 AI Accuracy
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
                          {sub.integrityLog?.anomalies?.length > 0 && <span style={{ marginLeft: 6, fontSize: '0.9em' }} title="Anomalies detected">⚠️</span>}
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
                        {sub.emailSent && <>
                          <span className="badge badge--sent">Marked</span>
                          {sub.mark != null && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginLeft: 6 }}>{sub.mark}</span>}
                        </>}
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

  const helpByAssignment = {};
  helpRequests.forEach(h => {
    if (!helpByAssignment[h.assignmentId]) helpByAssignment[h.assignmentId] = [];
    helpByAssignment[h.assignmentId].push(h);
  });

  const activeAssignments = assignments.filter(a => !a.archived);

  // Group by course+stream, sorted by most-recent submission within each group
  const groupMap = {};
  activeAssignments.forEach(a => {
    const key = `${a.course}${a.stream ? ' ' + a.stream : ''}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(a);
  });
  // Sort each group's assignments by latest submission desc
  Object.values(groupMap).forEach(arr => arr.sort((a, b) => {
    const la = Math.max(...submissions.filter(s => s.assignmentId === a.id).map(s => s.timestamp?.seconds || 0), 0);
    const lb = Math.max(...submissions.filter(s => s.assignmentId === b.id).map(s => s.timestamp?.seconds || 0), 0);
    return lb - la;
  }));
  const groupKeys = Object.keys(groupMap).sort();

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0, flex: 1 }}>Assignments</h1>
        <button
          className="btn btn--secondary btn--sm"
          onClick={closeAll}
          style={{ background: 'rgba(255,80,80,0.12)', borderColor: 'rgba(255,80,80,0.4)', color: 'var(--text)' }}
        >
          🔒 Close All
        </button>
      </div>
      {groupKeys.length === 0 ? (
        <div className="empty"><span className="empty__icon">📋</span><p>No assignments yet. Add one in Setup.</p></div>
      ) : (
        groupKeys.map(key => {
          const label   = key.replace('Social ', '').replace(' -', '-');
          const items   = groupMap[key];
          const isOpen  = !!openGroups[key];
          const toMark  = items.reduce((n, a) => {
            const subs = submissions.filter(s => s.assignmentId === a.id);
            const isActualSubmission = s => s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));
            return n + subs.filter(s => isActualSubmission(s) && !s.emailSent && s.mark == null).length;
          }, 0);

          return (
            <div key={key} style={{ marginBottom: 16 }}>
              {/* Group header */}
              <div
                onClick={() => toggleGroup(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: isOpen ? '8px 8px 0 0' : 8, cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 12 }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{items.length} assignment{items.length !== 1 ? 's' : ''}</span>
                {toMark > 0 && (
                  <span style={{ fontSize: 11, background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '2px 8px' }}>
                    {toMark} to mark
                  </span>
                )}
              </div>
              {/* Cards */}
              {isOpen && (
                <div className="assignment-grid" style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 12 }}>
                  {items.map(a => {
                    const allDocs  = submissions.filter(s => s.assignmentId === a.id);
                    const isActualSubmission = s => s.submitted === true || (!('submitted' in s) && (s.response || s.plainResponse));
                    const actualSubs = allDocs.filter(isActualSubmission);
                    const helps      = helpByAssignment[a.id] || [];
                    const unmarked   = actualSubs.filter(s => !s.emailSent && s.mark == null).length;
                    const isOpen_    = a.isOpen !== false;

                    return (
                      <div key={a.id} className={`acard ${!isOpen_ ? 'acard--closed' : ''}`}
                        onClick={() => { setSelectedAssignment(a); setView('detail'); }}>
                        <div className="acard__top">
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between' }}>
                            <div className="acard__name">{a.name}</div>
                            <button
                              className={`open-toggle ${isOpen_ ? 'open-toggle--open' : 'open-toggle--closed'}`}
                              onClick={e => toggleOpen(a, e)}
                              title={isOpen_ ? 'Close assignment' : 'Open assignment'}
                            >
                              {isOpen_ ? 'Open' : 'Closed'}
                            </button>
                          </div>
                        </div>
                        <div className="acard__stats">
                          <div className="stat-pill">
                            <span className="stat-pill__num">{allDocs.length}</span>
                            <span className="stat-pill__label">opened</span>
                          </div>
                          <div className="stat-pill">
                            <span className="stat-pill__num">{actualSubs.length}</span>
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
        })
      )}
    </div>
  );
}
