/**
 * Render a dashboard as a styled HTML snapshot. Used by:
 *   - on-demand HTML export (POST /api/app?path=dashboard-export)
 *   - scheduled email pulse handler
 *
 * Charts are rendered as SVG-free CSS visualisations for email-client safety
 * (Outlook strips SVG; mobile clients vary wildly on chart support).
 * KPIs are big numbers, breakdowns are CSS bars, trends are a simple sparkline
 * rendered as inline SVG (most clients accept basic SVG paths).
 */

function escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isCurrency(field) {
  return /(_usd|cost|revenue|amount|spend|budget)/i.test(field || '');
}

function renderKpi(block, data) {
  const value = data?.total ?? 0;
  const formatted = isCurrency(block?.data?.measure?.field) ? `$${fmt(value)}` : fmt(value);
  return `
    <td style="padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-weight:600;">${escape(block?.title || 'KPI')}</div>
      <div style="font-size:28px;font-weight:800;color:#1B2A4A;margin-top:4px;">${formatted}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${escape(block?.data?.measure?.agg || '')}${block?.data?.measure?.field ? ` · ${escape(block.data.measure.field)}` : ''}</div>
    </td>`;
}

function renderBreakdown(block, data) {
  const rows = (data?.rows || []).slice(0, 10);
  if (!rows.length) return renderEmpty(block);
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.value) || 0)), 1);
  const bars = rows
    .map((r) => {
      const pct = Math.round((Math.abs(Number(r.value) || 0) / max) * 100);
      return `
        <tr>
          <td style="padding:4px 8px;font-size:12px;color:#1e293b;width:140px;">${escape(r.group)}</td>
          <td style="padding:4px 8px;">
            <div style="background:#3B82F6;height:14px;width:${pct}%;border-radius:3px;display:inline-block;"></div>
          </td>
          <td style="padding:4px 8px;font-size:12px;color:#1e293b;text-align:right;width:80px;">${fmt(r.value)}</td>
        </tr>`;
    })
    .join('');
  return `
    <td style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;">${escape(block?.title || 'Breakdown')}</div>
      <table style="width:100%;border-collapse:collapse;">${bars}</table>
    </td>`;
}

function renderTrend(block, data) {
  const rows = (data?.rows || []).slice(-30);
  if (!rows.length) return renderEmpty(block);
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);
  const w = 360;
  const h = 80;
  const stepX = rows.length > 1 ? w / (rows.length - 1) : w;
  const points = rows
    .map((r, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(h - (Number(r.value) / max) * h);
      return `${x},${y}`;
    })
    .join(' ');
  return `
    <td style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;">${escape(block?.title || 'Trend')}</div>
      <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <polyline points="${points}" fill="none" stroke="#3B82F6" stroke-width="2" />
      </svg>
      <div style="font-size:11px;color:#64748b;margin-top:6px;">
        ${rows.length} data points · total ${fmt(data?.total)}
      </div>
    </td>`;
}

function renderTable(block, data) {
  const rows = (data?.rows || []).slice(0, 15);
  if (!rows.length) return renderEmpty(block);
  const body = rows
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 8px;font-size:12px;border-bottom:1px solid #f1f5f9;">${escape(r.group)}</td>
          <td style="padding:6px 8px;font-size:12px;border-bottom:1px solid #f1f5f9;text-align:right;">${fmt(r.value)}</td>
          <td style="padding:6px 8px;font-size:12px;border-bottom:1px solid #f1f5f9;text-align:right;">${fmt(r.count)}</td>
        </tr>`
    )
    .join('');
  return `
    <td style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:8px;">${escape(block?.title || 'Table')}</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">${escape(block?.data?.group_by?.field || 'Group')}</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">${escape(block?.data?.measure?.agg || 'value')}</th>
            <th style="text-align:right;padding:6px 8px;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">count</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </td>`;
}

function renderMarkdown(block) {
  const body = (block?.body || '')
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h2 style="font-size:18px;margin:8px 0;color:#1B2A4A;">${escape(line.slice(2))}</h2>`;
      if (line.startsWith('## ')) return `<h3 style="font-size:15px;margin:6px 0;color:#1B2A4A;">${escape(line.slice(3))}</h3>`;
      if (!line.trim()) return '<br/>';
      return `<p style="font-size:13px;color:#334155;margin:4px 0;">${escape(line)}</p>`;
    })
    .join('');
  return `
    <td style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      ${body || '<em style="color:#94a3b8;">Empty note</em>'}
    </td>`;
}

function renderEmpty(block) {
  return `
    <td style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;vertical-align:top;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;">${escape(block?.title || 'Block')}</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:6px;">No data for current filters.</div>
    </td>`;
}

function renderError(block, error) {
  return `
    <td style="padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;vertical-align:top;">
      <div style="font-size:13px;font-weight:700;color:#991b1b;">${escape(block?.title || 'Block')}</div>
      <div style="font-size:12px;color:#991b1b;margin-top:6px;">${escape(error)}</div>
    </td>`;
}

function renderBlock(block, data) {
  if (data?.error) return renderError(block, data.error);
  switch (block.type) {
    case 'kpi':
      return renderKpi(block, data);
    case 'trend':
      return renderTrend(block, data);
    case 'breakdown':
    case 'pie':
    case 'alerts':
      return renderBreakdown(block, data);
    case 'table':
      return renderTable(block, data);
    case 'markdown':
      return renderMarkdown(block);
    default:
      return renderEmpty(block);
  }
}

/**
 * Render a full HTML email document for a dashboard.
 */
export function renderDashboardHtml({ dashboard, resultsById, viewerUrl = '' }) {
  const blocks = dashboard?.config?.blocks || [];
  const kpiBlocks = blocks.filter((b) => b.type === 'kpi');
  const otherBlocks = blocks.filter((b) => b.type !== 'kpi');

  const kpiRow = kpiBlocks.length
    ? `<tr>${kpiBlocks.slice(0, 4).map((b) => renderBlock(b, resultsById[b.id])).join('')}</tr>`
    : '';

  const otherRows = otherBlocks
    .map((b) => `<tr>${renderBlock(b, resultsById[b.id])}</tr>`)
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escape(dashboard?.title || 'Dashboard')}</title>
</head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <table style="max-width:720px;margin:0 auto;width:100%;border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 16px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;font-weight:700;">Dashboard snapshot</div>
        <div style="font-size:22px;font-weight:800;color:#1B2A4A;margin-top:4px;">${escape(dashboard?.title || 'Untitled')}</div>
        ${dashboard?.description ? `<div style="font-size:13px;color:#64748b;margin-top:4px;">${escape(dashboard.description)}</div>` : ''}
        <div style="font-size:11px;color:#94a3b8;margin-top:6px;">Generated ${new Date().toUTCString()}</div>
      </td>
    </tr>
    ${kpiRow ? `<tr><td style="padding-bottom:12px;"><table style="width:100%;border-collapse:separate;border-spacing:8px 0;">${kpiRow}</table></td></tr>` : ''}
    ${otherRows
      ? `<tr><td><table style="width:100%;border-collapse:separate;border-spacing:0 8px;">${otherRows}</table></td></tr>`
      : ''}
    ${viewerUrl
      ? `<tr><td style="padding-top:20px;text-align:center;"><a href="${escape(viewerUrl)}" style="display:inline-block;padding:10px 20px;background:#3B82F6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Open in browser</a></td></tr>`
      : ''}
    <tr>
      <td style="padding-top:32px;text-align:center;font-size:11px;color:#94a3b8;">
        Sent by Orqaly · You're receiving this because a scheduled export is configured for this dashboard.
      </td>
    </tr>
  </table>
</body>
</html>`;
}
