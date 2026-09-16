/**
 * AI Presentation PDF export.
 *
 * Landscape 16:9 slides intended for stakeholder review. Each slide carries
 * one idea:
 *   - cover slide with headline
 *   - agenda slide
 *   - executive summary slide
 *   - one slide per KPI band (large numbers, deltas, context)
 *   - one slide per section, with the proper chart rendered large
 *   - alerts slide
 *   - insights slide
 *   - recommendations slide
 *   - closing slide
 */

import { SECTION_TYPES } from '../reportTemplates';
import { getReportTheme, getSeverityColor } from './theme';
import {
  formatValue,
  formatCell,
  humanizeKey,
  formatDateShort,
  safeFileName,
  truncate,
} from './format';
import {
  buildExecutiveSummary,
  buildHeadline,
  buildInsights,
  buildRecommendations,
  collectAlerts,
} from './insights';
import {
  drawTrendChart,
  drawBarChart,
  drawFunnel,
  drawHeatmap,
  drawTreemap,
  drawGeoMap,
  drawGauge,
} from './charts';

const SLIDE = {
  width: 297,
  height: 167,
  marginX: 16,
  marginTop: 14,
  marginBottom: 12,
};

const BODY_LEFT = SLIDE.marginX;
const BODY_RIGHT = SLIDE.width - SLIDE.marginX;
const BODY_WIDTH = BODY_RIGHT - BODY_LEFT;
const BODY_TOP = SLIDE.marginTop;
const BODY_BOTTOM = SLIDE.height - SLIDE.marginBottom;

export async function exportAIPresentation(template, snapshot) {
  if (!template || !snapshot) return;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const theme = getReportTheme(template, { variant: 'dark' });
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [SLIDE.width, SLIDE.height],
  });

  drawCoverSlide(doc, template, snapshot, theme);

  drawAgendaSlide(doc, template, theme);

  drawSummarySlide(doc, template, snapshot, theme);

  drawKpiSlide(doc, snapshot.kpis || [], theme);

  template.sections.forEach((section) => {
    const data = snapshot[section.dataKey];
    if (!hasSectionData(section, data)) return;
    if (section.type === SECTION_TYPES.KPI_GRID && section.dataKey === 'kpis') return;
    drawContentSlide(doc, section, data, theme, autoTable);
  });

  const alerts = collectAlerts(snapshot);
  if (alerts.length > 0) drawAlertsSlide(doc, alerts, theme);

  drawInsightsSlide(doc, buildInsights(snapshot, template), theme);
  drawRecommendationsSlide(doc, buildRecommendations(snapshot, template), theme);
  drawClosingSlide(doc, template, snapshot, theme);

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    drawSlideChrome(doc, theme, p, totalPages, template);
  }

  doc.save(`${safeFileName(template.name)}_Presentation.pdf`);
}

function hasSectionData(section, data) {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') return Object.keys(data).length > 0;
  return false;
}

function addSlide(doc) {
  doc.addPage();
  paintBackground(doc);
}

function paintBackground(doc) {
  doc.setFillColor(15, 21, 36);
  doc.rect(0, 0, SLIDE.width, SLIDE.height, 'F');
}

function drawSlideChrome(doc, theme, page, totalPages, template) {
  if (page === 1) return; // cover has its own chrome
  doc.setFillColor(...theme.palette.accent);
  doc.rect(0, 0, SLIDE.width, 1.4, 'F');
  doc.rect(0, SLIDE.height - 1.4, SLIDE.width, 1.4, 'F');

  doc.setTextColor(160, 175, 200);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(String(template.category || '').toUpperCase(), SLIDE.marginX, SLIDE.height - 4, {
    charSpace: 1.2,
  });
  doc.setFont('helvetica', 'normal');
  doc.text(template.name, SLIDE.marginX + 50, SLIDE.height - 4);
  doc.text(`${page} / ${totalPages}`, SLIDE.width - SLIDE.marginX, SLIDE.height - 4, {
    align: 'right',
  });
}

function drawSlideTitle(doc, title, theme, { eyebrow } = {}) {
  if (eyebrow) {
    doc.setTextColor(...theme.palette.accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(String(eyebrow).toUpperCase(), BODY_LEFT, BODY_TOP + 2, { charSpace: 1.5 });
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(title, BODY_LEFT, BODY_TOP + 12, { maxWidth: BODY_WIDTH - 20 });
  doc.setDrawColor(...theme.palette.accent);
  doc.setLineWidth(0.6);
  doc.line(BODY_LEFT, BODY_TOP + 16, BODY_LEFT + 28, BODY_TOP + 16);
}

function drawCoverSlide(doc, template, snapshot, theme) {
  paintBackground(doc);
  const accent = theme.palette.accent;

  doc.setFillColor(...accent);
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 0.16 }));
  doc.circle(SLIDE.width - 30, SLIDE.height - 30, 120, 'F');
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setFillColor(...accent);
  doc.rect(0, 0, 4, SLIDE.height, 'F');

  doc.setTextColor(...accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(String(template.category || '').toUpperCase(), SLIDE.marginX, 22, { charSpace: 2 });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.text(template.name, SLIDE.marginX, 50, { maxWidth: SLIDE.width - 60 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(200, 210, 225);
  const headline = buildHeadline(snapshot, template);
  doc.text(headline, SLIDE.marginX, 66, { maxWidth: SLIDE.width - 60 });

  doc.setFontSize(11);
  doc.setTextColor(170, 185, 210);
  doc.text(template.description || '', SLIDE.marginX, 80, { maxWidth: SLIDE.width - 80 });

  // Metadata block bottom-left
  doc.setFontSize(9);
  doc.setTextColor(140, 158, 188);
  doc.text(`Generated ${formatDateShort(snapshot.computedAt)}`, SLIDE.marginX, SLIDE.height - 22);
  doc.text(
    `Source ${snapshot.source === 'client' ? 'Client snapshot' : 'API'}  ·  Version ${(snapshot.version || '').slice(0, 16)}`,
    SLIDE.marginX,
    SLIDE.height - 16
  );

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Orchestratori', SLIDE.width - SLIDE.marginX, SLIDE.height - 22, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(160, 175, 200);
  doc.text('AI-assisted presentation', SLIDE.width - SLIDE.marginX, SLIDE.height - 16, {
    align: 'right',
  });
}

function drawAgendaSlide(doc, template, theme) {
  addSlide(doc);
  drawSlideTitle(doc, 'Agenda', theme, { eyebrow: 'What we will cover' });

  const items = [
    'Executive Summary',
    'Key Performance Indicators',
    ...template.sections
      .filter((s) => !(s.type === SECTION_TYPES.KPI_GRID && s.dataKey === 'kpis'))
      .map((s) => s.label),
    'Alerts & Risks',
    'Insights',
    'Recommendations',
  ];

  const cols = 2;
  const colW = (BODY_WIDTH - 12) / cols;
  items.forEach((label, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = BODY_LEFT + col * (colW + 12);
    const y = BODY_TOP + 26 + row * 13;
    doc.setFillColor(...theme.palette.accent);
    doc.circle(x + 4, y - 2, 3.4, 'F');
    doc.setTextColor(15, 21, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(i + 1).padStart(2, '0'), x + 4, y - 0.4, { align: 'center' });
    doc.setTextColor(225, 235, 250);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.text(truncate(label, 50), x + 12, y, { maxWidth: colW - 14 });
  });
}

function drawSummarySlide(doc, template, snapshot, theme) {
  addSlide(doc);
  drawSlideTitle(doc, 'Executive summary', theme, { eyebrow: 'In one paragraph' });

  doc.setTextColor(220, 230, 245);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  const lines = doc.splitTextToSize(buildExecutiveSummary(snapshot, template), BODY_WIDTH - 10);
  doc.text(lines, BODY_LEFT, BODY_TOP + 26, { lineHeightFactor: 1.45 });
}

function drawKpiSlide(doc, kpis, theme) {
  if (!kpis || kpis.length === 0) return;
  addSlide(doc);
  drawSlideTitle(doc, 'Key performance indicators', theme, { eyebrow: 'At a glance' });

  const list = kpis.slice(0, 8);
  const cols = list.length <= 4 ? list.length : 4;
  const rows = Math.ceil(list.length / cols);
  const gap = 6;
  const cardW = (BODY_WIDTH - gap * (cols - 1)) / cols;
  const cardH = Math.min(50, (BODY_BOTTOM - (BODY_TOP + 26) - gap * (rows - 1)) / rows);
  const startY = BODY_TOP + 26;

  list.forEach((kpi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = BODY_LEFT + col * (cardW + gap);
    const y = startY + row * (cardH + gap);

    doc.setFillColor(24, 36, 60);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'F');
    doc.setFillColor(...theme.palette.accent);
    doc.rect(x, y, 2.4, cardH, 'F');

    doc.setTextColor(170, 185, 210);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(truncate(String(kpi.label || ''), 30).toUpperCase(), x + 6, y + 7, { charSpace: 1 });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(formatValue(kpi.value, kpi.format), x + 6, y + 22);

    if (kpi.change != null && !Number.isNaN(Number(kpi.change))) {
      const n = Number(kpi.change);
      const color =
        Math.abs(n) < 0.5 ? [170, 185, 210] : n > 0 ? theme.severity.success : theme.severity.error;
      doc.setTextColor(...color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const sign = n > 0 ? '▲' : n < 0 ? '▼' : '–';
      doc.text(`${sign} ${Math.abs(n).toFixed(1)}%`, x + cardW - 6, y + 22, { align: 'right' });
    }

    if (kpi.tooltip) {
      doc.setTextColor(160, 175, 200);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const wrap = doc.splitTextToSize(String(kpi.tooltip), cardW - 12);
      doc.text(wrap.slice(0, 2), x + 6, y + cardH - 4);
    }
  });
}

function drawContentSlide(doc, section, data, theme, autoTable) {
  addSlide(doc);
  drawSlideTitle(doc, section.label, theme, { eyebrow: humanizeKey(section.type) });

  const chartRect = {
    x: BODY_LEFT,
    y: BODY_TOP + 24,
    w: BODY_WIDTH,
    h: BODY_BOTTOM - (BODY_TOP + 24) - 4,
  };

  switch (section.type) {
    case SECTION_TYPES.LINE_CHART:
      drawTrendChart(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.BAR_CHART:
      drawBarChart(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.FUNNEL_CHART:
      drawFunnel(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.HEATMAP_CALENDAR:
      drawHeatmap(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.TREEMAP:
      drawTreemap(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.GEO_MAP:
      drawGeoMap(doc, data, chartRect, theme, section.config || {});
      break;
    case SECTION_TYPES.GAUGE_KPI:
      drawGauge(doc, data, chartRect, theme);
      break;
    case SECTION_TYPES.RANKED_TABLE:
      drawSlideTable(doc, data, theme, autoTable);
      break;
    case SECTION_TYPES.ALERTS_LIST:
      drawSlideAlerts(doc, data, theme);
      break;
    default:
      doc.setTextColor(200, 210, 220);
      doc.setFontSize(11);
      doc.text(`Unsupported section type: ${section.type}`, BODY_LEFT, BODY_TOP + 30);
  }
}

function drawSlideTable(doc, data, theme, autoTable) {
  if (!Array.isArray(data) || data.length === 0) return;
  const cols = Object.keys(data[0]).slice(0, 6);
  const head = [cols.map((c) => humanizeKey(c))];
  const body = data.slice(0, 12).map((row) => cols.map((c) => formatCell(row[c])));

  autoTable(doc, {
    startY: BODY_TOP + 26,
    head,
    body,
    margin: { left: BODY_LEFT, right: BODY_LEFT },
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
      textColor: [220, 230, 250],
      lineColor: [60, 75, 100],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: theme.palette.accent,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [24, 34, 54] },
  });
}

function drawSlideAlerts(doc, alerts, _theme) {
  if (!Array.isArray(alerts) || alerts.length === 0) return;
  const startY = BODY_TOP + 26;
  alerts.slice(0, 5).forEach((alert, i) => {
    const color = getSeverityColor(alert.severity);
    const y = startY + i * 22;
    if (y + 22 > BODY_BOTTOM) return;
    doc.setFillColor(24, 36, 60);
    doc.roundedRect(BODY_LEFT, y, BODY_WIDTH, 18, 2, 2, 'F');
    doc.setFillColor(...color);
    doc.roundedRect(BODY_LEFT, y, 3, 18, 2, 2, 'F');

    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(alert.severity || 'info').toUpperCase(), BODY_LEFT + 8, y + 6.5, {
      charSpace: 1,
    });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11.5);
    doc.text(truncate(alert.title || 'Alert', 90), BODY_LEFT + 8, y + 12);
    if (alert.detail) {
      doc.setTextColor(190, 200, 220);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(alert.detail, BODY_WIDTH - 18);
      doc.text(lines.slice(0, 1), BODY_LEFT + 8, y + 17);
    }
  });
}

function drawAlertsSlide(doc, alerts, theme) {
  addSlide(doc);
  drawSlideTitle(doc, 'Alerts & risks', theme, { eyebrow: 'Worth attention' });
  drawSlideAlerts(doc, alerts, theme);
}

function drawInsightsSlide(doc, insights, theme) {
  addSlide(doc);
  drawSlideTitle(doc, 'Insights', theme, { eyebrow: 'What the data says' });
  if (!insights || insights.length === 0) {
    doc.setTextColor(200, 210, 220);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Not enough signal yet to surface insights.', BODY_LEFT, BODY_TOP + 30);
    return;
  }
  const startY = BODY_TOP + 26;
  insights.forEach((insight, i) => {
    const y = startY + i * 17;
    if (y > BODY_BOTTOM - 6) return;
    doc.setFillColor(...theme.palette.accent);
    doc.circle(BODY_LEFT + 5, y + 3, 4, 'F');
    doc.setTextColor(15, 21, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(i + 1), BODY_LEFT + 5, y + 4.5, { align: 'center' });
    doc.setTextColor(225, 235, 250);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const wrap = doc.splitTextToSize(insight, BODY_WIDTH - 14);
    doc.text(wrap.slice(0, 2), BODY_LEFT + 12, y + 3.5, { lineHeightFactor: 1.4 });
  });
}

function drawRecommendationsSlide(doc, recs, theme) {
  addSlide(doc);
  drawSlideTitle(doc, 'Recommendations', theme, { eyebrow: 'Next steps' });
  if (!recs || recs.length === 0) return;
  recs.forEach((rec, i) => {
    const y = BODY_TOP + 30 + i * 18;
    if (y > BODY_BOTTOM - 6) return;
    doc.setFillColor(24, 36, 60);
    doc.roundedRect(BODY_LEFT, y, BODY_WIDTH, 14, 2, 2, 'F');
    doc.setFillColor(...theme.palette.accent);
    doc.roundedRect(BODY_LEFT, y, 3.4, 14, 2, 2, 'F');
    doc.setTextColor(225, 235, 250);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const wrap = doc.splitTextToSize(rec, BODY_WIDTH - 12);
    doc.text(wrap.slice(0, 2), BODY_LEFT + 8, y + 6, { lineHeightFactor: 1.35 });
  });
}

function drawClosingSlide(doc, template, snapshot, theme) {
  addSlide(doc);
  doc.setFillColor(...theme.palette.accent);
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 0.18 }));
  doc.circle(40, 40, 120, 'F');
  if (doc.GState && doc.setGState) doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setTextColor(...theme.palette.accent);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('THANK YOU', SLIDE.width / 2, SLIDE.height / 2 - 16, { align: 'center', charSpace: 3 });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(30);
  doc.text('Questions?', SLIDE.width / 2, SLIDE.height / 2, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 192, 215);
  doc.text(
    `${template.name} · ${formatDateShort(snapshot.computedAt)}`,
    SLIDE.width / 2,
    SLIDE.height / 2 + 12,
    { align: 'center' }
  );
}
