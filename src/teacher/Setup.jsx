// src/teacher/Setup.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { exportCSV, stripHtml, currentSchoolYear } from '../utils/exportUtils';
import '../styles/setup.css';

// ── Rubric Builder ─────────────────────────────────────────────────────────
function RubricBuilder({ onSaved }) {
  const [name, setName] = useState('');
  const [categories, setCategories] = useState([{ name: '', descriptors: [{ text: '', points: 1 }] }]);
  const [saving, setSaving] = useState(false);

  const addCategory = () => setCategories(c => [...c, { name: '', descriptors: [{ text: '', points: 1 }] }]);
  const removeCategory = (ci) => setCategories(c => c.filter((_, i) => i !== ci));
  const updateCatName = (ci, val) => setCategories(c => c.map((cat, i) => i === ci ? { ...cat, name: val } : cat));

  const addDescriptor = (ci) => setCategories(c => c.map((cat, i) =>
    i === ci ? { ...cat, descriptors: [...cat.descriptors, { text: '', points: 1 }] } : cat
  ));
  const removeDescriptor = (ci, di) => setCategories(c => c.map((cat, i) =>
    i === ci ? { ...cat, descriptors: cat.descriptors.filter((_, j) => j !== di) } : cat
  ));
  const updateDescriptor = (ci, di, field, val) => setCategories(c => c.map((cat, i) =>
    i === ci ? {
      ...cat,
      descriptors: cat.descriptors.map((d, j) => j === di ? { ...d, [field]: field === 'points' ? Number(val) : val } : d)
    } : cat
  ));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'rubrics'), { name: name.trim(), categories });
      setName(''); setCategories([{ name: '', descriptors: [{ text: '', points: 1 }] }]);
      onSaved?.();
    } finally { setSaving(false); }
  };

  return (
    <div className="setup-section card">
      <h2 className="setup-section__title">Add Rubric</h2>
      <div className="field">
        <label>Rubric Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Position Paper Rubric" />
      </div>
      {categories.map((cat, ci) => (
        <div key={ci} className="rubric-cat-block">
          <div className="rubric-cat-block__header">
            <input
              className="rubric-cat-name"
              value={cat.name}
              onChange={e => updateCatName(ci, e.target.value)}
              placeholder={`Category ${ci + 1} name`}
            />
            <button className="btn btn--secondary btn--sm" onClick={() => removeCategory(ci)} title="Remove category">✕</button>
          </div>
          {cat.descriptors.map((d, di) => (
            <div key={di} className="descriptor-row">
              <input
                className="descriptor-text"
                value={d.text}
                onChange={e => updateDescriptor(ci, di, 'text', e.target.value)}
                placeholder="Descriptor text"
              />
              <input
                type="number"
                className="descriptor-points"
                value={d.points}
                onChange={e => updateDescriptor(ci, di, 'points', e.target.value)}
                min="0"
              />
              <span className="descriptor-pts-label">pts</span>
              <button className="btn btn--secondary btn--sm" onClick={() => removeDescriptor(ci, di)} title="Remove">✕</button>
            </div>
          ))}
          <button className="btn btn--secondary btn--sm" onClick={() => addDescriptor(ci)} style={{ marginTop: 4 }}>+ Descriptor</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn--secondary" onClick={addCategory}>+ Category</button>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : 'Save Rubric'}
        </button>
      </div>
    </div>
  );
}

// ── Assignment Registration ─────────────────────────────────────────────────
const COURSES = ['Social 9', 'Social 10', 'Social 20', 'Social 30'];
const STREAMS = ['', '10-1', '10-2', '20-1', '20-2', '30-1', '30-2'];

function AssignmentForm({ rubrics, onSaved }) {
  const [form, setForm] = useState({ name: '', course: 'Social 9', stream: '', docUrl: '', rubricId: '' });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.docUrl.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'assignments'), { ...form, name: form.name.trim(), docUrl: form.docUrl.trim() });
      setForm({ name: '', course: 'Social 9', stream: '', docUrl: '', rubricId: '' });
      onSaved?.();
    } finally { setSaving(false); }
  };

  return (
    <div className="setup-section card">
      <h2 className="setup-section__title">Register Assignment</h2>
      <div className="setup-grid">
        <div className="field">
          <label>Assignment Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Position Paper" />
        </div>
        <div className="field">
          <label>Course</label>
          <select value={form.course} onChange={e => set('course', e.target.value)}>
            {COURSES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Stream</label>
          <select value={form.stream} onChange={e => set('stream', e.target.value)}>
            {STREAMS.map(s => <option key={s} value={s}>{s || 'All streams (Social 9)'}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Rubric</label>
          <select value={form.rubricId} onChange={e => set('rubricId', e.target.value)}>
            <option value="">— No rubric —</option>
            {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Google Doc URL</label>
          <input value={form.docUrl} onChange={e => set('docUrl', e.target.value)} placeholder="https://docs.google.com/document/d/..." />
        </div>
      </div>
      <button className="btn btn--primary" onClick={handleSave} disabled={saving || !form.name.trim() || !form.docUrl.trim()}>
        {saving ? 'Saving...' : 'Register Assignment'}
      </button>
    </div>
  );
}

// ── Saved Lists ─────────────────────────────────────────────────────────────
function SavedRubrics({ rubrics }) {
  if (!rubrics.length) return null;
  return (
    <div className="setup-section">
      <h3 className="setup-list-title">Saved Rubrics ({rubrics.length})</h3>
      {rubrics.map(r => (
        <div key={r.id} className="card setup-list-item">
          <strong>{r.name}</strong>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.categories?.length || 0} categories</span>
        </div>
      ))}
    </div>
  );
}

function SavedAssignments({ assignments, rubrics, onDelete }) {
  if (!assignments.length) return null;
  return (
    <div className="setup-section">
      <h3 className="setup-list-title">Registered Assignments ({assignments.length})</h3>
      {assignments.map(a => {
        const rubric = rubrics.find(r => r.id === a.rubricId);
        return (
          <div key={a.id} className="card setup-list-item">
            <div style={{ flex: 1 }}>
              <strong>{a.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 10 }}>{a.course} {a.stream}</span>
              {rubric && <span style={{ fontSize: 12, color: 'var(--text-dim)', display: 'block', marginTop: 2 }}>Rubric: {rubric.name}</span>}
            </div>
            <button
              className="btn btn--secondary btn--sm"
              onClick={async () => {
                if (!window.confirm(`Archive "${a.name}"? It will be hidden from students but all submissions are kept.`)) return;
                await updateDoc(doc(db, 'assignments', a.id), { archived: true });
                onDelete?.();
              }}
            >
              Archive
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Setup Page ─────────────────────────────────────────────────────────
export default function Setup() {
  const [rubrics,     setRubrics]     = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [archiving,   setArchiving]   = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [exportCourse, setExportCourse] = useState('');
  const [exportStream, setExportStream] = useState('');
  const COURSES = ['', 'Social 9', 'Social 10', 'Social 20', 'Social 30'];
  const STREAMS = ['', '10-1', '10-2', '20-1', '20-2', '30-1', '30-2'];

  async function load() {
    const [rSnap, aSnap] = await Promise.all([
      getDocs(collection(db, 'rubrics')),
      getDocs(collection(db, 'assignments')),
    ]);
    setRubrics(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setAssignments(aSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function archiveSchoolYear() {
    const year = currentSchoolYear();
    const sSnap = await getDocs(collection(db, 'submissions'));
    if (sSnap.empty) { alert('No submissions to archive.'); return; }
    if (!window.confirm(`Archive ${sSnap.size} submission${sSnap.size !== 1 ? 's' : ''} to "submissions_${year}"?\n\nThis clears the active dashboard. All data is preserved in Firestore.`)) return;
    setArchiving(true);
    try {
      // Batch in chunks of 250 (2 ops per doc ≤ 500 limit)
      const all = sSnap.docs;
      for (let i = 0; i < all.length; i += 250) {
        const chunk = all.slice(i, i + 250);
        const batch = writeBatch(db);
        chunk.forEach(d => {
          batch.set(doc(db, `submissions_${year}`, d.id), d.data());
          batch.delete(doc(db, 'submissions', d.id));
        });
        await batch.commit();
      }
      alert(`✓ ${all.length} submissions archived to submissions_${year}.`);
    } catch (err) {
      console.error(err);
      alert('Error archiving. Check console.');
    } finally { setArchiving(false); }
  }

  async function handleGlobalExport() {
    setExporting(true);
    try {
      const sSnap = await getDocs(collection(db, 'submissions'));
      const allSubs = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter by matching assignment course/stream
      const matchingIds = new Set(
        assignments
          .filter(a => (!exportCourse || a.course === exportCourse) && (!exportStream || a.stream === exportStream))
          .map(a => a.id)
      );
      const filtered = allSubs.filter(s => matchingIds.has(s.assignmentId));
      if (!filtered.length) { alert('No submissions match that filter.'); return; }
      const aMap = Object.fromEntries(assignments.map(a => [a.id, a]));
      const headers = ['Assignment', 'Course', 'Stream', 'Student Name', 'Email', 'Submitted', 'Words', 'Mark', 'Revision', 'Feedback'];
      const rows = filtered.map(s => {
        const a = aMap[s.assignmentId] || {};
        return [
          a.name || s.assignmentId,
          a.course || '',
          a.stream || '',
          s.studentName,
          s.studentEmail,
          s.timestamp?.toDate ? s.timestamp.toDate().toLocaleDateString() : '',
          s.wordCount ?? '',
          s.mark ?? '',
          s.isResubmission ? 'Yes' : 'No',
          stripHtml(s.feedback),
        ];
      });
      const label = [exportCourse, exportStream].filter(Boolean).join('_') || 'all';
      exportCSV(`grades_${label}.csv`, headers, rows);
    } finally { setExporting(false); }
  }

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  return (
    <div className="page">
      <h1 className="page-title">Setup</h1>
      <div className="setup-columns">
        <div>
          <RubricBuilder onSaved={load} />
          <SavedRubrics rubrics={rubrics} />
        </div>
        <div>
          <AssignmentForm rubrics={rubrics} onSaved={load} />
          <SavedAssignments assignments={assignments.filter(a => !a.archived)} rubrics={rubrics} onDelete={load} />
        </div>
      </div>

      {/* ── Export & Archive ── */}
      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Global CSV Export */}
        <div className="setup-section card">
          <h2 className="setup-section__title">Export Grades</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Download a CSV of all marks filtered by course and stream.
          </p>
          <div className="setup-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <div className="field">
              <label>Course</label>
              <select value={exportCourse} onChange={e => setExportCourse(e.target.value)}>
                {COURSES.map(c => <option key={c} value={c}>{c || 'All courses'}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Stream</label>
              <select value={exportStream} onChange={e => setExportStream(e.target.value)}>
                {STREAMS.map(s => <option key={s} value={s}>{s || 'All streams'}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn--primary" onClick={handleGlobalExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>

        {/* Archive School Year */}
        <div className="setup-section card">
          <h2 className="setup-section__title">Archive School Year</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
            Move all current submissions to a separate Firestore collection for the <strong>{currentSchoolYear().replace('_', '–')}</strong> school year.
            The active dashboard will be cleared. All data is preserved.
          </p>
          <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 16 }}>
            ⚠️ This cannot be undone from the UI.
          </p>
          <button className="btn btn--danger" onClick={archiveSchoolYear} disabled={archiving}>
            {archiving ? 'Archiving…' : `Archive ${currentSchoolYear().replace('_', '–')} Submissions`}
          </button>
        </div>

      </div>
    </div>
  );
}
