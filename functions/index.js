// functions/index.js
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const GMAIL_USER = defineSecret('GMAIL_USER');
const GMAIL_PASS = defineSecret('GMAIL_PASS');

exports.sendMark = onCall({ secrets: [GMAIL_USER, GMAIL_PASS] }, async (request) => {
  // Only the teacher can call this (enforce via auth check)
  const callerEmail = request.auth?.token?.email;
  const teacherEmail = process.env.TEACHER_EMAIL || 'amcrae@rvschools.ab.ca';

  if (callerEmail !== teacherEmail) {
    throw new HttpsError('permission-denied', 'Only the teacher can send marks.');
  }

  const { submissionId, studentEmail, studentName, assignmentName, mark, feedback } = request.data;

  if (!studentEmail || !assignmentName) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  // Send email via Nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER.value(),
      pass: GMAIL_PASS.value(),
    },
  });

  const markLine = mark != null ? `<p><strong>Mark:</strong> ${mark} points</p>` : '';
  const feedbackLine = feedback ? `<p><strong>Feedback:</strong></p><p>${feedback.replace(/\n/g, '<br>')}</p>` : '';

  const mailOptions = {
    from: `"McRae Social Studies" <${GMAIL_USER.value()}>`,
    to: studentEmail,
    subject: `Your mark for ${assignmentName}`,
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#2d3240">Hi ${studentName},</h2>
        <p>Your submission for <strong>${assignmentName}</strong> has been marked.</p>
        ${markLine}
        ${feedbackLine}
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#666;font-size:13px">McRae Social Studies &mdash; McRae Submit</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);

  // Update Firestore — mark emailSent
  await admin.firestore().collection('submissions').doc(submissionId).update({
    emailSent: true,
  });

  return { success: true };
});
