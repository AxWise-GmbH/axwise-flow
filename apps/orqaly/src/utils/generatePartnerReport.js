import { formatCurrency, formatPercent, formatDate } from './formatters';

// Color palette
const COLORS = {
  primary: [27, 42, 74], // #1B2A4A
  secondary: [59, 130, 246], // #3B82F6
  success: [16, 185, 129], // #10B981
  error: [239, 68, 68], // #EF4444
  warning: [245, 158, 11], // #F59E0B
  text: [30, 41, 59], // #1E293B
  textLight: [100, 116, 139], // #64748B
  bg: [241, 245, 249], // #F1F5F9
  white: [255, 255, 255],
  divider: [226, 232, 240], // #E2E8F0
};

const PAGE_W = 210;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

function addPageFooter(doc, pageNum, totalPages, partnerName) {
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLORS.divider);
  doc.line(MARGIN, pageH - 16, PAGE_W - MARGIN, pageH - 16);
  doc.setFontSize(7.5);
  doc.setTextColor(...COLORS.textLight);
  doc.text(`${partnerName} — Partner Report`, MARGIN, pageH - 10);
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, pageH - 10, { align: 'right' });
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    PAGE_W / 2,
    pageH - 10,
    { align: 'center' }
  );
}

function sectionTitle(doc, y, title) {
  // Accent bar
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(MARGIN, y, 3, 14, 1.5, 1.5, 'F');
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN + 8, y + 10);
  return y + 22;
}

function labelValue(doc, x, y, label, value, maxWidth = 60) {
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.textLight);
  doc.setFont('helvetica', 'normal');
  doc.text(label.toUpperCase(), x, y);
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  const val = String(value || '—');
  doc.text(val.length > 28 ? val.slice(0, 28) + '...' : val, x, y + 6);
  return y + 16;
}

function chip(doc, x, y, text, bgColor, textColor) {
  const tw = doc.getTextWidth(text) + 6;
  doc.setFillColor(...bgColor);
  doc.roundedRect(x, y - 4, tw, 7, 2, 2, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'bold');
  doc.text(text, x + 3, y + 0.5);
  return tw + 3;
}

function checkPageBreak(doc, y, needed = 40) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 22) {
    doc.addPage();
    return 22;
  }
  return y;
}

export default async function generatePartnerReport({
  partner,
  periodLabel,
  selectedPeriod,
  periodizedCampaigns,
  campaignPerformanceData,
  crTrendData,
  financePeriod,
  monitoredLinks,
  MONTH_NAMES,
  reportSummary = {},
  reportComparison = { metrics: [] },
  reportInsights = [],
  reportRecommendations = [],
  reportMetadata = { notes: [] },
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF('p', 'mm', 'a4');
  let y = 0;
  const formatDateTime = (value) => {
    if (!value) return '—';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${formatDate(dt.toISOString())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };
  const formatDeltaPercent = (value) => {
    if (value == null || Number.isNaN(value)) return 'N/A';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };
  const formatDeltaPoints = (value) => {
    if (value == null || Number.isNaN(value)) return 'N/A';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)} pp`;
  };
  const statusStyles = {
    Healthy: { bg: [209, 250, 229], text: [5, 150, 105] },
    Warning: { bg: [254, 243, 199], text: [217, 119, 6] },
    Critical: { bg: [254, 226, 226], text: [220, 38, 38] },
  };

  // ── COVER HEADER ──────────────────────────────────────────────
  // Dark header band
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE_W, 58, 'F');

  // Logo square
  doc.setFillColor(255, 255, 255, 0.15);
  doc.roundedRect(MARGIN, 12, 14, 14, 3, 3, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.text('J', MARGIN + 5, 22);

  // Title
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.text(partner.name, MARGIN + 20, 22);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 210, 230);
  doc.text(
    `${partner.userId}  •  ${partner.team}  •  ${partner.group}  •  Registered ${formatDate(partner.registrationDate)}`,
    MARGIN + 20,
    30
  );

  // Period badge
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);
  doc.setFont('helvetica', 'bold');
  const periodText = `Report Period: ${MONTH_NAMES[selectedPeriod.month - 1]} ${selectedPeriod.year}`;
  doc.text(periodText, MARGIN, 48);

  // Generated date
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 195, 215);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    PAGE_W - MARGIN,
    48,
    { align: 'right' }
  );

  y = 68;

  // ── EXECUTIVE SUMMARY ─────────────────────────────────────────
  y = sectionTitle(doc, y, 'Executive Summary');
  const summaryKpis = [
    { label: 'Status', value: reportSummary.status || 'Healthy', type: 'status' },
    { label: 'Active Campaigns', value: String(reportSummary.activeCampaigns ?? '—') },
    { label: 'Clicks', value: (reportSummary.totalClicks ?? 0).toLocaleString() },
    { label: 'Total FTD', value: String(reportSummary.totalFtd ?? 0) },
    { label: 'Avg CR%', value: formatPercent(reportSummary.avgCr ?? 0) },
    { label: 'Links Health', value: `${reportSummary.linksHealthScore ?? 0}%` },
    { label: 'Materials Coverage', value: `${reportSummary.materialsCoverage ?? 0}%` },
    { label: 'Top Campaign', value: reportSummary.topCampaign || '—' },
  ];
  const cardCols = 4;
  const cardGap = 3;
  const cardW = (CONTENT_W - cardGap * (cardCols - 1)) / cardCols;
  const cardH = 18;
  summaryKpis.forEach((item, idx) => {
    const row = Math.floor(idx / cardCols);
    const col = idx % cardCols;
    const x = MARGIN + col * (cardW + cardGap);
    const cy = y + row * (cardH + 3);
    doc.setFillColor(...COLORS.bg);
    doc.roundedRect(x, cy, cardW, cardH, 2, 2, 'F');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label.toUpperCase(), x + 2.5, cy + 5.2);
    if (item.type === 'status') {
      const s = statusStyles[item.value] || statusStyles.Healthy;
      doc.setFillColor(...s.bg);
      doc.roundedRect(
        x + 2.3,
        cy + 8,
        Math.max(18, doc.getTextWidth(item.value) + 6),
        6.5,
        2,
        2,
        'F'
      );
      doc.setFontSize(8);
      doc.setTextColor(...s.text);
      doc.setFont('helvetica', 'bold');
      doc.text(item.value, x + 5, cy + 12.7);
    } else {
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.primary);
      doc.setFont('helvetica', 'bold');
      const text = String(item.value);
      const clipped = text.length > 26 ? `${text.slice(0, 26)}...` : text;
      doc.text(clipped, x + 2.5, cy + 13);
    }
  });
  y += Math.ceil(summaryKpis.length / cardCols) * (cardH + 3) + 5;

  // ── METADATA PANEL ────────────────────────────────────────────
  y = checkPageBreak(doc, y, 40);
  y = sectionTitle(doc, y, 'Report Metadata');
  doc.setFillColor(...COLORS.bg);
  doc.roundedRect(MARGIN, y, CONTENT_W, 28, 2, 2, 'F');
  const mColW = CONTENT_W / 3;
  labelValue(
    doc,
    MARGIN + 3,
    y + 7,
    'Partner ID',
    reportMetadata.partnerId || partner.userId,
    mColW - 6
  );
  labelValue(
    doc,
    MARGIN + 3 + mColW,
    y + 7,
    'Period',
    reportMetadata.selectedPeriod || selectedPeriod.label,
    mColW - 6
  );
  labelValue(
    doc,
    MARGIN + 3 + mColW * 2,
    y + 7,
    'Generated',
    formatDateTime(reportMetadata.generatedAt),
    mColW - 6
  );
  labelValue(
    doc,
    MARGIN + 3,
    y + 20,
    'Campaigns',
    String(reportMetadata.campaignCount ?? (periodizedCampaigns || []).length),
    mColW - 6
  );
  labelValue(
    doc,
    MARGIN + 3 + mColW,
    y + 20,
    'Materials',
    String(reportMetadata.materialsCount ?? (partner.materials || []).length),
    mColW - 6
  );
  labelValue(
    doc,
    MARGIN + 3 + mColW * 2,
    y + 20,
    'Links',
    String(reportMetadata.linksCount ?? monitoredLinks.length),
    mColW - 6
  );
  y += 34;

  // ── COMPARISON ────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 45);
  y = sectionTitle(
    doc,
    y,
    `Period Comparison (${reportComparison.currentPeriod || selectedPeriod.label} vs ${reportComparison.previousPeriod || 'Previous'})`
  );
  if ((reportComparison.metrics || []).length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Metric', 'Current', 'Previous', 'Delta']],
      body: reportComparison.metrics.map((item) => {
        const currentVal =
          item.label === 'Avg CR%' ? formatPercent(item.current) : String(item.current ?? 'N/A');
        const previousVal =
          item.previous == null
            ? 'N/A'
            : item.label === 'Avg CR%'
              ? formatPercent(item.previous)
              : String(item.previous);
        const deltaVal =
          item.deltaPoints != null
            ? formatDeltaPoints(item.deltaPoints)
            : formatDeltaPercent(item.deltaPercent);
        return [item.label, currentVal, previousVal, deltaVal];
      }),
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
        cellPadding: 3,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineWidth: 0 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.startsWith('+')) data.cell.styles.textColor = [5, 150, 105];
          else if (raw.startsWith('-')) data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── ACTIONABLE INSIGHTS ───────────────────────────────────────
  y = checkPageBreak(doc, y, 48);
  y = sectionTitle(doc, y, 'What Needs Attention');
  const insightRows = (reportInsights || []).slice(0, 5);
  if (insightRows.length === 0) {
    insightRows.push({
      type: 'success',
      title: 'No major risks detected',
      detail: 'Current period metrics and monitoring indicators are stable.',
    });
  }
  insightRows.forEach((item) => {
    const variant =
      item.type === 'critical'
        ? { bg: [254, 226, 226], text: [220, 38, 38] }
        : item.type === 'warning'
          ? { bg: [254, 243, 199], text: [180, 83, 9] }
          : { bg: [209, 250, 229], text: [5, 150, 105] };
    doc.setFillColor(...variant.bg);
    doc.roundedRect(MARGIN, y, CONTENT_W, 9, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...variant.text);
    doc.setFont('helvetica', 'bold');
    doc.text(item.title, MARGIN + 2.8, y + 5.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.text);
    const detailLines = doc.splitTextToSize(item.detail, CONTENT_W - 45);
    doc.text(detailLines[0] || '', MARGIN + 45, y + 5.8);
    y += 11;
  });
  y += 2;
  y = checkPageBreak(doc, y, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primary);
  doc.text('Recommended Next Actions', MARGIN, y);
  y += 5;
  (reportRecommendations || []).slice(0, 5).forEach((line) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    doc.setTextColor(...COLORS.text);
    const lines = doc.splitTextToSize(`- ${line}`, CONTENT_W);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.2;
  });
  y += 4;

  // ── DESCRIPTION ───────────────────────────────────────────────
  if (partner.description) {
    y = sectionTitle(doc, y, 'Description');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.text);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(partner.description, CONTENT_W);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.5 + 6;
  }

  // ── INFORMATION ───────────────────────────────────────────────
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, y, 'Information');

  const trafficList = partner.trafficSources || [partner.trafficSource].filter(Boolean);
  const geoList = partner.geos || [partner.geo].filter(Boolean);

  const col = CONTENT_W / 4;
  labelValue(doc, MARGIN, y, 'Team', partner.team);
  labelValue(doc, MARGIN + col, y, 'Group', partner.group);
  labelValue(doc, MARGIN + col * 2, y, 'Agreement', partner.agreement);
  labelValue(doc, MARGIN + col * 3, y, 'Funnel Status', partner.funnelStatus);
  y += 18;

  labelValue(doc, MARGIN, y, 'Contact (Nick)', partner.telegramNick);
  labelValue(doc, MARGIN + col, y, 'Contact (Group)', partner.telegramGroup || '—');
  labelValue(doc, MARGIN + col * 2, y, 'Geo', geoList.join(', ') || '—');
  labelValue(doc, MARGIN + col * 3, y, 'Traffic Sources', trafficList.join(', ') || '—');
  y += 18;

  // ── PERFORMANCE KPIs ──────────────────────────────────────────
  y = checkPageBreak(doc, y, 55);
  y = sectionTitle(
    doc,
    y,
    `Performance — ${MONTH_NAMES[selectedPeriod.month - 1]} ${selectedPeriod.year}`
  );

  const totalClicks = periodizedCampaigns.reduce((s, { metrics }) => s + metrics.clicks, 0);
  const totalFtd = periodizedCampaigns.reduce((s, { metrics }) => s + metrics.ftd, 0);
  const avgCr =
    periodizedCampaigns.length > 0
      ? periodizedCampaigns.reduce((s, { metrics }) => s + metrics.cr, 0) /
        periodizedCampaigns.length
      : 0;
  const activeCamps =
    periodizedCampaigns.filter(({ metrics }) => metrics.ftd > 0 || metrics.clicks > 0).length ||
    partner.campaignsActive;

  // KPI cards row
  const kpiW = CONTENT_W / 6;
  const kpis = [
    { label: 'Active Campaigns', value: String(activeCamps) },
    { label: 'Clicks', value: totalClicks.toLocaleString() },
    { label: 'Total FTD', value: String(totalFtd) },
    { label: 'Avg CR%', value: formatPercent(avgCr) },
    { label: 'Total Finance', value: formatCurrency(financePeriod.total) },
    { label: 'Debt', value: formatCurrency(financePeriod.debt) },
  ];

  // Draw KPI card backgrounds
  kpis.forEach((kpi, i) => {
    const kx = MARGIN + i * kpiW;
    doc.setFillColor(...COLORS.bg);
    doc.roundedRect(kx, y, kpiW - 2, 20, 2, 2, 'F');

    doc.setFontSize(6.5);
    doc.setTextColor(...COLORS.textLight);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), kx + 3, y + 6);

    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, kx + 3, y + 15);
  });
  y += 28;

  // Finance summary chips
  doc.setFontSize(8);
  let chipX = MARGIN;
  chipX += chip(
    doc,
    chipX,
    y,
    `Paid: ${formatCurrency(financePeriod.paid)}`,
    [209, 250, 229],
    [5, 150, 105]
  );
  chipX += chip(
    doc,
    chipX + 2,
    y,
    `Debt: ${formatCurrency(financePeriod.debt)}`,
    [254, 226, 226],
    [220, 38, 38]
  );
  chipX += chip(
    doc,
    chipX + 4,
    y,
    `Total: ${formatCurrency(financePeriod.total)}`,
    COLORS.bg,
    COLORS.textLight
  );
  y += 12;

  // ── CAMPAIGN PERFORMANCE TABLE ────────────────────────────────
  y = checkPageBreak(doc, y, 50);
  y = sectionTitle(doc, y, 'Campaign Performance');

  if (campaignPerformanceData.length > 0) {
    const totalFtdValue = periodizedCampaigns.reduce(
      (sum, item) => sum + Number(item.metrics.ftd || 0),
      0
    );
    const rankedCampaigns = [...periodizedCampaigns]
      .sort((a, b) => (b.metrics.ftd || 0) - (a.metrics.ftd || 0))
      .map((item, idx) => ({
        rank: idx + 1,
        name: item.campaign.name,
        ftd: item.metrics.ftd || 0,
        clicks: item.metrics.clicks || 0,
        cr: item.metrics.cr || 0,
        share: totalFtdValue > 0 ? ((item.metrics.ftd || 0) / totalFtdValue) * 100 : 0,
      }));
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Campaign', 'FTD', 'FTD Share', 'Clicks', 'CR%']],
      body: rankedCampaigns.map((item) => [
        String(item.rank),
        item.name,
        String(item.ftd),
        `${item.share.toFixed(1)}%`,
        item.clicks.toLocaleString(),
        formatPercent(item.cr),
      ]),
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
        cellPadding: 3,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      styles: {
        lineWidth: 0,
        overflow: 'linebreak',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 58 },
        2: { halign: 'right', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 24 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 20 },
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textLight);
    doc.text('No campaign data available.', MARGIN, y);
    y += 10;
  }

  // ── CR% TREND TABLE ───────────────────────────────────────────
  y = checkPageBreak(doc, y, 40);
  y = sectionTitle(doc, y, 'CR% Trend by Campaign');

  if (crTrendData.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['#', 'Campaign', 'CR%']],
      body: crTrendData.map((item, idx) => [
        String(idx + 1),
        item.fullName,
        formatPercent(item.cr),
      ]),
      headStyles: {
        fillColor: [139, 92, 246],
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
        cellPadding: 3,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineWidth: 0 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        2: { halign: 'right', cellWidth: 25 },
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── MATERIALS TABLE ───────────────────────────────────────────
  const materials = [...(partner.materials || [])]
    .map((m) => ({
      ...m,
      coverage:
        (m.campaignNames || []).length > 0 && (m.links || []).length > 0 ? 'Good' : 'Needs update',
    }))
    .sort((a, b) => {
      const score = (item) =>
        ((item.campaignNames || []).length > 0 ? 1 : 0) + ((item.links || []).length > 0 ? 1 : 0);
      return score(a) - score(b);
    });
  if (materials.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = sectionTitle(doc, y, 'Materials');

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Name', 'Type', 'Campaigns', 'Links', 'Coverage', 'Uploaded']],
      body: materials.map((m) => [
        m.name,
        m.type || '—',
        (m.campaignNames || []).join(', ') || '—',
        (m.links || []).length > 0
          ? `${m.links.length} link${m.links.length !== 1 ? 's' : ''}`
          : '—',
        m.coverage,
        formatDate(m.uploadedAt),
      ]),
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: COLORS.text,
        cellPadding: 3,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineWidth: 0, overflow: 'linebreak' },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const value = data.cell.raw;
          data.cell.styles.textColor = value === 'Good' ? [5, 150, 105] : [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── LINKS MONITORING TABLE ────────────────────────────────────
  if (monitoredLinks.length > 0) {
    const riskScore = (status) => {
      if (status === 'Not working') return 0;
      if (status === 'Have errors') return 1;
      return 2;
    };
    const sortedLinks = [...monitoredLinks].sort((a, b) => {
      const risk = riskScore(a.status) - riskScore(b.status);
      if (risk !== 0) return risk;
      const aDt = new Date(a.testedAt).getTime() || 0;
      const bDt = new Date(b.testedAt).getTime() || 0;
      return aDt - bDt;
    });
    y = checkPageBreak(doc, y, 40);
    y = sectionTitle(doc, y, 'Links Monitoring');

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['URL', 'Description', 'Campaign', 'Status', 'Tested', 'Uptime']],
      body: sortedLinks.map((link) => [
        link.url.length > 40 ? `${link.url.slice(0, 40)}...` : link.url,
        link.description || '—',
        link.campaign || '—',
        link.status,
        link.testedAt,
        link.uptimeDate,
      ]),
      headStyles: {
        fillColor: COLORS.primary,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: 2.5,
      },
      bodyStyles: {
        fontSize: 6.5,
        textColor: COLORS.text,
        cellPadding: 2.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { lineWidth: 0, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 42 },
        3: { cellWidth: 18 },
        4: { cellWidth: 28 },
        5: { cellWidth: 22 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'Perfect') data.cell.styles.textColor = [5, 150, 105];
          else if (val === 'Have errors') data.cell.styles.textColor = [217, 119, 6];
          else data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── DATA QUALITY NOTES ────────────────────────────────────────
  const qualityNotes = reportMetadata.notes || [];
  if (qualityNotes.length > 0) {
    y = checkPageBreak(doc, y, 24);
    y = sectionTitle(doc, y, 'Data Quality Notes');
    qualityNotes.forEach((note) => {
      const lines = doc.splitTextToSize(`- ${note}`, CONTENT_W);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLORS.textLight);
      doc.text(lines, MARGIN, y);
      y += lines.length * 4.1;
    });
  }

  // ── ADD PAGE FOOTERS ──────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i += 1) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, partner.name);
  }

  // ── SAVE ──────────────────────────────────────────────────────
  const fileName = `${partner.name.replace(/\s+/g, '_')}_Report_${periodLabel.replace('/', '-')}.pdf`;
  doc.save(fileName);
}
