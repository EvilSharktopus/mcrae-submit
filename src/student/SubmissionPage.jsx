// src/student/SubmissionPage.jsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, addDoc, query, where, onSnapshot
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../auth/ThemeContext';
import DOMPurify from 'dompurify';
import { isPastCutoff, msUntilCutoff } from '../utils/cutoff';
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
  const [rubric,         setRubric]         = useState(null);
  const [showRubric,     setShowRubric]     = useState(false);
  const [draftData,      setDraftData]      = useState(null);   // existing Firestore doc
  const [loading,        setLoading]        = useState(true);
  const [mobileTab,      setMobileTab]      = useState('assignment');
  const [wordCount,      setWordCount]      = useState(0);
  const [saveStatus,     setSaveStatus]     = useState('idle'); // 'idle'|'saving'|'saved'
  const [lastSaved,      setLastSaved]      = useState(null);   // Date object
  const [isRevisionMode, setIsRevisionMode] = useState(false);
  const [isResubmission, setIsResubmission] = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);

  // Ask Mr. McRae modal
  const [askModal,   setAskModal]   = useState(false);
  const [askType,    setAskType]    = useState('come');
  const [askMessage,  setAskMessage]  = useState('');
  const [askSending,  setAskSending]  = useState(false);
  const [askSent,     setAskSent]     = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  const [teacherReplies, setTeacherReplies] = useState([]);

  const editorRef           = useRef(null);
  const keystrokeCount      = useRef(0);
  const firstKeystroke      = useRef(null);
  const accumulatedActiveMS = useRef(0);
  const lastFocusTime       = useRef(Date.now());
  const sessionLog          = useRef([]);
  const lastTrustedKey      = useRef(Date.now());
  const anomalies           = useRef(new Set());
  const velocityCheck       = useRef([]);
  const initialContentSet   = useRef(false);
  const saveTimer           = useRef(null);
  const splitRef          = useRef(null);
  const isDraggingRef     = useRef(false);
  const [splitPct,     setSplitPct]     = useState(40);
  const [isDragging,   setIsDragging]   = useState(false);
  const [isListening,  setIsListening]  = useState(false);
  const recognitionRef = useRef(null);
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

  // ── Session tracking (focus/blur) ────────────────────────────────────────
  useEffect(() => {
    const onFocus = () => {
      if (!lastFocusTime.current) lastFocusTime.current = Date.now();
      sessionLog.current.push({ type: 'focus', time: Date.now() });
    };
    const onBlur = () => {
      if (lastFocusTime.current) {
        accumulatedActiveMS.current += (Date.now() - lastFocusTime.current);
        lastFocusTime.current = null;
      }
      sessionLog.current.push({ type: 'blur', time: Date.now() });
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      if (lastFocusTime.current) {
        accumulatedActiveMS.current += (Date.now() - lastFocusTime.current);
      }
    };
  }, []);

  // ── Load assignment + existing draft ─────────────────────────────────────
  useEffect(() => {
    let unsubAssign;
    async function load() {
      try {
        const subSnap = await getDoc(docRef);

        unsubAssign = onSnapshot(doc(db, 'assignments', assignmentId), aDoc => {
          const aData = { id: aDoc.id, ...aDoc.data() };
          setAssignment(aData);
          setLoading(false);
          // Fetch rubric once if assignment has one
          if (aData.rubricId && !rubric) {
            getDoc(doc(db, 'rubrics', aData.rubricId))
              .then(rSnap => { if (rSnap.exists()) setRubric(rSnap.data()); })
              .catch(() => {});
          }
        });

        if (subSnap.exists()) {
          setDraftData(subSnap.data());
        } else {
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
        setLoading(false);
      }
    }
    load();
    return () => { if (unsubAssign) unsubAssign(); };
  }, [assignmentId, user.email]);

  // ── Listen for teacher replies & active requests ─────────────────────────
  useEffect(() => {
    if (!user || !assignmentId) return;
    const q = query(
      collection(db, 'help_requests'),
      where('studentEmail', '==', user.email)
    );
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.assignmentId === assignmentId); // filter client-side
      setActiveRequest(all.find(r => !r.resolved) || null);
      
      const msgs = all
        .filter(r => r.resolved && r.reply?.trim() && !r.dismissed)
        .sort((a,b) => (b.timestamp?.seconds||0) - (a.timestamp?.seconds||0));
      setTeacherReplies(msgs);
    }, err => {
      console.error('Error listening to help requests:', err);
    });
    return () => unsub();
  }, [user.email, assignmentId]);

  const dismissReply = async (id) => {
    try { await updateDoc(doc(db, 'help_requests', id), { dismissed: true }); } catch (err) {}
  };

  // ── Populate editor once data is loaded ──────────────────────────────────
  useEffect(() => {
    if (loading || !editorRef.current || initialContentSet.current) return;
    initialContentSet.current = true;
    if (draftData?.response) {
      editorRef.current.innerHTML = draftData.response;
    }
    updateWordCount();
    if (draftData?.lastSaved?.toDate) setLastSaved(draftData.lastSaved.toDate());
    
    // Initialize tracking from existing draft
    if (draftData?.integrityLog) {
      keystrokeCount.current = draftData.integrityLog.keystrokes || 0;
      accumulatedActiveMS.current = (draftData.integrityLog.activeTimeSeconds || 0) * 1000;
      firstKeystroke.current = draftData.integrityLog.firstKeystroke || null;
      sessionLog.current = draftData.integrityLog.sessionLog || [];
      if (draftData.integrityLog.anomalies) {
        draftData.integrityLog.anomalies.forEach(a => anomalies.current.add(a));
      }
    }
    sessionLog.current.push({ type: 'open', time: Date.now() });
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

  // ── Integrity Calculation ────────────────────────────────────────────────
  const calculateIntegrity = (wc, isSubmit = false) => {
    let currentActive = accumulatedActiveMS.current;
    if (lastFocusTime.current) {
      currentActive += (Date.now() - lastFocusTime.current);
    }
    
    let wpm = 0;
    if (firstKeystroke.current) {
      const elapsedMinutes = (Date.now() - firstKeystroke.current) / 60000;
      if (elapsedMinutes > 0) {
        wpm = Math.round(wc / elapsedMinutes);
      }
    }

    if (isSubmit) {
      sessionLog.current.push({ type: 'submit', time: Date.now() });
    }

    return {
      keystrokes: keystrokeCount.current,
      activeTimeSeconds: Math.round(currentActive / 1000),
      firstKeystroke: firstKeystroke.current,
      wpm,
      anomalies: Array.from(anomalies.current),
      sessionLog: sessionLog.current
    };
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
      
      const integrityLog = calculateIntegrity(wc);

      try {
        await setDoc(docRef, {
          response:      html,
          plainResponse: plain.trim(),
          wordCount:     wc,
          integrityLog,
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

  // ── Immediate save (no debounce) — used by cutoff kickout ─────────────────
  const saveNow = useCallback(async () => {
    if (!editorRef.current) return;
    clearTimeout(saveTimer.current);
    const html  = editorRef.current.innerHTML;
    const plain = editorRef.current.innerText || '';
    const wc    = plain.trim().split(/\s+/).filter(Boolean).length;
    try {
      await setDoc(docRef, {
        response: html, plainResponse: plain.trim(), wordCount: wc,
        lastSaved: serverTimestamp(),
      }, { merge: true });
      setSaveStatus('saved');
      setLastSaved(new Date());
    } catch (err) { console.error('Force save failed:', err); }
  }, [assignmentId, user.email]);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '\u00a0\u00a0\u00a0\u00a0');
    }
    if (e.isTrusted) {
      if (!firstKeystroke.current) firstKeystroke.current = Date.now();
      keystrokeCount.current += 1;
      lastTrustedKey.current = Date.now();
    }
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const plain = editorRef.current.innerText || '';
    const wc    = plain.trim().split(/\s+/).filter(Boolean).length;
    
    const previousWc = wordCount;
    const wordDelta = wc - previousWc;
    
    setWordCount(wc);

    const now = Date.now();
    
    // Academic Integrity: Injection check (allow 1000ms grace period)
    // Ignore small word deltas to allow for native spellcheck/autocorrect replacements
    if (!isListening && now - lastTrustedKey.current > 1000 && wordDelta > 3) {
      anomalies.current.add('Programmatic injection detected');
    }

    // Academic Integrity: Velocity check
    velocityCheck.current.push({ wc, time: now });
    // Keep only last ~3.5s of history to detect >50 words in 3s
    while (velocityCheck.current.length > 0 && now - velocityCheck.current[0].time > 3500) {
      velocityCheck.current.shift();
    }
    if (velocityCheck.current.length > 0) {
      const oldest = velocityCheck.current[0];
      if (wc - oldest.wc >= 50) {
        anomalies.current.add('High velocity input (>50 words in 3s)');
      }
    }

    scheduleSave();
  };

  // ── Paste/drop prevention ─────────────────────────────────────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const stopPaste = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const stopDrop  = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const stopCopy  = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    el.addEventListener('paste',       stopPaste, { capture: true });
    el.addEventListener('drop',        stopDrop,  { capture: true });
    el.addEventListener('copy',        stopCopy,  { capture: true });
    el.addEventListener('cut',         stopCopy,  { capture: true });
    return () => {
      el.removeEventListener('paste',       stopPaste, { capture: true });
      el.removeEventListener('drop',        stopDrop,  { capture: true });
      el.removeEventListener('copy',        stopCopy,  { capture: true });
      el.removeEventListener('cut',         stopCopy,  { capture: true });
    };
  }, [loading]);

  const blockPaste = (e) => { e.preventDefault(); e.stopPropagation(); };
  const blockCopy  = (e) => { e.preventDefault(); e.stopPropagation(); };

  const execCmd = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
  };

  // ── Speech-to-text ───────────────────────────────────────────────────────
  const toggleListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser. Try Chrome or Edge.'); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SR();
    rec.lang = 'en-CA';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .slice(e.resultIndex)
        .filter(r => r.isFinal)
        .map(r => r[0].transcript)
        .join(' ');
      if (!transcript) return;

      // Insert at current cursor position in the editor
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        // Add a space before if cursor isn't at start
        const text = document.createTextNode(
          (range.startOffset > 0 ? ' ' : '') + transcript
        );
        range.insertNode(text);
        range.setStartAfter(text);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Fallback: append to end
        document.execCommand('insertText', false, ' ' + transcript);
      }
      handleInput();
    };

    rec.onerror = (e) => {
      if (e.error !== 'aborted') console.error('Speech error:', e.error);
    };

    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Force a save first, then flag as submitted
    if (!editorRef.current) return;
    const html  = editorRef.current.innerHTML;
    const plain = editorRef.current.innerText || '';
    if (!plain.trim()) return;
    const wc = plain.trim().split(/\s+/).filter(Boolean).length;
    
    const integrityLog = calculateIntegrity(wc, true);

    setSubmitting(true);
    try {
      await setDoc(docRef, {
        response:       html,
        plainResponse:  plain.trim(),
        wordCount:      wc,
        integrityLog,
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

  // ── Unsubmit (revert to draft before marking) ──────────────────────────────
  const handleUnsubmit = async () => {
    try {
      await updateDoc(docRef, { submitted: false, submittedAt: null });
      // Reset the guard so the content useEffect re-populates the editor
      // after React re-renders and puts the editor back in the DOM
      initialContentSet.current = false;
      setDraftData(prev => ({ ...prev, submitted: false, submittedAt: null }));
    } catch (err) {
      console.error('Unsubmit failed:', err);
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

  // ── Kick students out at cutoff — save first ─────────────────────────────
  useEffect(() => {
    if (loading) return;
    const ms = msUntilCutoff();
    if (ms <= 0) return; // already past cutoff — render block handles it
    const id = setTimeout(async () => {
      await saveNow();
      sessionStorage.setItem('cutoffKickout', '1');
      navigate('/', { replace: true });
    }, ms);
    return () => clearTimeout(id);
  }, [loading]);

  // ── Update relative time every 10s ───────────────────────────────────────
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  const isClosed   = assignment.isOpen === false || isPastCutoff();
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {showEditor && !isClosed && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              {saveStatus === 'saving' && '💾 Saving…'}
              {saveStatus === 'saved'  && `✓ Saved ${relativeTime(lastSaved)}`}
              {saveStatus === 'idle'   && lastSaved && `✓ Saved ${relativeTime(lastSaved)}`}
            </span>
          )}
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
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
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {rubric && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => setShowRubric(r => !r)}
                    >
                      {showRubric ? '← Assignment' : '📋 See Rubric'}
                    </button>
                  )}
                  <a href={assignment.docUrl} target="_blank" rel="noreferrer" className="btn btn--secondary btn--sm" style={{ flexShrink: 0 }}>
                    ↗ New tab
                  </a>
                </div>
              </div>
              {showRubric && rubric ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                  {rubric.categories?.map((cat, ci) => (
                    <div key={ci} style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--text)' }}>{cat.name}</div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        {(cat.descriptors || []).map((d, di) => (
                          <div
                            key={di}
                            style={{
                              padding: '8px 14px',
                              borderBottom: di < cat.descriptors.length - 1 ? '1px solid var(--border)' : 'none',
                              background: 'var(--bg-card)',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
                            }}
                          >
                            <span style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>{d.studentText || d.text || '—'}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                              {d.label ? `${d.label} · ` : ''}{d.points != null ? `${d.points} pts` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <iframe src={toEmbedUrl(assignment.docUrl)} className="doc-embed-iframe" title={assignment.name} />
              )}
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

            {/* Teacher Replies */}
            {teacherReplies.length > 0 && (
              <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teacherReplies.map(reply => (
                  <div key={reply.id} style={{ 
                    background: 'var(--bg-input)', border: '1px solid var(--primary)', 
                    borderRadius: 8, padding: '12px 16px', position: 'relative'
                  }}>
                    <button 
                      onClick={() => dismissReply(reply.id)} 
                      style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}
                      title="Dismiss"
                    >×</button>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Mr. McRae replied
                    </div>
                    {reply.message && (
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6, fontStyle: 'italic' }}>
                        "{reply.message}"
                      </div>
                    )}
                    <div style={{ fontSize: 14, color: 'var(--text)' }}>
                      {reply.reply}
                    </div>
                  </div>
                ))}
              </div>
            )}

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

                {/* Action buttons — kept at top so they're always visible */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                  {!draftData?.emailSent && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={handleUnsubmit}
                    >
                      Edit Submission
                    </button>
                  )}
                  {draftData?.emailSent && !isClosed && (
                    <button
                      className="btn btn--secondary btn--sm"
                      onClick={() => setIsRevisionMode(true)}
                    >
                      Revise Marked Submission
                    </button>
                  )}
                </div>
                {draftData?.emailSent && draftData?.feedback && (
                  <div className="feedback-box">
                    <div className="feedback-box__label">Feedback</div>
                    {draftData.mark != null && <div className="feedback-box__mark">Mark: <strong>{draftData.mark}</strong></div>}
                    <div className="feedback-box__text" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draftData.feedback) }} />
                  </div>
                )}
                
                {/* Read-only view of submitted work */}
                {(draftData?.response || draftData?.plainResponse) && (
                  <div style={{ marginTop: 32, textAlign: 'left' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Submission</div>
                    <div 
                      className="editor-body" 
                      style={{ minHeight: 'auto', maxHeight: '50vh', overflowY: 'auto', padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'default' }} 
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draftData.response || draftData.plainResponse) }} 
                    />
                  </div>
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
                  <div className="editor-toolbar__divider" />
                  <button
                    className={`editor-toolbar__btn ${isListening ? 'editor-toolbar__btn--mic-active' : ''}`}
                    onMouseDown={e => { e.preventDefault(); toggleListening(); }}
                    title={isListening ? 'Stop dictating' : 'Dictate (speech to text)'}
                    style={{ minWidth: 36 }}
                  >
                    {isListening ? '🔴' : '🎤'}
                  </button>

                  <div className="editor-toolbar__divider" />
                  <button
                    className="editor-toolbar__btn"
                    style={{ fontSize: 11, color: 'var(--text-dim)' }}
                    onMouseDown={e => {
                      e.preventDefault();
                      alert("Spellcheck not working?\n\nBecause this editor blocks external extensions like Grammarly to maintain academic integrity, you must use your computer's built-in spellcheck.\n\n• On Chrome: Go to Settings -> Languages -> Spell check and turn it ON.\n• On Mac (Safari): Go to System Settings -> Keyboard -> Text Input and turn 'Correct spelling automatically' ON.");
                    }}
                    title="How to fix spellcheck"
                  >
                    ❓ Spellcheck broken?
                  </button>
                </div>

                {/* Editable area */}
                <div
                  ref={editorRef}
                  className="editor-body"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck="true"
                  autoComplete="off"
                  autoCorrect="on"
                  autoCapitalize="on"
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                  onKeyDown={handleKeyDown}
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
                    <button className="btn btn--primary" onClick={() => setShowConfirm(true)} disabled={submitting || wordCount === 0}>
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
            ) : activeRequest ? (
              <div className="modal-sent">
                <div className="modal-sent__icon" style={{ background: '#fef3c7', color: '#d97706' }}>🕒</div>
                <h3 style={{ margin: '16px 0 8px' }}>Hold tight!</h3>
                <p>Mr. McRae has received your request and will get to you soon.</p>
                <div className="modal-footer" style={{ marginTop: 24, justifyContent: 'center' }}>
                  <button className="btn btn--secondary btn--sm" onClick={() => setAskModal(false)}>Close</button>
                </div>
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

      {/* Confirm Submit Modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Submit this assignment?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '8px 0 0' }}>
              You can still edit your submission until the assignment is closed. Once it's closed, your work will be marked as-is.
            </p>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn--secondary btn--sm" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => { setShowConfirm(false); handleSubmit(); }}
                disabled={submitting}
              >
                {submitting ? 'Submitting…' : 'Yes, submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
