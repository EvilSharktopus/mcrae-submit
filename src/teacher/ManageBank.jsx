// src/teacher/ManageBank.jsx
import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { CATEGORY_ORDER } from './commentBank';

const inputStyle = {
  padding: '4px 8px', borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
};
const taStyle = {
  width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'var(--bg-input)', color: 'var(--text)',
  fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
};

function EntryRow({ entry, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ label: entry.label, category: entry.category, text: entry.text });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.label.trim() || !draft.text.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'comment_bank', entry.id), {
        label: draft.label.trim(), category: draft.category, text: draft.text.trim(),
      });
      onUpdate({ ...entry, ...draft, label: draft.label.trim(), text: draft.text.trim() });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${entry.label}"?`)) return;
    await deleteDoc(doc(db, 'comment_bank', entry.id));
    onDelete(entry.id);
  };

  if (editing) return (
    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Label" style={{ ...inputStyle, flex: 1 }} />
        <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} style={inputStyle}>
          {CATEGORY_ORDER.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Use <code>[first name]</code> and <code>[subject]</code> as placeholders.</div>
      <textarea value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} rows={5} style={taStyle} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn--primary btn--sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn btn--secondary btn--sm" onClick={() => { setEditing(false); setDraft({ label: entry.label, category: entry.category, text: entry.text }); }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 5 }}>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{entry.label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.text.slice(0, 55)}…</span>
      <button className="btn btn--secondary btn--sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEditing(true)}>✏️</button>
      <button className="btn btn--secondary btn--sm" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={remove}>🗑</button>
    </div>
  );
}

function AddRow({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState({ label: '', category: 'General', text: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!entry.label.trim() || !entry.text.trim()) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'comment_bank'), {
        label: entry.label.trim(), category: entry.category, text: entry.text.trim(), order: 99,
      });
      onAdded({ id: ref.id, ...entry, label: entry.label.trim(), text: entry.text.trim(), order: 99 });
      setEntry({ label: '', category: 'General', text: '' });
      setOpen(false);
    } finally { setSaving(false); }
  };

  if (!open) return <button className="btn btn--secondary btn--sm" style={{ marginTop: 4 }} onClick={() => setOpen(true)}>+ New Entry</button>;

  return (
    <div style={{ padding: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={entry.label} onChange={e => setEntry(n => ({ ...n, label: e.target.value }))} placeholder="Label (e.g. Strong in seminar)" style={{ ...inputStyle, flex: 1 }} />
        <select value={entry.category} onChange={e => setEntry(n => ({ ...n, category: e.target.value }))} style={inputStyle}>
          {CATEGORY_ORDER.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Use <code>[first name]</code> and <code>[subject]</code> as placeholders.</div>
      <textarea value={entry.text} onChange={e => setEntry(n => ({ ...n, text: e.target.value }))} placeholder="Write your template here…" rows={5} style={taStyle} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn--primary btn--sm" onClick={save} disabled={saving || !entry.label.trim() || !entry.text.trim()}>{saving ? 'Saving…' : '+ Add'}</button>
        <button className="btn btn--secondary btn--sm" onClick={() => { setOpen(false); setEntry({ label: '', category: 'General', text: '' }); }}>Cancel</button>
      </div>
    </div>
  );
}

export default function ManageBank({ bank, onBankChange, onSeedDefaults }) {
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = bank.filter(e => e.category === cat).sort((a, b) => (a.order || 0) - (b.order || 0));
    return acc;
  }, {});

  const handleUpdate = updated => onBankChange(bank.map(e => e.id === updated.id ? updated : e));
  const handleDelete = id => onBankChange(bank.filter(e => e.id !== id));
  const handleAdded = entry => onBankChange([...bank, entry]);

  const handleSeed = async (e) => {
    e.stopPropagation();
    setSeeding(true); setSeedError('');
    const result = await onSeedDefaults();
    if (!result.ok) setSeedError(result.error);
    setSeeding(false);
  };

  const isEmpty = bank.length === 0;

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-card)', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', width: 12 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>📚 Manage Comment Bank</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{bank.length} entries</span>
        {isEmpty && (
          <button
            className="btn btn--primary btn--sm"
            style={{ fontSize: 11 }}
            disabled={seeding}
            onClick={handleSeed}
          >
            {seeding ? 'Loading…' : '⬇ Load 14 defaults'}
          </button>
        )}
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '14px 16px', background: 'var(--bg-input)' }}>
          {seedError && (
            <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 5, fontSize: 12, color: '#dc2626' }}>
              Error loading defaults: {seedError}
            </div>
          )}

          {isEmpty ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
                Your bank is empty. Load the 14 built-in templates to get started.
              </div>
              <button className="btn btn--primary btn--sm" disabled={seeding} onClick={handleSeed}>
                {seeding ? 'Loading…' : '⬇ Load 14 defaults'}
              </button>
            </div>
          ) : (
            <>
              {CATEGORY_ORDER.map(cat => (
                <div key={cat} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{cat}</div>
                  {grouped[cat].length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic', marginBottom: 6 }}>No entries yet.</div>}
                  {grouped[cat].map(entry => <EntryRow key={entry.id} entry={entry} onUpdate={handleUpdate} onDelete={handleDelete} />)}
                </div>
              ))}
              <AddRow onAdded={handleAdded} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
