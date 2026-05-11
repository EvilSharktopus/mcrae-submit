import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Curricular lens by grade ─────────────────────────────────────────────────
const LENS_MAP = {
  9:  'the Canadian federal system',
  10: 'historical globalization',
  20: 'nationalism',
  30: 'liberalism',
};

// Key assignment header keywords
const KEY_KEYWORDS = ['position paper', 'three source', 'three-source', 'source analysis'];

// Tone thresholds
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
  // Match formats: "62 62%", "62%", "62", "62.5%"
  const m = str.match(/(\d+(?:\.\d+)?)\s*%?/);
  return m ? Math.round(parseFloat(m[1])) : null;
}

function parseSheetName(name) {
  if (!name) return null;
  const m = name.match(/\b(9|10|20|30)\b/);
  return m ? parseInt(m[1], 10) : null;
}

function buildKeySignal(keyScores) {
  // Turn numeric scores into qualitative language without naming assignments
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

        // Identify key assignment column indices (col 2+)
        const keyColIndices = [];
        headers.forEach((h, i) => {
          if (i >= 2 && KEY_KEYWORDS.some(kw => h.includes(kw))) {
            keyColIndices.push(i);
          }
        });

        const students = [];
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const rawName = String(row[0] || '').trim();
          if (!rawName) continue;

          // Extract first name from "Last, First" format
          const nameParts = rawName.split(',');
          const firstName = nameParts.length > 1
            ? nameParts[1].trim().split(' ')[0]
            : rawName.split(' ')[0];

          // Parse overall grade from col 1
          const rawGrade = row[1];
          const pct = parseGrade(rawGrade);
          if (pct === null) continue; // skip rows without a valid grade

          const tone = getTone(pct);

          // Key assignment scores
          const keyScores = keyColIndices
            .map(i => parseGrade(row[i]))
            .filter(v => v !== null);

          students.push({
            id: `${r}-${firstName}`,
            fullName: rawName,
            firstName,
            pct,
            tone,
            lens,
            keySignal: buildKeySignal(keyScores),
            comment: '',
            generating: false,
            error: '',
          });
        }

        resolve({ students, lens, gradeLevel, sheetName });
      } catch (err) {
        reject(err);
      }
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
  const fileRef = useRef(null);

  function updateStudent(id, patch) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError('');
    setStudents([]);
    setSheetInfo(null);
    try {
      const { students: parsed, lens, gradeLevel, sheetName } = await parseXlsx(file);
      setStudents(parsed);
      setSheetInfo({ lens, gradeLevel, sheetName, count: parsed.length });
    } catch (err) {
      setParseError(err.message);
    } finally {
      setParsing(false);
    }
  }

  async function handleGenerateOne(id) {
    const student = students.find(s => s.id === id);
    if (!student) return;
    updateStudent(id, { generating: true, error: '' });
    try {
      const comment = await generateOne(student);
      updateStudent(id, { comment, generating: false });
    } catch (err) {
      updateStudent(id, { error: err.message, generating: false });
    }
  }

  async function handleGenerateAll() {
    const targets = students.filter(s => !s.comment);
    if (!targets.length) return;
    setGeneratingAll(true);
    setGenProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      setGenProgress({ current: i + 1, total: targets.length });
      updateStudent(s.id, { generating: true, error: '' });
      try {
        const comment = await generateOne(s);
        updateStudent(s.id, { comment, generating: false });
      } catch (err) {
        updateStudent(s.id, { error: err.message, generating: false });
      }
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    setGeneratingAll(false);
  }

  function copyComment(comment) {
    navigator.clipboard.writeText(comment);
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
        Upload a gradebook <code>.xlsx</code> file. Each student gets an AI-drafted comment you can edit before copying.
      </p>

      {/* Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        style={{
          marginBottom: 20, padding: '20px 24px', background: 'var(--bg-card)', border: '2px dashed var(--border)',
          borderRadius: 8, cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.2s',
        }}
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
            <button className="btn btn--primary btn--sm" onClick={handleGenerateAll}>
              ▶ Generate All ({ungeneratedCount})
            </button>
          )}
          {generatingAll && (
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Generating {genProgress.current} of {genProgress.total}…
            </span>
          )}
          <button className="btn btn--secondary btn--sm" onClick={() => fileRef.current?.click()}>
            ↑ New File
          </button>
        </div>
      )}

      {/* Progress bar */}
      {generatingAll && (
        <div style={{ marginBottom: 16, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: 'var(--primary)',
            width: `${(genProgress.current / genProgress.total) * 100}%`, transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* Student cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {students.map(s => {
          const toneStyle = TONE_LABELS[s.tone] || { label: s.tone, color: 'var(--text-dim)' };
          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: s.comment || s.generating || s.error ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{s.firstName}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 6 }}>{s.fullName}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: toneStyle.color, background: `${toneStyle.color}20`, border: `1px solid ${toneStyle.color}40`, borderRadius: 20, padding: '2px 8px' }}>
                  {toneStyle.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.pct}%</span>
                {s.comment && (
                  <button
                    className="btn btn--secondary btn--sm"
                    style={{ fontSize: 11, padding: '2px 10px' }}
                    onClick={() => copyComment(s.comment)}
                  >
                    📋 Copy
                  </button>
                )}
                <button
                  className="btn btn--primary btn--sm"
                  style={{ fontSize: 11, padding: '2px 10px' }}
                  onClick={() => handleGenerateOne(s.id)}
                  disabled={s.generating || generatingAll}
                >
                  {s.generating ? '…' : s.comment ? '↺' : '▶'}
                </button>
              </div>

              {/* Comment area */}
              {s.generating && (
                <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                  Generating comment…
                </div>
              )}
              {s.error && !s.generating && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>
                  ⚠ {s.error}
                </div>
              )}
              {s.comment && !s.generating && (
                <textarea
                  value={s.comment}
                  onChange={e => updateStudent(s.id, { comment: e.target.value })}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 14px',
                    background: 'transparent', border: 'none', resize: 'vertical',
                    color: 'var(--text)', fontSize: 13, lineHeight: 1.6,
                    fontFamily: 'inherit', minHeight: 100, outline: 'none',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
