import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./mcrae-assignments-firebase-adminsdk-fbsvc-5cba02ba01.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Student-friendly text by category name + descriptor text pattern
function studentText(catName, origText, label) {
  const t = origText.toLowerCase();

  // INS
  if (label === 'INS') return "You didn't attempt this part of the assignment, or your response is too brief to assess.";

  // ── COMMUNICATION ──────────────────────────────────────────────────────────
  if (catName.toLowerCase().includes('communication')) {
    if (t.includes('fluent') || t.includes('sophisticated') || label === 'E')
      return "Your writing flows naturally and is well-organized. Your word choice is precise and your grammar/mechanics are excellent.";
    if (t.includes('coherent') || t.includes('purposeful') || label === 'Pf')
      return "Your writing is clear and well-organized. You use specific vocabulary and your grammar is strong. Minor errors don't get in the way.";
    if (t.includes('straightforward') || t.includes('functionally') || t.includes('conventional') || label === 'S')
      return "Your writing is generally clear and organized at a basic level. Your vocabulary is adequate and minor errors don't seriously hurt your message.";
    if (t.includes('awkward') || t.includes('inconsistent') || label === 'L')
      return "Your writing is hard to follow and lacks organization. Grammar errors and imprecise word choice get in the way of your ideas.";
    if (t.includes('unclear') || t.includes('disorganized') || label === 'P')
      return "Your writing is unclear and disorganized. Serious grammar and vocabulary issues make it very hard to read.";
    return origText;
  }

  // ── EXPLORATION AND ANALYSIS ───────────────────────────────────────────────
  if (catName.toLowerCase().includes('exploration')) {
    if (t.includes('insightful and complete'))
      return "Your exploration of the issue is deep and thorough. Your analysis is thoughtful and shows a strong understanding of different perspectives.";
    if (t.includes('specific and accurate') && t.includes('analysis is appropriate'))
      return "You've explored the issue with good detail and accuracy. Your analysis is focused with only minor misunderstandings. You clearly understand different points of view.";
    if (t.includes('valid but general'))
      return "You've addressed the issue reasonably, but your analysis stays general. You show a basic understanding of different perspectives.";
    if (t.includes('vague and may contain large errors'))
      return "Your exploration is vague or contains significant errors. Your analysis is repetitive and shows only a limited understanding of different perspectives.";
    if (t.includes('wrong or unrelated'))
      return "Your exploration is off-topic or doesn't connect to the issue. There is very little analysis and little understanding of different perspectives.";
    return origText;
  }

  // ── INTERPRETATION OF SOURCES ──────────────────────────────────────────────
  if (catName.toLowerCase().includes('interpretation')) {
    if (t.includes('sophisticated') || t.includes('insightful and complete'))
      return "Your interpretation of the source is deep and insightful. You've made specific, well-developed connections to the key ideas of the course.";
    if (t.includes('sound, specific') || (t.includes('specific and accurate') && !t.includes('defense')))
      return "Your interpretation is solid and clearly explained. Your connections to course ideas are logical and well-developed.";
    if (t.includes('adequate') || t.includes('valid but general'))
      return "You've interpreted the source at a reasonable level, but your explanation stays general. Your connections to course ideas are on topic but not fully developed.";
    if (t.includes('confused, vague') || t.includes('over-generalized'))
      return "Your interpretation is unclear or oversimplified. Your connections to course ideas are incomplete or hard to follow.";
    if (t.includes('minimal, inaccurate') || t.includes('mistaken or irrelevant'))
      return "Your interpretation is missing, inaccurate, or too similar to the source. Your connections don't show a clear understanding of the task.";
    return origText;
  }

  // ── IDENTIFICATION OF RELATIONSHIPS ───────────────────────────────────────
  if (catName.toLowerCase().includes('relationship')) {
    if (t.includes('accurately and perceptively'))
      return "You've clearly and insightfully identified the relationship(s) and explained them in a thorough, detailed way.";
    if (t.includes('clearly and capably'))
      return "You've clearly identified the relationship(s) and explained them in a focused, purposeful way.";
    if (t.includes('generally and adequately'))
      return "You've identified the relationship(s) in a straightforward way, though your explanation stays general.";
    if (t.includes('superficial and of questionable'))
      return "Your identification of the relationship(s) is vague or may not be accurate. The explanation is hard to follow or repetitive.";
    if (t.includes('minimal') && t.includes('off topic'))
      return "You've barely identified any relationship(s), or your explanation is off-topic and undeveloped.";
    return origText;
  }

  // ── DEFENSE OF POSITION ───────────────────────────────────────────────────
  if (catName.toLowerCase().includes('defense')) {
    if (t.includes('convincing, logical') || t.includes('convincing, logical'))
      return "Your position is supported by strong, convincing arguments and specific accurate evidence. You clearly understand the relevant course content.";
    if (t.includes('sound arguments') || t.includes('clear understanding of applicable'))
      return "Your position is backed by solid arguments with mostly accurate evidence. Minor errors don't seriously hurt your response.";
    if (t.includes('adequate arguments') || t.includes('acceptable understanding'))
      return "Your position has reasonable arguments behind it, but your evidence is general or not fully developed. You show a basic understanding of the content.";
    if (t.includes('simple statements') || t.includes('oversimplified') || t.includes('questionable logic'))
      return "Your defense of position relies on simple statements rather than real arguments. Your evidence is weak or not always on topic, and may contain significant errors.";
    if (t.includes('difficult to understand') || t.includes('hard to understand'))
      return "It's hard to tell what position you're defending, or little attempt has been made to defend it. Any evidence present is incomplete or barely relevant.";
    return origText;
  }

  // ── ARGUMENTATION ─────────────────────────────────────────────────────────
  if (catName.toLowerCase().includes('argumentation')) {
    if (t.includes('convincingly') || label === 'E')
      return "Your position is clearly stated and backed by convincing, well-chosen arguments. You've shown an insightful understanding of the relationship and what the assignment is asking.";
    if ((t.includes('purposely') || t.includes('purposeful')) && !t.includes('lower') || label === 'Pf')
      return "Your position is clear and your arguments are logical and well-developed. You've clearly connected the source to your perspective.";
    if (t.includes('lower proficient'))
      return "Your position is clear with logical arguments, but some parts of your argument need more development.";
    if ((t.includes('appropriately') || t.includes('straightforward and conventional')) && !t.includes('lower') || label === 'S')
      return "Your position is reasonable and your arguments are straightforward. You've generally shown the connection and demonstrated adequate understanding.";
    if (t.includes('lower satisfactory') && t.includes('argumentation'))
      return "Your position is basic and your arguments lack consistency or depth.";
    if (t.includes('confusing') || t.includes('repetitive, contradictory') || label === 'L')
      return "Your position is hard to follow and your arguments are repetitive, contradictory, or too simple. The connection to the source is barely there.";
    if (t.includes('lower limited') && t.includes('argumentation'))
      return "Your position is mostly off-topic with very little real argumentation.";
    if (t.includes('irrelevant and illogical') || label === 'P')
      return "Your position doesn't connect to the source or the task. There is little or no argumentation present.";
    return origText;
  }

  // ── EVIDENCE ──────────────────────────────────────────────────────────────
  if (catName.toLowerCase().includes('evidence')) {
    if (t.includes('sophisticated') || label === 'E')
      return "Your evidence is carefully chosen and highly specific. It shows a thorough understanding of social studies content and the assignment.";
    if ((t.includes('purposeful and specific') || t.includes('purposeful')) && !t.includes('lower') || label === 'Pf')
      return "Your evidence is purposeful and specific. It effectively shows a solid understanding of the content and the assignment.";
    if (t.includes('lower proficient') && t.includes('evidence'))
      return "Your evidence is purposeful but may have some gaps or errors.";
    if ((t.includes('conventional and straightforward') || t.includes('general acceptable')) && !t.includes('lower') || label === 'S')
      return "Your evidence is reasonable and straightforward. There may be minor errors or some unnecessary details, but it generally shows an acceptable understanding.";
    if (t.includes('lower satisfactory') && t.includes('evidence'))
      return "Your evidence is basic but noticeably unfocused or off-topic.";
    if (t.includes('somewhat relevant') || label === 'L')
      return "Your evidence is somewhat relevant but unfocused or not fully developed. It contains off-topic details, suggesting an oversimplified understanding.";
    if (t.includes('lower limited') && t.includes('evidence'))
      return "Your evidence is mostly irrelevant or underdeveloped.";
    if (t.includes('irrelevant and') || label === 'P')
      return "Your evidence is irrelevant or inaccurate. Serious errors reveal a lack of understanding.";
    return origText;
  }

  // ── ANALYSIS OF SOURCE ────────────────────────────────────────────────────
  if (catName.toLowerCase().includes('analysis')) {
    if (t.includes('insightful and sophisticated'))
      return "Your understanding of the source is deep and insightful. You've clearly and comprehensively explained how it connects to different perspectives.";
    if (t.includes('sound and adept'))
      return "Your understanding of the source is solid. You've explained its connections to different perspectives in a clear, focused way.";
    if (t.includes('straightforward and conventional') && t.includes('adequately developed'))
      return "You've understood the source at a basic level and explained it in a straightforward way. Your connection to perspectives is on track but stays general.";
    if (t.includes('lower satisfactory') && t.includes('understanding of the source'))
      return "You've shown a basic understanding of the source, but your explanation doesn't go far enough in depth.";
    if (t.includes('incomplete or lacks depth'))
      return "Your understanding of the source is shallow or incomplete. The connection to different perspectives is oversimplified.";
    if (t.includes('minimal understanding of the source'))
      return "There's little to no clear understanding of the source. Your interpretation is confused, inaccurate, or vague.";
    return origText;
  }

  return origText;
}

const snap = await db.collection('rubrics').get();
let total = 0;

for (const docSnap of snap.docs) {
  const data = docSnap.data();
  const updatedCats = data.categories.map(cat => ({
    ...cat,
    descriptors: (cat.descriptors || []).map(desc => ({
      ...desc,
      studentText: studentText(cat.name, desc.text || '', desc.label || ''),
    })),
  }));
  await db.collection('rubrics').doc(docSnap.id).update({ categories: updatedCats });
  total++;
  console.log(`Updated: ${data.name || docSnap.id}`);
}

console.log(`\nDone! Updated ${total} rubrics.`);
process.exit(0);
