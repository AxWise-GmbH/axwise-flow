/**
 * Report insights handler (consolidated under api/ops).
 * POST /api/report-insights  → /api/ops?path=report-insights
 *
 * Generates a real, LLM-written executive narrative + recommendations for a
 * report snapshot using the configured platform LLM. Every call is recorded to llm_usage via the shared
 * tracked executor, so Report Studio spend shows up on /llm-usage like any other
 * call site. The client falls back to a deterministic summary on any failure, so
 * this endpoint is allowed to fail loudly (4xx/5xx) without breaking the studio.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { SUPPORTED_REPORT_TYPES } from '../../src/utils/reportAggregation.js';
import { defaultProvider, defaultCheapModel } from '../_shared/llm-defaults.js';

const SYSTEM_PROMPT =
  'You are a precise executive business analyst. Write a tight, factual briefing ' +
  'from the provided report metrics ONLY. Never invent numbers, partners, or trends ' +
  'that are not in the data. Be concrete and reference the actual figures. ' +
  'Output plain text (no markdown headings). Structure: one short paragraph (2-3 ' +
  'sentences) summarising performance, then a line "Recommendations:" followed by ' +
  '2-3 single-line bullet points starting with "- ". Keep the whole reply under 130 words.';

function fmtValue(kpi) {
  const v = Number(kpi?.value ?? 0);
  switch (kpi?.format) {
    case 'currency':
      return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case 'percent':
      return `${v.toFixed(1)}%`;
    default:
      return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
}

function buildPrompt({ templateName, kpis, alerts, topRows }) {
  const lines = [`Report: ${templateName || 'Report'}`, '', 'Key metrics:'];
  (kpis || []).slice(0, 8).forEach((k) => {
    const note = k.tooltip ? ` (${k.tooltip})` : '';
    lines.push(`- ${k.label}: ${fmtValue(k)}${note}`);
  });
  if (Array.isArray(alerts) && alerts.length > 0) {
    lines.push('', 'Active alerts:');
    alerts.slice(0, 6).forEach((a) => {
      lines.push(`- [${a.severity || 'info'}] ${a.title}${a.detail ? `: ${a.detail}` : ''}`);
    });
  } else {
    lines.push('', 'Active alerts: none.');
  }
  if (Array.isArray(topRows) && topRows.length > 0) {
    lines.push('', 'Top entries:');
    topRows.slice(0, 5).forEach((r) => {
      const label = r.name || r.title || r.scenario || r.channel || 'item';
      const metric =
        r.revenue != null
          ? `$${Number(r.revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          : r.jobs != null
            ? `${r.jobs} jobs`
            : '';
      lines.push(`- ${label}${metric ? ` — ${metric}` : ''}`);
    });
  }
  lines.push('', 'Write the briefing now.');
  return lines.join('\n');
}

function parseBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return b;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  // ── Rate limit (tighter than /reports: this calls an LLM) ─────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  try {
    const { reportType, templateName, kpis, alerts, topRows } = parseBody(req);
    if (!reportType) return jsonError(res, 400, 'Missing required "reportType"');
    if (!SUPPORTED_REPORT_TYPES.includes(reportType)) {
      return jsonError(res, 400, `Unknown report type "${reportType}"`);
    }
    if (!Array.isArray(kpis) || kpis.length === 0) {
      return jsonError(res, 400, 'No KPI data supplied to summarise');
    }

    const prompt = buildPrompt({ templateName, kpis, alerts, topRows });
    const admin = buildSupabaseAdminClient();

    const result = await executeLlmV2Tracked({
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.4,
      maxTokens: 320,
      timeoutMs: 20000,
      usage: {
        admin,
        userId: user.id,
        source: 'report-insights',
        operation: reportType,
        description: `Report Studio narrative: ${templateName || reportType}`,
      },
    });

    const narrative = String(result?.content || '').trim();
    if (!narrative) return jsonError(res, 502, 'Model returned an empty narrative');

    return res.status(200).json({
      reportType,
      narrative,
      provider: result.provider || defaultProvider(),
      model: result.model || null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(res, err, 'report-insights');
  }
}
