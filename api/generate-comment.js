// Vercel serverless function — POST /api/generate-comment
// Generates a report card comment for a single student using Gemini.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_KEY || process.env.VITE_GEMINI_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_KEY not set on server' });

  const { firstName, tone, curricularLens, keyAssignmentSignal } = req.body;
  if (!firstName || !tone || !curricularLens) {
    return res.status(400).json({ error: 'firstName, tone, and curricularLens are required' });
  }

  const toneDescriptions = {
    excellent:    'This student is a high achiever who demonstrates exceptional understanding.',
    strong:       'This student performs well and shows solid understanding of the material.',
    satisfactory: 'This student meets expectations and demonstrates adequate understanding.',
    developing:   'This student is working toward meeting expectations and needs support.',
    struggling:   'This student is significantly below expectations and requires considerable support.',
  };

  const keySignalNote = keyAssignmentSignal
    ? `Additional qualitative context (do NOT mention assignments by name): ${keyAssignmentSignal}`
    : '';

  const prompt = `You are writing a divisionally approved report card comment for a high school Social Studies student. Follow ALL rules exactly.

RULES:
- 4–5 sentences, paragraph style (no bullet points)
- Use the student's first name naturally at least once
- Include: one clear strength, one area for improvement, one concrete suggestion for how to improve
- Reference the broad curricular lens provided
- NEVER mention specific grades, percentages, or numbers
- NEVER mention specific assignment names or titles
- NEVER mention assignment completion or work habits
- Tone must reflect the overall performance level provided
- Write in third person (e.g. "${firstName} demonstrates...")
- Sound like a thoughtful human teacher, not AI
- Output only the comment, nothing else

STUDENT INFO:
- First name: ${firstName}
- Overall performance level: ${tone} — ${toneDescriptions[tone] || ''}
- Curricular lens (broad topic area): ${curricularLens}
${keySignalNote}

Write the comment now:`;

  let rawBody = '';
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 1,
            maxOutputTokens: 512,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    rawBody = await geminiRes.text();

    if (!geminiRes.ok) {
      return res.status(502).json({ error: `Gemini ${geminiRes.status}: ${rawBody}` });
    }

    const data = JSON.parse(rawBody);
    const comment = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    if (!comment) return res.status(502).json({ error: 'Empty response from Gemini' });

    return res.status(200).json({ comment });
  } catch (err) {
    return res.status(502).json({
      error: `Function error: ${err.message}${rawBody ? ' | raw: ' + rawBody.slice(0, 200) : ''}`,
    });
  }
}
