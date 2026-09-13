/**
 * Allow-listed custom queries — the safety net for "I need something the
 * generic resolver can't express." NEVER raw SQL from the LLM. Each entry
 * declares its param schema (Zod) and its handler function.
 *
 * The handler receives ({ admin, userId, params }) and must return
 * { rows: [{ group, value, count }], total, sample_count }.
 *
 * Auto mode can reference these by `template_id`. The dashboard-query
 * resolver also dispatches them when a block has type='custom_query'.
 */
import { z } from 'zod';

const TEMPLATES = {
  /**
   * Top N failed agent jobs in the last N days, by cost.
   */
  top_failed_jobs: {
    label: 'Top failed agent jobs by cost',
    paramSchema: z.object({
      window_days: z.number().int().min(1).max(180).default(7),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async handler({ admin, userId, params }) {
      const since = new Date(Date.now() - params.window_days * 86400_000).toISOString();
      const { data, error } = await admin
        .from('agent_jobs')
        .select('id, status, cost_usd, type, created_at')
        .eq('user_id', userId)
        .eq('status', 'failed')
        .gte('created_at', since)
        .order('cost_usd', { ascending: false })
        .limit(params.limit);
      if (error) throw error;
      const rows = (data || []).map((r) => ({
        group: r.type || r.id,
        value: Number(r.cost_usd) || 0,
        count: 1,
      }));
      return {
        rows,
        total: rows.reduce((acc, r) => acc + r.value, 0),
        sample_count: rows.length,
      };
    },
  },

  /**
   * Goal budget utilization: spent / budget per active goal.
   */
  goal_budget_utilization: {
    label: 'Goal budget utilization',
    paramSchema: z.object({
      include_completed: z.boolean().default(false),
    }),
    async handler({ admin, userId, params }) {
      let q = admin
        .from('goals')
        .select('id, status, budget_usd, spent_usd')
        .eq('user_id', userId);
      if (!params.include_completed) {
        q = q.neq('status', 'completed');
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data || []).map((g) => ({
        group: g.id,
        value: Number(g.budget_usd) > 0 ? (Number(g.spent_usd) / Number(g.budget_usd)) * 100 : 0,
        count: 1,
      }));
      return {
        rows: rows.sort((a, b) => b.value - a.value),
        total: rows.reduce((acc, r) => acc + r.value, 0) / Math.max(rows.length, 1),
        sample_count: rows.length,
      };
    },
  },

  /**
   * Agent cost share by provider — derived from concilium_agent_reports.
   */
  cost_by_provider: {
    label: 'Cost share by LLM provider',
    paramSchema: z.object({
      window_days: z.number().int().min(1).max(365).default(30),
    }),
    async handler({ admin, userId, params }) {
      const since = new Date(Date.now() - params.window_days * 86400_000).toISOString();
      const { data, error } = await admin
        .from('concilium_agent_reports')
        .select('report_type, cost_usd')
        .eq('user_id', userId)
        .gte('created_at', since);
      if (error) throw error;
      const totals = new Map();
      for (const r of data || []) {
        const k = r.report_type || 'unknown';
        totals.set(k, (totals.get(k) || 0) + (Number(r.cost_usd) || 0));
      }
      const rows = [...totals.entries()]
        .map(([group, value]) => ({ group, value, count: 1 }))
        .sort((a, b) => b.value - a.value);
      return {
        rows,
        total: rows.reduce((acc, r) => acc + r.value, 0),
        sample_count: rows.length,
      };
    },
  },
};

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    template_id: id,
    label: t.label,
    params: Object.keys(t.paramSchema?.shape || {}),
  }));
}

/**
 * Validate template_id + params; on success return parsed params.
 */
export function validateTemplate(templateId, params) {
  const t = TEMPLATES[templateId];
  if (!t) return { ok: false, error: `Unknown template_id: ${templateId}` };
  const parsed = t.paramSchema.safeParse(params || {});
  if (!parsed.success) {
    return {
      ok: false,
      error: `Invalid params: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }
  return { ok: true, params: parsed.data };
}

export async function runTemplate({ admin, userId, templateId, params }) {
  const v = validateTemplate(templateId, params);
  if (!v.ok) throw new Error(v.error);
  const tpl = TEMPLATES[templateId];
  return tpl.handler({ admin, userId, params: v.params });
}

export function catalogForPrompt() {
  return Object.entries(TEMPLATES).map(([id, t]) => {
    const shape = t.paramSchema?.shape || {};
    return {
      template_id: id,
      label: t.label,
      params: Object.fromEntries(
        Object.entries(shape).map(([k, v]) => [k, v._def?.typeName || 'any'])
      ),
    };
  });
}
