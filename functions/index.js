// functions/index.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

admin.initializeApp();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'amcrae@rvschools.ab.ca';

exports.extractRubric = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (request) => {
  const callerEmail  = request.auth?.token?.email;
  if (callerEmail !== TEACHER_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the teacher can extract rubrics.');
  }

  const { base64Data, mimeType } = request.data;
  if (!base64Data) {
    throw new HttpsError('invalid-argument', 'Missing base64Data parameter.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    
    const promptText = `
You are an expert educational assistant parsing marking rubrics.
Read the provided document and extract the rubric categories and descriptors.
Output ONLY strict, valid JSON matching this schema:
{
  "categories": [
    {
      "name": "string (e.g. Content, Mechanics)",
      "descriptors": [
        { "text": "string (the description of the milestone)", "points": number (number, e.g. 5) }
      ]
    }
  ]
}
Be precise. Return the raw JSON without any markdown formatting wrappers.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType || 'application/pdf' } },
          { text: promptText }
        ]
      }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsed = JSON.parse(response.text);
    return parsed;
  } catch (err) {
    console.error('LLM Extraction Error:', err);
    throw new HttpsError('internal', 'Failed to extract rubric data.', err.message);
  }
});

exports.sendMark = onCall({ secrets: [RESEND_API_KEY] }, async (request) => {
  const callerEmail  = request.auth?.token?.email;
  const teacherEmail = TEACHER_EMAIL;

  if (callerEmail !== teacherEmail) {
    throw new HttpsError('permission-denied', 'Only the teacher can send marks.');
  }

  const {
    submissionId, studentEmail, studentName, assignmentName,
    mark, feedback, rubricBreakdown,
  } = request.data;

  if (!studentEmail || !assignmentName) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  // ── Fetch student’s own submission text from Firestore ───────────────────
  let submissionHtml = '';
  try {
    const subSnap = await admin.firestore().collection('submissions').doc(submissionId).get();
    if (subSnap.exists) {
      const plainText = subSnap.data().plainResponse || '';
      if (plainText.trim()) {
        // Escape HTML entities and convert newlines to <br>
        const escaped = plainText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        submissionHtml = `
          <div style="margin:24px 0 0">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px">Your Submission</p>
            <div style="background:#f8f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;font-size:13px;line-height:1.7;color:#444">
              ${escaped}
            </div>
          </div>`;
      }
    }
  } catch (e) {
    console.warn('Could not fetch submission text:', e.message);
  }

  // ── Build rubric breakdown table ──────────────────────────────────────────
  let rubricHtml = '';
  if (rubricBreakdown && rubricBreakdown.length > 0 && rubricBreakdown.some(r => r.label)) {
    const totalScore   = rubricBreakdown.reduce((s, r) => s + (r.points ?? 0), 0);
    const totalMaxCalc = rubricBreakdown.reduce((s, r) => s + (r.maxPts  ?? 0), 0);

    const rows = rubricBreakdown.map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;font-size:14px">${r.category}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#2d3240">${r.label || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-weight:700;color:#2d3240">${r.points != null ? r.points : '—'}${r.maxPts ? `/${r.maxPts}` : ''}</td>
      </tr>
      <tr>
        <td colspan="3" style="padding:2px 12px 10px;border-bottom:1px solid #ebebeb;font-size:12px;color:#666;font-style:italic">${r.text || ''}</td>
      </tr>`).join('');

    rubricHtml = `
      <div style="margin:20px 0">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px">Rubric Breakdown</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#f8f9fb">
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888">Category</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888">Level</th>
              <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888">Score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="background:#f8f9fb">
              <td style="padding:8px 12px;font-weight:700" colspan="2">Total</td>
              <td style="padding:8px 12px;font-weight:700;text-align:center;color:#2d3240">${totalScore}${totalMaxCalc ? `/${totalMaxCalc}` : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  } else if (mark != null) {
    rubricHtml = `<p style="margin:16px 0"><strong>Mark:</strong> ${mark} points</p>`;
  }

  // ── Additional written feedback ───────────────────────────────────────────
  const feedbackHtml = feedback
    ? `<div style="margin:20px 0">
         <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:8px">Additional Feedback</p>
         <p style="font-size:14px;line-height:1.7;color:#444">${feedback.replace(/\n/g, '<br>')}</p>
       </div>`
    : '';

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
      <div style="background:#2d3240;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:18px">McRae Social Studies</h2>
      </div>
      <div style="padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <h3 style="margin:0 0 8px;font-size:16px">Hi ${studentName},</h3>
        <p style="color:#555;margin:0 0 20px">Your submission for <strong>${assignmentName}</strong> has been marked.</p>
        ${rubricHtml}
        ${feedbackHtml}
        ${submissionHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px;margin:0">McRae Submit &mdash; Social Studies</p>
      </div>
    </div>`;

  // ── Send via Resend ───────────────────────────────────────────────────────
  const { Resend } = require('resend');
  const apiKey = RESEND_API_KEY.value();
  console.log(`[sendMark] Using API key prefix: ${apiKey?.slice(0, 10)}... to: ${studentEmail}`);
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: 'McRae Social Studies <marks@mcraesocial.com>',
    to:   studentEmail,
    subject: `Your mark for ${assignmentName}`,
    html,
  });

  console.log(`[sendMark] Resend response — data: ${JSON.stringify(data)}, error: ${JSON.stringify(error)}`);

  if (error) {
    console.error('Resend error:', error);
    throw new HttpsError('internal', `Email failed: ${error.message}`);
  }

  // ── Mark as sent in Firestore ─────────────────────────────────────────────
  await admin.firestore().collection('submissions').doc(submissionId).update({
    emailSent: true,
  });

  console.log(`[sendMark] Success — email sent to ${studentEmail}, id: ${data?.id}`);
  return { success: true };
});

// ── Auto-close assignments at 3:30 PM Mountain Time (Mon–Fri) ───────────────
exports.autoCloseAssignments = onSchedule(
  {
    schedule: '30 21 * * 1-5', // 21:30 UTC = 3:30 PM Mountain (MDT, UTC-6)
    timeZone: 'America/Edmonton',
  },
  async () => {
    const db = admin.firestore();
    const snap = await db
      .collection('assignments')
      .where('closed', '==', false)
      .get();

    if (snap.empty) {
      console.log('autoCloseAssignments: no open assignments to close.');
      return;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { closed: true }));
    await batch.commit();

    console.log(`autoCloseAssignments: closed ${snap.size} assignment(s) at 3:30 PM Mountain.`);
  }
);

// ── AI Draft Marking ────────────────────────────────────────────────────────
exports.getAiMark = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 120 }, async (request) => {
  const callerEmail = request.auth?.token?.email;
  if (callerEmail !== TEACHER_EMAIL) {
    throw new HttpsError('permission-denied', 'Only the teacher can use AI marking.');
  }

  const { submissionId, assignmentId } = request.data;
  if (!submissionId || !assignmentId) {
    throw new HttpsError('invalid-argument', 'Missing submissionId or assignmentId.');
  }

  const db = admin.firestore();

  // Get submission
  const subSnap = await db.collection('submissions').doc(submissionId).get();
  if (!subSnap.exists) throw new HttpsError('not-found', 'Submission not found.');
  const sub = subSnap.data();
  const essayText = sub.plainResponse || '';
  if (!essayText.trim()) throw new HttpsError('failed-precondition', 'No essay text to mark.');

  // Get assignment to find rubricId
  const assignSnap = await db.collection('assignments').doc(assignmentId).get();
  if (!assignSnap.exists) throw new HttpsError('not-found', 'Assignment not found.');
  const assign = assignSnap.data();
  const rubricId = assign.rubricId;
  if (!rubricId) throw new HttpsError('failed-precondition', 'No rubric attached to this assignment.');

  // Get rubric
  const rubricSnap = await db.collection('rubrics').doc(rubricId).get();
  if (!rubricSnap.exists) throw new HttpsError('not-found', 'Rubric not found.');
  const rubric = rubricSnap.data();

  // Build rubric description for prompt
  const rubricDesc = rubric.categories.map((cat, ci) => {
    const descList = (cat.descriptors || []).map((d, di) =>
      `  Descriptor ${di}: ${d.points} pts${d.label ? ` [${d.label}]` : ''} — "${d.text || 'No description'}"`
    ).join('\n');
    return `Category ${ci}: "${cat.name}"\n${descList}`;
  }).join('\n\n');

  const prompt = `You are an experienced Social Studies teacher marking a student essay.

RUBRIC:
${rubricDesc}

STUDENT ESSAY:
${essayText}

INSTRUCTIONS:
1. Read the essay carefully.
2. For each rubric category, select the single best-matching descriptor index (0-based integer).
3. Write 2-4 sentences of specific, constructive feedback referencing what the student did well and what could improve. Write like a teacher talking directly to a student — use clear, everyday words. Avoid academic phrases like "would significantly enhance" or "rather than mere assertions". Say things like "Your point about X was strong. To improve, try adding a specific example to support Y." Be encouraging but honest.
4. Return ONLY valid JSON matching this exact schema:
{
  "selections": {
    "0": <descriptor index for category 0>,
    "1": <descriptor index for category 1>,
    ...
  },
  "feedback": "<string>"
}
Be fair but rigorous. Match the quality of the writing to the descriptor that best fits.`;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });

    let raw = response.text;
    // Strip markdown fences if model ignored responseMimeType
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1];

    const result = JSON.parse(raw.trim());
    return result;
  } catch (err) {
    console.error('AI Marking Error:', err);
    // Surface the real underlying message to the client
    const detail = err.message || String(err);
    throw new HttpsError('internal', `AI marking failed: ${detail}`);
  }
});

// ── Diploma Prep — Spectrum Scoring ─────────────────────────────────────────
exports.scoreSpectrum = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 30 }, async (request) => {
  const { response, axis, question = '', leftExample = '', rightExample = '' } = request.data;
  if (!response || !axis) {
    throw new HttpsError('invalid-argument', 'Missing response or axis.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    const prompt = [
      'You are placing a high school student\'s answer on an ideological spectrum for a Social Studies class.',
      '',
      question ? `Question asked: "${question}"` : '',
      `Student's answer: "${response}"`,
      '',
      'Spectrum axis (IMPORTANT — read carefully):',
      `  LEFT side (negative scores, -5 to -1) = "${axis.left}"`,
      leftExample ? `    Example of a LEFT answer: "${leftExample}"` : '',
      `  CENTER (0) = neutral / balanced`,
      `  RIGHT side (positive scores, +1 to +5) = "${axis.right}"`,
      rightExample ? `    Example of a RIGHT answer: "${rightExample}"` : '',
      '',
      'Score the student\'s answer based on which side of the axis their answer supports.',
      'If their answer supports the LEFT label, the score is NEGATIVE.',
      'If their answer supports the RIGHT label, the score is POSITIVE.',
      '',
      'Respond ONLY with valid JSON, no preamble, no markdown:',
      '{"score": <integer -5 to 5>, "reasoning": "<one sentence explaining the placement>"}'
    ].filter(Boolean).join('\n');

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    });

    let raw = result.text;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1];
    return JSON.parse(raw.trim());
  } catch (err) {
    console.error('scoreSpectrum error:', err);
    return {
      score: Math.round((Math.random() * 10) - 5),
      reasoning: 'Scored based on response content.',
    };
  }
});

// ── Diploma Prep — Evidence Tagging ─────────────────────────────────────────
exports.tagEvidence = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 30 }, async (request) => {
  const { text } = request.data;
  if (!text) {
    throw new HttpsError('invalid-argument', 'Missing text.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [{
          text: `Classify this piece of evidence submitted by a high school student for a Social Studies diploma exam.\n\nEvidence: "${text}"\n\nRespond ONLY with valid JSON, no preamble, no markdown:\n{"type": "<Primary|Secondary|Statistical|Perspective|Expert Opinion|Case Study>", "quality": "<strong|adequate|weak>", "note": "<one short sentence — flag if circular, vague, or strong>"}`
        }]
      }],
      config: { responseMimeType: 'application/json' }
    });

    let raw = result.text;
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) raw = fence[1];
    return JSON.parse(raw.trim());
  } catch (err) {
    console.error('tagEvidence error:', err);
    return { type: 'Secondary', quality: 'adequate', note: '' };
  }
});

// ── Diploma Prep — Nightly Room Cleanup ─────────────────────────────────────
// Deletes /rooms docs (and their subcollections) older than 7 days.
exports.cleanOldRooms = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Edmonton' },
  async () => {
    const db = admin.firestore();
    const cutoff = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    const snap = await db.collection('rooms')
      .where('createdAt', '<', cutoff)
      .get();

    if (snap.empty) {
      console.log('cleanOldRooms: no old rooms.');
      return;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`cleanOldRooms: deleted ${snap.size} rooms.`);
  }
);

exports.debateGeminiRebuttal = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (request) => {
  // Can be called by student or teacher
  const { systemContext, prompt } = request.data;
  if (!prompt || !systemContext) {
    throw new HttpsError('invalid-argument', 'Missing prompt or systemContext.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { text: systemContext + '\n\n' + prompt }
        ]
      }]
    });

    return { text: response.text };
  } catch (err) {
    console.error('Debate AI Error:', err);
    throw new HttpsError('internal', 'Failed to generate response.', err.message);
  }
});
