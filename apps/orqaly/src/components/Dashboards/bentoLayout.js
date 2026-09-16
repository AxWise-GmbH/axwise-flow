/**
 * Bento auto-layout — packs dashboard blocks into a tight 12-column grid
 * where each block's size reflects its content needs (KPIs small, charts
 * medium, tables full-width), with no horizontal gaps.
 *
 * Used by:
 *   - lib/api-handlers/dashboard-auto.js — after LLM produces blocks,
 *     replaces its layout coords with a deterministic bento.
 *   - src/pages/Dashboards/DashboardEditor.jsx — "Auto-arrange" button +
 *     re-flow when a new block is added.
 *
 * Algorithm is deterministic + single-pass. Output rows always sum to
 * exactly 12 columns wide.
 */

const GRID_COLS = 12;

/**
 * Per-type ideal dimensions. The {w} value is the "natural" width on a
 * 12-col grid; the algorithm may stretch a block horizontally to fill
 * gaps so every row sums to 12.
 */
const SIZE = {
  markdown: { w: 12, h: 2, category: 'header' },
  kpi: { w: 3, h: 2, category: 'stat' },
  alerts: { w: 4, h: 5, category: 'media' },
  pie: { w: 4, h: 5, category: 'media' },
  breakdown: { w: 6, h: 5, category: 'media' },
  trend: { w: 8, h: 5, category: 'media' },
  table: { w: 12, h: 6, category: 'wide' },
  custom_query: { w: 12, h: 6, category: 'wide' },
};

function sizeFor(type) {
  return SIZE[type] || { w: 6, h: 5, category: 'media' };
}

/**
 * Pack a list of stats blocks (kpi) into rows. Each row holds up to 4 by
 * default; if a row has fewer, blocks expand to fill the 12-col width.
 */
function packStats(stats, startY) {
  const items = [];
  let y = startY;
  const PER_ROW = 4;
  for (let i = 0; i < stats.length; i += PER_ROW) {
    const rowBlocks = stats.slice(i, i + PER_ROW);
    const w = Math.floor(GRID_COLS / rowBlocks.length); // 12 / 4 = 3, 12 / 3 = 4
    rowBlocks.forEach((b, j) => {
      items.push({ i: b.id, x: j * w, y, w, h: 2 });
    });
    // Distribute the remainder (12 % rowBlocks.length) to the trailing block
    const remainder = GRID_COLS - w * rowBlocks.length;
    if (remainder > 0 && items.length) {
      items[items.length - 1].w += remainder;
    }
    y += 2;
  }
  return { items, nextY: y };
}

/**
 * Pack media blocks (trend / breakdown / pie / alerts) into rows. Aims for
 * a magazine-like layout: pair wide+narrow (8+4), triplets at 4+4+4, etc.
 */
function packMedia(media, startY) {
  const items = [];
  let y = startY;
  let i = 0;
  while (i < media.length) {
    const remaining = media.length - i;
    if (remaining === 1) {
      // Single block left → full width
      const b = media[i];
      const h = sizeFor(b.type).h;
      items.push({ i: b.id, x: 0, y, w: 12, h });
      y += h;
      i += 1;
    } else if (remaining === 2) {
      // Pair: wider block left at 8, narrower right at 4 (unless both wide)
      const [a, c] = [media[i], media[i + 1]];
      const aSize = sizeFor(a.type);
      const cSize = sizeFor(c.type);
      const aWide = aSize.w >= 6;
      const cWide = cSize.w >= 6;
      let aw, cw;
      if (aWide && !cWide) {
        aw = 8;
        cw = 4;
      } else if (!aWide && cWide) {
        aw = 4;
        cw = 8;
      } else {
        aw = 6;
        cw = 6;
      }
      const h = Math.max(aSize.h, cSize.h);
      items.push({ i: a.id, x: 0, y, w: aw, h });
      items.push({ i: c.id, x: aw, y, w: cw, h });
      y += h;
      i += 2;
    } else if (remaining === 3) {
      // Triplet: 4 + 4 + 4
      const row = media.slice(i, i + 3);
      const h = Math.max(...row.map((b) => sizeFor(b.type).h));
      row.forEach((b, j) => items.push({ i: b.id, x: j * 4, y, w: 4, h }));
      y += h;
      i += 3;
    } else {
      // 4+ remaining: do a 2×2 (6+6 / 6+6) chunk
      const row = media.slice(i, i + 4);
      const h0 = Math.max(sizeFor(row[0].type).h, sizeFor(row[1].type).h);
      const h1 = Math.max(sizeFor(row[2].type).h, sizeFor(row[3].type).h);
      items.push({ i: row[0].id, x: 0, y, w: 6, h: h0 });
      items.push({ i: row[1].id, x: 6, y, w: 6, h: h0 });
      items.push({ i: row[2].id, x: 0, y: y + h0, w: 6, h: h1 });
      items.push({ i: row[3].id, x: 6, y: y + h0, w: 6, h: h1 });
      y += h0 + h1;
      i += 4;
    }
  }
  return { items, nextY: y };
}

/**
 * Compute a bento layout for an array of blocks.
 *
 * @param {Array<{id: string, type: string}>} blocks
 * @returns {Array<{i: string, x: number, y: number, w: number, h: number}>}
 */
export function computeBentoLayout(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  const headers = blocks.filter((b) => sizeFor(b.type).category === 'header');
  const stats = blocks.filter((b) => sizeFor(b.type).category === 'stat');
  const media = blocks.filter((b) => sizeFor(b.type).category === 'media');
  const wide = blocks.filter((b) => sizeFor(b.type).category === 'wide');

  const items = [];
  let y = 0;

  // Headers full-width on top
  headers.forEach((b) => {
    const h = sizeFor(b.type).h;
    items.push({ i: b.id, x: 0, y, w: 12, h });
    y += h;
  });

  // Stats packed in rows of up to 4
  if (stats.length) {
    const packed = packStats(stats, y);
    items.push(...packed.items);
    y = packed.nextY;
  }

  // Media (charts, alerts) — pair smart
  if (media.length) {
    const packed = packMedia(media, y);
    items.push(...packed.items);
    y = packed.nextY;
  }

  // Wide (tables) full-width at bottom
  wide.forEach((b) => {
    const h = sizeFor(b.type).h;
    items.push({ i: b.id, x: 0, y, w: 12, h });
    y += h;
  });

  return items;
}

/**
 * Return the default {w,h} for a given block type. Use this when adding a
 * standalone block without re-laying out the whole dashboard.
 */
export function bentoSizeFor(type) {
  const s = sizeFor(type);
  return { w: s.w, h: s.h };
}
