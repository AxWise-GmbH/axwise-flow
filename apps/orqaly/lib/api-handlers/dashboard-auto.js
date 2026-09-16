/**
 * Auto-mode dashboard builder.
 *
 * POST /api/app?path=dashboard-auto
 * body: {
 *   prompt: "describe what you want to see",
 *   current_config?: DashboardConfig,        // for refinement
 *   refinement?: "make the first one a pie"  // optional
 * }
 *
 * Flow:
 *   1. Build a system prompt embedding our metric catalog + custom-query
 *      registry as a strict allow-list.
 *   2. Call LLM via existing fallback chain (executeLlm).
 *   3. Parse JSON output and validate with Zod (DashboardConfigSchema).
 *   4. On validation failure, re-prompt once with the error details (h02 pattern).
 *   5. Return { config, rationale, model, durationMs }.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { parseLlmJson } from '../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { catalogForPrompt } from '../../src/services/metricCatalog.js';
import { validateDashboardConfig } from '../../src/services/dashboardSchema.js';
import { catalogForPrompt as customQueryCatalog } from './customQueryRegistry.js';
import { computeBentoLayout } from '../../src/components/Dashboards/bentoLayout.js';

function buildSystemPrompt() {
  const catalog = JSON.stringify(catalogForPrompt(), null, 2);
  const customQueries = JSON.stringify(customQueryCatalog(), null, 2);
  return `You are a dashboard composer for the Orqaly platform.

You output ONLY a JSON object matching this shape:

{
  "version": 1,
  "layout": [{ "i": "<block-id>", "x": 0-11, "y": 0+, "w": 1-12, "h": 1-24 }],
  "blocks": [
    {
      "id": "<unique slug>",
      "type": "kpi" | "trend" | "breakdown" | "pie" | "table" | "alerts" | "markdown" | "custom_query",
      "title": "<short label>",
      "data": {
        "dataset": "<one of the datasets below>",
        "measure": { "agg": "count|sum|avg|min|max|p95", "field": "<column>" },
        "group_by": { "field": "<dimension>", "time_bucket": "day|week|month" },
        "limit": 100
      },
      "filters": { "<filter_field>": "<value>" },
      "body": "<markdown body, only for type=markdown>",
      "custom_query": { "template_id": "<from registry>", "params": {} }
    }
  ],
  "global_filters": { "time_range": { "kind": "last_n_days", "value": 30 } }
}

Use ONLY these datasets / measures / dimensions:
${catalog}

For requests that don't fit those generic shapes, you may pick a custom_query template instead:
${customQueries}

Rules:
- IDs must be unique slugs (e.g. "kpi-spend", "trend-jobs").
- Chart types must match the data shape: KPI for single values, trend for time-series, breakdown/pie for categorical, table for ranked lists, alerts for issues, markdown for headings/notes.
- Layout: pick the blocks but DO NOT worry about coordinates. The server runs an auto-arrange pass that places blocks into a tight bento-grid based on type. Just emit "layout": [] (empty array) — the server replaces it.
- If the user is vague, default time_range to last 30 days and pick 3-5 sensible blocks.
- NEVER invent datasets, measures, or fields. If the user asks for something you can't fulfil, omit that block.
- Output the rationale as a top-level "rationale" string explaining your choices in 1-2 sentences.

CRITICAL measure rules:
- For count: use exactly { "agg": "count" } — NEVER include a "field" property (no "count:*", no field).
- For sum/avg/min/max/p95: REQUIRES a "field" — { "agg": "sum", "field": "<column>" }. Pick fields ONLY from the dataset's "measures" array above.
- Example valid measures: { "agg": "count" }, { "agg": "sum", "field": "amount_usd" }, { "agg": "avg", "field": "duration_ms" }.

CRITICAL dataset hints — these are the most useful for typical questions:
- "agent spend / LLM cost / token usage" → dataset = "llm_usage" (NOT agent_jobs; agent_jobs has no cost columns)
- "goal pipeline / budgets / spend" → dataset = "goals"
- "revenue, refunds, paid events" → dataset = "financial_events"
- "leads / conversion / funnel" → dataset = "leads"
- "agent activity reports" → dataset = "concilium_agent_reports"
- "documents / artifacts produced" → dataset = "deliverables"
- "business hierarchy / kill-switch" → dataset = "businesses"

Return JSON only — no markdown, no commentary, no code fences.`;
}

function buildUserPrompt({ prompt, currentConfig, refinement }) {
  if (refinement && currentConfig) {
    return `Current dashboard:
${JSON.stringify(currentConfig, null, 2)}

The user now wants this change: "${refinement}"

Return the updated full dashboard JSON.`;
  }
  return `Build a dashboard for this request: "${prompt}"`;
}

async function generate({ prompt, currentConfig, refinement, req, usage }) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ prompt, currentConfig, refinement });

  // Try Anthropic (strongest at structured JSON), fallback chain handles others.
  const result = await executeLlmTracked({
    prompt: userPrompt,
    systemPrompt,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    temperature: 0.2,
    maxTokens: 4000,
    jsonMode: true,
    req,
    usage: usage && { ...usage, operation: refinement ? 'refine' : 'compose' },
  });

  let parsed = null;
  let parseError = '';
  try {
    parsed = parseLlmJson(result.content);
  } catch (err) {
    parseError = err.message || 'invalid JSON';
  }

  // Validate
  const validation = parsed ? validateDashboardConfig(parsed) : { ok: false, errors: [{ message: parseError }] };

  if (!validation.ok) {
    // Re-prompt once with the validation errors (h02 pattern).
    const fixPrompt = `${userPrompt}

Your previous response was invalid:
${JSON.stringify(validation.errors, null, 2)}
Original output:
${result.content.slice(0, 2000)}

Return ONLY valid JSON that passes the schema.`;
    const retry = await executeLlmTracked({
      prompt: fixPrompt,
      systemPrompt,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      temperature: 0.1,
      maxTokens: 4000,
      jsonMode: true,
      req,
      usage: usage && { ...usage, operation: 'compose-retry' },
    });
    let retryParsed = null;
    try {
      retryParsed = parseLlmJson(retry.content);
    } catch (err) {
      throw new Error(`LLM_INVALID_JSON: ${err.message}`);
    }
    const retryValidation = validateDashboardConfig(retryParsed);
    if (!retryValidation.ok) {
      throw new Error(
        `LLM_VALIDATION_FAILED: ${retryValidation.errors.map((e) => e.message).join('; ')}`
      );
    }
    // Override the LLM's layout coordinates with our deterministic bento.
    retryValidation.value.layout = computeBentoLayout(retryValidation.value.blocks);
    return {
      config: retryValidation.value,
      rationale: retryParsed.rationale || '(no rationale provided)',
      model: retry.model,
      provider: retry.provider,
      durationMs: result.durationMs + retry.durationMs,
      cost_usd: (result.estimatedCostUsd || 0) + (retry.estimatedCostUsd || 0),
      retried: true,
    };
  }

  // Override the LLM's layout coordinates with our deterministic bento.
  validation.value.layout = computeBentoLayout(validation.value.blocks);
  return {
    config: validation.value,
    rationale: parsed.rationale || '(no rationale provided)',
    model: result.model,
    provider: result.provider,
    durationMs: result.durationMs,
    cost_usd: result.estimatedCostUsd || 0,
    retried: false,
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `dashboard-auto:${getRateLimitIdentifier(req, user.id)}`;
  // Auto-mode burns LLM tokens — keep limits tight.
  const rl = checkRateLimit({ key: rlKey, limit: 12, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests — wait a minute');

  const prompt = String(req.body?.prompt || '').trim().slice(0, 1000);
  const refinement = req.body?.refinement
    ? String(req.body.refinement).trim().slice(0, 500)
    : '';
  const currentConfig = req.body?.current_config || null;

  if (!prompt && !refinement) {
    return jsonError(res, 400, 'prompt or refinement is required');
  }

  // Usage-recording context — admin client + owner, tagged by this handler.
  const admin = buildSupabaseAdminClient();
  const usage = { admin, userId: user.id, source: 'dashboard-auto' };

  try {
    const result = await generate({ prompt, currentConfig, refinement, req, usage });
    return res.status(200).json(result);
  } catch (err) {
    if (err.message?.startsWith('LLM_INVALID_JSON') || err.message?.startsWith('LLM_VALIDATION_FAILED')) {
      return res.status(422).json({ error: err.message });
    }
    return handleApiError(res, err, 'dashboard-auto');
  }
}
