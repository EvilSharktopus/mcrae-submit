/**
 * Scrape mcraesocial website HTML for all "Write Assignment" blocks.
 * Outputs a JSON file that the Setup page can import into Firestore.
 *
 * Usage:  node scrape-assignments.cjs
 */

const fs   = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const courseDirs = ['social-9', 'social-10', 'social-20', 'social-30'];

function walk(dir) {
  let files = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) files = files.concat(walk(full));
    else if (f.endsWith('.html')) files.push(full);
  }
  return files;
}

const assignments = [];

for (const courseDir of courseDirs) {
  const courseLabel = courseDir.replace('social-', 'Social ');
  for (const file of walk(path.join(root, courseDir))) {
    const html = fs.readFileSync(file, 'utf-8');
    const unitFolder = path.basename(path.dirname(file));
    const blockRegex = /<div\s+class="assignment-block"([^>]*)>([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    while ((match = blockRegex.exec(html)) !== null) {
      const attrs = match[1], inner = match[2];
      if (!inner.includes('Write Assignment')) continue;

      const labelMatch = inner.match(/class="assignment-block__label">(.*?)<\/div>/);
      const name = labelMatch ? labelMatch[1].trim() : 'Unknown';
      if (/slide|planner/i.test(name)) continue;

      const docMatch = inner.match(/href="(https:\/\/docs\.google\.com\/document\/[^"]+)"/);
      const docUrl = docMatch ? docMatch[1] : '';

      const streamMatch = attrs.match(/data-stream="(\d+)"/);
      const stream = streamMatch ? `-${streamMatch[1]}` : '';
      const unit = unitFolder !== courseDir ? unitFolder : '';

      if (!stream) {
        assignments.push({ name, course: courseLabel, stream: '-1', unit, docUrl, isOpen: false, rubricId: null });
        assignments.push({ name, course: courseLabel, stream: '-2', unit, docUrl, isOpen: false, rubricId: null });
      } else {
        assignments.push({ name, course: courseLabel, stream, unit, docUrl, isOpen: false, rubricId: null });
      }
    }
  }
}

// Print summary
console.log(`\nFound ${assignments.length} assignments:\n`);
for (const a of assignments) {
  console.log(`  ${a.course}${a.stream.padEnd(4)} | ${a.unit.padEnd(26)} | ${a.name}`);
}

// Write JSON
const outPath = path.join(__dirname, 'src', 'data', 'scraped-assignments.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(assignments, null, 2));
console.log(`\nWrote to ${outPath}`);
