/**
 * Convert an array of rows to CSV and trigger a browser download.
 * Each row is { group, value, count } from dashboard-query.
 */

function escapeCsv(cell) {
  if (cell == null) return '';
  const s = String(cell);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows, { groupHeader = 'group', valueHeader = 'value' } = {}) {
  if (!rows?.length) return `${groupHeader},${valueHeader},count\n`;
  const header = `${groupHeader},${valueHeader},count`;
  const body = rows
    .map((r) => [escapeCsv(r.group), escapeCsv(r.value), escapeCsv(r.count)].join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBlockAsCsv(block, data) {
  const groupHeader = block?.data?.group_by?.field || 'group';
  const measure = block?.data?.measure;
  const valueHeader = measure?.field ? `${measure.agg}_${measure.field}` : measure?.agg || 'value';
  const csv = rowsToCsv(data?.rows || [], { groupHeader, valueHeader });
  const safeTitle = (block?.title || 'block')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .toLowerCase()
    .slice(0, 50);
  downloadCsv(`${safeTitle}.csv`, csv);
}
