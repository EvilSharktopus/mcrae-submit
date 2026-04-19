// src/student/SubmissionPage.jsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  collection, addDoc, getDocs, query, where,
  serverTimestamp, doc, getDoc, setDoc,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../auth/ThemeContext';
import '../styles/submission.css';

function draftKey(assignmentId, email) {
  return `mcrae_draft_${assignmentId}__${email}`;
}

export default function SubmissionPage() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [assignment, setAssignment]   = useState(null);
  const [existingSub, setExistingSub] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [loading, setLoading]         = useState(true);
  const [mobileTab, setMobileTab]     = useState('assignment');
  const [wordCount, setWordCount]     = useState(0);
  const [draftSaved, setDraftSaved]   = useState(false);

  // Resubmission
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const [isResubmission, setIsResubmission] = useState(false);

  // Ask Mr. McRae modal
  const [askModal, setAskModal]   = useState(false);
  const [askType, setAskType]     = useState('come');
  const [askMessage, setAskMessage] = useState('');
  const [askSending, setAskSending] = useState(false);
  const [askSent, setAskSent]     = useState(false);

  const editorRef          = useRef(null);
  const initialContentSet  = useRef(false);
  const draftTimer         = useRef(null);

  // ── Load assignment + existing submission ──────────────────────────────────
  useEffect(() => {
    async function load() {
      const [aDoc, sSnap] = await Promise.all([
        getDoc(doc(db, 'assignments', assignmentId)),
        getDocs(query(
          collection(db, 'submissions'),
          where('assignmentId', '==', assignmentId),
          where('studentEmail', '==', user.email),
        )),
      ]);
      if (!aDoc.exists()) { navigate('/'); return; }
      const a = { id: aDoc.id, ...aDoc.data() };
      setAssignment(a);
      // Track access (upsert, no duplicates)
      setDoc(
        doc(db, 'accesses', `${assignmentId}__${user.email}`),
        { assignmentId, studentName: user.displayName, studentEmail: user.email, lastOpened: serverTimestamp() },
        { merge: true },
      );
      if (!sSnap.empty) setExistingSub(sSnap.docs[0].data());
      setLoading(false);
    }
    load();
  }, [assignmentId, user.email, navigate]);

  // ── Populate editor once data loads ───────────────────────────────────────
  useEffect(() => {
    if (loading || !editorRef.current || initialContentSet.current) return;
    initialContentSet.current = true;

    if (existingSub?.response) {
      // Already submitted — show the previous response in read-only look
      // (editor is hidden in showSuccess state; this sets up revision mode)
      editorRef.current.innerHTML = existingSub.response;
    } else {
      // Check localStorage for an in-progress draft
      const draft = localStorage.getItem(draftKey(assignmentId, user.email));
      if (draft) editorRef.current.innerHTML = draft;
    }
    updateWordCount();
  }, [loading, existingSub]);

  // ── When entering revision mode, pre-load previous response ───────────────
  useEffect(() => {
    if (isRevisionMode && editorRef.current && existingSub?.response) {
      editorRef.current.innerHTML = existingSub.response;
      setIsResubmission(true);
      updateWordCount();
      editorRef.current.focus();
    }
  }, [isRevisionMode]);

  // ── Word count + draft auto-save ──────────────────────────────────────────
  const updateWordCount = () => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    setWordCount(text.trim().split(/\s+/).filter(Boolean).length);
  };

  const handleInput = () => {
    updateWordCount();
    // Debounced draft save (1 second after last keystroke)
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      if (editorRef.current) {
        localStorage.setItem(draftKey(assignmentId, user.email), editorRef.current.innerHTML);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      }
    }, 1000);
  };

  // ── Bulletproof paste / drop prevention ──────────────────────────────────
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
    const html  = editorRef.current?.innerHTML || '';
    const plain = editorRef.current?.innerText  || '';
    if (!plain.trim()) return;
    const wc = plain.trim().split(/\s+/).filter(Boolean).length;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'submissions'), {
        studentName:    user.displayName,
        studentEmail:   user.email,
        assignmentId,
        response:       html,
        plainResponse:  plain.trim(),
        wordCount:      wc,
        isResubmission,
        timestamp:      serverTimestamp(),
        mark:           null,
        feedback:       null,
        emailSent:      false,
      });
      // Clear draft now that it's submitted
      localStorage.removeItem(draftKey(assignmentId, user.email));
      setSubmitted(true);
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
        setAskModal(false);
        setAskSent(false);
        setAskMessage('');
        setAskType('come');
      }, 1800);
    } finally {
      setAskSending(false);
    }
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  const isClosed          = assignment.isOpen === false;
  const isAlreadySubmitted = !!existingSub && !isRevisionMode;
  const showSuccess        = (submitted && !isRevisionMode) || isAlreadySubmitted;
  const showEditor         = !showSuccess;

  return (
    <div className="submission-page">
      {/* Header */}
      <div className="submission-header">
        <button className="btn btn--secondary btn--sm" onClick={() => navigate('/')}>← Back</button>
        <div className="submission-header__info">
          <h1 className="submission-header__title">{assignment.name}</h1>
          {assignment.stream && <span className="submission-header__stream">{assignment.stream}</span>}
          {isClosed && <span className="submission-header__closed">Closed</span>}
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

      <div className="split">
        {/* Left — Assignment info */}
        <div className={`split__pane assignment-info-pane ${mobileTab !== 'assignment' ? 'mobile-hidden' : ''}`}>
          <div className="assignment-card">
            <div className="assignment-card__label">Assignment</div>
            <h2 className="assignment-card__name">{assignment.name}</h2>
            {assignment.stream && <span className="badge badge--pending">{assignment.stream}</span>}
            {assignment.description && <p className="assignment-card__desc">{assignment.description}</p>}
            {assignment.docUrl && (
              <a href={assignment.docUrl} target="_blank" rel="noreferrer" className="assignment-card__link">
                View Assignment Doc →
              </a>
            )}
          </div>
        </div>

        {/* Right — Work pane */}
        <div className={`split__pane split__pane--work ${mobileTab !== 'work' ? 'mobile-hidden' : ''}`}>
          <div className="work-pane">

            {/* ── Assignment closed ── */}
            {isClosed && !showSuccess && (
              <div className="submission-success">
                <div className="submission-success__icon" style={{ background: 'rgba(224,92,92,0.15)', color: 'var(--danger)', fontSize: 28 }}>🔒</div>
                <h2>Assignment Closed</h2>
                <p>Mr. McRae has closed this assignment. You can still view the assignment doc using the link on the left.</p>
              </div>
            )}

            {/* ── Already submitted / success ── */}
            {showSuccess && (
              <div className="submission-success">
                <div className="submission-success__icon">✓</div>
                <h2>Submitted</h2>
                <p>Your response has been received. You'll get an email when it's been marked.</p>
                {existingSub?.emailSent && existingSub?.feedback && (
                  <div className="feedback-box">
                    <div className="feedback-box__label">Feedback</div>
                    <div className="feedback-box__mark">Mark: <strong>{existingSub.mark}</strong></div>
                    <div className="feedback-box__text" dangerouslySetInnerHTML={{ __html: existingSub.feedback }} />
                  </div>
                )}
                {!isClosed && (
                  <button
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: 16 }}
                    onClick={() => setIsRevisionMode(true)}
                  >
                    Submit a revision
                  </button>
                )}
              </div>
            )}

            {/* ── Editor (new submission or revision) ── */}
            {showEditor && !isClosed && (
              <>
                {/* Resubmission flag */}
                {(isRevisionMode || existingSub) && (
                  <div className="resubmission-bar">
                    <label className="resubmission-bar__label">
                      <input
                        type="checkbox"
                        checked={isResubmission}
                        onChange={e => setIsResubmission(e.target.checked)}
                      />
                      This is a revision / resubmission
                    </label>
                  </div>
                )}

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
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyLeft'); }}    title="Align left">⬅</button>
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyCenter'); }}  title="Align center">☰</button>
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('justifyRight'); }}   title="Align right">➡</button>
                  <div className="editor-toolbar__divider" />
                  <button className="editor-toolbar__btn" onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }} title="Bullet list">• List</button>
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="work-charcount">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                    {draftSaved && <span style={{ fontSize: 11, color: 'var(--success)' }}>Draft saved</span>}
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
                    <button
                      className="btn btn--primary"
                      onClick={handleSubmit}
                      disabled={submitting || wordCount === 0}
                    >
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
                  <textarea
                    className="modal-textarea"
                    value={askMessage}
                    onChange={e => setAskMessage(e.target.value)}
                    placeholder="Type your question for Mr. McRae…"
                    rows={4}
                    autoFocus
                  />
                )}
                <div className="modal-footer">
                  <button className="btn btn--secondary btn--sm" onClick={() => setAskModal(false)}>Cancel</button>
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={handleAskSubmit}
                    disabled={askSending || (askType === 'answer' && !askMessage.trim())}
                  >
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
