// src/utils/exportUtils.js

/** Download an array of rows as a .csv file */
export function exportCSV(filename, headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Returns the current school year label, e.g. "2025_2026" */
export function currentSchoolYear() {
  const now      = new Date();
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}_${startYear + 1}`;
}

/** Strip HTML tags from a string (for CSV-safe feedback text) */
export function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
