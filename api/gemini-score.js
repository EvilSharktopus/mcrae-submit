// Vercel serverless function — POST /api/gemini-score
// Scores a single student submission against the RVS rubric using Gemini.
// Uses ESM (export default) because package.json has "type":"module".

const RVS_RUBRIC = `
CONTENT:
  4 - Effectively crafts a topic, engaging throughout, incorporates effective examples appropriate to purpose and audience.
  3 - Adequately crafts a topic, engaging, incorporates appropriately chosen examples to purpose and audience.
  2 - Simplistically crafts a topic, occasionally engaging, incorporates simplistic examples.
  1 - Does not yet craft a topic; seldom engaging, incorporates superficial examples.

AUDIENCE & WORD CHOICE:
  4 - Effectively uses language, image, and structure to create different effects for purpose and audience.
  3 - Adequately uses language, image, and structure to create different effects for purpose and audience.
  2 - Simplistically uses language, image, and structure to create different effects for purpose and audience.
  1 - Rarely uses language, image, and structure to create different effects for purpose and audience.

ORGANIZATION:
  4 - Organizes information purposefully and effectively; effectively strengthens relationships between ideas to enhance unity.
  3 - Organizes information logically; adequately strengthens relationships between ideas to enhance unity.
  2 - Partially organizes information; partially and/or simplistically strengthens relationships between ideas.
  1 - Rarely organizes information; rarely and/or superficially strengthens relationships between ideas.

SENTENCE STRUCTURE (consider proportion of error to length and complexity):
  4 - Skillfully and frequently uses syntactically correct sentences with a variety of sentence patterns.
  3 - Adequately and often uses syntactically correct sentences with a variety of sentence patterns.
  2 - Simplistically and occasionally uses syntactically correct sentences with a variety of sentence patterns.
  1 - Rarely or not yet using syntactically correct sentences.

SPELLING, CAPITALIZATION & PUNCTUATION (consider proportion of error to length and complexity):
  4 - Effectively applies correct capitalization, punctuation, spelling, and usage.
  3 - Adequately applies correct capitalization, punctuation, spelling, and usage.
  2 - Occasionally applies correct capitalization, punctuation, spelling, and usage.
  1 - Rarely applies correct capitalization, punctuation, spelling, and usage.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_KEY || process.env.VITE_GEMINI_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_KEY not set on server' });

  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const prompt = `You are scoring a Grade 10 student's written submission using the RVS Year-End Writing Assessment Rubric.

Score ONLY based on the text provided. Do not infer or assume anything not present in the writing.
Consider proportion of errors to length and complexity for Sentence Structure and Conventions.

RUBRIC (score 1-4 per category):
${RVS_RUBRIC}

LEVEL LABELS:
4 = Meeting curricular outcomes with enriched understanding
3 = Meeting curricular outcomes
2 = Approaching curricular outcomes
1 = Not yet meeting curricular outcomes

STUDENT SUBMISSION:
"""
${text.slice(0, 6000)}
"""

Respond ONLY with valid JSON, no extra text or markdown:
{
  "content": <integer 1-4>,
  "audienceWordChoice": <integer 1-4>,
  "organization": <integer 1-4>,
  "sentenceStructure": <integer 1-4>,
  "conventions": <integer 1-4>,
  "rationale": "<one brief sentence per category separated by | in rubric order>"
}`;

  let rawBody = '';
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );

    rawBody = await geminiRes.text();

    if (!geminiRes.ok) {
      return res.status(502).json({ error: `Gemini ${geminiRes.status}: ${rawBody}` });
    }

    const data = JSON.parse(rawBody);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const catKeys = ['content', 'audienceWordChoice', 'organization', 'sentenceStructure', 'conventions'];
    for (const k of catKeys) {
      const v = parsed[k];
      if (!Number.isInteger(v) || v < 1 || v > 4) {
        return res.status(502).json({ error: `Invalid score for ${k}: ${v}` });
      }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(502).json({ error: `Function error: ${err.message}${rawBody ? ' | raw: ' + rawBody.slice(0, 200) : ''}` });
  }
}
