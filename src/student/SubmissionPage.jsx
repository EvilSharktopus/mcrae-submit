// src/student/SubmissionPage.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import '../styles/submission.css';

function makeEmbedUrl(url) {
  // Convert Google Doc view URL to embed URL
  return url.replace('/edit', '/preview').replace(/\?.*$/, '');
}

export default function SubmissionPage() {
  const { assignmentId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [existingSub, setExistingSub] = useState(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileTab, setMobileTab] = useState('assignment'); // 'assignment' | 'work'

  useEffect(() => {
    async function load() {
      const [aDoc, sSnap] = await Promise.all([
        getDoc(doc(db, 'assignments', assignmentId)),
        getDocs(query(collection(db, 'submissions'), where('assignmentId', '==', assignmentId), where('studentEmail', '==', user.email))),
      ]);
      if (!aDoc.exists()) { navigate('/'); return; }
      setAssignment({ id: aDoc.id, ...aDoc.data() });
      if (!sSnap.empty) {
        const s = sSnap.docs[0].data();
        setExistingSub(s);
        setResponse(s.response || '');
      }
      setLoading(false);
    }
    load();
  }, [assignmentId, user.email, navigate]);

  const blockPaste = (e) => e.preventDefault();
  const blockCopy = (e) => e.preventDefault();

  const handleSubmit = async () => {
    if (!response.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'submissions'), {
        studentName: user.displayName,
        studentEmail: user.email,
        assignmentId,
        response: response.trim(),
        timestamp: serverTimestamp(),
        mark: null,
        feedback: null,
        emailSent: false,
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="loading-screen"><span className="spinner" /></div>;

  const isAlreadySubmitted = !!existingSub;
  const showSuccess = submitted || isAlreadySubmitted;

  const embedUrl = makeEmbedUrl(assignment.docUrl || '');

  return (
    <div className="submission-page">
      <div className="submission-header">
        <button className="btn btn--secondary btn--sm" onClick={() => navigate('/')}>
          ← Back
        </button>
        <div className="submission-header__info">
          <h1 className="submission-header__title">{assignment.name}</h1>
          {assignment.stream && <span className="submission-header__stream">{assignment.stream}</span>}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mobile-tabs">
        <button className={`mobile-tab ${mobileTab === 'assignment' ? 'active' : ''}`} onClick={() => setMobileTab('assignment')}>Assignment</button>
        <button className={`mobile-tab ${mobileTab === 'work' ? 'active' : ''}`} onClick={() => setMobileTab('work')}>Your Work</button>
      </div>

      <div className="split">
        {/* Left pane — Doc */}
        <div className={`split__pane ${mobileTab !== 'assignment' ? 'mobile-hidden' : ''}`}>
          <iframe
            src={embedUrl}
            title="Assignment"
            className="doc-embed"
            allowFullScreen
          />
        </div>

        {/* Right pane — Submission */}
        <div className={`split__pane split__pane--work ${mobileTab !== 'work' ? 'mobile-hidden' : ''}`}>
          <div className="work-pane">
            {showSuccess ? (
              <div className="submission-success">
                <div className="submission-success__icon">✓</div>
                <h2>Submitted</h2>
                <p>Your response has been received. You'll get an email when it's been marked.</p>
                {existingSub?.emailSent && existingSub?.feedback && (
                  <div className="feedback-box">
                    <div className="feedback-box__label">Feedback</div>
                    <div className="feedback-box__mark">Mark: <strong>{existingSub.mark}</strong></div>
                    <p className="feedback-box__text">{existingSub.feedback}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <label className="work-label">Your Response</label>
                <p className="work-hint">Type your response below. Copy/paste is disabled.</p>
                <textarea
                  className="work-textarea"
                  value={response}
                  onChange={e => setResponse(e.target.value)}
                  onPaste={blockPaste}
                  onCopy={blockCopy}
                  onCut={blockCopy}
                  placeholder="Write your response here..."
                  rows={16}
                />
                <div className="work-footer">
                  <span className="work-charcount">{response.trim().split(/\s+/).filter(Boolean).length} words</span>
                  <button
                    className="btn btn--primary"
                    onClick={handleSubmit}
                    disabled={submitting || !response.trim()}
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
