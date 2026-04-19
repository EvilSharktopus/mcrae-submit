// src/student/SubmissionPage.jsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../auth/ThemeContext';
import '../styles/submission.css';

// Convert a Google Docs URL to the /preview embed URL
function toEmbedUrl(url) {
  const match = url?.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://docs.google.com/document/d/${match[1]}/preview`;
  return url;
}

function relativeTime(date) {
  if (!date) return '';
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return date.toLocaleTimeString();
}

export default function SubmissionPage() {
  const { assignmentId } = useParams();
  const { user }         = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate         = useNavigate();

  const [assignment,     setAssignment]     = useState(null);
  const [draftData,      setDraftData]      = useState(null);   // existing Firestore doc
  const [loading,        setLoading]        = useState(true);
  const [mobileTab,      setMobileTab]      = useState('assignment');
  const [wordCount,      setWordCount]      = useState(0);
  const [saveStatus,     setSaveStatus]     = useState('idle'); // 'idle'|'saving'|'saved'
  const [lastSaved,      setLastSaved]      = useState(null);   // Date object
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const [isResubmission, setIsResubmission] = useState(false);
  const [submitting,     setSubmitting]     = useState(false);

  // Ask Mr. McRae modal
  const [askModal,   setAskModal]   = useState(false);
  const [askType,    setAskType]    = useState('come');
  const [askMessage, setAskMessage] = useState('');
  const [askSending, setAskSending] = useState(false);
  const [askSent,    setAskSent]    = useState(false);

  const editorRef         = useRef(null);
  const initialContentSet = useRef(false);
  const saveTimer         = useRef(null);
  const splitRef          = useRef(null);
  const isDraggingRef     = useRef(false);
  const [splitPct,     setSplitPct]     = useState(40);   // left pane %
  const [isDragging,   setIsDragging]   = useState(false); // overlay blocker
  const docRef            = doc(db, 'submissions', `${assignmentId}__${user.email}`);

  // ── Drag-to-resize split ───────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!isDraggingRef.current || !splitRef.current) return;
      const rect   = splitRef.current.getBoundingClientRect();
      const newPct = Math.min(75, Math.max(20, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPct(newPct);
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, []);

  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current  = true;
    setIsDragging(true);
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // ── Load assignment + existing draft ─────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const [aDoc, subSnap] = await Promise.all([
          getDoc(doc(db, 'assignments', assignmentId)),
          getDoc(docRef),
        ]);
        if (!aDoc.exists()) { navigate('/'); return; }
        setAssignment({ id: aDoc.id, ...aDoc.data() });

        if (subSnap.exists()) {
          setDraftData(subSnap.data());
        } else {
          // Create the draft doc immediately on first open
          const initial = {
            assignmentId,
            studentName:    user.displayName,
            studentEmail:   user.email,
            response:       '',
            plainResponse:  '',
            wordCount:      0,
            lastSaved:      serverTimestamp(),
            submitted:      false,
            submittedAt:    null,
            isResubmission: false,
            mark:           null,
            feedback:       null,
            emailSent:      false,
            createdAt:      serverTimestamp(),
          };
          await setDoc(docRef, initial);
          setDraftData(initial);
        }
      } catch (err) {
        console.error('SubmissionPage load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assignmentId, user.email]);

  // ── Populate editor once data is loaded ──────────────────────────────────
  useEffect(() => {
    if (loading || !editorRef.current || initialContentSet.current) return;
    initialContentSet.current = true;
    if (draftData?.response) {
      editorRef.current.innerHTML = draftData.response;
    }
    updateWordCount();
    if (draftData?.lastSaved?.toDate) setLastSaved(draftData.lastSaved.toDate());
  }, [loading, draftData]);

  // ── When entering revision mode, reset to current draft content ───────────
  useEffect(() => {
    if (isRevisionMode && editorRef.current && draftData?.response) {
      editorRef.current.innerHTML = draftData.response;
      setIsResubmission(true);
      updateWordCount();
      editorRef.current.focus();
    }
  }, [isRevisionMode]);

  // ── Word count ────────────────────────────────────────────────────────────
  const updateWordCount = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  };

  // ── Auto-save (5 second debounce) ────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    setSaveStatus('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!editorRef.current) return;
      const html  = editorRef.current.innerHTML;
      const plain = editorRef.current.innerText || '';
      const wc    = plain.trim().split(/\s+/).filter(Boolean).length;
      try {
        await setDoc(docRef, {
          response:      html,
          plainResponse: plain.trim(),
          wordCount:     wc,
          lastSaved:     serverTimestamp(),
        }, { merge: true });
        const now = new Date();
        setLastSaved(now);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('idle');
      }
    }, 5000);
  }, [assignmentId, user.email]);

  const handleInput = () => {
    updateWordCount();
    scheduleSave();
  };

  // ── Paste/drop prevention ─────────────────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const stopPaste = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const stopDrop  = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const stopCtx   = (e) => e.preventDefault();
    el.addEventListener('paste',       stopPaste, { capture: true });
    el.addEventListener('drop',        stopDrop,  { capture: true });
    el.addEventListener('contextmenu', stopCtx,   { capture: true });
    return () => {
      el.removeEventListener('paste',       stopPaste, { capture: true });
      el.removeEventListener('drop',        stopDrop,  { capture: true });
      el.removeEventListener('contextmenu', stopCtx,   { capture: true });
    };
  }, [loading]);

  const blockPaste = (e) => { e.preventDefault(); e.stopPropagation(); };
  const blockCopy  = (e) => { e.preventDefault(); e.stopPropagation(); };

  // ── Rich text commands ────────────────────────────────────────────────────
  const execCmd = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Force a save first, then flag as submitted
    if (!editorRef.current) return;
    const html  = editorRef.current.innerHTML;
    const plain = editorRef.current.innerText || '';
    if (!plain.trim()) return;
    const wc = plain.trim().split(/\s+/).filter(Boolean).length;
    setSubmitting(true);
    try {
      await setDoc(docRef, {
        response:       html,
        plainResponse:  plain.trim(),
        wordCount:      wc,
        lastSaved:      serverTimestamp(),
        submitted:      true,
        submittedAt:    serverTimestamp(),
        isResubmission,
      }, { merge: true });
      setDraftData(prev => ({ ...prev, submitted: true, isResubmission }));
      setIsRevisionMode(false);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Ask Mr. McRae ─────────────────────────────────────────────────────────
  const handleAskSubmit = async () => {
    setAskSending(true);
    try {
      await addDoc(collection(db, 'help_requests'), {
        studentName:    user.displayName,
        studentEmail:   user.email,
        assignmentId,
        assignmentName: assignment.name,
        type:           askType,
        message:        askType === 'answer' ? askMessage.trim() : '',
        timestamp:      serverTimestamp(),
        resolved:       false,
      });
      setAskSent(true);
      setTimeout(() => {
        setAskModal(false); setAskSent(false); setAskMessage(''); setAskType('come');
      }, 1800);
    } finally { setAskSending(false); }
  };

  // ── Update relative time every 10s ───────────────────────────────────────
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  const isClosed   = assignment.isOpen === false;
  const isSubmitted = draftData?.submitted === true;
  const showSuccess = isSubmitted && !isRevisionMode;
  const showEditor  = !showSuccess;

  // Closed assignment — send student back silently
  if (isClosed) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="submission-page">
      {/* Header */}
      <div className="submission-header">
        <button className="btn btn--secondary btn--sm" onClick={() => navigate('/')}>← Back</button>
        <div className="submission-header__info">
          <h1 className="submission-header__title">{assignment.name}</h1>
          {assignment.stream && <span className="submission-header__stream">{assignment.stream}</span>}
        </div>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </div>

      {/* Mobile tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${mobileTab === 'assignment' ? 'active' : ''}`} onClick={() => setMobileTab('assignment')}>Assignment</button>
        <button className={`mobile-tab ${mobileTab === 'work' ? 'active' : ''}`} onClick={() => setMobileTab('work')}>Your Work</button>
      </div>

      {/* Drag blocker: transparent overlay prevents iframe stealing events */}
      {isDragging && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, cursor: 'col-resize' }} />
      )}

      <div ref={splitRef} className="split" style={{ gridTemplateColumns: `${splitPct}% 6px 1fr` }}>
        {/* Left — Google Doc embed or info card */}
        <div className={`split__pane ${mobileTab !== 'assignment' ? 'mobile-hidden' : ''} doc-pane`}>
          {assignment.docUrl ? (
            <>
              <div className="doc-embed-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span className="doc-embed-header__name">{assignment.name}</span>
                  {assignment.stream && <span className="submission-header__stream">{assignment.stream}</span>}
                </div>
                <a href={assignment.docUrl} target="_blank" rel="noreferrer" className="btn btn--secondary btn--sm" style={{ flexShrink: 0 }}>
                  ↗ New tab
                </a>
              </div>
              <iframe src={toEmbedUrl(assignment.docUrl)} className="doc-embed-iframe" title={assignment.name} />
            </>
          ) : (
            <div className="assignment-info-pane">
              <div className="assignment-card">
                <div className="assignment-card__label">Assignment</div>
                <h2 className="assignment-card__name">{assignment.name}</h2>
                {assignment.stream && <span className="badge badge--pending">{assignment.stream}</span>}
                {assignment.description && <p className="assignment-card__desc">{assignment.description}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Drag handle */}
        <div
          className="split__divider"
          onMouseDown={handleDividerMouseDown}
          title="Drag to resize"
        />

        {/* Right — Work pane */}
        <div className={`split__pane split__pane--work ${mobileTab !== 'work' ? 'mobile-hidden' : ''}`}>
          <div className="work-pane">

            {/* Assignment closed */}
            {isClosed && !showSuccess && (
              <div className="submission-success">
                <div className="submission-success__icon" style={{ background: 'rgba(224,92,92,0.15)', color: 'var(--danger)', fontSize: 28 }}>🔒</div>
                <h2>Assignment Closed</h2>
                <p>Mr. McRae has closed this assignment. The doc is still viewable on the left.</p>
              </div>
            )}

            {/* Success / submitted state */}
            {showSuccess && (
              <div className="submission-success">
                <div className="submission-success__icon">✓</div>
                <h2>Submitted</h2>
                <p>Your response has been received. You'll get an email when it's been marked.</p>
                {draftData?.emailSent && draftData?.feedback && (
                  <div className="feedback-box">
                    <div className="feedback-box__label">Feedback</div>
                    {draftData.mark != null && <div className="feedback-box__mark">Mark: <strong>{draftData.mark}</strong></div>}
                    <div className="feedback-box__text" dangerouslySetInnerHTML={{ __html: draftData.feedback }} />
                  </div>
                )}
                
                {/* Read-only view of submitted work */}
                {(draftData?.response || draftData?.plainResponse) && (
                  <div style={{ marginTop: 32, textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Submission</div>
                    <div 
                      className="editor-body" 
                      style={{ minHeight: 'auto', maxHeight: '50vh', overflowY: 'auto', padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'default' }} 
                      dangerouslySetInnerHTML={{ __html: draftData.response || draftData.plainResponse }} 
                    />
                  </div>
                )}

                {!isClosed && (
                  <button className="btn btn--secondary btn--sm" style={{ marginTop: 16 }} onClick={() => setIsRevisionMode(true)}>
                    Submit a revision
                  </button>
                )}
              </div>
            )}

            {/* Editor */}
            {showEditor && !isClosed && (
              <>
                {/* Toolbar */}
                <div className="editor-toolbar">
                  <button className="editor-toolbar__btn editor-toolbar__btn--bold"      onMouseDown={e => { e.preventDefault(); execCmd('bold'); }}          title="Bold">B</button>
                  <button className="editor-toolbar__btn editor-toolbar__btn--italic"    onMouseDown={e => { e.preventDefault(); execCmd('italic'); }}        title="Italic">I</button>
                  <button className="editor-toolbar__btn editor-toolbar__btn--underline" onMouseDown={e => { e.preventDefault(); execCmd('underline'); }}     title="Underline">U</button>
                  <button className="editor-toolbar__btn editor-toolbar__btn--strike"    onMouseDown={e => { e.preventDefault(); execCmd('strikeThrough'); }} title="Strikethrough">S̶</button>
                  <div className="editor-toolbar__divider" />
                  <select className="editor-toolbar__select" defaultValue="" onChange={e => { execCmd('fontSize', e.target.value); e.target.value = ''; }} title="Font size">
                    <option value="" disabled>Size</option>
                    <option value="1">Small</option>
                    <option value="3">Normal</option>
                    <option value="5">Large</option>
                    <option value="7">X-Large</option>
                  </select>
                  <div className="editor-toolbar__divider" />
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyLeft'); }}   title="Left">⬅</button>
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyCenter'); }} title="Center">☰</button>
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyRight'); }}  title="Right">➡</button>
                  <div className="editor-toolbar__divider" />
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }} title="Bullets">• List</button>
                  <div className="editor-toolbar__divider" />
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('undo'); }} title="Undo">↩</button>
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('redo'); }} title="Redo">↪</button>
                </div>

                {/* Editable area */}
                <div
                  ref={editorRef}
                  className="editor-body"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleInput}
                  onPaste={blockPaste}
                  onCopy={blockCopy}
                  onCut={blockCopy}
                  onDrop={blockPaste}
                  onDragOver={blockPaste}
                  data-placeholder="Write your response here…"
                />

                {/* Footer */}
                <div className="work-footer">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="work-charcount">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    <span style={{ fontSize: 11, color: saveStatus === 'saved' ? 'var(--success)' : 'var(--text-dim)' }}>
                      {saveStatus === 'saving' && 'Saving…'}
                      {saveStatus === 'saved'  && `Last saved ${relativeTime(lastSaved)}`}
                      {saveStatus === 'idle'   && lastSaved && `Last saved ${relativeTime(lastSaved)}`}
                    </span>
                    {(isRevisionMode || isResubmission) && (
                      <label className="resubmission-bar__label">
                        <input type="checkbox" checked={isResubmission} onChange={e => setIsResubmission(e.target.checked)} />
                        Resubmission
                      </label>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isRevisionMode && (
                      <button className="btn btn--secondary btn--sm" onClick={() => { setIsRevisionMode(false); setIsResubmission(false); }}>
                        Cancel
                      </button>
                    )}
                    <button className="btn btn--secondary btn--sm" onClick={() => setAskModal(true)}>
                      🙋 Ask Mr. McRae
                    </button>
                    <button className="btn btn--primary" onClick={handleSubmit} disabled={submitting || wordCount === 0}>
                      {submitting ? 'Submitting…' : isRevisionMode ? 'Submit Revision' : 'Submit'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ask Mr. McRae Modal */}
      {askModal && (
        <div className="modal-overlay" onClick={() => setAskModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            {askSent ? (
              <div className="modal-sent">
                <div className="modal-sent__icon">✓</div>
                <p>Mr. McRae has been notified!</p>
              </div>
            ) : (
              <>
                <h3 className="modal-title">Ask Mr. McRae</h3>
                <p className="modal-subtitle">{assignment.name}</p>
                <div className="ask-toggle">
                  <button className={`ask-toggle__btn ${askType === 'come' ? 'active' : ''}`} onClick={() => setAskType('come')}>📍 Come see me</button>
                  <button className={`ask-toggle__btn ${askType === 'answer' ? 'active' : ''}`} onClick={() => setAskType('answer')}>💬 Answer here</button>
                </div>
                {askType === 'answer' && (
                  <textarea className="modal-textarea" value={askMessage} onChange={e => setAskMessage(e.target.value)} placeholder="Type your question…" rows={4} autoFocus />
                )}
                <div className="modal-footer">
                  <button className="btn btn--secondary btn--sm" onClick={() => setAskModal(false)}>Cancel</button>
                  <button className="btn btn--primary btn--sm" onClick={handleAskSubmit} disabled={askSending || (askType === 'answer' && !askMessage.trim())}>
                    {askSending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
