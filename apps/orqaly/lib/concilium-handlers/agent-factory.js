/**
 * Agent Factory: create agents from blueprints with full validation.
 *
 * POST /api/concilium?path=agent-factory
 * Body: { blueprint_id } OR inline config { name, system_prompt, ... }
 *
 * Flow:
 * 1. Load/merge blueprint
 * 2. Run security validation
 * 3. Check tools against whitelist
 * 4. Estimate cost
 * 5. Register agent
 * 6. Auto-accept if low-risk; queue for approval if high-risk
 * 7. Seed rate limits
 * 8. Return agent + tracking_token + instruction packet
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  checkRateLimit,
  applyRateLimitHeaders,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { validateAgentConfig, screenSystemPrompt } from './agent-config-validator.js';
import { randomUUID } from 'node:crypto';
import { withAxwiseTracked, buildAgentGenerateContext } from '../integrations/axwise/index.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('agent-factory');

// Cost estimates per 1K tokens (USD) — synced from llm-executor-v2.js
const TOKEN_COSTS = {
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'deepseek-reasoner': { input: 0.00055, output: 0.0022 },
  'glm-4': { input: 0.001, output: 0.001 },
  'glm-4-flash': { input: 0.0001, output: 0.0001 },
  'gemini-3.8-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.7-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.6-flash': { input: 0.0015, output: 0.0075 },
  'gemini-flash-latest': { input: 0.0015, output: 0.0075 },
};

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'cagt_';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

function buildInstructionPacket(agent, config) {
  return {
    platform: 'Orqaly',
    version: '1.0',
    rules: {
      task_manager:
        'Create subtasks via POST /api/app?path=tasks. Always create a task before starting work.',
      reports:
        'Submit activity reports via POST /api/concilium?path=domain-tools with tool_id reports:submit.',
      job_pool:
        'When assigned a job, update status to running. On completion, set status to done with result.',
      tools: `Use only your assigned tools: ${(config.tools || []).join(', ')}. Call via POST /api/concilium?path=domain-tools.`,
      workflows:
        'For multi-step tasks, run an owned workflow via POST /api/app?path=workflows&action=execute with workflowId and triggerData.',
      projects:
        'When working on project-linked tasks, add progress notes via the task relatedProjects field.',
    },
    constraints: {
      max_requests_per_hour: config.constraints?.max_requests_per_hour || 60,
      max_cost_per_day_usd: Number(config.constraints?.max_cost_per_day_usd || 5),
      check_in_interval_ms: config.constraints?.check_in_interval_ms || 300000,
      tracking_token: agent.tracking_token || null,
    },
    model: {
      provider: config.provider || defaultProvider(),
      model: config.model || (config.provider ? '' : defaultModel()),
      temperature: config.temperature ?? 0.3,
      max_tokens: config.max_tokens || 3000,
    },
  };
}

function estimateCost(config) {
  const model = config.model || (config.provider ? '' : defaultModel());
  const costs =
    TOKEN_COSTS[model] || TOKEN_COSTS[defaultModel()] || TOKEN_COSTS['gemini-3.8-flash'];
  const maxTokens = config.max_tokens || 3000;

  // Estimate: system prompt tokens + avg input + max output
  const promptTokens = Math.ceil((config.system_prompt || '').length / 4);
  const avgInputTokens = 500;
  const inputCost = ((promptTokens + avgInputTokens) / 1000) * costs.input;
  const outputCost = (maxTokens / 1000) * costs.output;
  const perCall = inputCost + outputCost;

  return {
    model,
    per_call_usd: Math.round(perCall * 10000) / 10000,
    estimated_hourly_usd: Math.round(perCall * 10 * 10000) / 10000, // ~10 calls/hr
    estimated_daily_usd: Math.round(perCall * 100 * 10000) / 10000, // ~100 calls/day
  };
}

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

    // 1. Load or build config
    let config;
    if (body.blueprint_id) {
      const { data: blueprint, error } = await admin
        .from('agent_blueprints')
        .select('*')
        .eq('id', body.blueprint_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return handleApiError(res, error, 'factory:load-blueprint');
      if (!blueprint) return jsonError(res, 404, 'Blueprint not found');
      config = blueprint;
    } else {
      // Inline config
      if (!body.name) return jsonError(res, 400, 'name or blueprint_id is required');
      if (!body.system_prompt) return jsonError(res, 400, 'system_prompt is required');
      config = body;
    }

    // 1.5 AxWise cognition (fail-closed point): author persona + injection/scope
    // gate. Shadow-safe: no-op unless AXWISE_ENABLE. Effects apply only when
    // AXWISE_ENFORCE=authoritative; local agent-config-validator always runs.
    const axReqId = randomUUID();
    const axTenant = { userId: user.id, orgId: body.orgId || body.org_id || null };
    // Cheap pure local security verdict on the ORIGINAL prompt (before any AxWise
    // rewrite below), persisted beside the AxWise verdict for divergence analysis.
    const localSecurity = screenSystemPrompt(config.system_prompt).decision;
    const ax = await withAxwiseTracked(
      buildAgentGenerateContext({
        requestId: axReqId,
        tenant: axTenant,
        config,
        boardId: config.board_id || body.board_id || null,
        requestContext: body.requestContext || null,
      }),
      () => ({ processedOutputs: {} }),
      { posture: 'closed', admin, localDecision: localSecurity }
    );
    const axBlock = ax.skipped
      ? null
      : {
          requestId: axReqId,
          applicableConditions: ax.applicableConditions || [],
          processedOutputs: ax.processedOutputs || {},
        };
    let axForceApproval = false;

    if (process.env.AXWISE_ENFORCE === 'authoritative') {
      const axSecurity = ax.processedOutputs?.security;
      // Hard-block only on an authoritative (non-degraded) denial.
      if (!ax.degraded && axSecurity?.scopeDecision === 'denied') {
        return res.status(403).json({
          error: 'Agent blocked by AxWise security review',
          reason: axSecurity.blockReason || 'scope denied',
        });
      }
      // degraded rule: when AxWise could not rule on this fail-closed point,
      // do not trust scopeDecision - be conservative and route to approval.
      // `disabled` is excluded: AxWise being switched off is not a failure to
      // rule, it is the user opting out, and must leave the pre-integration
      // local path (agent-config-validator + screenSystemPrompt) untouched.
      if (ax.degraded && !ax.disabled) {
        axForceApproval = true;
      } else {
        if (axSecurity?.requiresApproval) axForceApproval = true;
        const frag = ax.processedOutputs?.systemPromptFragment;
        if (frag)
          config = { ...config, system_prompt: `${frag}\n\n${config.system_prompt || ''}`.trim() };
        const persona = ax.processedOutputs?.persona;
        if (persona && persona.temperature != null && config.temperature == null) {
          config = { ...config, temperature: persona.temperature };
        }
      }
    }

    // 2. Validate config
    const validation = await validateAgentConfig(admin, config, user.id);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Agent config validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // 3. Estimate cost
    const costEstimate = estimateCost(config);

    // 4. Determine risk level from the tool whitelist (the async .some() block
    // that used to sit here was dead code - it never resolved and its result was
    // never read; risk is decided by the toolEntries query below + AxWise).
    let requiresApproval = false;
    if (config.tools && config.tools.length > 0) {
      const { data: toolEntries } = await admin
        .from('agent_tool_whitelist')
        .select('tool_id, risk_level, requires_approval')
        .eq('user_id', user.id)
        .in('tool_id', config.tools);

      requiresApproval = (toolEntries || []).some(
        (t) => t.risk_level === 'high' || t.requires_approval
      );
    }

    const maxCost = Number(config.constraints?.max_cost_per_day_usd || 5);
    if (maxCost > 20) requiresApproval = true;
    if (axForceApproval) requiresApproval = true;

    // 5. Register agent
    const trackingToken = generateToken();
    const agentRow = {
      user_id: user.id,
      name: config.name,
      description: config.description || '',
      board_id: config.board_id || null,
      agent_type: 'internal',
      check_in_interval_ms: config.constraints?.check_in_interval_ms || 300000,
      max_requests_per_hour: config.constraints?.max_requests_per_hour || 60,
      max_cost_per_day_usd: maxCost,
      status: requiresApproval ? 'pending' : 'accepted',
      tracking_token: requiresApproval ? null : trackingToken,
      accepted_at: requiresApproval ? null : new Date().toISOString(),
      axwise: axBlock,
    };

    const { data: agent, error: insertErr } = await admin
      .from('concilium_agents')
      .insert(agentRow)
      .select('*')
      .single();
    if (insertErr) {
      log.error('Agent insert failed', { error: insertErr.message, code: insertErr.code });
      return res.status(400).json({ error: `Agent creation failed: ${insertErr.message}` });
    }

    // 6. Activate blueprint
    if (body.blueprint_id && config.status === 'draft') {
      await admin
        .from('agent_blueprints')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', body.blueprint_id)
        .eq('user_id', user.id);
    }

    // 7. Seed rate limit row
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);

    await admin.from('concilium_rate_limits').upsert(
      {
        user_id: user.id,
        entity_type: 'agent',
        entity_id: agent.id,
        max_requests_per_hour: config.constraints?.max_requests_per_hour || 60,
        max_requests_per_day: (config.constraints?.max_requests_per_hour || 60) * 24,
        max_tokens_per_day: 500000,
        max_cost_per_day_usd: maxCost,
        max_cost_per_month_usd: maxCost * 30,
        hour_reset_at: new Date(now.getTime() + 3600_000).toISOString(),
        day_reset_at: new Date(now.getTime() + 86400_000).toISOString(),
        month_reset_at: nextMonth.toISOString(),
      },
      { onConflict: 'entity_type,entity_id' }
    );

    // 8. Build instruction packet
    const instructions = buildInstructionPacket(agent, config);

    // Store instructions as metadata
    if (!requiresApproval) {
      await admin.from('concilium_agents').update({ metadata: instructions }).eq('id', agent.id);
    }

    endTimer('factory:create');
    log.info('Agent created via factory', {
      agentId: agent.id,
      userId: user.id,
      autoApproved: !requiresApproval,
      tools: config.tools?.length || 0,
    });

    return res.status(201).json({
      agent,
      instructions: requiresApproval ? null : instructions,
      cost_estimate: costEstimate,
      requires_approval: requiresApproval,
      warnings: validation.warnings,
    });
  } catch (err) {
    return handleApiError(res, err, 'agent-factory');
  }
}
