import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

// ── RVS Grade 10 Year-End Writing Rubric (hardcoded) ────────────────────────
const RVS_RUBRIC = [
  {
    key: 'content',
    label: 'Content',
    descriptors: {
      4: 'Effectively crafts a topic, engaging throughout, incorporates effective examples appropriate to purpose and audience.',
      3: 'Adequately crafts a topic, engaging, incorporates appropriately chosen examples to purpose and audience.',
      2: 'Simplistically crafts a topic, occasionally engaging, incorporates simplistic examples to purpose and audience.',
      1: 'Does not yet craft a topic and/or develop content; seldom engaging, incorporates superficial examples.',
    },
  },
  {
    key: 'audienceWordChoice',
    label: 'Audience & Word Choice',
    descriptors: {
      4: 'Effectively uses language, image, and structure to create different effects for the writer\'s purpose and audience.',
      3: 'Adequately uses language, image, and structure to create different effects for the writer\'s purpose and audience.',
      2: 'Simplistically uses language, image, and structure to create different effects for the writer\'s purpose and audience.',
      1: 'Rarely uses language, image, and structure to create different effects for the writer\'s purpose and audience.',
    },
  },
  {
    key: 'organization',
    label: 'Organization',
    descriptors: {
      4: 'Organizes information purposefully and effectively; effectively strengthens relationships between ideas to enhance unity.',
      3: 'Organizes information logically; adequately strengthens relationships between ideas to enhance unity.',
      2: 'Partially organizes information; partially and/or simplistically strengthens relationships between ideas.',
      1: 'Rarely organizes information; rarely and/or superficially strengthens relationships between ideas.',
    },
  },
  {
    key: 'sentenceStructure',
    label: 'Sentence Structure',
    descriptors: {
      4: 'Skillfully and frequently uses syntactically correct sentences with a variety of sentence patterns.',
      3: 'Adequately and often uses syntactically correct sentences with a variety of sentence patterns.',
      2: 'Simplistically and occasionally uses syntactically correct sentences with a variety of sentence patterns.',
      1: 'Rarely or not yet using syntactically correct sentences.',
    },
  },
  {
    key: 'conventions',
    label: 'Spelling, Cap. & Punct.',
    descriptors: {
      4: 'Effectively applies correct capitalization, punctuation, spelling, and usage.',
      3: 'Adequately applies correct capitalization, punctuation, spelling, and usage.',
      2: 'Occasionally applies correct capitalization, punctuation, spelling, and usage.',
      1: 'Rarely applies correct capitalization, punctuation, spelling, and usage.',
    },
  },
];

async function scoreWithGemini(studentText) {
  const res = await fetch('/api/gemini-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: studentText }),
  });
  if (!res.ok) throw new Error(`Score API ${res.status}: ${await res.text()}`);
  const parsed = await res.json();
  if (parsed.error) throw new Error(parsed.error);
  // Validate
  for (const cat of RVS_RUBRIC) {
    const v = parsed[cat.key];
    if (!Number.isInteger(v) || v < 1 || v > 4) throw new Error(`Invalid score for ${cat.key}: ${v}`);
  }
  return parsed;
}

function getStudentText(submission) {
  // Plain text version (used for AI marking) — preferred
  if (submission.plainResponse?.trim()) return submission.plainResponse.trim();
  // HTML version — strip tags as fallback
  if (submission.response?.trim()) {
    return submission.response.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

function scoreColor(v) {
  if (v === 4) return '#16a34a';
  if (v === 3) return '#2563eb';
  if (v === 2) return '#d97706';
  return '#dc2626';
}

export default function LiteracyAudit() {
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' });
  const [showRubric, setShowRubric] = useState(false);
  const [expandedRationale, setExpandedRationale] = useState(null);
  const [error, setError] = useState('');

  // Load assignments on mount
  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(collection(db, 'assignments'));
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => !a.archived);
        all.sort((a, b) => a.name.localeCompare(b.name));
        setAssignments(all);
        if (all.length > 0) setSelectedId(all[0].id);
      } catch (e) { setError('Failed to load assignments: ' + e.message); }
      finally { setLoadingAssignments(false); }
    }
    load();
  }, []);

  // Load submissions when assignment changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingSubs(true);
    setSubmissions([]);
    getDocs(collection(db, 'submissions')).then(snap => {
      const subs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => s.assignmentId === selectedId && getStudentText(s));
      subs.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
      setSubmissions(subs);
    }).catch(e => setError('Failed to load submissions: ' + e.message))
      .finally(() => setLoadingSubs(false));
  }, [selectedId]);

  const scored = submissions.filter(s => s.rvsAudit);
  const unscored = submissions.filter(s => !s.rvsAudit);

  async function runAudit(targets) {
    setScoring(true);
    setError('');
    setProgress({ current: 0, total: targets.length, name: '' });

    for (let i = 0; i < targets.length; i++) {
      const sub = targets[i];
      setProgress({ current: i + 1, total: targets.length, name: sub.studentName || sub.studentEmail });
      try {
        const text = getStudentText(sub);
        const result = await scoreWithGemini(text);
        const total = RVS_RUBRIC.reduce((sum, cat) => sum + result[cat.key], 0);
        const audit = { ...result, total, scoredAt: new Date().toISOString(), assignmentId: selectedId };
        await updateDoc(doc(db, 'submissions', sub.id), { rvsAudit: audit });
        // Update local state immediately
        setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, rvsAudit: audit } : s));
      } catch (e) {
        // Flag this submission as failed, continue with rest
        const errMsg = e.message || 'Unknown error';
        const failed = { error: errMsg, scoredAt: new Date().toISOString(), assignmentId: selectedId };
        await updateDoc(doc(db, 'submissions', sub.id), { rvsAudit: failed }).catch(() => {});
        setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, rvsAudit: failed } : s));
        // Show first error in the error banner
        if (!error) setError(`Scoring error for ${sub.studentName}: ${errMsg}`);
      }
      // Small delay between calls to be polite to the API
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setScoring(false);
  }

  function copyCSV() {
    const header = ['Student', ...RVS_RUBRIC.map(c => c.label), 'Total'].join('\t');
    const rows = submissions
      .filter(s => s.rvsAudit && !s.rvsAudit.error)
      .map(s => {
        const a = s.rvsAudit;
        return [s.studentName, ...RVS_RUBRIC.map(c => a[c.key] ?? ''), a.total ?? ''].join('\t');
      });
    navigator.clipboard.writeText([header, ...rows].join('\n'));
  }

  const selectedAssignment = assignments.find(a => a.id === selectedId);

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}>📊 Literacy Audit</h1>
        <span style={{ fontSize: 13, color: 'var(--text-dim)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px' }}>RVS Grade 10 Writing Rubric</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>AI scores each submission independently against the standardized RVS rubric. Results are saved and can be exported as CSV.</p>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          disabled={loadingAssignments || scoring}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 14, flex: 1, minWidth: 200 }}
        >
          {assignments.map(a => <option key={a.id} value={a.id}>{a.name} — {a.course}{a.stream ? ' ' + a.stream : ''}</option>)}
        </select>

        <button
          className="btn btn--secondary btn--sm"
          onClick={() => setShowRubric(v => !v)}
        >
          {showRubric ? 'Hide Rubric' : 'View Rubric'}
        </button>

        {unscored.length > 0 && !scoring && (
          <button className="btn btn--primary btn--sm" onClick={() => runAudit(unscored)}>
            ▶ Score {unscored.length} unscored
          </button>
        )}

        {scored.length > 0 && !scoring && (
          <button className="btn btn--secondary btn--sm" onClick={() => runAudit(submissions)}>
            ↺ Re-score all
          </button>
        )}

        {scored.length > 0 && !scoring && (
          <button className="btn btn--secondary btn--sm" onClick={copyCSV}>
            📋 Copy CSV
          </button>
        )}
      </div>

      {/* Rubric panel */}
      {showRubric && (
        <div style={{ marginBottom: 20, overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--bg-input)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', width: 150 }}>Category</th>
                {[4,3,2,1].map(n => (
                  <th key={n} style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)' }}>
                    {n} — {['','Not Yet Meeting','Approaching','Meeting','Meeting + Enriched'][n]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RVS_RUBRIC.map(cat => (
                <tr key={cat.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cat.label}</td>
                  {[4,3,2,1].map(n => (
                    <td key={n} style={{ padding: '8px 12px', borderLeft: '1px solid var(--border)', lineHeight: 1.4, color: 'var(--text-dim)' }}>
                      {cat.descriptors[n]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress bar */}
      {scoring && (
        <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span>Scoring <strong>{progress.name}</strong>…</span>
            <span style={{ color: 'var(--text-dim)' }}>{progress.current} of {progress.total}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, background: 'var(--primary)', width: `${(progress.current / progress.total) * 100}%`, transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {/* Status summary */}
      {!loadingSubs && submissions.length > 0 && !scoring && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--text-dim)' }}>
          <span><strong style={{ color: 'var(--text)' }}>{submissions.length}</strong> submissions</span>
          <span><strong style={{ color: '#16a34a' }}>{scored.length}</strong> scored</span>
          {unscored.length > 0 && <span><strong style={{ color: '#d97706' }}>{unscored.length}</strong> not yet scored</span>}
        </div>
      )}

      {/* Results table */}
      {!loadingSubs && submissions.length === 0 && !scoring && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 14 }}>
          {selectedAssignment ? `No text submissions found for "${selectedAssignment.name}".` : 'Select an assignment above.'}
        </div>
      )}

      {submissions.length > 0 && (
        <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-input)', borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--bg-input)', zIndex: 1 }}>Student</th>
                {RVS_RUBRIC.map(cat => (
                  <th key={cat.key} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{cat.label}</th>
                ))}
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, borderLeft: '1px solid var(--border)' }}>Total</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid var(--border)' }}>Notes</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid var(--border)' }}></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(sub => {
                const a = sub.rvsAudit;
                const isExpanded = expandedRationale === sub.id;
                return (
                  <>
                    <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)', background: isExpanded ? 'var(--bg-input)' : 'transparent' }}>
                      <td style={{ padding: '10px 14px', position: 'sticky', left: 0, background: isExpanded ? 'var(--bg-input)' : 'var(--bg-card)', zIndex: 1, borderRight: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>{sub.studentName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{sub.studentEmail}</div>
                      </td>
                      {RVS_RUBRIC.map(cat => (
                        <td key={cat.key} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                          {a && !a.error && a[cat.key] != null ? (
                            <span style={{ fontWeight: 700, fontSize: 16, color: scoreColor(a[cat.key]) }}>{a[cat.key]}</span>
                          ) : a?.error ? (
                            <span style={{ color: '#dc2626', fontSize: 11 }} title={a.error}>⚠ err</span>
                          ) : (
                            <span style={{ color: 'var(--border)' }}>—</span>
                          )}
                        </td>
                      ))}
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)', fontWeight: 700, fontSize: 16 }}>
                        {a && !a.error ? (
                          <span style={{ color: scoreColor(Math.round(a.total / 5)) }}>{a.total}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-dim)' }}>/20</span></span>
                        ) : <span style={{ color: 'var(--border)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                        {a && !a.error && a.rationale && (
                          <button
                            onClick={() => setExpandedRationale(isExpanded ? null : sub.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13, padding: '2px 6px' }}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                        <button
                          className="btn btn--secondary btn--sm"
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => runAudit([sub])}
                          disabled={scoring}
                        >
                          ↺
                        </button>
                      </td>
                    </tr>
                    {isExpanded && a?.rationale && (
                      <tr key={sub.id + '_rationale'} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-input)' }}>
                        <td colSpan={RVS_RUBRIC.length + 4} style={{ padding: '8px 14px 14px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {a.rationale.split('|').map((r, i) => (
                              <div key={i} style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--text)' }}>{RVS_RUBRIC[i]?.label}:</strong> {r.trim()}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && a?.error && (
                      <tr key={sub.id + '_err'} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(220,38,38,0.05)' }}>
                        <td colSpan={RVS_RUBRIC.length + 4} style={{ padding: '8px 14px', fontSize: 12, color: '#dc2626' }}>
                          <strong>Error:</strong> {a.error}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
