// src/teacher/SectionsPanel.jsx
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, addDoc, doc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where,
} from 'firebase/firestore';
import '../styles/section.css';

const COURSES = ['Social 9', 'Social 10', 'Social 20', 'Social 30'];
const STREAMS = ['', '9', '10-1', '10-2', '20-1', '20-2', '30-1', '30-2'];

export default function SectionsPanel() {
  const [sections,    setSections]    = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [expanded,    setExpanded]    = useState({}); // sectionId → bool
  const [loading,     setLoading]     = useState(true);
  const [form, setForm] = useState({ course: 'Social 30', stream: '', displayName: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [sSnap, eSnap] = await Promise.all([
      getDocs(collection(db, 'sections')),
      getDocs(collection(db, 'enrollments')),
    ]);
    setSections(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setEnrollments(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const handleAddSection = async (e) => {
    e.preventDefault();
    if (!form.displayName.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'sections'), {
        course:      form.course,
        stream:      form.stream,
        displayName: form.displayName.trim(),
        archived:    false,
        createdAt:   serverTimestamp(),
      });
      setForm({ course: 'Social 30', stream: '', displayName: '' });
      await load();
    } finally { setSaving(false); }
  };

  const archiveSection = async (s) => {
    if (!window.confirm(`Archive "${s.displayName}"? Students won't see it in the picker, but existing enrollments are kept.`)) return;
    await updateDoc(doc(db, 'sections', s.id), { archived: true });
    setSections(prev => prev.map(x => x.id === s.id ? { ...x, archived: true } : x));
  };

  const purgeRoster = async (s) => {
    const roster = enrollments.filter(e => e.sectionId === s.id);
    if (!roster.length) { alert('No students enrolled.'); return; }
    if (!window.confirm(`Remove all ${roster.length} student${roster.length !== 1 ? 's' : ''} from "${s.displayName}"? They'll see the section picker again on next login.`)) return;
    const batch = writeBatch(db);
    roster.forEach(e => batch.delete(doc(db, 'enrollments', e.id)));
    await batch.commit();
    setEnrollments(prev => prev.filter(e => e.sectionId !== s.id));
  };

  const removeStudent = async (enrollment) => {
    if (!window.confirm(`Remove ${enrollment.studentName} from this section?`)) return;
    await deleteDoc(doc(db, 'enrollments', enrollment.id));
    setEnrollments(prev => prev.filter(e => e.id !== enrollment.id));
  };

  if (loading) return <div style={{ padding: 24 }}><span className="spinner" /></div>;

  const active   = sections.filter(s => !s.archived);
  const archived = sections.filter(s =>  s.archived);

  return (
    <div className="setup-section">
      <h2 className="setup-section__title">Sections &amp; Rosters</h2>

      {/* ── Add section form ── */}
      <form className="setup-grid" onSubmit={handleAddSection} style={{ gridTemplateColumns: '1fr 1fr 2fr auto', marginBottom: 24, alignItems: 'end' }}>
        <div className="field">
          <label>Course</label>
          <select value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))}>
            {COURSES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Stream</label>
          <select value={form.stream} onChange={e => setForm(f => ({ ...f, stream: e.target.value }))}>
            {STREAMS.map(s => <option key={s} value={s}>{s || 'Any'}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Section display name</label>
          <input
            type="text"
            value={form.displayName}
            onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
            placeholder="e.g. Period 2 – Block A"
            required
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={saving}>
          {saving ? 'Adding…' : '+ Add Section'}
        </button>
      </form>

      {/* ── Active sections ── */}
      {active.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No sections yet — add one above.</p>
      ) : (
        <div className="sections-list">
          {active.map(s => {
            const roster = enrollments.filter(e => e.sectionId === s.id);
            const isOpen = expanded[s.id];
            return (
              <div key={s.id} className="section-row">
                <div className="section-row__header" onClick={() => setExpanded(x => ({ ...x, [s.id]: !x[s.id] }))}>
                  <div className="section-row__info">
                    <div className="section-row__name">{s.displayName}</div>
                    <div className="section-row__meta">{s.course}{s.stream ? ` · ${s.stream}` : ''}</div>
                  </div>
                  <span className="section-row__count">{roster.length} student{roster.length !== 1 ? 's' : ''}</span>
                  <div className="section-row__actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn--secondary btn--sm" onClick={() => purgeRoster(s)}>Purge roster</button>
                    <button className="btn btn--secondary btn--sm" onClick={() => archiveSection(s)}>Archive</button>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>

                {isOpen && (
                  <div className="section-roster">
                    {roster.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No students enrolled yet.</p>
                    ) : (
                      <table className="roster-table">
                        <thead><tr><th>Name</th><th>Email</th><th>Enrolled</th><th></th></tr></thead>
                        <tbody>
                          {roster.map(e => (
                            <tr key={e.id}>
                              <td style={{ fontWeight: 600 }}>{e.studentName}</td>
                              <td style={{ color: 'var(--text-dim)' }}>{e.studentEmail}</td>
                              <td style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                                {e.enrolledAt?.toDate ? e.enrolledAt.toDate().toLocaleDateString() : '—'}
                              </td>
                              <td>
                                <button className="btn btn--secondary btn--sm" style={{ fontSize: 11 }} onClick={() => removeStudent(e)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Archived sections (collapsed by default) ── */}
      {archived.length > 0 && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', userSelect: 'none' }}>
            {archived.length} archived section{archived.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {archived.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', opacity: 0.65 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{s.displayName} — {s.course}{s.stream ? ` ${s.stream}` : ''}</span>
                <button className="btn btn--secondary btn--sm" onClick={async () => {
                  await updateDoc(doc(db, 'sections', s.id), { archived: false });
                  setSections(prev => prev.map(x => x.id === s.id ? { ...x, archived: false } : x));
                }}>Restore</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
