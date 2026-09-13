/**
 * Platform Copilot — multi-turn read -> reason -> act -> answer loop.
 * POST /api/agent?path=copilot
 *
 * Hosted on api/agent.js (maxDuration 180s) because the loop makes several
 * blocking LLM calls; api/app.js (30s) is too tight.
 *
 * Actions:
 *  - copilot        : run the agentic loop (default)
 *  - resolve-action : approve/reject a confirmation-gated proposed action
 *
 * Reuses the existing engine: executeToolCall + extractBlocks (assistant-bridge),
 * getRiskLevel/isReadTool/buildCopilotSystemPrompt (assistant-chat), the tracked
 * LLM executor, the content guard, and the daily spend cap.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { parseLlmJson } from '../concilium-handlers/llm-executor-v2.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { guardUserContent, blockedResponse } from '../security/content-guard.js';
import { auditSecurityEvent } from '../security/audit-security-event.js';
import {
  buildCopilotSystemPrompt,
  getRiskLevel,
  isReadTool,
} from '../api-handlers/assistant-chat.js';
import { windowHistory, OMITTED_HISTORY_NOTE } from '../_shared/chat-history.js';
import { draftGoalCreateArgs } from '../_shared/goal-draft.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';
import { resolveLlmPair } from '../_shared/llm-pair.js';
import { executeToolCall, checkDailySpendCap } from '../communicator-handlers/assistant-bridge.js';
import { extractBlocks } from '../communicator-handlers/chat-blocks-extractor.js';
import { resolvePendingToolCall } from '../communicator-handlers/resolve-pending.js';
import { randomUUID } from 'node:crypto';
import { withAxwiseTracked, buildCopilotContext } from '../integrations/axwise/index.js';
import { enqueueAxwiseGroundJob } from '../integrations/axwise/grounding-job.js';

const log = createLogger('copilot');

const MAX_ITERATIONS = 4;
const COPILOT_LLM_TIMEOUT_MS = 20_000;
const WALL_CLOCK_BUDGET_MS = 150_000;
const MAX_RESULT_CHARS = 6_000;
const STUCK_REPEAT_LIMIT = 3;

// entityType -> the read tool that loads it (for pageContext pre-load).
const ENTITY_READ_TOOL = {
  goal: 'goal.get',
  workflow: 'workflow.get',
  org: 'org.get',
  organization: 'org.get',
  pulse: 'pulse.get',
  consilium: 'consilium.getBoard',
  board: 'consilium.getBoard',
};

function trim(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/**
 * Force the active organization onto KB/brief/insights tool args so scoping can't
 * be skipped, and exclude the current conversation from a past-chats search.
 */
function withOrg(tool, args, orgId, conversationId) {
  const a = { ...(args || {}) };
  if (orgId && !a.organization_id && /^(kb|brief|insights)\./.test(tool)) a.organization_id = orgId;
  if (conversationId && tool === 'chat.searchHistory') a.excludeConversationId = conversationId;
  return a;
}

function sanitizePageContext(pc) {
  if (!pc || typeof pc !== 'object') return null;
  const route =
    typeof pc.route === 'string' && /^[\w\-/?=&:.%]{0,160}$/.test(pc.route) ? pc.route : '';
  const entityType =
    typeof pc.entityType === 'string' && /^[a-z-]{1,30}$/i.test(pc.entityType) ? pc.entityType : '';
  const entityId =
    typeof pc.entityId === 'string' && /^[\w-]{1,64}$/.test(pc.entityId) ? pc.entityId : '';
  if (!route && !entityType) return null;
  return { route, entityType, entityId };
}

/** Build the <external> DATA prepended to the first user turn (focused entity + attachments). */
async function buildPrepend(admin, userId, pageContext, attachments) {
  let prepend = '';
  if (pageContext?.entityType && pageContext?.entityId) {
    const tool = ENTITY_READ_TOOL[pageContext.entityType];
    if (tool) {
      try {
        const res = await executeToolCall(admin, userId, tool, { id: pageContext.entityId });
        prepend += `<external>FOCUSED ENTITY (${pageContext.entityType} ${pageContext.entityId}): ${trim(JSON.stringify(res), 3000)}</external>\n`;
      } catch {
        /* ignore preload failures */
      }
    }
  }
  for (const att of Array.isArray(attachments) ? attachments.slice(0, 5) : []) {
    const documentId = att?.documentId;
    if (!documentId || !/^[\w-]{1,64}$/.test(String(documentId))) continue;
    try {
      const res = await executeToolCall(admin, userId, 'kb.get', { id: documentId });
      const doc = res?.document;
      if (doc)
        prepend += `<external>ATTACHED FILE "${trim(doc.title || 'file', 120)}":\n${trim(String(doc.content || ''), 4000)}</external>\n`;
    } catch {
      /* ignore */
    }
  }
  return prepend;
}

function isStuck(keys) {
  const counts = {};
  for (const k of keys) {
    counts[k] = (counts[k] || 0) + 1;
    if (counts[k] >= STUCK_REPEAT_LIMIT) return true;
  }
  return false;
}

/**
 * The agentic loop. Returns { message, blocks, proposedActions, toolTrace, iterations, usage, cost, model, provider }.
 * proposedActions are NOT yet persisted — the handler persists them to pending_tool_calls.
 */
export async function runCopilotLoop(
  {
    admin,
    userId,
    message,
    history,
    pageContext,
    personality,
    provider,
    model,
    memories,
    orgId,
    conversationId,
    systemPromptFragment,
  },
  opts = {}
) {
  const attachments = opts.attachments || [];
  // Resolve the selection once so every prompt, execution call, log and return
  // value observes the same provider/model pair. In particular, a provider-only
  // request must not inherit the Gemini model (and vice versa).
  const platformPair = resolveLlmPair(
    {
      provider: process.env.LLM_DEFAULT_PROVIDER,
      model: process.env.LLM_DEFAULT_MODEL,
    },
    { fallback: { provider: defaultProvider(), model: defaultModel() } }
  );
  const selectedLlm = resolveLlmPair({ provider, model }, { fallback: platformPair });
  const orgHint = orgId
    ? `\nACTIVE ORGANIZATION: ${orgId}. Scope Knowledge Base reads, briefs and saved insights to it.`
    : '';
  // AxWise-authored tone/persona fragment (empty unless authoritative + ruled).
  const axHint = systemPromptFragment ? `\n${systemPromptFragment}` : '';
  const systemPrompt =
    buildCopilotSystemPrompt({
      personality,
      memories,
      pageContext,
      provider: selectedLlm.provider,
      model: selectedLlm.model,
    }) +
    orgHint +
    axHint;
  const prepend = await buildPrepend(admin, userId, pageContext, attachments);
  const firstUser = [prepend, message].filter(Boolean).join('\n\n');

  // Prior conversation is passed as real turns (not a system-prompt blob) so the
  // model can actually read the whole current chat — including a freshly-switched model.
  const { turns: historyTurns, omitted: historyOmitted } = windowHistory(history);
  const messages = [{ role: 'system', content: systemPrompt }];
  if (historyOmitted) messages.push({ role: 'system', content: OMITTED_HISTORY_NOTE });
  for (const t of historyTurns) messages.push(t);
  messages.push({ role: 'user', content: firstUser });

  const blocks = [];
  const toolTrace = [];
  const stuckKeys = [];
  let finalMessage = '';
  let llmError = null;
  let proposedRaw = [];
  let iterations = 0;
  let cost = 0;
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let lastModel = selectedLlm.model;
  let lastProvider = selectedLlm.provider;
  const started = Date.now();

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    iterations = i + 1;
    const overBudget = Date.now() - started > WALL_CLOCK_BUDGET_MS;
    if (i === MAX_ITERATIONS - 1 || overBudget) {
      messages.push({
        role: 'user',
        content:
          'This is your final turn. Reply now with an {"action":"answer", "message":"...", "proposedActions":[...]} JSON object using what you already have.',
      });
    }

    let llm;
    try {
      llm = await executeLlmV2Tracked({
        userId,
        messages,
        provider: selectedLlm.provider,
        model: selectedLlm.model,
        temperature: 0.2,
        maxTokens: 2000,
        jsonMode: true,
        timeoutMs: COPILOT_LLM_TIMEOUT_MS,
        usage: { admin, userId, source: 'copilot', operation: 'loop' },
      });
    } catch (err) {
      // Every LLM failure used to collapse into one opaque sentence with the
      // cause visible only in server logs, so a missing key, a 401, a timeout
      // and a bad model name were indistinguishable from the UI. Off Vercel
      // (local dev) append the real reason so this is diagnosable without a
      // code trace; in production keep the generic text and log the detail.
      const reason = err?.message ? String(err.message).slice(0, 300) : '';
      const detailed = reason && !process.env.VERCEL;
      finalMessage =
        finalMessage ||
        (detailed
          ? `I hit an error reaching the model. Please try again. (${reason})`
          : 'I hit an error reaching the model. Please try again.');
      llmError = reason || 'unknown';
      log.warn({}, 'copilot.llm-failed', {
        error: err?.message,
        provider: selectedLlm.provider,
        model: selectedLlm.model,
      });
      break;
    }

    cost += llm.estimatedCostUsd || 0;
    usage.prompt_tokens += llm.usage?.prompt_tokens || 0;
    usage.completion_tokens += llm.usage?.completion_tokens || 0;
    usage.total_tokens += llm.usage?.total_tokens || 0;
    lastModel = llm.model || lastModel;
    lastProvider = llm.provider || lastProvider;

    const parsed = parseLlmJson(llm.content);
    if (!parsed) {
      // The reply was not parseable JSON (e.g. a thinking model emitted raw
      // newlines or prose). NEVER surface the raw protocol text to the user.
      // Re-ask once with a strict nudge; if it is already the final turn, fall
      // back to a graceful message.
      const isLastTurn = i === MAX_ITERATIONS - 1 || overBudget;
      if (!isLastTurn) {
        messages.push({ role: 'assistant', content: trim(llm.content, 500) });
        messages.push({
          role: 'user',
          content:
            'Your last reply was not valid JSON. Reply again with ONLY a single JSON object matching the protocol ("action":"read" or "action":"answer"), no code fences, and escape every newline inside string values as \\n.',
        });
        continue;
      }
      finalMessage = 'I ran into trouble formatting that answer. Please try asking again.';
      break;
    }

    if (parsed.action === 'answer' || (!parsed.action && parsed.message)) {
      finalMessage = parsed.message || '';
      proposedRaw = Array.isArray(parsed.proposedActions) ? parsed.proposedActions : [];
      break;
    }

    if (parsed.action === 'read') {
      const calls = Array.isArray(parsed.calls) ? parsed.calls : [];
      const safeCalls = calls.filter((c) => c && typeof c.tool === 'string' && isReadTool(c.tool));
      const droppedMutations = calls.filter(
        (c) => c && typeof c.tool === 'string' && !isReadTool(c.tool)
      );

      const results = [];
      for (const call of safeCalls) {
        stuckKeys.push(call.tool + JSON.stringify(call.args || {}).slice(0, 200));
        try {
          const result = await executeToolCall(
            admin,
            userId,
            call.tool,
            withOrg(call.tool, call.args, orgId, conversationId)
          );
          results.push({ tool: call.tool, status: 'ok', result });
          toolTrace.push({ tool: call.tool, status: 'ok' });
          blocks.push(...(extractBlocks(call.tool, call.args || {}, result) || []));
        } catch (err) {
          results.push({ tool: call.tool, status: 'error', error: err.message });
          toolTrace.push({ tool: call.tool, status: 'error' });
        }
      }

      messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
      let feedback;
      if (!safeCalls.length && !droppedMutations.length) {
        feedback =
          'No valid read tools were requested. Answer now with what you know, or request a specific read tool.';
      } else {
        feedback = 'TOOL RESULTS:\n' + trim(JSON.stringify(results), MAX_RESULT_CHARS);
        if (droppedMutations.length) {
          feedback += `\n\nNOTE: ${droppedMutations.map((c) => c.tool).join(', ')} are mutations and were NOT run. If the user wants them, list them under proposedActions in your final answer with a clear summary each.`;
        }
      }
      messages.push({ role: 'user', content: feedback });

      if (isStuck(stuckKeys)) {
        messages.push({
          role: 'user',
          content: 'You are repeating the same reads. Give your best final answer now.',
        });
      }
      continue;
    }

    // Unrecognized shape — nudge back to the protocol.
    messages.push({ role: 'assistant', content: trim(llm.content, 500) });
    messages.push({
      role: 'user',
      content: 'Reply with a single JSON object whose "action" is either "read" or "answer".',
    });
  }

  if (!finalMessage) {
    finalMessage =
      'Here is what I found based on the data I could read. Ask me to go deeper on anything.';
  }

  // Post-process proposed actions: auto-run any that are actually safe reads
  // (their blocks get appended), keep real mutations as confirmation proposals.
  const proposedActions = [];
  for (const p of proposedRaw) {
    if (!p || typeof p.tool !== 'string') continue;
    if (isReadTool(p.tool)) {
      try {
        const result = await executeToolCall(
          admin,
          userId,
          p.tool,
          withOrg(p.tool, p.args, orgId, conversationId)
        );
        blocks.push(...(extractBlocks(p.tool, p.args || {}, result) || []));
        toolTrace.push({ tool: p.tool, status: 'ok' });
      } catch {
        /* ignore */
      }
      continue;
    }
    // Complete goal.create here rather than inside the executor, so the
    // confirmation card can show the title and budget it would create and mark
    // the ones the model never stated as a draft.
    let args = withOrg(p.tool, p.args, orgId);
    let draftFields = [];
    if (p.tool === 'goal.create') ({ args, draftFields } = draftGoalCreateArgs(args));
    proposedActions.push({
      tool: p.tool,
      args,
      draftFields,
      riskLevel: getRiskLevel(p.tool),
      summary: typeof p.summary === 'string' ? trim(p.summary, 240) : `Run ${p.tool}`,
    });
  }

  return {
    message: finalMessage,
    blocks,
    proposedActions,
    toolTrace,
    iterations,
    usage,
    cost,
    model: lastModel,
    provider: lastProvider,
    ...(llmError ? { llmError } : {}),
  };
}

export function resolveCopilotOrgId(value, userId) {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : userId;
}

// ── Handler ─────────────────────────────────────────────────────────────────

async function handleCopilot(req, res, user, admin, done) {
  const rawMessage = req.body?.message;
  if (!rawMessage || typeof rawMessage !== 'string') {
    done({ status: 400 });
    return jsonError(res, 400, 'message is required');
  }

  const guard = guardUserContent(rawMessage, { context: 'copilot:chat' });
  await auditSecurityEvent({
    userId: user.id,
    context: 'copilot:chat',
    guardResult: guard,
    sample: rawMessage,
  });
  if (guard.action === 'block') {
    done({ status: 400, security: 'blocked' });
    return blockedResponse(res, guard, 'Your message was blocked by security review');
  }

  const cap = await checkDailySpendCap(admin, user.id);
  if (cap.over) {
    done({ status: 200 });
    return res.status(200).json({
      message: `Daily LLM cap of $${cap.cap.toFixed(2)} reached ($${cap.spent.toFixed(2)} used). Try again tomorrow or raise it in Settings.`,
      blocks: [],
      proposedActions: [],
      capExceeded: true,
    });
  }

  const pageContext = sanitizePageContext(req.body?.pageContext);
  // Keep the real database organization separate from AxWise's required tenant
  // id. Personal sessions use the authenticated user only for the AxWise call;
  // llm_usage must receive null instead of that non-organization UUID.
  const organizationId = resolveCopilotOrgId(req.body?.orgId, null);
  const orgId = organizationId || user.id;

  // AxWise copilot cognition (advisory security + tone). Shadow-safe: no-op
  // unless AXWISE_ENABLE. The local guardUserContent above stays the primary
  // gate; AxWise only augments it and (in authoritative mode) supplies tone.
  const axReqId = randomUUID();
  const axTenant = { userId: user.id, orgId };
  const ax = await withAxwiseTracked(
    buildCopilotContext({
      requestId: axReqId,
      tenant: axTenant,
      message: guard.cleaned,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      pageContext,
      activeTwinId: typeof req.body?.agent_id === 'string' ? req.body.agent_id : null,
    }),
    () => ({ processedOutputs: {} }),
    // localDecision = the local guard verdict, persisted beside the AxWise verdict
    // for divergence analysis. 'block' already returned early above, so this is the
    // non-blocking verdict AxWise is being compared against.
    { posture: 'open', admin, localDecision: guard.action, organizationId }
  );
  const axAuthoritative = process.env.AXWISE_ENFORCE === 'authoritative';
  // degraded rule: never block on a degraded verdict; local guard already ruled.
  if (
    axAuthoritative &&
    !ax.degraded &&
    ax.processedOutputs?.security?.scopeDecision === 'denied'
  ) {
    done({ status: 200, security: 'axwise-blocked' });
    return res.status(200).json({
      message: ax.processedOutputs.security.blockReason || 'This request is not permitted.',
      blocks: [],
      proposedActions: [],
      blocked: true,
    });
  }
  const axFragment =
    axAuthoritative && !ax.degraded && !ax.skipped
      ? ax.processedOutputs?.systemPromptFragment || ''
      : '';

  const loop = await runCopilotLoop(
    {
      admin,
      systemPromptFragment: axFragment,
      userId: user.id,
      message: guard.cleaned,
      history: Array.isArray(req.body?.history) ? req.body.history : [],
      pageContext,
      personality: req.body?.personality || 'professional',
      provider: req.body?.provider,
      model: req.body?.model,
      memories: [],
      orgId,
      conversationId:
        typeof req.body?.conversationId === 'string' &&
        /^[\w-]{1,64}$/.test(req.body.conversationId)
          ? req.body.conversationId
          : null,
    },
    { attachments: req.body?.attachments }
  );

  // Persist each proposed (mutation) action so the frontend confirm button can resolve it.
  const proposedActions = [];
  for (const p of loop.proposedActions) {
    try {
      const { data: pending } = await admin
        .from('pending_tool_calls')
        .insert({ user_id: user.id, tool: p.tool, args: p.args, risk_level: p.riskLevel })
        .select('id')
        .maybeSingle();
      proposedActions.push({
        pendingCallId: pending?.id || null,
        tool: p.tool,
        args: p.args,
        draftFields: p.draftFields || [],
        riskLevel: p.riskLevel,
        summary: p.summary,
      });
    } catch {
      proposedActions.push({
        pendingCallId: null,
        tool: p.tool,
        args: p.args,
        draftFields: p.draftFields || [],
        riskLevel: p.riskLevel,
        summary: p.summary,
      });
    }
  }

  // Record spend to command_history so the daily cap sees copilot usage.
  await admin
    .from('command_history')
    .insert({
      user_id: user.id,
      input: guard.cleaned,
      parsed_intent: 'copilot',
      output: trim(loop.message, 2000),
      status: 'success',
      platform: 'copilot',
      metadata: {
        cost: loop.cost,
        model: loop.model,
        provider: loop.provider,
        tools: loop.toolTrace.map((t) => t.tool),
        iterations: loop.iterations,
      },
    })
    .then(
      () => {},
      () => {}
    );

  // Post-hoc grounding is queued durably. The previous fire-and-forget network
  // call was routinely truncated after the serverless response, producing
  // copilot.ground AbortError rows even when copilot.chat itself was healthy.
  if (process.env.AXWISE_ENABLE === 'true') {
    try {
      await enqueueAxwiseGroundJob(admin, {
        userId: user.id,
        tenant: axTenant,
        organizationId,
        draftAnswer: loop.message,
        sources: [],
      });
    } catch (error) {
      // Grounding remains advisory; failure to enqueue must not hide a valid
      // Copilot answer. The warning is actionable and the chat status remains
      // independent from the grounding status.
      log.warn(req, 'axwise.grounding.enqueue-failed', { error: error.message });
    }
  }

  done({ status: 200 });
  return res.status(200).json({
    message: loop.message,
    blocks: loop.blocks,
    proposedActions,
    toolTrace: loop.toolTrace,
    iterations: loop.iterations,
    usage: loop.usage,
    cost: loop.cost,
    model: loop.model,
    provider: loop.provider,
    ...(loop.llmError ? { llmError: loop.llmError } : {}),
  });
}

async function handleResolve(req, res, user, admin, done) {
  const { pendingCallId, decision } = req.body || {};
  if (!pendingCallId || !['approve', 'reject'].includes(decision)) {
    done({ status: 400 });
    return jsonError(res, 400, 'pendingCallId and decision (approve|reject) are required');
  }
  const result = await resolvePendingToolCall(admin, user.id, pendingCallId, decision);
  done({ status: 200 });
  return res.status(200).json(result);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `copilot:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 15, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 503 });
    return jsonError(res, 503, 'Database not configured');
  }

  const action = req.body?.action || 'copilot';
  try {
    if (action === 'resolve-action') return await handleResolve(req, res, user, admin, done);
    return await handleCopilot(req, res, user, admin, done);
  } catch (err) {
    log.error(req, 'unhandled', err);
    done({ status: 500 });
    return handleApiError(res, err, 'copilot');
  }
}
