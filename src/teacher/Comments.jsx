import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import ManageBank from './ManageBank';
import { CATEGORY_ORDER, DEFAULT_BANK, applyTemplate } from './commentBank';

// ── Curricular lens by grade ─────────────────────────────────────────────────
const LENS_MAP = {
  9:  'the Canadian federal system',
  10: 'globalization',
  20: 'nationalism',
  30: 'liberalism',
};

const KEY_KEYWORDS = ['position paper', 'three source', 'three-source', 'source analysis'];

function getTone(pct) {
  if (pct >= 85) return 'excellent';
  if (pct >= 73) return 'strong';
  if (pct >= 60) return 'satisfactory';
  if (pct >= 50) return 'developing';
  return 'struggling';
}

const TONE_LABELS = {
  excellent:    { label: 'Excellent',    color: '#16a34a' },
  strong:       { label: 'Strong',       color: '#2563eb' },
  satisfactory: { label: 'Satisfactory', color: '#7c3aed' },
  developing:   { label: 'Developing',   color: '#d97706' },
  struggling:   { label: 'Struggling',   color: '#dc2626' },
};

function parseGrade(raw) {
  if (!raw || typeof raw === 'string' && raw.trim().toUpperCase() === 'CO') return null;
  const str = String(raw);
  const m = str.match(/(\d+(?:\.\d+)?)\s*%?/);
  return m ? Math.round(parseFloat(m[1])) : null;
}

function parseSheetName(name) {
  if (!name) return null;
  const m = name.match(/\b(9|10|20|30)\b/);
  return m ? parseInt(m[1], 10) : null;
}

function buildKeySignal(keyScores) {
  if (!keyScores.length) return '';
  const avg = keyScores.reduce((a, b) => a + b, 0) / keyScores.length;
  if (avg >= 80) return 'Written work demonstrates strong analytical thinking and clear argumentation.';
  if (avg >= 65) return 'Written work shows adequate understanding, with room to strengthen argumentation and depth.';
  if (avg >= 50) return 'Written work indicates developing skills in analysis and written expression.';
  return 'Written work suggests significant challenges with analytical thinking and written expression.';
}

function parseXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const gradeLevel = parseSheetName(sheetName);
        const lens = LENS_MAP[gradeLevel] || 'social studies concepts';
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) return reject(new Error('Sheet appears empty.'));
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const keyColIndices = [];
        headers.forEach((h, i) => {
          if (i >= 2 && KEY_KEYWORDS.some(kw => h.includes(kw))) keyColIndices.push(i);
        });
        const students = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = String(row[0] || '').trim();
          if (!rawName) continue;
          const nameParts = rawName.split(',');
          const firstName = nameParts.length > 1 ? nameParts[1].trim().split(' ')[0] : rawName.split(' ')[0];
          const rawGrade = row[1];
          const pct = parseGrade(rawGrade);
          if (pct === null) continue;
          const tone = getTone(pct);
          const keyScores = keyColIndices.map(i => parseGrade(row[i])).filter(v => v !== null);
          students.push({
            id: `${r}-${firstName}`,
            fullName: rawName, firstName, pct, tone, lens,
            keySignal: buildKeySignal(keyScores),
            comment: '', templatePick: '', generating: false, error: '',
          });
        }
        resolve({ students, lens, gradeLevel, sheetName });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

async function generateOne(student) {
  const res = await fetch('/api/generate-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: student.firstName,
      tone: student.tone,
      curricularLens: student.lens,
      keyAssignmentSignal: student.keySignal,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.comment;
}

export default function Comments() {
  const [students, setStudents] = useState([]);
  const [sheetInfo, setSheetInfo] = useState(null);
  const [parseError, setParseError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const [bank, setBank] = useState([]);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [bankError, setBankError] = useState('');
  const fileRef = useRef(null);

  // Load comment bank from Firestore
  useEffect(() => {
    async function loadBank() {
      try {
        const snap = await getDocs(collection(db, 'comment_bank'));
        setBank(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Bank load error:', err);
        setBankError(err.message);
      } finally {
        setBankLoaded(true);
      }
    }
    loadBank();
  }, []);

  // Seed all default entries into Firestore (called from ManageBank button)
  async function seedDefaults() {
    try {
      const seeded = [];
      for (const entry of DEFAULT_BANK) {
        const ref = await addDoc(collection(db, 'comment_bank'), entry);
        seeded.push({ id: ref.id, ...entry });
      }
      setBank(prev => [...prev, ...seeded]);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Grouped bank for the dropdown
  const groupedBank = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = bank.filter(e => e.category === cat).sort((a, b) => (a.order || 0) - (b.order || 0));
    return acc;
  }, {});

  function updateStudent(id, patch) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setParseError(''); setStudents([]); setSheetInfo(null);
    try {
      const { students: parsed, lens, gradeLevel, sheetName } = await parseXlsx(file);
      setStudents(parsed);
      setSheetInfo({ lens, gradeLevel, sheetName, count: parsed.length });
    } catch (err) { setParseError(err.message); }
    finally { setParsing(false); }
  }

  async function handleGenerateOne(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    updateStudent(id, { generating: true, error: '' });
    try {
      const comment = await generateOne(student);
      updateStudent(id, { comment, generating: false, templatePick: '' });
    } catch (err) { updateStudent(id, { error: err.message, generating: false }); }
  }

  async function handleGenerateAll() {
    const targets = students.filter(s => !s.comment);
    if (!targets.length) return;
    setGeneratingAll(true); setGenProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      setGenProgress({ current: i + 1, total: targets.length });
      updateStudent(s.id, { generating: true, error: '' });
      try {
        const comment = await generateOne(s);
        updateStudent(s.id, { comment, generating: false, templatePick: '' });
      } catch (err) { updateStudent(s.id, { error: err.message, generating: false }); }
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    setGeneratingAll(false);
  }

  function copyComment(comment) { navigator.clipboard.writeText(comment); }

  function exportComments() {
    const withComments = students.filter(s => s.comment);
    if (!withComments.length) { alert('No comments to export yet.'); return; }
    const header = ['Student Name', 'Grade %', 'Comment'];
    const rows = withComments.map(s => [
      s.fullName,
      s.pct,
      `"${s.comment.replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const grade = sheetInfo?.gradeLevel ? `Social${sheetInfo.gradeLevel}_` : '';
    a.href = url;
    a.download = `${grade}ReportCardComments.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const ungeneratedCount = students.filter(s => !s.comment).length;

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}>💬 Report Card Comments</h1>
        {sheetInfo && (
          <span style={{ fontSize: 13, color: 'var(--text-dim)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px' }}>
            Social {sheetInfo.gradeLevel} · {sheetInfo.lens}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>
        Upload a gradebook <code>.xlsx</code> file. Pick a template per student, or use the AI button as a fallback.
      </p>

      {/* Manage Bank */}
      {bankError && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>Bank load error: {bankError}</div>}
      {bankLoaded && <ManageBank bank={bank} onBankChange={setBank} onSeedDefaults={seedDefaults} />}

      {/* Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{ marginBottom: 20, padding: '20px 24px', background: 'var(--bg-card)', border: '2px dashed var(--border)', borderRadius: 8, cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.2s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      >
        <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFile} />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{parsing ? 'Reading file…' : 'Click to upload gradebook .xlsx'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>Sheet name must include grade level (9, 10, 20, or 30)</div>
      </div>

      {parseError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>
          {parseError}
        </div>
      )}

      {/* Controls */}
      {students.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            <strong style={{ color: 'var(--text)' }}>{students.length}</strong> students · <strong style={{ color: 'var(--text)' }}>{ungeneratedCount}</strong> without comments
          </span>
          <div style={{ flex: 1 }} />
          {ungeneratedCount > 0 && !generatingAll && (
            <button className="btn btn--secondary btn--sm" onClick={handleGenerateAll}>
              ✦ AI Generate All ({ungeneratedCount})
            </button>
          )}
          {generatingAll && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Generating {genProgress.current} of {genProgress.total}…</span>}
          {students.some(s => s.comment) && (
            <button className="btn btn--secondary btn--sm" onClick={exportComments}>↓ Export CSV</button>
          )}
          <button className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()}>↑ New File</button>
        </div>
      )}

      {generatingAll && (
        <div style={{ marginBottom: 16, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: 'var(--primary)', width: `${(genProgress.current / genProgress.total) * 100}%`, transition: 'width 0.3s' }} />
        </div>
      )}

      {/* Student cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {students.map(s => {
          const toneStyle = TONE_LABELS[s.tone] || { label: s.tone, color: 'var(--text-dim)' };
          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{s.firstName}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>{s.fullName}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: toneStyle.color, background: `${toneStyle.color}20`, border: `1px solid ${toneStyle.color}40`, borderRadius: 20, padding: '2px 8px' }}>
                  {toneStyle.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.pct}%</span>
                {s.comment && (
                  <button className="btn btn--secondary btn--sm" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => copyComment(s.comment)}>
                    📋 Copy
                  </button>
                )}
                <button
                  className="btn btn--secondary btn--sm"
                  style={{ fontSize: 11, padding: '2px 10px' }}
                  onClick={() => handleGenerateOne(s.id)}
                  disabled={s.generating || generatingAll}
                  title="Generate with AI"
                >
                  {s.generating ? '…' : s.comment ? '✦ AI ↺' : '✦ AI'}
                </button>
              </div>

              {/* Template picker */}
              <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                <select
                  value={s.templatePick}
                  onChange={e => {
                    const entryId = e.target.value;
                    if (!entryId) { updateStudent(s.id, { templatePick: '' }); return; }
                    const entry = bank.find(b => b.id === entryId);
                    if (!entry) return;
                    const filled = applyTemplate(entry.text, s.firstName, s.lens);
                    updateStudent(s.id, { comment: filled, templatePick: entryId });
                  }}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13 }}
                >
                  <option value="">— Pick a template —</option>
                  {CATEGORY_ORDER.map(cat => {
                    const entries = groupedBank[cat] || [];
                    if (!entries.length) return null;
                    return (
                      <optgroup key={cat} label={cat}>
                        {entries.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {/* Comment area */}
              {s.generating && <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>Generating comment…</div>}
              {s.error && !s.generating && <div style={{ padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>⚠ {s.error}</div>}
              {s.comment && !s.generating && (
                <textarea
                  value={s.comment}
                  onChange={e => updateStudent(s.id, { comment: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: 'transparent', border: 'none', resize: 'vertical', color: 'var(--text)', fontSize: 13, lineHeight: 1.6, fontFamily: 'inherit', minHeight: 100, outline: 'none' }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
