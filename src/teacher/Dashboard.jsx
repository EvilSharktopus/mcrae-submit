// src/teacher/Dashboard.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, query, orderBy, where, onSnapshot,
} from 'firebase/firestore';
import MarkingView from './MarkingView';
import '../styles/dashboard.css';

export default function Dashboard() {
  const [view, setView] = useState('grid'); // 'grid' | 'detail' | 'marking'
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [accesses, setAccesses] = useState([]);
  const [helpRequests, setHelpRequests] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
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
    // Live help request count
    const unsub = onSnapshot(
      query(collection(db, 'help_requests'), where('resolved', '==', false)),
      snap => setHelpRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, []);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // ── Marking view ───────────────────────────────────────────────────────────
  if (view === 'marking' && selectedSubmission) {
    return (
      <MarkingView
        submission={selectedSubmission}
        assignment={selectedAssignment}
        rubric={rubrics.find(r => r.id === selectedAssignment?.rubricId)}
        onClose={() => { setView('detail'); loadData(); }}
      />
    );
  }

  // ── Detail view (one assignment → student list) ────────────────────────────
  if (view === 'detail' && selectedAssignment) {
    const assignmentAccesses = accesses.filter(a => a.assignmentId === selectedAssignment.id);
    const assignmentSubs = submissions.filter(s => s.assignmentId === selectedAssignment.id);

    // Merge accesses + submissions by email
    const studentMap = {};
    assignmentAccesses.forEach(a => {
      studentMap[a.studentEmail] = {
        studentName: a.studentName,
        studentEmail: a.studentEmail,
        wordCount: null,
        status: 'opened',
        submission: null,
      };
    });
    assignmentSubs.forEach(s => {
      studentMap[s.studentEmail] = {
        ...studentMap[s.studentEmail],
        studentName: s.studentName,
        studentEmail: s.studentEmail,
        wordCount: s.wordCount ?? null,
        status: s.emailSent ? 'marked' : 'submitted',
        submission: s,
      };
    });
    const students = Object.values(studentMap);

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
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
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
              <span className="empty__icon">👀</span>
              <p>No students have opened this assignment yet.</p>
            </div>
          ) : (
            <table className="student-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Words</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr
                    key={s.studentEmail}
                    className={s.submission ? 'clickable-row' : ''}
                    onClick={s.submission ? () => { setSelectedSubmission(s.submission); setView('marking'); } : undefined}
                  >
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s.studentName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.studentEmail}</div>
                    </td>
                    <td style={{ fontSize: 14 }}>
                      {s.wordCount != null
                        ? <strong>{s.wordCount}</strong>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                    <td>
                      {s.status === 'marked'    && <span className="badge badge--sent">Marked</span>}
                      {s.status === 'submitted' && <span className="badge badge--pending">Submitted</span>}
                      {s.status === 'opened'    && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Opened</span>}
                    </td>
                    <td style={{ width: 24 }}>
                      {s.submission && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      )}
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

  // ── Grid view (all assignments) ────────────────────────────────────────────
  const helpByAssignment = {};
  helpRequests.forEach(h => {
    if (!helpByAssignment[h.assignmentId]) helpByAssignment[h.assignmentId] = [];
    helpByAssignment[h.assignmentId].push(h);
  });

  return (
    <div style={{ padding: '24px' }}>
      <h1 className="page-title" style={{ marginBottom: 24 }}>Assignments</h1>
      {assignments.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">📋</span>
          <p>No assignments yet. Add one in Setup.</p>
        </div>
      ) : (
        <div className="assignment-grid">
          {assignments.map(a => {
            const subs = submissions.filter(s => s.assignmentId === a.id);
            const acc  = accesses.filter(ac => ac.assignmentId === a.id);
            const helps = helpByAssignment[a.id] || [];
            return (
              <div
                key={a.id}
                className="acard"
                onClick={() => { setSelectedAssignment(a); setView('detail'); }}
              >
                <div className="acard__top">
                  <div className="acard__name">{a.name}</div>
                  <div className="acard__course">
                    {a.course}{a.stream ? ` · ${a.stream}` : ''}
                  </div>
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
                </div>
                {helps.length > 0 && (
                  <div className="acard__helps">
                    {helps.map(h => (
                      <span key={h.id} className="help-chip">
                        🙋 {h.studentName.split(' ')[0]}
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
