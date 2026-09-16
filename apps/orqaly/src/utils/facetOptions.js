/**
 * Helpers for building Marketplace filter facet option lists from live data.
 *
 * A facet option is a `{ value, label, color? }` descriptor. Options are derived
 * from the actual item set (so the UI only ever offers values that exist), then
 * optionally overlaid with config-provided labels/colors.
 */

/**
 * Derive distinct, sorted option descriptors for one facet from the item set.
 *
 * @param {Array}   items          Raw item list.
 * @param {string}  field          Item field to read.
 * @param {object}  [opts]
 * @param {boolean} [opts.array]   True when item[field] is an array (tags, capabilities).
 * @returns {Array<{ value: string, label: string }>} distinct values, sorted A-Z.
 */
export function deriveFacetOptions(items, field, { array = false } = {}) {
  const set = new Set();
  for (const item of items || []) {
    const v = item?.[field];
    if (array) {
      if (Array.isArray(v)) {
        for (const x of v) if (x != null && x !== '') set.add(String(x));
      }
    } else if (v != null && v !== '') {
      set.add(String(v));
    }
  }
  return [...set]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

/**
 * Overlay config labels/colors onto derived options. Config wins on label/color;
 * derived-only values (not present in config) are retained with their raw label.
 *
 * @param {Array<{ value: string, label: string }>} derived
 * @param {Array<{ value: string, label?: string, color?: string }>} [config]
 * @returns {Array<{ value: string, label: string, color?: string }>}
 */
export function mergeFacetOptions(derived, config = []) {
  const byValue = new Map((config || []).map((c) => [c.value, c]));
  return (derived || []).map((o) => ({ ...o, ...(byValue.get(o.value) || {}) }));
}
