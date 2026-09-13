/**
 * Professional PDF export.
 *
 * Portrait A4 report with:
 *   - branded cover page (template name, period, source)
 *   - table of contents
 *   - executive summary (data-driven narrative)
 *   - KPI dashboard (cards with delta + sparkline-friendly hint)
 *   - one block per section, with the actual chart for that section type
 *   - alerts panel
 *   - recommendations
 *   - footer with page numbers on every page
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

const PAGE = {
  width: 210,
  height: 297,
  marginX: 16,
  marginTop: 20,
  marginBottom: 22,
};

const COLUMN_X = PAGE.marginX;
const COLUMN_W = PAGE.width - PAGE.marginX * 2;
const BODY_BOTTOM = PAGE.height - PAGE.marginBottom;

export async function exportToProfessionalPDF(template, snapshot) {
  if (!template || !snapshot) return;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const theme = getReportTheme(template);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  drawCover(doc, template, snapshot, theme);

  const tocEntries = [];

  // Body content lives on pages 2..N. TOC is composed last and moved into
  // position 2 with doc.movePage so the page numbers we capture remain valid.
  let cursorY = newBodyPage(doc, template, theme);
  cursorY = drawSectionTitle(doc, 'Executive Summary', cursorY, theme);
  tocEntries.push({ label: 'Executive Summary', page: doc.internal.getNumberOfPages() });
  cursorY = drawParagraph(doc, buildExecutiveSummary(snapshot, template), cursorY, theme);

  cursorY = ensureSpace(doc, template, theme, cursorY, 40);
  cursorY = drawSectionTitle(doc, 'Key Performance Indicators', cursorY, theme);
  tocEntries.push({ label: 'Key Performance Indicators', page: doc.internal.getNumberOfPages() });
  cursorY = drawKpiGrid(doc, snapshot.kpis || [], cursorY, theme);

  template.sections.forEach((section) => {
    const data = snapshot[section.dataKey];
    if (!hasSectionData(section, data)) return;
    // KPI grid is already rendered above
    if (section.type === SECTION_TYPES.KPI_GRID && section.dataKey === 'kpis') return;
    cursorY = ensureSpace(doc, template, theme, cursorY, 60);
    cursorY = drawSectionTitle(doc, section.label, cursorY, theme);
    tocEntries.push({ label: section.label, page: doc.internal.getNumberOfPages() });
    cursorY = drawSection(doc, autoTable, section, data, cursorY, theme);
  });

  const alerts = collectAlerts(snapshot);
  if (alerts.length > 0) {
    cursorY = ensureSpace(doc, template, theme, cursorY, 60);
    cursorY = drawSectionTitle(doc, 'Alerts & Risks', cursorY, theme);
    tocEntries.push({ label: 'Alerts & Risks', page: doc.internal.getNumberOfPages() });
    cursorY = drawAlertsBlock(doc, alerts, cursorY, theme);
  }

  cursorY = ensureSpace(doc, template, theme, cursorY, 80);
  cursorY = drawSectionTitle(doc, 'Insights', cursorY, theme);
  tocEntries.push({ label: 'Insights', page: doc.internal.getNumberOfPages() });
  cursorY = drawInsightsList(doc, buildInsights(snapshot, template), cursorY, theme);

  cursorY = ensureSpace(doc, template, theme, cursorY, 60);
  cursorY = drawSectionTitle(doc, 'Recommendations', cursorY, theme);
  tocEntries.push({ label: 'Recommendations', page: doc.internal.getNumberOfPages() });
  drawRecommendationsList(doc, buildRecommendations(snapshot, template), cursorY, theme);

  // Build TOC page at the end, then move it into position 2
  doc.addPage();
  const tocCreatedAt = doc.internal.getNumberOfPages();
  drawPageHeader(doc, template, theme);
  drawTableOfContents(doc, tocEntries, theme);

  // tocEntries point to pages that are about to shift by +1 once TOC is inserted at position 2
  if (typeof doc.movePage === 'function') {
    doc.movePage(tocCreatedAt, 2);
    // Update entries that referenced the old indices (they shifted by +1)
    tocEntries.forEach((entry) => {
      entry.page += 1;
    });
    // Redraw TOC with updated page numbers since references shifted
    doc.setPage(2);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE.width, PAGE.height, 'F');
    drawPageHeader(doc, template, theme);
    drawTableOfContents(doc, tocEntries, theme);
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    if (p === 1) {
      drawCoverFooter(doc, theme, p, totalPages);
    } else {
      drawPageFooter(doc, template, snapshot, theme, p, totalPages);
    }
  }

  doc.save(`${safeFileName(template.name)}_Report.pdf`);
}

function hasSectionData(section, data) {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') return Object.keys(data).length > 0;
  return false;
}

function drawCover(doc, template, snapshot, theme) {
  const accent = theme.palette.accent;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, PAGE.width, PAGE.height, 'F');

  // Accent band
  doc.setFillColor(...accent);
  doc.rect(0, 0, PAGE.width, 4, 'F');

  // Decorative arc
  doc.setFillColor(...accent);
  doc.setGState && doc.setGState(new doc.GState({ opacity: 0.18 }));
  doc.circle(PAGE.width - 12, 84, 90, 'F');
  doc.setGState && doc.setGState(new doc.GState({ opacity: 1 }));

  doc.setTextColor(...accent);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(String(template.category || 'report').toUpperCase(), PAGE.marginX, 22, {
    charSpace: 2,
  });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(36);
  doc.setFont('helvetica', 'bold');
  doc.text(template.name, PAGE.marginX, 38, { maxWidth: PAGE.width - 60 });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(190, 200, 220);
  doc.text(template.description || '', PAGE.marginX, 58, { maxWidth: PAGE.width - 60 });

  // Cover metric strip
  const kpis = (snapshot.kpis || []).slice(0, 3);
  if (kpis.length > 0) {
    const cardGap = 6;
    const cardW = (COLUMN_W - cardGap * (kpis.length - 1)) / kpis.length;
    const cardY = 110;
    const cardH = 38;
    kpis.forEach((kpi, i) => {
      const x = PAGE.marginX + i * (cardW + cardGap);
      doc.setFillColor(28, 38, 56);
      doc.roundedRect(x, cardY, cardW, cardH, 2.5, 2.5, 'F');
      doc.setDrawColor(...accent);
      doc.setLineWidth(0.4);
      doc.line(x + 4, cardY + 4, x + 4, cardY + cardH - 4);
      doc.setTextColor(160, 175, 200);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.text(truncate(kpi.label, 28), x + 8, cardY + 10);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(formatValue(kpi.value, kpi.format), x + 8, cardY + 24);
      if (kpi.change != null && !Number.isNaN(Number(kpi.change))) {
        const n = Number(kpi.change);
        const color =
          Math.abs(n) < 0.5
            ? [180, 192, 212]
            : n > 0
              ? theme.severity.success
              : theme.severity.error;
        doc.setTextColor(...color);
        doc.setFontSize(9);
        doc.text(`${n >= 0 ? '+' : ''}${n.toFixed(1)}% vs prev`, x + 8, cardY + 32);
      }
    });
  }

  // Metadata block
  doc.setTextColor(160, 175, 200);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const metaLines = [
    `Generated  ${formatDateShort(snapshot.computedAt)}`,
    `Version    ${(snapshot.version || '').slice(0, 20)}`,
    `Source     ${snapshot.source === 'client' ? 'Client snapshot' : 'API'}`,
  ];
  metaLines.forEach((line, i) => {
    doc.text(line, PAGE.marginX, 174 + i * 6);
  });

  doc.setDrawColor(...accent);
  doc.setLineWidth(0.4);
  doc.line(PAGE.marginX, 196, PAGE.marginX + 28, 196);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Orchestratori Reporting', PAGE.marginX, 204);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(160, 175, 200);
  doc.text(
    'This document is generated from the most recent snapshot at time of export.',
    PAGE.marginX,
    210,
    { maxWidth: PAGE.width - 40 }
  );
}

function drawCoverFooter(doc, theme, page, total) {
  doc.setTextColor(120, 134, 158);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${page} / ${total}`, PAGE.width - PAGE.marginX, PAGE.height - 8, { align: 'right' });
}

function drawTableOfContents(doc, entries, theme) {
  doc.setTextColor(...theme.neutral.ink);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Contents', PAGE.marginX, PAGE.marginTop + 8);

  doc.setDrawColor(...theme.palette.accent);
  doc.setLineWidth(0.6);
  doc.line(PAGE.marginX, PAGE.marginTop + 12, PAGE.marginX + 28, PAGE.marginTop + 12);

  let y = PAGE.marginTop + 22;
  entries.forEach((entry, i) => {
    doc.setFontSize(10);
    doc.setTextColor(...theme.neutral.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(String(i + 1).padStart(2, '0'), PAGE.marginX, y);
    doc.setTextColor(...theme.neutral.ink);
    doc.setFont('helvetica', 'normal');
    doc.text(entry.label, PAGE.marginX + 10, y, { maxWidth: COLUMN_W - 40 });
    doc.setTextColor(...theme.neutral.muted);
    doc.text(String(entry.page), PAGE.marginX + COLUMN_W, y, { align: 'right' });

    doc.setDrawColor(...theme.neutral.hairline);
    doc.setLineWidth(0.1);
    doc.line(
      PAGE.marginX + 10 + doc.getTextWidth(entry.label) + 2,
      y - 0.6,
      PAGE.marginX + COLUMN_W - 6,
      y - 0.6
    );
    y += 9;
  });
}

function drawPageHeader(doc, template, theme) {
  doc.setFillColor(...theme.neutral.surface);
  doc.rect(0, 0, PAGE.width, PAGE.marginTop - 5, 'F');
  doc.setDrawColor(...theme.palette.accent);
  doc.setLineWidth(0.6);
  doc.line(PAGE.marginX, PAGE.marginTop - 6, PAGE.marginX + 18, PAGE.marginTop - 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...theme.palette.accent);
  doc.text(String(template.category || '').toUpperCase(), PAGE.marginX, PAGE.marginTop - 10, {
    charSpace: 1.5,
  });
  doc.setTextColor(...theme.neutral.ink);
  doc.setFontSize(11);
  doc.text(template.name, PAGE.marginX, PAGE.marginTop - 1);
}

function drawPageFooter(doc, template, snapshot, theme, page, total) {
  doc.setDrawColor(...theme.neutral.hairline);
  doc.setLineWidth(0.2);
  doc.line(PAGE.marginX, PAGE.height - 14, PAGE.width - PAGE.marginX, PAGE.height - 14);
  doc.setFontSize(7.5);
  doc.setTextColor(...theme.neutral.muted);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${template.name} · ${formatDateShort(snapshot.computedAt)}`,
    PAGE.marginX,
    PAGE.height - 8
  );
  if (total) {
    doc.text(`${page} / ${total}`, PAGE.width - PAGE.marginX, PAGE.height - 8, { align: 'right' });
  }
}

function newBodyPage(doc, template, theme) {
  doc.addPage();
  drawPageHeader(doc, template, theme);
  return PAGE.marginTop + 4;
}

function ensureSpace(doc, template, theme, cursorY, neededHeight) {
  if (cursorY + neededHeight > BODY_BOTTOM) {
    return newBodyPage(doc, template, theme);
  }
  return cursorY;
}

function drawSectionTitle(doc, label, cursorY, theme) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...theme.neutral.ink);
  doc.text(label, COLUMN_X, cursorY + 5);
  doc.setDrawColor(...theme.palette.accent);
  doc.setLineWidth(0.6);
  doc.line(COLUMN_X, cursorY + 7.5, COLUMN_X + 22, cursorY + 7.5);
  return cursorY + 12;
}

function drawParagraph(doc, text, cursorY, theme) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...theme.neutral.body);
  const lines = doc.splitTextToSize(text, COLUMN_W);
  doc.text(lines, COLUMN_X, cursorY + 2);
  return cursorY + lines.length * 4.2 + 4;
}

function drawKpiGrid(doc, kpis, cursorY, theme) {
  if (!kpis || kpis.length === 0) {
    return drawParagraph(doc, 'No KPI data available.', cursorY, theme);
  }
  const cols = kpis.length > 6 ? 3 : kpis.length > 4 ? 3 : Math.min(3, kpis.length);
  const cardGap = 4;
  const cardW = (COLUMN_W - cardGap * (cols - 1)) / cols;
  const cardH = 22;

  kpis.forEach((kpi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = COLUMN_X + col * (cardW + cardGap);
    const y = cursorY + row * (cardH + cardGap);

    doc.setFillColor(...theme.neutral.surface);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F');
    doc.setDrawColor(...theme.neutral.hairline);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5);

    doc.setFillColor(...theme.palette.accent);
    doc.rect(x, y, 1.4, cardH, 'F');

    doc.setTextColor(...theme.neutral.muted);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(truncate(String(kpi.label || ''), 26).toUpperCase(), x + 4, y + 5, { charSpace: 0.6 });

    doc.setTextColor(...theme.neutral.ink);
    doc.setFontSize(13);
    doc.text(formatValue(kpi.value, kpi.format), x + 4, y + 13);

    if (kpi.change != null && !Number.isNaN(Number(kpi.change))) {
      const n = Number(kpi.change);
      const color =
        Math.abs(n) < 0.5
          ? theme.neutral.muted
          : n > 0
            ? theme.severity.success
            : theme.severity.error;
      doc.setTextColor(...color);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(`${n >= 0 ? '+' : ''}${n.toFixed(1)}%`, x + cardW - 4, y + 13, { align: 'right' });
    }

    if (kpi.tooltip) {
      doc.setTextColor(...theme.neutral.muted);
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'normal');
      const wrap = doc.splitTextToSize(String(kpi.tooltip), cardW - 8);
      doc.text(wrap[0], x + 4, y + cardH - 3);
    }
  });

  const rowCount = Math.ceil(kpis.length / cols);
  return cursorY + rowCount * (cardH + cardGap) + 4;
}

function drawSection(doc, autoTable, section, data, cursorY, theme) {
  switch (section.type) {
    case SECTION_TYPES.KPI_GRID:
      return drawKpiGrid(doc, Array.isArray(data) ? data : [], cursorY, theme);
    case SECTION_TYPES.LINE_CHART: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: 70 };
      drawTrendChart(doc, data, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.BAR_CHART: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: 70 };
      drawBarChart(doc, data, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.FUNNEL_CHART: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: Math.max(40, data.length * 10 + 6) };
      drawFunnel(doc, data, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.HEATMAP_CALENDAR: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: 45 };
      drawHeatmap(doc, data, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.TREEMAP: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: 80 };
      drawTreemap(doc, data, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.GEO_MAP: {
      const items = Array.isArray(data) ? data : [];
      const rect = {
        x: COLUMN_X,
        y: cursorY,
        w: COLUMN_W,
        h: Math.max(40, Math.ceil(items.length / 4) * 22),
      };
      drawGeoMap(doc, items, rect, theme, section.config || {});
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.GAUGE_KPI: {
      const rect = { x: COLUMN_X, y: cursorY, w: COLUMN_W, h: 50 };
      drawGauge(doc, data, rect, theme);
      return cursorY + rect.h + 6;
    }
    case SECTION_TYPES.RANKED_TABLE:
      return drawDataTable(doc, autoTable, data, cursorY, theme);
    case SECTION_TYPES.ALERTS_LIST:
      return drawAlertsBlock(doc, data, cursorY, theme);
    default:
      return drawParagraph(doc, `Unsupported section type: ${section.type}`, cursorY, theme);
  }
}

function drawDataTable(doc, autoTable, data, cursorY, theme) {
  if (!Array.isArray(data) || data.length === 0) {
    return drawParagraph(doc, 'No data available.', cursorY, theme);
  }
  const cols = Object.keys(data[0]).slice(0, 6);
  const head = [cols.map((c) => humanizeKey(c))];
  const body = data.slice(0, 20).map((row) => cols.map((c) => formatCell(row[c])));

  autoTable(doc, {
    startY: cursorY,
    head,
    body,
    theme: 'plain',
    margin: { left: COLUMN_X, right: COLUMN_X },
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.2, right: 2.5, bottom: 2.2, left: 2.5 },
      textColor: theme.neutral.body,
      lineColor: theme.neutral.hairline,
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: theme.palette.accent,
      textColor: [255, 255, 255],
      fontSize: 8.2,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: theme.neutral.surface,
    },
    didDrawPage: () => {
      // headers are already drawn for added pages via doc.addPage hook elsewhere
    },
  });
  return doc.lastAutoTable.finalY + 6;
}

function drawAlertsBlock(doc, alerts, cursorY, theme) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return drawParagraph(doc, 'No alerts firing.', cursorY, theme);
  }
  let y = cursorY;
  alerts.slice(0, 12).forEach((alert) => {
    const color = getSeverityColor(alert.severity);
    const blockH = alert.detail ? 14 : 9;
    if (y + blockH > BODY_BOTTOM) return;
    doc.setFillColor(...color);
    doc.rect(COLUMN_X, y, 1.6, blockH, 'F');
    doc.setFillColor(...theme.neutral.surface);
    doc.roundedRect(COLUMN_X + 2.4, y, COLUMN_W - 2.4, blockH, 0.8, 0.8, 'F');

    doc.setTextColor(...color);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(String(alert.severity || 'info').toUpperCase(), COLUMN_X + 4.5, y + 4.5, {
      charSpace: 0.5,
    });
    doc.setTextColor(...theme.neutral.ink);
    doc.setFontSize(9.5);
    doc.text(truncate(alert.title || 'Alert', 110), COLUMN_X + 22, y + 4.5);
    if (alert.detail) {
      doc.setTextColor(...theme.neutral.body);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const lines = doc.splitTextToSize(alert.detail, COLUMN_W - 26);
      doc.text(lines.slice(0, 2), COLUMN_X + 22, y + 9);
    }
    y += blockH + 2;
  });
  return y + 4;
}

function drawInsightsList(doc, insights, cursorY, theme) {
  if (!insights || insights.length === 0) {
    return drawParagraph(
      doc,
      'Insights will populate once enough data is collected.',
      cursorY,
      theme
    );
  }
  let y = cursorY;
  insights.forEach((insight, i) => {
    if (y + 14 > BODY_BOTTOM) return;
    doc.setFillColor(...theme.palette.accent);
    doc.circle(COLUMN_X + 3, y + 3, 2.6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(String(i + 1), COLUMN_X + 3, y + 4, { align: 'center' });
    doc.setTextColor(...theme.neutral.body);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const wrap = doc.splitTextToSize(insight, COLUMN_W - 12);
    doc.text(wrap, COLUMN_X + 8, y + 3.5);
    y += Math.max(10, wrap.length * 4.5) + 3;
  });
  return y + 4;
}

function drawRecommendationsList(doc, recs, cursorY, theme) {
  if (!recs || recs.length === 0) {
    return drawParagraph(doc, 'No recommendations to call out this cycle.', cursorY, theme);
  }
  let y = cursorY;
  recs.forEach((rec) => {
    if (y + 12 > BODY_BOTTOM) return;
    doc.setFillColor(...theme.palette.gradient);
    doc.roundedRect(COLUMN_X, y, COLUMN_W, 9, 1, 1, 'F');
    doc.setFillColor(...theme.palette.accent);
    doc.roundedRect(COLUMN_X, y, 2.6, 9, 1, 1, 'F');
    doc.setTextColor(...theme.neutral.ink);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    const wrap = doc.splitTextToSize(rec, COLUMN_W - 10);
    doc.text(wrap[0], COLUMN_X + 6, y + 5.5);
    y += 11;
  });
  return y + 4;
}
