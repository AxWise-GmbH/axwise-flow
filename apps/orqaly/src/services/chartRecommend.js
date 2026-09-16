/**
 * Chart-type recommendation engine.
 *
 * Given the shape of a block's data (scalar, time-series, categorical,
 * ranked), return which chart types are recommended, which are allowed
 * with a warning, and a short rationale.
 *
 * Used by:
 *   - ChartTypePicker (shows ⚠ icon next to non-recommended types)
 *   - dashboard-auto (LLM prompt guidance)
 */

import { dimensionField } from './metricCatalog';

export const ALL_CHART_TYPES = ['kpi', 'trend', 'breakdown', 'pie', 'table', 'alerts', 'markdown'];

/**
 * Classify a (measure, group_by, cardinality) tuple into a shape.
 * cardinality = expected number of group-by buckets (optional hint).
 */
export function classifyShape({ measure, group_by, cardinality }) {
  if (!measure) return 'scalar';

  // No grouping → one number
  if (!group_by || !group_by.field) return 'scalar';

  const field = dimensionField(group_by.field);

  // Time series: grouped by a timestamp dimension
  const isTime = /(_at|_date|date|time)$/i.test(field) || Boolean(group_by.time_bucket);
  if (isTime) return 'timeseries';

  // Categorical, sized by cardinality hint
  if (typeof cardinality === 'number') {
    if (cardinality <= 6) return 'categorical_small';
    return 'categorical_large';
  }

  // No hint — assume small until we know better.
  return 'categorical_small';
}

const RULES = {
  scalar: {
    recommended: ['kpi'],
    warned: ['trend', 'breakdown', 'table'],
    blocked: ['pie', 'alerts'],
    rationale: 'Single value — KPI tile shows it most clearly.',
  },
  timeseries: {
    recommended: ['trend'],
    warned: ['breakdown', 'table'],
    blocked: ['pie', 'kpi'],
    rationale: 'Values over time — line/bar trend is clearest.',
  },
  categorical_small: {
    recommended: ['breakdown', 'pie'],
    warned: ['table'],
    blocked: ['trend', 'kpi'],
    rationale: 'Few categories — bar or pie both work.',
  },
  categorical_large: {
    recommended: ['breakdown', 'table'],
    warned: ['pie'],
    blocked: ['trend', 'kpi'],
    rationale: 'Many categories — pie becomes unreadable above ~6 slices.',
  },
};

/**
 * Return recommendation arrays + a rationale string for a given block.
 *   { recommended: string[], warned: string[], blocked: string[], rationale: string }
 *
 * "blocked" types should not be offered; "warned" types show a ⚠ icon.
 */
export function recommend({ measure, group_by, cardinality } = {}) {
  const shape = classifyShape({ measure, group_by, cardinality });
  const rule = RULES[shape];
  return {
    shape,
    recommended: [...rule.recommended],
    warned: [...rule.warned],
    blocked: [...rule.blocked],
    rationale: rule.rationale,
  };
}

/** Convenience: classify a single chart type for this data shape. */
export function classifyChartType(type, { measure, group_by, cardinality } = {}) {
  const r = recommend({ measure, group_by, cardinality });
  if (r.recommended.includes(type)) return 'recommended';
  if (r.warned.includes(type)) return 'warned';
  if (r.blocked.includes(type)) return 'blocked';
  return 'unknown';
}
