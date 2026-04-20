// src/teacher/Setup.jsx
import { useEffect, useState, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { exportCSV, stripHtml, currentSchoolYear } from '../utils/exportUtils';
import SectionsPanel from './SectionsPanel';
import scrapedAssignments from '../data/scraped-assignments.json';
import '../styles/setup.css';

// ── Rubric Presets ─────────────────────────────────────────────────────────
const RUBRIC_PRESETS = {
  'Position Paragraph Rubric (/24)': {
    name: 'Position Paragraph Rubric',
    categories: [
      { name: 'Argumentation', descriptors: [
        { label:'E',   points:8,   text:'Convincingly established position with judiciously chosen, consistent and compelling argumentation. The relationship (see above) is perceptively developed and demonstrates insightful understanding of the assignment.' },
        { label:'E',   points:7.5, text:'Convincingly established position with judiciously chosen, consistent and compelling argumentation. The relationship (see above) is perceptively developed and demonstrates insightful understanding of the assignment.' },
        { label:'Pf',  points:7,   text:'Purposely chosen position with logical and capably developed argumentation. The relationship (see above) is clearly developed and demonstrates sound understanding of the assignment.' },
        { label:'Pf',  points:6.5, text:'Purposely chosen position with logical and capably developed argumentation. The relationship (see above) is clearly developed and demonstrates sound understanding of the assignment.' },
        { label:'S',   points:6,   text:'Appropriately chosen and developed position with straightforward and conventional argumentation. The relationship (see above) is generally developed and demonstrates adequate understanding of the assignment.' },
        { label:'S',   points:5,   text:'Appropriately chosen and developed position with straightforward and conventional argumentation. The relationship (see above) is generally developed and demonstrates adequate understanding of the assignment.' },
        { label:'S',   points:4,   text:'Appropriately chosen and developed position with straightforward and conventional argumentation. The relationship (see above) is generally developed and demonstrates adequate understanding of the assignment.' },
        { label:'L',   points:3.5, text:'Confusing and largely unrelated position with repetitive, contradictory, and/or simplistic argumentation. The relationship (see above) is superficially developed and demonstrates an uninformed belief.' },
        { label:'L',   points:3,   text:'Confusing and largely unrelated position with repetitive, contradictory, and/or simplistic argumentation. The relationship (see above) is superficially developed and demonstrates an uninformed belief.' },
        { label:'L',   points:2.5, text:'Confusing and largely unrelated position with repetitive, contradictory, and/or simplistic argumentation. The relationship (see above) is superficially developed and demonstrates an uninformed belief.' },
        { label:'P',   points:2,   text:'Irrelevant and illogical position with little or no relationship to the source or argumentation. The relationship (see above) is minimally developed.' },
        { label:'P',   points:1.5, text:'Irrelevant and illogical position with little or no relationship to the source or argumentation. The relationship (see above) is minimally developed.' },
        { label:'P',   points:1,   text:'Irrelevant and illogical position with little or no relationship to the source or argumentation. The relationship (see above) is minimally developed.' },
        { label:'INS', points:0,   text:'Does not attempt to address the assignment or is too brief to assess in any scoring category.' },
      ]},
      { name: 'Evidence', descriptors: [
        { label:'E',   points:8,   text:'Evidence is sophisticated and deliberately chosen. The relative absence of error is impressive. A thorough and comprehensive discussion of evidence reveals an insightful understanding of social and application to the assignment.' },
        { label:'E',   points:7.5, text:'Evidence is sophisticated and deliberately chosen. The relative absence of error is impressive. A thorough and comprehensive discussion of evidence reveals an insightful understanding of social and application to the assignment.' },
        { label:'Pf',  points:7,   text:'Evidence is purposeful and specific. Evidence may contain some minor errors. A capable discussion of evidence reveals a solid understanding of social and application to the assignment.' },
        { label:'Pf',  points:6.5, text:'Evidence is purposeful and specific. Evidence may contain some minor errors. A capable discussion of evidence reveals a solid understanding of social and application to the assignment.' },
        { label:'S',   points:6,   text:'Evidence is conventional and straightforward. The evidence may contain minor errors and/or a mixture of relevant and unnecessary information. Discussion reveals a general acceptable understanding of social and application to the assignment.' },
        { label:'S',   points:5,   text:'Evidence is conventional and straightforward. The evidence may contain minor errors and/or a mixture of relevant and unnecessary information. Discussion reveals a general acceptable understanding of social and application to the assignment.' },
        { label:'S',   points:4,   text:'Evidence is conventional and straightforward. The evidence may contain minor errors and/or a mixture of relevant and unnecessary information. Discussion reveals a general acceptable understanding of social and application to the assignment.' },
        { label:'L',   points:3.5, text:'Evidence is somewhat relevant but is unfocused and/or incompletely developed. The evidence contains off topic detail. The discussion reveals an oversimplified and/or confused understanding of social and the application to the assignment.' },
        { label:'L',   points:3,   text:'Evidence is somewhat relevant but is unfocused and/or incompletely developed. The evidence contains off topic detail. The discussion reveals an oversimplified and/or confused understanding of social and the application to the assignment.' },
        { label:'L',   points:2.5, text:'Evidence is somewhat relevant but is unfocused and/or incompletely developed. The evidence contains off topic detail. The discussion reveals an oversimplified and/or confused understanding of social and the application to the assignment.' },
        { label:'P',   points:2,   text:'Evidence is either irrelevant and/or inaccurate. The evidence contains major errors. A minimal discussion reveals a lack of understanding of social and the application to the assignment.' },
        { label:'P',   points:1.5, text:'Evidence is either irrelevant and/or inaccurate. The evidence contains major errors. A minimal discussion reveals a lack of understanding of social and the application to the assignment.' },
        { label:'P',   points:1,   text:'Evidence is either irrelevant and/or inaccurate. The evidence contains major errors. A minimal discussion reveals a lack of understanding of social and the application to the assignment.' },
        { label:'INS', points:0,   text:'Does not attempt to address the assignment or is too brief to assess in any scoring category.' },
      ]},
      { name: 'Communication', descriptors: [
        { label:'E',   points:8,   text:'The writing is fluent, skillfully structured, and judiciously organized. Control of syntax, mechanics, and grammar is sophisticated. Vocabulary is precise and deliberately chosen. The relative absence of error is impressive.' },
        { label:'E',   points:7.5, text:'The writing is fluent, skillfully structured, and judiciously organized. Control of syntax, mechanics, and grammar is sophisticated. Vocabulary is precise and deliberately chosen. The relative absence of error is impressive.' },
        { label:'Pf',  points:7,   text:'The writing is clear and purposefully organized. Control of syntax, mechanics, and grammar is capable. Vocabulary is appropriate and specific. Minor errors in language do not impede communication.' },
        { label:'Pf',  points:6.5, text:'The writing is clear and purposefully organized. Control of syntax, mechanics, and grammar is capable. Vocabulary is appropriate and specific. Minor errors in language do not impede communication.' },
        { label:'S',   points:6,   text:'The writing is straightforward and functionally organized. Control of syntax, mechanics, and grammar is adequate. Vocabulary is conventional and generalized. There may be occasional lapses in control and minor errors; however, the communication remains generally clear.' },
        { label:'S',   points:5,   text:'The writing is straightforward and functionally organized. Control of syntax, mechanics, and grammar is adequate. Vocabulary is conventional and generalized. There may be occasional lapses in control and minor errors; however, the communication remains generally clear.' },
        { label:'S',   points:4,   text:'The writing is straightforward and functionally organized. Control of syntax, mechanics, and grammar is adequate. Vocabulary is conventional and generalized. There may be occasional lapses in control and minor errors; however, the communication remains generally clear.' },
        { label:'L',   points:3.5, text:'The writing is awkward and lacks organization. Control of syntax, mechanics and grammar is inconsistent. Vocabulary is imprecise, simplistic, and inappropriate. Errors obscure the clarity of communication.' },
        { label:'L',   points:3,   text:'The writing is awkward and lacks organization. Control of syntax, mechanics and grammar is inconsistent. Vocabulary is imprecise, simplistic, and inappropriate. Errors obscure the clarity of communication.' },
        { label:'L',   points:2.5, text:'The writing is awkward and lacks organization. Control of syntax, mechanics and grammar is inconsistent. Vocabulary is imprecise, simplistic, and inappropriate. Errors obscure the clarity of communication.' },
        { label:'P',   points:2,   text:'The writing is unclear and disorganized. Control of syntax, mechanics, and grammar is lacking. Vocabulary is overgeneralized and inaccurate. Jarring errors impede communication.' },
        { label:'P',   points:1.5, text:'The writing is unclear and disorganized. Control of syntax, mechanics, and grammar is lacking. Vocabulary is overgeneralized and inaccurate. Jarring errors impede communication.' },
        { label:'P',   points:1,   text:'The writing is unclear and disorganized. Control of syntax, mechanics, and grammar is lacking. Vocabulary is overgeneralized and inaccurate. Jarring errors impede communication.' },
        { label:'INS', points:0,   text:'Does not attempt to address the assignment or is too brief to assess in any scoring category.' },
      ]},
    ],
  },
};

// ── Rubric Builder ─────────────────────────────────────────────────────────
function RubricBuilder({ onSaved }) {
  const [name, setName] = useState('');
  const [categories, setCategories] = useState([{ name: '', descriptors: [{ text: '', points: 1 }] }]);
  const [saving, setSaving] = useState(false);

  const loadPreset = (presetKey) => {
    const p = RUBRIC_PRESETS[presetKey];
    if (p) { setName(p.name); setCategories(p.categories); }
  };

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

  const fileInputRef = useRef(null);

  return (
    <div className="setup-section card">
      <h2 className="setup-section__title">Add Rubric</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Load preset:</span>
        {Object.keys(RUBRIC_PRESETS).map(key => (
          <button key={key} className="btn btn--secondary btn--sm" onClick={() => loadPreset(key)}>{key}</button>
        ))}
      </div>
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

function AssignmentForm({ rubrics, onSaved }) {
  const [form, setForm] = useState({ name: '', course: 'Social 9', stream: '', unit: '', docUrl: '', rubricId: '' });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.docUrl.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'assignments'), { ...form, name: form.name.trim(), docUrl: form.docUrl.trim() });
      setForm({ name: '', course: 'Social 9', stream: '', unit: '', docUrl: '', rubricId: '' });
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
            <option value="">— no stream —</option>
            {(STREAMS_FOR[form.course] || []).map(s => <option key={s} value={s}>{s}</option>)}
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
          <label>Unit Page <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(shows badge on mcraesocial.com)</span></label>
          <select value={form.unit} onChange={e => { set('unit', e.target.value); }}>
            <option value="">— No unit link —</option>
            {(UNITS_FOR[form.course] || []).map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
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

// ── Grouped assignment checklist (used inside rubric apply panel) ────────────
function GroupedAssignmentList({ groupMap, groupKeys, rubricId, onAssignmentUpdate }) {
  const [openGroups, setOpenGroups] = useState({});
  const toggle = key => setOpenGroups(p => ({ ...p, [key]: !p[key] }));

  if (!groupKeys.length) return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>No assignments registered yet.</span>
    </div>
  );

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {groupKeys.map(key => {
        const items    = groupMap[key];
        const isOpen   = !!openGroups[key];
        const checkedN = items.filter(a => a.rubricId === rubricId).length;
        // Shorten label: "Social 9" → "9", "Social 10 -1" → "10-1"
        const label = key.replace('Social ', '').replace(' -', '-');
        return (
          <div key={key} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Group header */}
            <div
              onClick={() => toggle(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 10 }}>{isOpen ? '▼' : '▶'}</span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{label}</span>
              {checkedN > 0 && (
                <span style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>
                  {checkedN} applied
                </span>
              )}
            </div>
            {/* Assignment rows */}
            {isOpen && (
              <div style={{ paddingLeft: 28, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {items.map(a => (
                  <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={a.rubricId === rubricId}
                      onChange={async e => {
                        const newRubricId = e.target.checked ? rubricId : null;
                        await updateDoc(doc(db, 'assignments', a.id), { rubricId: newRubricId });
                        onAssignmentUpdate?.(a.id, { rubricId: newRubricId });
                      }}
                    />
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ── Saved Lists ─────────────────────────────────────────────────────────────
function SavedRubrics({ rubrics, assignments, onAssignmentUpdate }) {
  const [expandedId, setExpandedId] = useState(null);
  if (!rubrics.length) return null;
  return (
    <div className="setup-section">
      <h3 className="setup-list-title">Saved Rubrics ({rubrics.length})</h3>
      {rubrics.map(r => {
        const isExpanded = expandedId === r.id;
        const activeAssignments = assignments.filter(a => !a.archived);
        return (
          <div key={r.id} className="card" style={{ marginBottom: 8, padding: 0, overflow: 'hidden' }}>
            {/* Header row */}
            <div
              className="setup-list-item"
              style={{ cursor: 'pointer', padding: '10px 14px' }}
              onClick={() => setExpandedId(isExpanded ? null : r.id)}
            >
              <strong style={{ flex: 1 }}>{r.name}</strong>
              <span style={{ fontSize: 12, color: 'var(--text-dim)', marginRight: 12 }}>
                {r.categories?.length || 0} categories
              </span>
              <span style={{ fontSize: 12, color: 'var(--accent)' }}>
                {isExpanded ? '▲ Close' : '▼ Apply to assignments'}
              </span>
            </div>
            {/* Expandable assignment checklist — grouped by course+stream */}
            {isExpanded && (() => {
              // Build ordered group keys: "Social 9", "Social 10-1", etc.
              const groupMap = {};
              activeAssignments.forEach(a => {
                const key = `${a.course}${a.stream ? ' ' + a.stream : ''}`;
                if (!groupMap[key]) groupMap[key] = [];
                groupMap[key].push(a);
              });
              const groupKeys = Object.keys(groupMap);
              return (
                <GroupedAssignmentList
                  groupMap={groupMap}
                  groupKeys={groupKeys}
                  rubricId={r.id}
                  onAssignmentUpdate={onAssignmentUpdate}
                />
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}


const COURSES = ['Social 9', 'Social 10', 'Social 20', 'Social 30'];
const STREAMS_FOR = {
  'Social 9':  ['-1', '-2'],
  'Social 10': ['-1', '-2'],
  'Social 20': ['-1', '-2'],
  'Social 30': ['-1', '-2'],
};
const UNITS_FOR = {
  'Social 9': [
    { label: 'CCRF',                    value: 'social-9/ccrf' },
    { label: 'Collective Rights',        value: 'social-9/collective-rights' },
    { label: 'Consumerism',              value: 'social-9/consumerism' },
    { label: 'Economics',               value: 'social-9/economics' },
    { label: 'Federal Political Systems',value: 'social-9/federal-political-systems' },
    { label: 'Immigration',             value: 'social-9/immigration' },
    { label: 'Mock Election',           value: 'social-9/mock-election' },
    { label: 'PAT Prep',               value: 'social-9/pat-prep' },
    { label: 'Textbook',               value: 'social-9/textbook' },
    { label: 'YCJA',                   value: 'social-9/ycja' },
  ],
  'Social 10': [
    { label: 'Global Citizenship',      value: 'social-10/global-citizenship' },
    { label: 'Historical Globalization',value: 'social-10/historical' },
    { label: 'Identity',               value: 'social-10/identity' },
    { label: 'Modern Globalization',   value: 'social-10/modern-globalization' },
  ],
  'Social 20': [
    { label: 'Challenges to Canada',   value: 'social-20/challenges-to-canada' },
    { label: 'Contending Loyalties',   value: 'social-20/contending-loyalties' },
    { label: 'Create a Country',       value: 'social-20/create-a-country' },
    { label: 'Factors of Nationalism', value: 'social-20/factors-of-nationalism' },
    { label: 'Internationalism',       value: 'social-20/internationalism' },
    { label: 'Model UN',               value: 'social-20/model-un' },
    { label: 'National Interest',      value: 'social-20/national-interest' },
    { label: 'Ultranationalism',       value: 'social-20/ultranationalism' },
  ],
  'Social 30': [
    { label: 'Democracy',              value: 'social-30/democracy' },
    { label: 'Dictatorships',          value: 'social-30/dictatorships' },
    { label: 'Economics',              value: 'social-30/economics' },
    { label: 'Illiberalism',           value: 'social-30/illiberalism' },
    { label: 'Imposition',             value: 'social-30/imposition' },
    { label: 'Intro to Ideologies',    value: 'social-30/intro-to-ideologies' },
  ],
};
const selStyle = { fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)' };

function AssignmentRow({ a, rubrics, onDelete, onUpdate }) {
  const [copyOpen,   setCopyOpen]   = useState(false);
  const [tgtCourse,  setTgtCourse]  = useState(COURSES[0]);
  const [tgtStream,  setTgtStream]  = useState('-1');
  const [copying,    setCopying]    = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      await addDoc(collection(db, 'assignments'), {
        name:     a.name,
        course:   tgtCourse,
        stream:   tgtStream,
        docUrl:   a.docUrl || '',
        isOpen:   false,
        rubricId: a.rubricId || null,
      });
      setCopyOpen(false);
      onDelete?.(); // reload to show new entry
    } finally { setCopying(false); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Main row */}
      <div className="setup-list-item" style={{ flexWrap: 'wrap', gap: 8, padding: '8px 14px' }}>
        <span style={{ flex: 1, minWidth: 140, fontWeight: 600, fontSize: 13 }}>{a.name}</span>

        {/* Course dropdown */}
        <select style={selStyle} value={a.course} onChange={async e => {
          const course = e.target.value;
          await updateDoc(doc(db, 'assignments', a.id), { course });
          onDelete?.(); // reload groups
        }}>
          {COURSES.map(c => <option key={c}>{c}</option>)}
        </select>

        {/* Stream dropdown */}
        <select style={selStyle} value={a.stream || ''} onChange={async e => {
          const stream = e.target.value;
          await updateDoc(doc(db, 'assignments', a.id), { stream });
          onDelete?.();
        }}>
          <option value="">—</option>
          {(STREAMS_FOR[a.course] || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Rubric picker */}
        <select style={{ ...selStyle, minWidth: 140 }} value={a.rubricId || ''} onChange={async e => {
          const rubricId = e.target.value;
          await updateDoc(doc(db, 'assignments', a.id), { rubricId: rubricId || null });
          onUpdate?.(a.id, { rubricId });
        }}>
          <option value="">— No rubric —</option>
          {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        {/* Unit page picker */}
        <select
          style={{ ...selStyle, minWidth: 160 }}
          value={a.unit || ''}
          title="Unit page on mcraesocial.com"
          onChange={async e => {
            const unit = e.target.value;
            await updateDoc(doc(db, 'assignments', a.id), { unit: unit || '' });
            onUpdate?.(a.id, { unit });
          }}
        >
          <option value="">— No unit link —</option>
          {(UNITS_FOR[a.course] || []).map(u => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>

        <button className="btn btn--secondary btn--sm" onClick={() => setCopyOpen(o => !o)}>
          {copyOpen ? '✕' : 'Copy to…'}
        </button>
        <button className="btn btn--secondary btn--sm" onClick={async () => {
          if (!window.confirm(`Archive "${a.name}"?`)) return;
          await updateDoc(doc(db, 'assignments', a.id), { archived: true });
          onDelete?.();
        }}>
          Archive
        </button>
      </div>

      {/* Copy-to panel */}
      {copyOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 10px 14px', background: 'var(--bg-input)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Copy to:</span>
          <select style={selStyle} value={tgtCourse} onChange={e => { setTgtCourse(e.target.value); setTgtStream('-1'); }}>
            {COURSES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select style={selStyle} value={tgtStream} onChange={e => setTgtStream(e.target.value)}>
            {(STREAMS_FOR[tgtCourse] || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn--primary btn--sm" onClick={handleCopy} disabled={copying}>
            {copying ? 'Duplicating…' : 'Duplicate'}
          </button>
        </div>
      )}
    </div>
  );
}

function SavedAssignments({ assignments, rubrics, onDelete, onUpdate }) {
  const [openGroups, setOpenGroups] = useState({});
  const toggle = key => setOpenGroups(p => ({ ...p, [key]: !p[key] }));

  if (!assignments.length) return null;

  const groupMap = {};
  assignments.forEach(a => {
    const key = `${a.course}${a.stream ? ' ' + a.stream : ''}`;
    if (!groupMap[key]) groupMap[key] = [];
    groupMap[key].push(a);
  });
  const groupKeys = Object.keys(groupMap).sort();

  return (
    <div className="setup-section">
      <h3 className="setup-list-title">Registered Assignments ({assignments.length})</h3>
      {groupKeys.map(key => {
        const label  = key.replace('Social ', '').replace(' -', '-');
        const items  = groupMap[key];
        const isOpen = !!openGroups[key];
        return (
          <div key={key} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div onClick={() => toggle(key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg-card)', cursor: 'pointer', userSelect: 'none' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 10 }}>{isOpen ? '▼' : '▶'}</span>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{items.length} assignment{items.length !== 1 ? 's' : ''}</span>
            </div>
            {isOpen && items.map(a => (
              <AssignmentRow key={a.id} a={a} rubrics={rubrics} onDelete={onDelete} onUpdate={onUpdate} />
            ))}
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
  const EXPORT_COURSES = ['', 'Social 9', 'Social 10', 'Social 20', 'Social 30'];
  const EXPORT_STREAMS = ['', '-1', '-2'];

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
          <SavedRubrics
            rubrics={rubrics}
            assignments={assignments}
            onAssignmentUpdate={(id, changes) => setAssignments(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a))}
          />
        </div>
        <div>
          <AssignmentForm rubrics={rubrics} onSaved={load} />
          <SavedAssignments
            assignments={assignments.filter(a => !a.archived)}
            rubrics={rubrics}
            onDelete={load}
            onUpdate={(id, changes) => setAssignments(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a))}
          />
        </div>
      </div>

      {/* ── Export & Archive ── */}
      <div style={{ marginTop: 32 }}>

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
                {EXPORT_COURSES.map(c => <option key={c} value={c}>{c || 'All courses'}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Stream</label>
              <select value={exportStream} onChange={e => setExportStream(e.target.value)}>
                {EXPORT_STREAMS.map(s => <option key={s} value={s}>{s || 'All streams'}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn--primary" onClick={handleGlobalExport} disabled={exporting}>
            {exporting ? 'Exporting…' : '↓ Export CSV'}
          </button>
        </div>

      </div>

      {/* ── Sections & Rosters ── */}
      <div style={{ marginTop: 32 }}>
        <SectionsPanel />
      </div>

      {/* ── Archive School Year (bottom of page) ── */}
      <div className="setup-section card" style={{ marginTop: 32 }}>
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
  );
}

