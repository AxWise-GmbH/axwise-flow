/**
 * Shared helpers for customizable dashboard "blocks" + layout templates.
 *
 * A *template* is a named snapshot of `{ hidden, order, widths }` that can be
 * applied to a page's block layout in one click. These helpers are surface
 * agnostic (Home, Assistant, ...) — each page supplies its own block defs and
 * built-in templates and reuses the matching/grouping logic here.
 */

export function sameMembers(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

export function sameSequence(a, b) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

/**
 * True when the live layout (hidden Set + order array + widths Set) matches a
 * template. Used to highlight the active template chip. Order comparison ignores
 * ids the template does not know about so new blocks never break matching.
 *
 * @param {{hidden?:string[], order?:string[], widths?:string[]}|null} template
 * @param {Set<string>|string[]} hiddenSet
 * @param {string[]} order
 * @param {Set<string>|string[]} widthSet
 */
export function templateMatches(template, hiddenSet, order, widthSet) {
  if (!template) return false;
  const tplHidden = template.hidden || [];
  const liveHidden = [...(hiddenSet || [])];
  if (!sameMembers(tplHidden, liveHidden)) return false;

  if (!sameMembers(template.widths || [], [...(widthSet || [])])) return false;

  const known = new Set(template.order || []);
  const liveOrder = (order || []).filter((id) => known.has(id));
  const tplOrder = (template.order || []).filter((id) => known.has(id));
  return sameSequence(tplOrder, liveOrder);
}

/**
 * Group ordered, visible block defs into rows for rendering. Two consecutive
 * half-width blocks form a 2-up row; a full-width block is its own row; a lone
 * half-width block (no neighbour to pair with) gets its own row and is rendered
 * full width so there is never an empty half-cell.
 *
 * @param {Array<{id:string}>} sections - ordered visible block defs
 * @param {Set<string>|Array<string>} widthSet - ids rendered at half width
 * @returns {Array<Array<object>>} rows of 1-2 block defs
 */
export function groupBlockRows(sections, widthSet) {
  const halves = widthSet instanceof Set ? widthSet : new Set(widthSet || []);
  const rows = [];
  let pending = null;
  for (const sec of sections || []) {
    if (halves.has(sec.id)) {
      if (pending) {
        rows.push([pending, sec]);
        pending = null;
      } else pending = sec;
    } else {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([sec]);
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}
