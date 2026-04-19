// src/teacher/Dashboard.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import MarkingView from './MarkingView';
import '../styles/dashboard.css';

export default function Dashboard() {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [selected, setSelected] = useState(null); // { submission, assignment, rubric }
  const [loading, setLoading] = useState(true);

  async function loadData() {
    const [aSnap, sSnap, rSnap] = await Promise.all([
      getDocs(collection(db, 'assignments')),
      getDocs(query(collection(db, 'submissions'), orderBy('timestamp', 'desc'))),
      getDocs(collection(db, 'rubrics')),
    ]);
    setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setSubmissions(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setRubrics(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  // Group submissions by assignment
  const grouped = assignments.reduce((acc, a) => {
    const subs = submissions.filter(s => s.assignmentId === a.id);
    if (subs.length > 0) acc.push({ assignment: a, subs });
    return acc;
  }, []);

  const openMarking = (submission) => {
    const assignment = assignments.find(a => a.id === submission.assignmentId);
    const rubric = rubrics.find(r => r.id === assignment?.rubricId);
    setSelected({ submission, assignment, rubric });
  };

  if (selected) {
    return (
      <MarkingView
        submission={selected.submission}
        assignment={selected.assignment}
        rubric={selected.rubric}
        onClose={() => { setSelected(null); loadData(); }}
      />
    );
  }

  return (
    <div className="page-wide">
      <h1 className="page-title" style={{ padding: '0 0 0 0', marginBottom: 20, paddingTop: 24, paddingLeft: 24 }}>Submissions</h1>

      {grouped.length === 0 && (
        <div className="empty">
          <span className="empty__icon">📭</span>
          <p>No submissions yet.</p>
        </div>
      )}

      <div style={{ padding: '0 24px 24px' }}>
        {grouped.map(({ assignment, subs }) => (
          <div key={assignment.id} style={{ marginBottom: 28 }}>
            <div className="dashboard-assignment-header">
              <h2>{assignment.name}</h2>
              {assignment.stream && <span className="badge badge--pending">{assignment.stream}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-dim)' }}>{subs.length} submission{subs.length !== 1 ? 's' : ''}</span>
            </div>
            {subs.map(s => (
              <div
                key={s.id}
                className="card dashboard-submission-row"
                onClick={() => openMarking(s)}
              >
                <div className="dashboard-submission-row__student">
                  <strong>{s.studentName}</strong>
                  <span className="dashboard-submission-row__email">{s.studentEmail}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {s.wordCount != null && (
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.wordCount} words</span>
                  )}
                  {s.emailSent
                    ? <span className="badge badge--sent">Marked &amp; Sent</span>
                    : s.mark != null
                    ? <span className="badge badge--marked">Marked</span>
                    : <span className="badge badge--pending">Pending</span>
                  }
                  {s.mark != null && <span style={{ fontSize: 13, fontWeight: 600 }}>{s.mark} pts</span>}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
