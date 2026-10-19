// Browser file-download helpers shared by CSV exports and attachment downloads.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: fileName }).click();
  URL.revokeObjectURL(url);
}

// rows: array of arrays; every cell is quoted so commas/quotes/newlines are safe
export function downloadCSV(rows, fileName) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), fileName);
}
