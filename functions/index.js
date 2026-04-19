// functions/index.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
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
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px;margin:0">McRae Submit &mdash; Social Studies</p>
      </div>
    </div>`;

  // ── Send via Resend ───────────────────────────────────────────────────────
  const { Resend } = require('resend');
  const resend = new Resend(RESEND_API_KEY.value());

  const { error } = await resend.emails.send({
    from: 'McRae Social Studies <marks@mcraesocial.com>',
    to:   studentEmail,
    subject: `Your mark for ${assignmentName}`,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    throw new HttpsError('internal', `Email failed: ${error.message}`);
  }

  // ── Mark as sent in Firestore ─────────────────────────────────────────────
  await admin.firestore().collection('submissions').doc(submissionId).update({
    emailSent: true,
  });

  return { success: true };
});
