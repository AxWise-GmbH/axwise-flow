/**
 * Metric catalog — single source of truth for what the dashboard builder can
 * chart. Used by:
 *   - DataPicker UI (manual mode)
 *   - dashboard-query handler (server-side validation + SQL building)
 *   - dashboard-auto LLM prompt (so the model never hallucinates a metric)
 *   - chartRecommend rules
 *
 * EVERY column listed below has been verified against an actual migration in
 * supabase/migrations/. To expose a new table/columns to dashboards, add one
 * dataset entry here — nothing else needs to change.
 *
 * Verified against:
 *   goals                  → 069_goals.sql + 140_businesses.sql (business_id)
 *   businesses             → 140_businesses.sql
 *   leads                  → 076_deliverables_marketplace.sql
 *   financial_events       → 076_deliverables_marketplace.sql
 *   deliverables           → 076_deliverables_marketplace.sql
 *   concilium_agent_reports → 048_agent_reports.sql
 *   llm_usage              → 031_llm_usage_and_retries.sql
 */

export const CATALOG = {
  goals: {
    label: 'Goals',
    description: 'Goal pipeline: status, budget, spend',
    icon: 'TrackChanges',
    measures: [
      'count',
      'sum:budget_usd',
      'sum:spent_usd',
      'avg:budget_usd',
      'avg:spent_usd',
      'sum:current_value',
      'avg:current_value',
      'sum:target_value',
      'avg:iteration',
    ],
    dimensions: [
      'status',
      'target_unit',
      'business_id',
      'org_id',
      'created_at:day|week|month',
      'updated_at:day|week|month',
    ],
    filters: ['status', 'target_unit', 'business_id', 'org_id'],
    click_through: { entity: 'goal', id_field: 'id' },
  },

  businesses: {
    label: 'Businesses',
    description: 'Business hierarchy, kill-switch state',
    icon: 'Business',
    measures: ['count'],
    dimensions: ['status', 'business_type', 'master_kill_switch', 'created_at:day|week|month'],
    filters: ['status', 'business_type'],
    click_through: { entity: 'business', id_field: 'id' },
  },

  llm_usage: {
    label: 'LLM usage',
    description: 'Per-call cost, tokens, duration — by provider/model',
    icon: 'SmartToy',
    measures: [
      'count',
      'sum:estimated_cost_usd',
      'avg:estimated_cost_usd',
      'sum:total_tokens',
      'avg:total_tokens',
      'sum:prompt_tokens',
      'sum:completion_tokens',
      'sum:duration_ms',
      'avg:duration_ms',
      'p95:duration_ms',
    ],
    dimensions: ['provider', 'model', 'created_at:day|week|month'],
    filters: ['provider', 'model'],
  },

  financial_events: {
    label: 'Financial events',
    description: 'Revenue, spend, refunds, fees',
    icon: 'Payments',
    measures: ['count', 'sum:amount_usd', 'avg:amount_usd'],
    dimensions: ['event_type', 'direction', 'source', 'goal_id', 'created_at:day|week|month'],
    filters: ['event_type', 'direction', 'source'],
  },

  leads: {
    label: 'Leads',
    description: 'Lead funnel and attribution',
    icon: 'PersonAdd',
    measures: ['count', 'sum:revenue_usd', 'avg:revenue_usd', 'avg:relevance_score'],
    dimensions: [
      'status',
      'source',
      'goal_id',
      'created_at:day|week|month',
      'updated_at:day|week|month',
    ],
    filters: ['status', 'source'],
    click_through: { entity: 'lead', id_field: 'id' },
  },

  deliverables: {
    label: 'Deliverables',
    description: 'Generated artifacts and their state',
    icon: 'Inventory2',
    measures: ['count'],
    dimensions: [
      'status',
      'type',
      'goal_id',
      'created_at:day|week|month',
      'updated_at:day|week|month',
    ],
    filters: ['status', 'type'],
  },

  concilium_agent_reports: {
    label: 'Agent reports',
    description: 'Per-agent activity, token usage, cost',
    icon: 'Assessment',
    measures: [
      'count',
      'sum:tokens_used',
      'avg:tokens_used',
      'sum:cost_usd',
      'avg:cost_usd',
      'sum:requests_made',
      'sum:errors_count',
    ],
    dimensions: ['report_type', 'agent_id', 'board_id', 'verified', 'created_at:day|week|month'],
    filters: ['report_type', 'agent_id', 'verified'],
  },
};

/**
 * Strip a bucket suffix from a dimension key.
 * 'created_at:day|week|month' → 'created_at'
 * 'status' → 'status'
 */
export function dimensionField(dim) {
  return String(dim).split(':')[0];
}

export function dimensionBuckets(dim) {
  const [, buckets] = String(dim).split(':');
  if (!buckets) return [];
  return buckets.split('|').filter(Boolean);
}

export function parseMeasure(spec) {
  if (spec === 'count') return { agg: 'count' };
  const [agg, field] = String(spec).split(':');
  return { agg, field };
}

/**
 * Build the canonical measure key. `count` never takes a field — if a caller
 * (e.g. a slightly-confused LLM) sets `field: '*'` or anything else when
 * `agg === 'count'`, we strip it so the catalog lookup succeeds. For all
 * other aggregations, an explicit field is required.
 */
export function measureKey(measure) {
  if (!measure) return '';
  if (measure.agg === 'count') return 'count';
  return measure.field ? `${measure.agg}:${measure.field}` : measure.agg;
}

/**
 * Validate a (dataset, measure, group_by, filters) tuple against the catalog.
 * Returns { ok: true } or { ok: false, error }.
 */
export function validateAgainstCatalog({ dataset, measure, group_by, filters }) {
  const d = CATALOG[dataset];
  if (!d) return { ok: false, error: `Unknown dataset: ${dataset}` };

  if (measure) {
    const key = measureKey(measure);
    if (!d.measures.includes(key)) {
      return { ok: false, error: `Unknown measure for ${dataset}: ${key}` };
    }
  }

  if (group_by?.field) {
    const found = d.dimensions.find((dim) => dimensionField(dim) === group_by.field);
    if (!found) {
      return {
        ok: false,
        error: `Unknown group_by for ${dataset}: ${group_by.field}`,
      };
    }
    if (group_by.time_bucket) {
      const buckets = dimensionBuckets(found);
      if (!buckets.includes(group_by.time_bucket)) {
        return {
          ok: false,
          error: `time_bucket ${group_by.time_bucket} not allowed on ${group_by.field}`,
        };
      }
    }
  }

  if (filters) {
    for (const key of Object.keys(filters)) {
      if (!d.filters.includes(key)) {
        return { ok: false, error: `Filter not allowed for ${dataset}: ${key}` };
      }
    }
  }

  return { ok: true };
}

/** Return a compact JSON representation safe to embed in an LLM prompt. */
export function catalogForPrompt() {
  return Object.fromEntries(
    Object.entries(CATALOG).map(([k, v]) => [
      k,
      {
        label: v.label,
        description: v.description,
        measures: v.measures,
        dimensions: v.dimensions,
        filters: v.filters,
      },
    ])
  );
}
