// src/teacher/MarkingView.jsx
import { useState } from 'react';
import { db, functions } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import '../styles/marking.css';

export default function MarkingView({ submission, assignment, rubric, onClose }) {
  // selections: { [categoryIndex]: { descriptorIndex, points } }
  const [selections, setSelections] = useState({});
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(submission.emailSent || false);

  const totalMark = Object.values(selections).reduce((sum, s) => sum + (s?.points || 0), 0);

  const selectDescriptor = (catIdx, descIdx, points) => {
    setSelections(prev => {
      if (prev[catIdx]?.descriptorIndex === descIdx) {
        const next = { ...prev };
        delete next[catIdx];
        return next;
      }
      return { ...prev, [catIdx]: { descriptorIndex: descIdx, points } };
    });
  };

  const handleSendMark = async () => {
    if (!rubric && !feedback.trim()) return;
    setSending(true);
    try {
      const mark = rubric ? totalMark : null;
      // Save mark + feedback to Firestore
      await updateDoc(doc(db, 'submissions', submission.id), {
        mark,
        feedback: feedback.trim(),
      });

      // Call Cloud Function to send email
      const sendMark = httpsCallable(functions, 'sendMark');
      await sendMark({
        submissionId: submission.id,
        studentEmail: submission.studentEmail,
        studentName: submission.studentName,
        assignmentName: assignment.name,
        mark,
        feedback: feedback.trim(),
      });

      await updateDoc(doc(db, 'submissions', submission.id), { emailSent: true });
      setSent(true);
    } catch (err) {
      console.error('Error sending mark:', err);
      alert('Error sending mark. Check console for details.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="marking-page">
      <div className="marking-header">
        <button className="btn btn--secondary btn--sm" onClick={onClose}>← Back</button>
        <div>
          <div className="marking-header__title">{submission.studentName}</div>
          <div className="marking-header__sub">{assignment?.name} · {submission.studentEmail}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {sent && <span className="badge badge--sent">Email Sent</span>}
          <button
            className="btn btn--success"
            onClick={handleSendMark}
            disabled={sending || sent}
          >
            {sent ? '✓ Sent' : sending ? 'Sending...' : 'Send Mark'}
          </button>
        </div>
      </div>

      <div className="marking-split">
        {/* Left — Student response */}
        <div className="marking-pane">
          <div className="marking-pane__label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Student Response
            {submission.wordCount != null && (
              <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(123,143,181,0.2)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 20 }}>
                {submission.wordCount} words
              </span>
            )}
          </div>
          <div
            className="marking-response"
            dangerouslySetInnerHTML={{ __html: submission.response }}
          />
        </div>

        {/* Right — Rubric + feedback */}
        <div className="marking-pane">
          {rubric ? (
            <>
              <div className="marking-pane__label">
                Rubric — <span className="marking-total">{totalMark} pts</span>
              </div>
              <div className="rubric-categories">
                {rubric.categories?.map((cat, catIdx) => (
                  <div key={catIdx} className="rubric-category">
                    <div className="rubric-category__name">
                      {cat.name}
                      {selections[catIdx] != null && (
                        <span className="rubric-category__points">+{selections[catIdx].points}</span>
                      )}
                    </div>
                    <div className="rubric-descriptors">
                      {cat.descriptors?.map((desc, descIdx) => (
                        <button
                          key={descIdx}
                          className={`rubric-descriptor ${selections[catIdx]?.descriptorIndex === descIdx ? 'selected' : ''}`}
                          onClick={() => selectDescriptor(catIdx, descIdx, desc.points)}
                        >
                          <span className="rubric-descriptor__points">{desc.points}</span>
                          <span className="rubric-descriptor__text">{desc.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="marking-pane__label">No rubric attached</div>
          )}

          <div className="marking-pane__label" style={{ marginTop: 16 }}>Feedback</div>
          <textarea
            className="marking-feedback"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Write feedback for the student..."
            rows={6}
            disabled={sent}
          />
        </div>
      </div>
    </div>
  );
}
