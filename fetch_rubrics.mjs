import admin from 'firebase-admin';
import { readFileSync, writeFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./mcrae-assignments-firebase-adminsdk-fbsvc-5cba02ba01.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection('rubrics').get();
const out = [];
snap.docs.forEach(d => {
  out.push(`\n=== RUBRIC ID: ${d.id} | name: ${d.data().name || '(no name)'} ===`);
  const data = d.data();
  data.categories.forEach((cat, i) => {
    out.push(`\nCATEGORY ${i}: ${cat.name}`);
    cat.descriptors.forEach((desc, j) => {
      out.push(`  [${j}] ${desc.label || '(no label)'} | ${desc.points} pts | "${desc.text}"`);
    });
  });
});
writeFileSync('rubrics_full.txt', out.join('\n'), 'utf8');
console.log('Written to rubrics_full.txt');
process.exit(0);
