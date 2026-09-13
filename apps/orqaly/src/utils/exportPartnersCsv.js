/**
 * Export partners to CSV format.
 * Used for exporting filtered partner list for reporting or external tools.
 */
export function exportPartnersToCsv(partners, filename = 'partners-export.csv') {
  const headers = [
    'Name',
    'Email',
    'Group',
    'Team',
    'Traffic Source',
    'Geo',
    'Funnel Status',
    'Agreement',
    'ROI %',
    'Campaigns Active',
    'Campaigns Total',
  ];

  const rows = partners.map((p) => [
    p.name || '',
    p.email || '',
    p.group || '',
    p.team || '',
    p.trafficSource || '',
    p.geo || '',
    p.funnelStatus || '',
    p.agreement || '',
    p.roi != null ? String(p.roi) : '',
    p.campaignsActive != null ? String(p.campaignsActive) : '',
    p.campaignsTotal != null ? String(p.campaignsTotal) : '',
  ]);

  const escape = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map((row) => row.map(escape).join(',')).join('\n');
  const csv = [headerLine, dataLines].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
