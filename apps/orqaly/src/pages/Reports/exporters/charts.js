/**
 * jsPDF chart renderers for report exports.
 *
 * Each function draws a single chart inside a given rectangle. Drawing is
 * resolution-independent vector output so the result looks crisp in print.
 */

import { formatValue, truncate } from './format';

function autoXKey(data) {
  if (!data || data.length === 0) return null;
  return (
    Object.keys(data[0]).find((k) => typeof data[0][k] === 'string') || Object.keys(data[0])[0]
  );
}

function numericKeys(data, xKey) {
  if (!data || data.length === 0) return [];
  return Object.keys(data[0]).filter((k) => k !== xKey && typeof data[0][k] === 'number');
}

function pickPalette(theme, count) {
  const base = [
    theme.palette.accent,
    theme.severity.info,
    theme.severity.success,
    theme.severity.warning,
    theme.severity.error,
  ];
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(base[i % base.length]);
  return out;
}

function gridLine(doc, x1, y1, x2, y2, color) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.1);
  doc.line(x1, y1, x2, y2);
}

function axisLabel(doc, text, x, y, color, options = {}) {
  doc.setFontSize(options.size || 7);
  doc.setFont('helvetica', options.weight || 'normal');
  doc.setTextColor(...color);
  doc.text(String(text), x, y, options);
}

function compactNumber(v) {
  if (v == null) return '';
  const num = Math.abs(v);
  if (num >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  if (num % 1 !== 0) return v.toFixed(1);
  return String(v);
}

export function drawTrendChart(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No trend data');
    return;
  }
  const xKey = options.xKey || autoXKey(data);
  const seriesKeys = (
    options.lines && options.lines.length > 0 ? options.lines : numericKeys(data, xKey)
  ).slice(0, 4);
  if (seriesKeys.length === 0) {
    drawEmpty(doc, rect, theme, 'No numeric series');
    return;
  }

  const padding = { top: 8, right: 8, bottom: 14, left: 18 };
  const chartX = rect.x + padding.left;
  const chartY = rect.y + padding.top;
  const chartW = rect.w - padding.left - padding.right;
  const chartH = rect.h - padding.top - padding.bottom;

  let minVal = Infinity;
  let maxVal = -Infinity;
  data.forEach((row) => {
    seriesKeys.forEach((k) => {
      const v = Number(row[k]) || 0;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    });
  });
  if (!Number.isFinite(minVal)) minVal = 0;
  if (!Number.isFinite(maxVal)) maxVal = 1;
  if (maxVal === minVal) {
    maxVal = minVal + 1;
  }
  if (minVal > 0) minVal = 0;

  const yToPx = (v) => chartY + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const xToPx = (i) =>
    data.length === 1 ? chartX + chartW / 2 : chartX + (i / (data.length - 1)) * chartW;

  for (let i = 0; i <= 4; i += 1) {
    const y = chartY + (chartH * i) / 4;
    gridLine(doc, chartX, y, chartX + chartW, y, theme.neutral.hairline);
    axisLabel(
      doc,
      compactNumber(maxVal - ((maxVal - minVal) * i) / 4),
      chartX - 2,
      y + 1.5,
      theme.neutral.muted,
      {
        align: 'right',
      }
    );
  }

  const tickCount = Math.min(data.length, 6);
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = tickCount === 1 ? 0.5 : i / (tickCount - 1);
    const idx = Math.round(ratio * (data.length - 1));
    const labelX = xToPx(idx);
    axisLabel(
      doc,
      truncate(String(data[idx][xKey] ?? ''), 8),
      labelX,
      chartY + chartH + 5,
      theme.neutral.muted,
      {
        align: 'center',
      }
    );
  }

  const palette = pickPalette(theme, seriesKeys.length);
  seriesKeys.forEach((key, si) => {
    const color = palette[si];
    doc.setDrawColor(...color);
    doc.setLineWidth(0.8);
    let prev = null;
    data.forEach((row, i) => {
      const v = Number(row[key]) || 0;
      const x = xToPx(i);
      const y = yToPx(v);
      if (prev) doc.line(prev.x, prev.y, x, y);
      prev = { x, y };
    });
    data.forEach((row, i) => {
      const v = Number(row[key]) || 0;
      doc.setFillColor(...color);
      doc.circle(xToPx(i), yToPx(v), 0.9, 'F');
    });
  });

  drawLegend(doc, rect.x + rect.w - 4, rect.y + 4, seriesKeys, palette, theme, { align: 'right' });
}

export function drawBarChart(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No data');
    return;
  }
  const xKey = options.xKey || autoXKey(data);
  const seriesKeys = (
    options.bars && options.bars.length > 0 ? options.bars : numericKeys(data, xKey)
  ).slice(0, 3);
  if (seriesKeys.length === 0) {
    drawEmpty(doc, rect, theme, 'No numeric series');
    return;
  }

  const padding = { top: 8, right: 8, bottom: 14, left: 18 };
  const chartX = rect.x + padding.left;
  const chartY = rect.y + padding.top;
  const chartW = rect.w - padding.left - padding.right;
  const chartH = rect.h - padding.top - padding.bottom;

  let maxVal = 0;
  data.forEach((row) => {
    seriesKeys.forEach((k) => {
      const v = Number(row[k]) || 0;
      if (v > maxVal) maxVal = v;
    });
  });
  if (maxVal === 0) maxVal = 1;

  for (let i = 0; i <= 4; i += 1) {
    const y = chartY + (chartH * i) / 4;
    gridLine(doc, chartX, y, chartX + chartW, y, theme.neutral.hairline);
    axisLabel(
      doc,
      compactNumber((maxVal * (4 - i)) / 4),
      chartX - 2,
      y + 1.5,
      theme.neutral.muted,
      {
        align: 'right',
      }
    );
  }

  const groupCount = data.length;
  const groupW = chartW / groupCount;
  const innerPad = Math.min(groupW * 0.2, 3);
  const barW = (groupW - innerPad * 2) / seriesKeys.length;

  const palette = pickPalette(theme, seriesKeys.length);
  data.forEach((row, gi) => {
    seriesKeys.forEach((key, si) => {
      const v = Number(row[key]) || 0;
      const h = (v / maxVal) * chartH;
      const x = chartX + gi * groupW + innerPad + si * barW;
      const y = chartY + chartH - h;
      doc.setFillColor(...palette[si]);
      doc.roundedRect(x, y, Math.max(0.6, barW - 0.8), h, 0.6, 0.6, 'F');
    });
    axisLabel(
      doc,
      truncate(String(row[xKey] ?? ''), 10),
      chartX + gi * groupW + groupW / 2,
      chartY + chartH + 5,
      theme.neutral.muted,
      { align: 'center' }
    );
  });

  drawLegend(doc, rect.x + rect.w - 4, rect.y + 4, seriesKeys, palette, theme, { align: 'right' });
}

export function drawFunnel(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No funnel data');
    return;
  }
  const stageKey = options.stageKey || 'stage';
  const valueKey =
    options.valueKey ||
    Object.keys(data[0]).find((k) => k !== stageKey && typeof data[0][k] === 'number') ||
    'count';

  const sorted = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
  const max = Math.max(...sorted.map((r) => Number(r[valueKey]) || 0)) || 1;

  const rowGap = 3;
  const totalGap = rowGap * (sorted.length - 1);
  const rowH = Math.max(8, (rect.h - totalGap - 6) / sorted.length);

  const palette = pickPalette(theme, sorted.length);
  let cursorY = rect.y + 3;
  sorted.forEach((row, i) => {
    const value = Number(row[valueKey]) || 0;
    const w = (value / max) * (rect.w - 4);
    const x = rect.x + (rect.w - 4 - w) / 2;
    doc.setFillColor(...palette[i]);
    doc.roundedRect(x, cursorY, w, rowH, 1.2, 1.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(
      truncate(String(row[stageKey] ?? `Stage ${i + 1}`), 24),
      x + 3,
      cursorY + rowH / 2 + 1.5
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(value.toLocaleString(), x + w - 3, cursorY + rowH / 2 + 1.5, { align: 'right' });

    if (i > 0) {
      const prev = Number(sorted[i - 1][valueKey]) || 0;
      const drop = prev > 0 ? ((prev - value) / prev) * 100 : 0;
      if (drop > 0) {
        axisLabel(
          doc,
          `-${drop.toFixed(0)}%`,
          rect.x + rect.w - 2,
          cursorY + rowH / 2 + 1.5,
          theme.severity.error,
          { align: 'right', size: 7.5, weight: 'bold' }
        );
      }
    }
    cursorY += rowH + rowGap;
  });
}

export function drawHeatmap(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No activity recorded');
    return;
  }
  const dateKey = options.dateKey || 'date';
  const valueKey =
    options.valueKey ||
    Object.keys(data[0]).find((k) => k !== dateKey && typeof data[0][k] === 'number') ||
    'count';

  const weeks = options.weeks || 14;
  const totalDays = weeks * 7;
  const map = new Map();
  data.forEach((row) => {
    if (!row[dateKey]) return;
    const key = String(row[dateKey]).slice(0, 10);
    map.set(key, (map.get(key) || 0) + (Number(row[valueKey]) || 0));
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - dayOfWeek - (weeks - 1) * 7);

  const cells = [];
  let max = 0;
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const value = map.get(key) || 0;
    if (value > max) max = value;
    cells.push({ value, key });
  }

  const cellSize = Math.min((rect.w - 18) / weeks, (rect.h - 18) / 7) - 0.8;
  const gridX = rect.x + 14;
  const gridY = rect.y + 6;
  const accent = theme.palette.accent;

  ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((label, i) => {
    if (!label) return;
    axisLabel(
      doc,
      label,
      gridX - 2,
      gridY + i * (cellSize + 0.8) + cellSize * 0.7,
      theme.neutral.muted,
      {
        align: 'right',
        size: 6.5,
      }
    );
  });

  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const cell = cells[w * 7 + d];
      if (!cell) continue;
      const intensity = max > 0 ? cell.value / max : 0;
      const fill =
        intensity === 0
          ? theme.neutral.hairline
          : [
              Math.round(255 - (255 - accent[0]) * (0.2 + intensity * 0.8)),
              Math.round(255 - (255 - accent[1]) * (0.2 + intensity * 0.8)),
              Math.round(255 - (255 - accent[2]) * (0.2 + intensity * 0.8)),
            ];
      doc.setFillColor(...fill);
      doc.roundedRect(
        gridX + w * (cellSize + 0.8),
        gridY + d * (cellSize + 0.8),
        cellSize,
        cellSize,
        0.5,
        0.5,
        'F'
      );
    }
  }

  axisLabel(doc, 'Less', rect.x + rect.w - 28, rect.y + rect.h - 2, theme.neutral.muted, {
    size: 6.5,
  });
  [0, 0.25, 0.5, 0.75, 1].forEach((step, i) => {
    const fill =
      step === 0
        ? theme.neutral.hairline
        : [
            Math.round(255 - (255 - accent[0]) * (0.2 + step * 0.8)),
            Math.round(255 - (255 - accent[1]) * (0.2 + step * 0.8)),
            Math.round(255 - (255 - accent[2]) * (0.2 + step * 0.8)),
          ];
    doc.setFillColor(...fill);
    doc.roundedRect(rect.x + rect.w - 22 + i * 3, rect.y + rect.h - 4, 2, 2, 0.3, 0.3, 'F');
  });
  axisLabel(doc, 'More', rect.x + rect.w - 6, rect.y + rect.h - 2, theme.neutral.muted, {
    size: 6.5,
  });
}

export function drawTreemap(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No data');
    return;
  }
  const nameKey = options.nameKey || autoXKey(data) || 'name';
  const valueKey =
    options.valueKey ||
    Object.keys(data[0]).find((k) => k !== nameKey && typeof data[0][k] === 'number') ||
    'value';
  const format = options.format || 'number';

  const items = data
    .map((row) => ({
      name: row[nameKey] ?? '',
      value: Number(row[valueKey]) || 0,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  if (items.length === 0) {
    drawEmpty(doc, rect, theme, 'No measurable values');
    return;
  }

  const total = items.reduce((sum, it) => sum + it.value, 0);
  const palette = pickPalette(theme, items.length);

  let x = rect.x;
  let y = rect.y;
  let w = rect.w;
  let h = rect.h;
  let horizontal = w >= h;

  items.forEach((it, i) => {
    const ratio = it.value / total;
    let cellW;
    let cellH;
    if (i === items.length - 1) {
      cellW = w;
      cellH = h;
    } else if (horizontal) {
      cellW = w * ratio * 1.4;
      cellW = Math.min(cellW, w * 0.7);
      cellH = h;
    } else {
      cellH = h * ratio * 1.4;
      cellH = Math.min(cellH, h * 0.7);
      cellW = w;
    }

    doc.setFillColor(...palette[i]);
    doc.roundedRect(x, y, cellW, cellH, 0.8, 0.8, 'F');
    doc.setTextColor(255, 255, 255);
    if (cellW > 18 && cellH > 10) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(truncate(String(it.name), 22), x + 2, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(formatValue(it.value, format), x + 2, y + 9);
    }

    if (horizontal) {
      x += cellW;
      w -= cellW;
    } else {
      y += cellH;
      h -= cellH;
    }
    horizontal = w >= h;
  });
}

export function drawGeoMap(doc, data, rect, theme, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    drawEmpty(doc, rect, theme, 'No regional data');
    return;
  }
  const geoKey = options.geoKey || 'geo';
  const valueKey =
    options.valueKey ||
    Object.keys(data[0]).find((k) => k !== geoKey && typeof data[0][k] === 'number') ||
    'value';
  const format = options.format || 'number';

  const total = data.reduce((sum, r) => sum + (Number(r[valueKey]) || 0), 0) || 1;
  const max = Math.max(...data.map((r) => Number(r[valueKey]) || 0)) || 1;
  const items = [...data].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));

  const cols = Math.min(4, items.length);
  const rows = Math.ceil(items.length / cols);
  const gap = 2;
  const cellW = (rect.w - gap * (cols - 1)) / cols;
  const cellH = (rect.h - gap * (rows - 1)) / rows;
  const accent = theme.palette.accent;

  items.forEach((item, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const value = Number(item[valueKey]) || 0;
    const intensity = value / max;
    const x = rect.x + c * (cellW + gap);
    const y = rect.y + r * (cellH + gap);

    doc.setFillColor(
      Math.round(255 - (255 - accent[0]) * (0.15 + intensity * 0.7)),
      Math.round(255 - (255 - accent[1]) * (0.15 + intensity * 0.7)),
      Math.round(255 - (255 - accent[2]) * (0.15 + intensity * 0.7))
    );
    doc.roundedRect(x, y, cellW, cellH, 1.2, 1.2, 'F');

    doc.setTextColor(...theme.neutral.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(truncate(String(item[geoKey] ?? '-'), 14), x + 2.5, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(formatValue(value, format), x + 2.5, y + 10);
    doc.setFontSize(6.5);
    doc.setTextColor(...theme.neutral.muted);
    doc.text(`${((value / total) * 100).toFixed(1)}% of total`, x + 2.5, y + 14);
  });
}

export function drawGauge(doc, kpi, rect, theme) {
  if (!kpi) {
    drawEmpty(doc, rect, theme, 'No data');
    return;
  }
  const value = Number(kpi.value) || 0;
  const target = Number(kpi.target) || 0;
  const ratio = target > 0 ? Math.max(0, Math.min(1.2, value / target)) : 0;
  const sweep = Math.min(180, ratio * 180);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h - 8;
  const radius = Math.min(rect.w / 2 - 4, rect.h - 14);

  doc.setLineCap('round');
  doc.setDrawColor(...theme.neutral.hairline);
  doc.setLineWidth(3);
  drawArc(doc, cx, cy, radius, 0, 180);

  const fillColor =
    ratio >= 1
      ? theme.severity.success
      : ratio >= 0.7
        ? theme.palette.accent
        : ratio >= 0.4
          ? theme.severity.warning
          : theme.severity.error;
  doc.setDrawColor(...fillColor);
  drawArc(doc, cx, cy, radius, 0, sweep);

  doc.setTextColor(...theme.neutral.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(formatValue(value, kpi.format), cx, cy - 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...theme.neutral.muted);
  doc.text(target > 0 ? `target ${formatValue(target, kpi.format)}` : 'no target set', cx, cy + 1, {
    align: 'center',
  });
}

function drawArc(doc, cx, cy, r, startDeg, endDeg) {
  const steps = Math.max(6, Math.round((endDeg - startDeg) / 6));
  let prev = null;
  for (let i = 0; i <= steps; i += 1) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps;
    const rad = ((deg - 180) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    if (prev) doc.line(prev.x, prev.y, x, y);
    prev = { x, y };
  }
}

function drawLegend(doc, x, y, keys, palette, theme, { align = 'left' } = {}) {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...theme.neutral.muted);
  let cursorX = x;
  if (align === 'right') {
    // measure
    const labels = keys.map((k) => doc.getTextWidth(k));
    const totalW = labels.reduce((s, w) => s + w + 8, 0);
    cursorX = x - totalW;
  }
  keys.forEach((key, i) => {
    doc.setFillColor(...palette[i]);
    doc.rect(cursorX, y - 1.5, 2, 2, 'F');
    doc.setTextColor(...theme.neutral.muted);
    doc.text(key, cursorX + 3, y, { align: 'left' });
    cursorX += doc.getTextWidth(key) + 8;
  });
}

function drawEmpty(doc, rect, theme, message) {
  doc.setFillColor(...theme.neutral.surface);
  doc.roundedRect(rect.x, rect.y, rect.w, rect.h, 1, 1, 'F');
  doc.setTextColor(...theme.neutral.muted);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(message, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, { align: 'center' });
}
