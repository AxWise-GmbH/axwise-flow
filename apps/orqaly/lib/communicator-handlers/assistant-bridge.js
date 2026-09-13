/**
 * [module: connection-hub]
 * Assistant Bridge — shared NL processing for Controller tab + messenger webhooks.
 * Decoupled from Express req/res — takes plain arguments, returns plain objects.
 * Reuses TOOL_CATALOG, RISK_LEVELS, buildFunctionCallingPrompt from assistant-chat.js.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { executeLlmV2, parseLlmJson } from '../concilium-handlers/llm-executor-v2.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import {
  TOOL_CATALOG,
  RISK_LEVELS,
  getRiskLevel,
  buildFunctionCallingPrompt,
} from '../api-handlers/assistant-chat.js';
import { extractBlocks } from './chat-blocks-extractor.js';
import { guardUserContent } from '../security/content-guard.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  withAxwiseTracked,
  buildCopilotContext,
  buildAgentGenerateContext,
} from '../integrations/axwise/index.js';
import { screenSystemPrompt } from '../concilium-handlers/agent-config-validator.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';
import { resolveLlmPair } from '../_shared/llm-pair.js';
import { isToolCredentialConfigured } from '../security/tool-credential-status.js';
import { goalCreationRequestsNoTools } from '../_shared/goal-tool-policy.js';
import { draftGoalCreateArgs } from '../_shared/goal-draft.js';
import { deterministicAgentJobId, enqueueAgentJob } from '../goal-handlers/_helpers.js';
import {
  bindJobPayloadToWorkerDeployment,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';
import { checkQuotas } from '../security/user-quotas.js';
import { isJobLeaseLostError } from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('assistant-bridge');

const ASSISTANT_GOAL_HANDOFF_KEY = 'assistant_goal_handoff';

function expectedIdempotentJob(job, env = process.env) {
  const workerScope = resolveWorkerScope(env);
  const payload = bindJobPayloadToWorkerDeployment(job?.payload, env);
  const requestedId = job.id;
  const id = payload[WORKER_DEPLOYMENT_PAYLOAD_KEY]
    ? deterministicAgentJobId('preview-deployment-agent-job', {
        id: requestedId,
        deployment: payload[WORKER_DEPLOYMENT_PAYLOAD_KEY],
      })
    : workerScope === 'local'
      ? deterministicAgentJobId('local-agent-job', { id: requestedId })
      : requestedId;
  return { id, user_id: job.user_id, payload, worker_scope: workerScope };
}

async function inspectAssistantGoalJob(admin, expected) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, user_id, status, worker_scope, payload, updated_at')
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    const exact =
      job.id === expected.id &&
      job.user_id === expected.user_id &&
      job.worker_scope === expected.worker_scope &&
      isDeepStrictEqual(job.payload || {}, expected.payload || {});
    return exact ? { state: 'present', job } : { state: 'conflict', job };
  } catch (error) {
    if (isJobLeaseLostError(error)) throw error;
    return { state: 'unknown', error };
  }
}

async function inspectAssistantGoalPark(admin, snapshot, jobId, parkedData) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, title, status, budget_usd, data, updated_at')
      .eq('id', snapshot.id)
      .eq('user_id', snapshot.user_id)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    if (
      current.status === 'needs_human' &&
      current.data?.[ASSISTANT_GOAL_HANDOFF_KEY]?.job_id === jobId &&
      current.data?.[ASSISTANT_GOAL_HANDOFF_KEY]?.status === 'stopped' &&
      isDeepStrictEqual(current.data || {}, parkedData || {})
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === snapshot.status &&
      current.updated_at === snapshot.updated_at &&
      isDeepStrictEqual(current.data || {}, snapshot.data || {})
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    if (isJobLeaseLostError(error)) throw error;
    return { state: 'unknown', error };
  }
}

async function parkAssistantGoal(admin, snapshot, jobId, enqueueError, jobState) {
  // `updated_at` is the lease on this freshly inserted domain row. Refuse a
  // broad status-only write if the insert response did not return it.
  if (!snapshot?.updated_at) return { state: 'unknown' };

  const parkedAt = new Date().toISOString();
  const parkedData = {
    ...(snapshot.data || {}),
    [ASSISTANT_GOAL_HANDOFF_KEY]: {
      status: 'stopped',
      job_id: jobId,
      job_state: jobState,
      failed_at: parkedAt,
      error: String(enqueueError?.message || enqueueError || 'Worker handoff failed').slice(0, 500),
      reconciliation_required: false,
    },
  };

  const updateExact = async () => {
    try {
      return await admin
        .from('goals')
        .update({ status: 'needs_human', data: parkedData, updated_at: parkedAt })
        .eq('id', snapshot.id)
        .eq('user_id', snapshot.user_id)
        .eq('status', snapshot.status)
        .eq('updated_at', snapshot.updated_at)
        .select('id, user_id, title, status, budget_usd, data, updated_at')
        .maybeSingle();
    } catch (error) {
      if (isJobLeaseLostError(error)) throw error;
      return { data: null, error };
    }
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await updateExact();
    if (
      !response.error &&
      response.data?.status === 'needs_human' &&
      response.data?.data?.[ASSISTANT_GOAL_HANDOFF_KEY]?.job_id === jobId
    ) {
      return { state: 'committed', goal: response.data };
    }
    const inspection = await inspectAssistantGoalPark(admin, snapshot, jobId, parkedData);
    if (inspection.state === 'committed' || inspection.state === 'conflict') return inspection;
    if (inspection.state !== 'original') return inspection;
  }
  return { state: 'unknown' };
}

async function compensateAssistantGoalHandoff({ admin, goal, expectedJob, enqueueError, env }) {
  const inspection = await inspectAssistantGoalJob(admin, expectedJob);
  if (inspection.state === 'present' && inspection.job.status === 'done') {
    return { state: 'processed', goal, job: inspection.job, reconciliationRequired: false };
  }

  const terminal =
    inspection.state === 'absent' ||
    (inspection.state === 'present' && ['failed', 'cancelled'].includes(inspection.job.status));
  if (resolveWorkerScope(env) === 'preview' && terminal) {
    const parked = await parkAssistantGoal(
      admin,
      goal,
      expectedJob.id,
      enqueueError,
      inspection.state === 'absent' ? 'absent' : inspection.job.status
    );
    if (parked.state === 'committed') {
      return {
        state: 'parked',
        goal: parked.goal,
        job: inspection.job || null,
        reconciliationRequired: false,
      };
    }
  }

  return {
    state: 'reconciliation_required',
    goal,
    job: inspection.job || null,
    reconciliationState: inspection.state,
    reconciliationRequired: true,
  };
}

export { normalizeGoalComplexity } from '../_shared/goal-complexity.js';

/**
 * Process a natural language message through the assistant.
 * Works for both Controller tab and messenger webhooks.
 *
 * @param {object} admin - Supabase admin client
 * @param {string} userId - Authenticated user ID
 * @param {string} input - User's natural language message
 * @param {object} [opts]
 * @param {string} [opts.platform] - 'internal' | 'telegram' | 'discord' | 'slack'
 * @param {string} [opts.threadId] - Conversation thread ID for history
 * @param {string} [opts.personality] - 'professional' | 'friendly' | 'technical' | 'creative' | 'minimal'
 * @returns {{ message, calls, toolResults, cost, model, provider, needsConfirmation }}
 */
export async function processAssistantMessage(admin, userId, input, opts = {}) {
  const {
    platform = 'internal',
    threadId = null,
    personality = 'professional',
    channelId = null,
    inputType = 'text',
  } = opts;

  try {
    // 0a. Local content guard (this shared path had none; messenger webhooks
    // route through here too). Block outright on a hard injection.
    const guard = guardUserContent(input, { context: `assistant-bridge:${platform}` });
    if (guard.action === 'block') {
      const blocked = {
        message: 'Your message was blocked by security review.',
        calls: [],
        toolResults: [],
        cost: 0,
        needsConfirmation: false,
        status: 'blocked',
      };
      await logCommand(admin, userId, input, blocked, platform, threadId);
      return blocked;
    }
    const cleanedInput = guard.cleaned;

    // 0. Per-user daily LLM spend cap (defends against injection-induced runaway).
    const capCheck = await checkDailySpendCap(admin, userId);
    if (capCheck.over) {
      const result = {
        message: `Daily LLM cap of $${capCheck.cap.toFixed(2)} reached ($${capCheck.spent.toFixed(2)} used). Try tomorrow, or raise it in Settings.`,
        calls: [],
        toolResults: [],
        cost: 0,
        needsConfirmation: false,
        status: 'cap_exceeded',
      };
      await logCommand(admin, userId, input, result, platform, threadId);
      return result;
    }

    // 1. Load conversation history (last 10 messages from this thread)
    const history = await loadHistory(admin, userId, threadId);

    // 2. Load user memories
    const memories = await loadMemories(admin, userId);

    // 2b. AxWise copilot.chat cognition (advisory). Shadow-safe: records telemetry;
    // only blocks/injects under AXWISE_ENFORCE=authoritative.
    const ax = await withAxwiseTracked(
      buildCopilotContext({
        requestId: randomUUID(),
        tenant: { userId, orgId: null },
        message: cleanedInput,
        history,
      }),
      () => ({ processedOutputs: {} }),
      { posture: 'open', admin, localDecision: guard.action }
    );
    const axActive = process.env.AXWISE_ENFORCE === 'authoritative' && !ax.degraded && !ax.skipped;
    if (axActive && ax.processedOutputs?.security?.scopeDecision === 'denied') {
      const blocked = {
        message: ax.processedOutputs.security.blockReason || 'This request is not permitted.',
        calls: [],
        toolResults: [],
        cost: 0,
        needsConfirmation: false,
        status: 'blocked',
      };
      await logCommand(admin, userId, input, blocked, platform, threadId);
      return blocked;
    }
    const axFragment = axActive ? ax.processedOutputs?.systemPromptFragment || '' : '';

    // 3. Build prompt using the same function as assistant-chat
    const { systemPrompt, prompt } = buildFunctionCallingPrompt({
      message: cleanedInput,
      history,
      personality,
      userRole: 'admin',
      memories,
    });
    const sysPrompt = axFragment ? `${systemPrompt}\n${axFragment}` : systemPrompt;

    // 4. Call LLM
    const llmResult = await executeLlmV2Tracked({
      prompt,
      systemPrompt: sysPrompt,
      provider: defaultProvider(),
      model: defaultModel(),
      temperature: 0.2,
      maxTokens: 2000,
      jsonMode: true,
      timeoutMs: 15000,
      usage: { admin, userId, source: 'assistant-bridge', operation: 'chat' },
    });

    // 5. Parse response
    const parsed = parseLlmJson(llmResult.content);
    if (!parsed) {
      const result = {
        message:
          llmResult.content?.slice(0, 1000) ||
          'I understood your request but had trouble formatting my response.',
        calls: [],
        toolResults: [],
        cost: llmResult.estimatedCostUsd,
        model: llmResult.model,
        provider: llmResult.provider,
        needsConfirmation: false,
      };
      await logCommand(admin, userId, input, result, platform, threadId);
      return result;
    }

    // 6. Attach risk levels
    const calls = (parsed.calls || []).map((call) => ({
      ...call,
      riskLevel: getRiskLevel(call.tool),
      needsConfirmation:
        call.needsConfirmation ||
        getRiskLevel(call.tool) === 'high' ||
        getRiskLevel(call.tool) === 'critical',
    }));

    // 7. Check if any call needs confirmation
    const needsConfirmation = calls.some((c) => c.needsConfirmation);

    // 8. Execute safe tool calls (skip those needing confirmation)
    const toolResults = [];
    const pendingCallIds = [];
    const viewLinks = [];
    const blocks = [];
    for (const call of calls) {
      if (call.needsConfirmation) {
        // Persist a pending_tool_calls row so the inline Approve/Reject buttons
        // can resolve it later. 10-min TTL is enforced in the migration default.
        try {
          const { data: pending } = await admin
            .from('pending_tool_calls')
            .insert({
              user_id: userId,
              channel_id: channelId,
              tool: call.tool,
              args: call.args || {},
              risk_level: call.riskLevel || 'high',
            })
            .select('id')
            .maybeSingle();
          if (pending?.id) pendingCallIds.push(pending.id);
          toolResults.push({
            tool: call.tool,
            status: 'awaiting_confirmation',
            pendingCallId: pending?.id || null,
            message: `Confirmation required for ${call.tool}`,
            args: call.args,
          });
        } catch (err) {
          if (isJobLeaseLostError(err)) throw err;
          toolResults.push({ tool: call.tool, status: 'error', error: err.message });
        }
        continue;
      }
      try {
        const result = await executeToolCall(admin, userId, call.tool, call.args || {});
        toolResults.push({ tool: call.tool, status: 'success', result });
        // Surface View links for created entities (used by callback dispatcher to attach a button).
        if (result?.created?.id && call.tool === 'goal.create') {
          viewLinks.push({ label: 'View goal', url: `${appBaseUrl()}/goals/${result.created.id}` });
        }
        // Extract inline chat blocks for rich entity rendering in the studio chat.
        try {
          const callBlocks = extractBlocks(call.tool, call.args || {}, result) || [];
          blocks.push(...callBlocks);
        } catch (extractErr) {
          if (isJobLeaseLostError(extractErr)) throw extractErr;
          log.warn(null, 'block-extract.failed', { tool: call.tool, error: extractErr?.message });
        }
      } catch (err) {
        if (isJobLeaseLostError(err)) throw err;
        toolResults.push({ tool: call.tool, status: 'error', error: err.message });
      }
    }

    // 9. Build response
    const durableHandoffNotices = toolResults
      .map((toolResult) => toolResult?.result)
      .filter((toolResult) =>
        ['parked', 'reconciliation_required'].includes(toolResult?.pipeline_status)
      )
      .map((toolResult) => toolResult.message)
      .filter(Boolean);
    const result = {
      message: [parsed.message || '', ...durableHandoffNotices].filter(Boolean).join('\n\n'),
      calls,
      toolResults,
      pendingCallIds,
      viewLinks,
      blocks,
      cost: llmResult.estimatedCostUsd,
      model: llmResult.model,
      provider: llmResult.provider,
      needsConfirmation,
    };

    // 10. Log
    await logCommand(admin, userId, input, result, platform, threadId);

    return result;
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    log.warn(null, 'assistant-bridge.failed', { error: err.message });
    const errorResult = {
      message: `Error: ${err.message}`,
      calls: [],
      toolResults: [],
      cost: 0,
      needsConfirmation: false,
      status: 'error',
    };
    await logCommand(admin, userId, input, errorResult, platform, threadId);
    return errorResult;
  }
}

/**
 * Resolve the LLM the user picked for their current assistant. The in-chat model
 * chip persists provider/model into the current assistant's config (assistants
 * table, is_current row), so tools that generate content can honor the user's
 * selection instead of hardcoding a provider. Falls back to `defaults` when the
 * config has no provider/model (or the lookup fails).
 */
export async function resolveAssistantLlm(admin, userId, defaults) {
  const resolvedDefaults = resolveLlmPair({}, { fallback: defaults });
  try {
    const { data } = await admin
      .from('assistants')
      .select('config')
      .eq('user_id', userId)
      .eq('is_current', true)
      .maybeSingle();
    const cfg = data?.config || {};
    const resolved = resolveLlmPair(cfg, { fallback: resolvedDefaults });
    return {
      ...resolved,
      // "User templates" filter toggle. Off/unset preserves the legacy free-form
      // behavior; only an explicit true opts into the structured answer-templates.
      useTemplates: cfg.useTemplates === true,
    };
  } catch {
    return { ...resolvedDefaults, useTemplates: false };
  }
}

/**
 * Execute a single tool call by routing to the appropriate Supabase operation.
 * Exported so callback-dispatcher can run a held tool after Approve is tapped.
 */
export async function executeToolCall(admin, userId, toolName, args, runtime = {}) {
  const [category, action] = toolName.split('.');

  switch (category) {
    // ── Partners ──
    case 'partner': {
      if (action === 'list') {
        const { data } = await admin
          .from('partners')
          .select('id, name, team, status, agreement')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return { partners: data || [], count: data?.length || 0 };
      }
      if (action === 'create') {
        const { data, error } = await admin
          .from('partners')
          .insert({
            user_id: userId,
            name: args.name,
            team: args.team || '',
            agreement: args.agreement || 'Revshare',
            status: 'active',
          })
          .select('id, name')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      if (action === 'update') {
        const updates = {};
        if (args.name) updates.name = args.name;
        if (args.team) updates.team = args.team;
        if (args.status) updates.status = args.status;
        if (args.agreement) updates.agreement = args.agreement;
        const { error } = await admin
          .from('partners')
          .update(updates)
          .eq('id', args.id)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { updated: args.id };
      }
      if (action === 'archive') {
        const { error } = await admin
          .from('partners')
          .update({ status: 'Archived' })
          .eq('id', args.id)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { archived: args.id };
      }
      break;
    }

    // ── Projects ──
    case 'project': {
      if (action === 'list') {
        const { data } = await admin
          .from('projects')
          .select('id, name, status, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return { projects: data || [], count: data?.length || 0 };
      }
      if (action === 'create') {
        const { data, error } = await admin
          .from('projects')
          .insert({
            user_id: userId,
            name: args.name,
            description: args.description || '',
            status: 'Active',
          })
          .select('id, name')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      if (action === 'update') {
        const updates = {};
        if (args.name) updates.name = args.name;
        if (args.status) updates.status = args.status;
        const { error } = await admin
          .from('projects')
          .update(updates)
          .eq('id', args.id)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { updated: args.id };
      }
      if (action === 'delete') {
        const { error } = await admin
          .from('projects')
          .delete()
          .eq('id', args.id)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { deleted: args.id };
      }
      break;
    }

    // ── Agents ──
    case 'agent': {
      if (action === 'list' || action === 'recommend') {
        const { data } = await admin
          .from('agents')
          .select('agent_id, role, availability_status')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50);
        return { agents: data || [], count: data?.length || 0 };
      }
      if (action === 'create') {
        // AxWise agent.generate cognition (advisory telemetry): so agents created
        // via the assistant show up in the AxWise monitor like the factory path.
        const axCfg = {
          name: args.name || args.role || 'Agent',
          system_prompt: args.role || '',
          tools: [],
        };
        await withAxwiseTracked(
          buildAgentGenerateContext({
            requestId: randomUUID(),
            tenant: { userId, orgId: null },
            config: axCfg,
          }),
          () => ({ processedOutputs: {} }),
          {
            posture: 'closed',
            admin,
            localDecision: screenSystemPrompt(axCfg.system_prompt).decision,
          }
        );
        const agentId = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error } = await admin
          .from('agents')
          .insert({
            agent_id: agentId,
            user_id: userId,
            role: args.role || args.name || '',
            availability_status: 'active',
          })
          .select('agent_id, role')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      if (action === 'update') {
        const updates = {};
        if (args.role) updates.role = args.role;
        if (args.availability) updates.availability_status = args.availability;
        const { error } = await admin
          .from('agents')
          .update(updates)
          .ilike('agent_id', `%${args.id}%`)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { updated: args.id };
      }
      if (action === 'delete') {
        const { error } = await admin
          .from('agents')
          .delete()
          .ilike('agent_id', `%${args.id}%`)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { deleted: args.id };
      }
      if (action === 'assign') {
        return {
          message: `Agent ${args.agentId} assignment noted. Use the Goals page to assign agents to projects.`,
        };
      }
      if (action === 'listByStatus') {
        let q = admin
          .from('agents')
          .select('agent_id, role, availability_status, created_at')
          .eq('user_id', userId);
        if (args.status) q = q.eq('availability_status', args.status);
        const { data } = await q.order('created_at', { ascending: false }).limit(50);
        return { agents: data || [], count: data?.length || 0, status: args.status || 'all' };
      }
      if (action === 'performance') {
        const { data } = await admin
          .from('agent_performance_metrics')
          .select('*')
          .ilike('agent_id', `%${args.id}%`)
          .order('day', { ascending: false })
          .limit(30);
        return { metrics: data || [], count: data?.length || 0 };
      }
      if (action === 'pause' || action === 'resume') {
        const next = action === 'pause' ? 'paused' : 'active';
        const { error } = await admin
          .from('agents')
          .update({ availability_status: next })
          .ilike('agent_id', `%${args.id}%`)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { updated: args.id, availability_status: next };
      }
      break;
    }

    // ── Goals ──
    case 'goal': {
      if (action === 'create') {
        const { resolveGoalOrgId } = await import('../_shared/default-organization.js');
        const orgId = await resolveGoalOrgId(admin, userId, { orgId: args.org_id || null });
        // Same completion the confirmation card previewed, so an approved
        // proposal inserts exactly the title and budget the user agreed to.
        const { args: draft } = draftGoalCreateArgs(args);
        const noTools = goalCreationRequestsNoTools(draft);
        const goalRow = {
          user_id: userId,
          title: draft.title,
          description: draft.description,
          budget_usd: draft.budget_usd,
          complexity: draft.complexity,
          execution_mode: 'auto',
          status: 'feasibility',
          org_id: orgId,
          data: noTools
            ? {
                tool_mode: 'no_tools',
                skip_tools: true,
                skip_tools_reason: 'User requested a tool-free goal at creation',
              }
            : {},
        };
        const { data, error } = await admin
          .from('goals')
          .insert(goalRow)
          .select('id, user_id, title, status, budget_usd, data, updated_at')
          .single();
        if (error) throw new Error(error.message);

        // Enqueue feasibility analysis to start the pipeline
        const env = runtime.env || process.env;
        const enqueueAgentJobImpl = runtime.enqueueAgentJobImpl || enqueueAgentJob;
        const requestedJob = {
          id: deterministicAgentJobId('assistant-goal-feasibility', { goalId: data.id }),
          user_id: data.user_id,
          payload: {
            type: 'orchestrate-goal',
            action: 'feasibility-analysis',
            goalId: data.id,
            _userId: data.user_id,
            userId: data.user_id,
            user_id: data.user_id,
          },
        };
        const expectedJob = expectedIdempotentJob(requestedJob, env);
        let job;
        try {
          job = await enqueueAgentJobImpl(admin, requestedJob, { idempotent: true, env });
        } catch (enqueueError) {
          if (isJobLeaseLostError(enqueueError)) throw enqueueError;
          const goalSnapshot = {
            ...goalRow,
            ...data,
            user_id: data.user_id || userId,
            data: data.data ?? goalRow.data,
          };
          const recovery = await compensateAssistantGoalHandoff({
            admin,
            goal: goalSnapshot,
            expectedJob,
            enqueueError,
            env,
          });
          log.warn(null, 'assistant.goal-create.handoff-not-started', {
            goalId: data.id,
            jobId: expectedJob.id,
            recovery: recovery.state,
            error: enqueueError?.message || String(enqueueError),
          });

          if (recovery.state === 'processed') {
            return {
              created: recovery.goal,
              job_id: expectedJob.id,
              pipeline_status: 'processed',
              reconciliation_required: false,
              message: 'Goal created and feasibility processing completed.',
            };
          }
          if (recovery.state === 'parked') {
            return {
              created: recovery.goal,
              job_id: expectedJob.id,
              pipeline_status: 'parked',
              reconciliation_required: false,
              message:
                'Goal created, but its Preview worker handoff stopped. The goal was parked safely for retry.',
            };
          }
          return {
            created: recovery.goal,
            job_id: expectedJob.id,
            pipeline_status: 'reconciliation_required',
            reconciliation_required: true,
            reconciliation_state: recovery.reconciliationState || 'unknown',
            message:
              'Goal created. Its worker handoff needs reconciliation; refresh this goal instead of creating it again.',
          };
        }

        return {
          created: data,
          job_id: job.id,
          message: 'Goal created and pipeline started (feasibility analysis).',
        };
      }
      if (action === 'list') {
        const { data } = await admin
          .from('goals')
          .select('id, title, status, budget_usd, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { goals: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('goals')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'goal not found' };
        return { goal: data };
      }
      if (action === 'nextSteps') {
        const { data: goal } = await admin
          .from('goals')
          .select('id, title, status, data, budget_usd, spent_usd, loop_enabled, loop_paused')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!goal) return { error: 'goal not found' };
        const { data: recentLog } = await admin
          .from('goal_log')
          .select('*')
          .eq('goal_id', args.id)
          .order('created_at', { ascending: false })
          .limit(5);
        const { count: pendingJobs } = await admin
          .from('agent_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .contains('payload', { goalId: args.id })
          .in('status', ['queued', 'running']);
        return { goal, recentLog: recentLog || [], pendingJobs: pendingJobs || 0 };
      }
      if (action === 'subgoals') {
        const { data } = await admin
          .from('goals')
          .select('id, title, status, budget_usd')
          .eq('parent_goal_id', args.id)
          .eq('user_id', userId)
          .limit(50);
        return { subgoals: data || [], count: data?.length || 0 };
      }
      if (action === 'loopingGoals') {
        const { data } = await admin
          .from('goals')
          .select(
            'id, title, status, iteration, max_iterations, loop_enabled, loop_paused, budget_usd'
          )
          .eq('user_id', userId)
          .or('iteration.gt.0,loop_enabled.eq.true')
          .order('created_at', { ascending: false })
          .limit(30);
        return { goals: data || [], count: data?.length || 0 };
      }
      if (action === 'pause' || action === 'resume') {
        const next = action === 'pause' ? 'paused' : 'active';
        const { data, error } = await admin
          .from('goals')
          .update({ status: next })
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, title, status')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'goal not found' };
        return { updated: data };
      }
      if (action === 'cancel') {
        const { data, error } = await admin
          .from('goals')
          .update({ status: 'cancelled' })
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, title, status')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'goal not found' };
        return { updated: data };
      }
      if (action === 'updateBudget') {
        const budget = Number(args.budget_usd || args.budget);
        if (!(budget > 0 && budget <= 1000))
          return { error: 'budget_usd must be between 0.01 and 1000' };
        const { data, error } = await admin
          .from('goals')
          .update({ budget_usd: budget })
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, title, budget_usd')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'goal not found' };
        return { updated: data };
      }
      break;
    }

    // ── Tasks ──
    case 'task': {
      if (action === 'create') {
        const { data, error } = await admin
          .from('team_tasks')
          .insert({
            user_id: userId,
            title: args.title || 'New Task',
            description: args.description || '',
            priority: args.priority || 'medium',
            status: 'todo',
          })
          .select('id, title, status')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      if (action === 'list') {
        const { data } = await admin
          .from('team_tasks')
          .select('id, title, status, priority, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        return { tasks: data || [], count: data?.length || 0 };
      }
      if (
        ['today', 'thisWeek', 'overdue', 'blocked', 'waitingApproval', 'byOrg', 'byAgent'].includes(
          action
        )
      ) {
        const NOT_DONE = '("done","completed","cancelled")';
        const now = new Date();
        const nowIso = now.toISOString();
        let q = admin
          .from('team_tasks')
          .select('id, title, status, priority, deadline, assigned_to, agent_id, created_at')
          .eq('user_id', userId);
        if (action === 'today') {
          const end = new Date(now.getTime() + 86_400_000).toISOString();
          q = q.not('status', 'in', NOT_DONE).gte('deadline', nowIso).lte('deadline', end);
        } else if (action === 'thisWeek') {
          const end = new Date(now.getTime() + 7 * 86_400_000).toISOString();
          q = q.not('status', 'in', NOT_DONE).gte('deadline', nowIso).lte('deadline', end);
        } else if (action === 'overdue') {
          q = q.not('status', 'in', NOT_DONE).lt('deadline', nowIso).not('deadline', 'is', null);
        } else if (action === 'blocked') {
          q = q.eq('status', 'blocked');
        } else if (action === 'waitingApproval') {
          q = q.in('status', [
            'waiting_approval',
            'review',
            'pending',
            'awaiting_context_approval',
            'awaiting_approval',
          ]);
        } else if (action === 'byOrg') {
          if (!args.orgId) return { error: 'orgId is required' };
          q = q.eq('org_id', args.orgId);
        } else if (action === 'byAgent') {
          if (!args.agentId) return { error: 'agentId is required' };
          q = q.eq('agent_id', args.agentId);
        }
        const { data } = await q
          .order('deadline', { ascending: true, nullsFirst: false })
          .limit(50);
        return { tasks: data || [], count: data?.length || 0, filter: action };
      }
      break;
    }

    // ── Reports ──
    case 'report': {
      if (action === 'list') {
        // Recent KPI snapshots — what reports has the user already had run.
        const { data } = await admin
          .from('report_kpi_snapshots')
          .select('id, snapshot_date, kpi_set, values, created_at')
          .eq('user_id', userId)
          .order('snapshot_date', { ascending: false })
          .limit(10);
        const reports = (data || []).map((r) => ({
          id: r.id,
          date: r.snapshot_date,
          type: r.kpi_set,
          headline: summarizeKpis(r.kpi_set, r.values),
        }));
        return { reports, count: reports.length };
      }

      if (
        action === 'summary' ||
        action === 'send' ||
        action === 'generate' ||
        action === 'fetch'
      ) {
        const kpiSet = mapReportType(args.type || args.subject || 'executive');
        const data = await loadFreshReportData(admin, userId);
        const summary = aggregateForChat(kpiSet, data);
        const deepLink = `${appBaseUrl()}/reports?type=${encodeURIComponent(uiTemplateForKpiSet(kpiSet))}`;

        // Phase 5c: render a branded PDF unless the user explicitly asked
        // for text-only ("as text", "no pdf", etc.).
        const asText = /\b(text\s+only|no\s+pdf|just\s+text)\b/i.test(
          String(args.format || args.subject || '')
        );
        let attachment = null;
        if (action === 'send' && !asText) {
          try {
            const { renderReportPdf } = await import('./pdf-renderer.js');
            const buffer = await renderReportPdf({
              kpiSet,
              data,
              period: args.period || new Date().toISOString().slice(0, 10),
              label: undefined,
            });
            attachment = {
              buffer,
              filename: `${kpiSet}-${new Date().toISOString().slice(0, 10)}.pdf`,
              mimeType: 'application/pdf',
              caption: summary.text,
              deepLink,
            };
          } catch (err) {
            if (isJobLeaseLostError(err)) throw err;
            log.warn(null, 'pdf.render.failed', { error: err.message });
            // Fall back to text-only.
          }
        }

        return {
          report: {
            type: kpiSet,
            period: args.period || 'current',
            summary,
            deepLink,
          },
          attachment,
          message: summary.text,
        };
      }
      return { message: `Unknown report action: ${action}` };
    }

    // ── Files (Phase 2 — past uploads from Telegram) ──
    case 'file': {
      if (action === 'list') {
        const { data } = await admin
          .from('communicator_files')
          .select('id, filename, mime_type, size_bytes, extraction_method, created_at, expires_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { files: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data: row } = await admin
          .from('communicator_files')
          .select(
            'id, filename, mime_type, size_bytes, extracted_text, extraction_method, created_at'
          )
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!row) return { error: 'file not found' };
        // Return the extracted text so the LLM can quote / summarise it.
        return {
          file: {
            ...row,
            extracted_text: row.extracted_text?.slice(0, 8000) || null,
          },
        };
      }
      if (action === 'delete') {
        const { data: row } = await admin
          .from('communicator_files')
          .select('id, storage_path')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!row) return { error: 'file not found' };
        await admin.storage
          .from('communicator-uploads')
          .remove([row.storage_path])
          .then(() => {})
          .then(
            () => {},
            () => {}
          );
        await admin.from('communicator_files').delete().eq('id', row.id);
        return { deleted: row.id };
      }
      return { message: `Unknown file action: ${action}` };
    }

    // ── Workflows ──
    case 'workflow': {
      if (action === 'list') {
        const { data } = await admin
          .from('workflows')
          .select('id, name, enabled, data, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        return { workflows: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('workflows')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'workflow not found' };
        return { workflow: data };
      }
      if (action === 'toggle') {
        const { data: cur } = await admin
          .from('workflows')
          .select('enabled')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!cur) return { error: 'workflow not found' };
        const next = !cur.enabled;
        const { error } = await admin
          .from('workflows')
          .update({ enabled: next })
          .eq('id', args.id)
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return { updated: args.id, enabled: next };
      }
      if (action === 'execute' || action === 'retry') {
        // The internal producer uses a service-role client, so prove ownership
        // before placing a caller-supplied workflow id on the trusted queue.
        const { data: workflow, error: workflowError } = await admin
          .from('workflows')
          .select('id, user_id')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (workflowError) throw new Error(workflowError.message);
        if (!workflow) return { error: 'workflow not found' };

        const checkQuotasImpl = runtime.checkQuotasImpl || checkQuotas;
        const quota = await checkQuotasImpl(admin, userId, { jobType: 'execute-workflow' });
        if (!quota.allowed) {
          return {
            error: quota.message || 'Workflow execution quota exceeded',
            code: quota.code || 'QUOTA_EXCEEDED',
            quotas: quota.quotas,
            usage: quota.usage,
          };
        }

        const enqueueAgentJobImpl = runtime.enqueueAgentJobImpl || enqueueAgentJob;
        const job = await enqueueAgentJobImpl(admin, {
          user_id: userId,
          payload: {
            type: 'execute-workflow',
            workflowId: workflow.id,
            userId,
            user_id: userId,
            _userId: userId,
          },
        });
        const verb = action === 'retry' ? 're-run' : 'execution';
        return {
          queued: workflow.id,
          job_id: job.id,
          message: `Workflow ${args.id} queued for ${verb}.`,
        };
      }
      if (action === 'executions') {
        const { data } = await admin
          .from('workflow_executions')
          .select('id, status, started_at, completed_at, error')
          .eq('workflow_id', args.id)
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(10);
        return { executions: data || [], count: data?.length || 0 };
      }
      if (action === 'lastRun') {
        const { data } = await admin
          .from('workflow_executions')
          .select('*')
          .eq('workflow_id', args.id)
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return { message: 'No executions yet for this workflow.' };
        return { lastRun: data };
      }
      if (action === 'errors') {
        // Failed steps for a workflow's most recent execution (or a specific one).
        let execId = args.executionId;
        if (execId) {
          // workflow_step_results has no tenant column and this handler uses a
          // service-role client. Prove ownership of the parent execution before
          // accepting a caller/LLM-supplied execution id.
          let ownedExecutionQuery = admin
            .from('workflow_executions')
            .select('id, workflow_id')
            .eq('id', execId)
            .eq('user_id', userId);
          if (args.id) ownedExecutionQuery = ownedExecutionQuery.eq('workflow_id', args.id);
          const { data: ownedExecution, error: executionError } =
            await ownedExecutionQuery.maybeSingle();
          if (executionError) throw new Error(executionError.message);
          if (!ownedExecution) {
            return { errors: [], count: 0, message: 'No execution found.' };
          }
          execId = ownedExecution.id;
        } else if (args.id) {
          const { data: last } = await admin
            .from('workflow_executions')
            .select('id')
            .eq('workflow_id', args.id)
            .eq('user_id', userId)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          execId = last?.id;
        }
        if (!execId) return { errors: [], count: 0, message: 'No execution found.' };
        const { data } = await admin
          .from('workflow_step_results')
          .select('node_id, node_type, status, error, output_data')
          .eq('execution_id', execId)
          .in('status', ['error', 'failed'])
          .limit(30);
        return { errors: data || [], count: data?.length || 0, executionId: execId };
      }
      break;
    }

    // ── Knowledge Base ──
    case 'kb': {
      if (action === 'list') {
        let q = admin
          .from('knowledge_documents')
          .select('id, title, content_type, tags, organization_id, created_at')
          .eq('user_id', userId);
        if (args.organization_id) q = q.eq('organization_id', args.organization_id);
        if (args.tag) q = q.contains('tags', [args.tag]);
        const { data } = await q.order('created_at', { ascending: false }).limit(20);
        return {
          documents: data || [],
          count: data?.length || 0,
          organization_id: args.organization_id || null,
        };
      }
      if (action === 'search') {
        const term = String(args.query || '').slice(0, 200);
        if (!term) return { error: 'missing search query' };
        let q = admin
          .from('knowledge_documents')
          .select('id, title, content_type, tags, organization_id, created_at')
          .eq('user_id', userId)
          .or(`title.ilike.%${term}%,content.ilike.%${term}%`);
        if (args.organization_id) q = q.eq('organization_id', args.organization_id);
        const { data } = await q.order('created_at', { ascending: false }).limit(10);
        return { documents: data || [], count: data?.length || 0, query: term };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('knowledge_documents')
          .select('id, title, content, content_type, tags, created_at')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'document not found' };
        return { document: data };
      }
      if (action === 'create') {
        const { data, error } = await admin
          .from('knowledge_documents')
          .insert({
            user_id: userId,
            title: args.title || 'Untitled',
            content: args.content || '',
            content_type: args.content_type || 'note',
            tags: Array.isArray(args.tags) ? args.tags : args.tags ? [args.tags] : [],
          })
          .select('id, title, content_type')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      break;
    }

    // ── Tools (connected integrations) ──
    case 'tool': {
      if (action === 'list') {
        const { data } = await admin
          .from('tools')
          .select('id, name, status, connection_type, description')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        return { tools: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        // This return value goes straight into the assistant's LLM context and
        // chat transcript. Report Vault metadata status, never tool data.
        const { data } = await admin
          .from('tools')
          .select('id, name, status, connection_type, description, used_by, created_at, updated_at')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'tool not found' };
        const configured =
          data.connection_type === 'internal' ||
          (await isToolCredentialConfigured(admin, userId, data.id, {
            slot: data.connection_type === 'webhook' ? 'webhook_secret' : 'default',
          }));
        // Keep an explicit output allowlist as a second boundary in case a
        // database client/mock ever returns columns beyond the select list.
        return {
          tool: {
            id: data.id,
            name: data.name,
            status: data.status,
            connection_type: data.connection_type,
            description: data.description,
            used_by: data.used_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
            configured,
          },
        };
      }
      if (action === 'test' || action === 'execute') {
        return {
          message: `Tool ${action} requires the Tools page — opening that gives you live feedback. Deep link: ${appBaseUrl()}/tools`,
        };
      }
      break;
    }

    // ── Marketplace ──
    case 'marketplace': {
      if (action === 'list' || action === 'browse') {
        const { data } = await admin
          .from('marketplace_listings')
          .select(
            'id, title, category, price_usd, avg_rating, total_purchases, creator_id, created_at'
          )
          .eq('status', 'active')
          .order('avg_rating', { ascending: false, nullsFirst: false })
          .limit(15);
        return { listings: data || [], count: data?.length || 0 };
      }
      if (action === 'myListings') {
        const { data } = await admin
          .from('marketplace_listings')
          .select('id, title, status, price_usd, total_purchases, created_at')
          .eq('creator_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { listings: data || [], count: data?.length || 0 };
      }
      if (action === 'myPurchases') {
        const { data } = await admin
          .from('marketplace_purchases')
          .select(
            'id, listing_id, price_paid, payment_status, created_at, marketplace_listings(title)'
          )
          .eq('buyer_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { purchases: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('marketplace_listings')
          .select('*')
          .eq('id', args.id)
          .maybeSingle();
        if (!data) return { error: 'listing not found' };
        return { listing: data };
      }
      break;
    }

    // ── Consilium (AI boards) ──
    case 'consilium': {
      if (action === 'listBoards' || action === 'list') {
        const { data } = await admin
          .from('concilium')
          .select('id, name, status, purpose, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { boards: data || [], count: data?.length || 0 };
      }
      if (action === 'getBoard' || action === 'get') {
        const { data } = await admin
          .from('concilium')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'board not found' };
        return { board: data };
      }
      if (action === 'recentDecisions') {
        const { data } = await admin
          .from('concilium_evaluations')
          .select('id, board_id, topic, decision, approved, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);
        return { decisions: data || [], count: data?.length || 0 };
      }
      if (action === 'decisionDetail') {
        const { data } = await admin
          .from('concilium_evaluations')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'decision not found' };
        return { decision: data };
      }
      if (action === 'meetingSummary') {
        let q = admin
          .from('concilium_evaluations')
          .select('id, board_id, topic, decision, approved, created_at')
          .eq('user_id', userId);
        if (args.boardId) q = q.eq('board_id', args.boardId);
        const { data } = await q.order('created_at', { ascending: false }).limit(10);
        return { decisions: data || [], count: data?.length || 0, boardId: args.boardId || null };
      }
      if (action === 'analytics') {
        let q = admin
          .from('concilium_evaluations')
          .select('approved, created_at')
          .eq('user_id', userId);
        if (args.boardId) q = q.eq('board_id', args.boardId);
        const { data } = await q.limit(500);
        const rows = data || [];
        const total = rows.length;
        const approved = rows.filter((r) => r.approved === true).length;
        return {
          analytics: {
            totalDecisions: total,
            approved,
            rejected: total - approved,
            approvalRate: total ? Math.round((approved / total) * 100) : 0,
          },
          boardId: args.boardId || null,
        };
      }
      // discuss/createBoard/evaluate — heavier ops, defer to the in-app Consilium page.
      return { message: `Open the Consilium page to ${action}: ${appBaseUrl()}/consilium` };
    }

    // ── Investments ──
    case 'invest': {
      if (action === 'listDeals') {
        const { data } = await admin
          .from('investment_deals')
          .select('id, title, status, required_amount, current_funded, industry, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { deals: data || [], count: data?.length || 0 };
      }
      if (action === 'listInvestors') {
        const { data } = await admin
          .from('investment_investors')
          .select('id, name, investor_type, total_invested, created_at')
          .eq('user_id', userId)
          .order('total_invested', { ascending: false, nullsFirst: false })
          .limit(20);
        return { investors: data || [], count: data?.length || 0 };
      }
      if (action === 'listPools') {
        const { data } = await admin
          .from('investment_pools')
          .select('id, name, status, target_amount, current_amount, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);
        return { pools: data || [], count: data?.length || 0 };
      }
      if (action === 'myCommitments') {
        const { data } = await admin
          .from('investment_commitments')
          .select('id, amount, committed_at, investment_deals(title, status)')
          .eq('user_id', userId)
          .order('committed_at', { ascending: false })
          .limit(20);
        return { commitments: data || [], count: data?.length || 0 };
      }
      if (action === 'dealDetails' || action === 'get') {
        const { data } = await admin
          .from('investment_deals')
          .select('*')
          .eq('id', args.id)
          .maybeSingle();
        if (!data) return { error: 'deal not found' };
        return { deal: data };
      }
      break;
    }

    // ── Organizations ──
    case 'org':
    case 'organization': {
      if (action === 'list') {
        const { data } = await admin
          .from('organizations')
          .select('id, name, slug, org_type, parent_id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        return { organizations: data || [], count: data?.length || 0 };
      }
      if (action === 'tree') {
        const { data } = await admin
          .from('organizations')
          .select('id, name, org_type, parent_id')
          .eq('user_id', userId);
        // Build flat hierarchy summary (the LLM will format it).
        const byId = Object.fromEntries((data || []).map((o) => [o.id, { ...o, children: [] }]));
        const roots = [];
        for (const o of Object.values(byId)) {
          if (o.parent_id && byId[o.parent_id]) byId[o.parent_id].children.push(o);
          else roots.push(o);
        }
        return { tree: roots, count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('organizations')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'organization not found' };
        return { organization: data };
      }
      if (action === 'createSubsidiary' || action === 'create') {
        const { data, error } = await admin
          .from('organizations')
          .insert({
            user_id: userId,
            name: args.name,
            slug: (args.name || '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .slice(0, 60),
            org_type: args.org_type || 'subsidiary',
            parent_id: args.parentId || null,
          })
          .select('id, name, org_type')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      if (action === 'members') {
        const [{ data: agents }, { data: teams }] = await Promise.all([
          admin.from('org_agents').select('agent_id').eq('user_id', userId).eq('org_id', args.id),
          admin.from('org_teams').select('team_id').eq('user_id', userId).eq('org_id', args.id),
        ]);
        return {
          agents: agents || [],
          teams: teams || [],
          agentCount: agents?.length || 0,
          teamCount: teams?.length || 0,
        };
      }
      if (action === 'kpis') {
        const headCount = (table) =>
          admin
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('org_id', args.id);
        const [goalsTotal, goalsActive, tasksOpen] = await Promise.all([
          headCount('goals').then(
            (r) => r.count || 0,
            () => 0
          ),
          headCount('goals')
            .not('status', 'in', '("completed","cancelled","failed")')
            .then(
              (r) => r.count || 0,
              () => 0
            ),
          headCount('team_tasks')
            .not('status', 'in', '("done","completed","cancelled")')
            .then(
              (r) => r.count || 0,
              () => 0
            ),
        ]);
        return { kpis: { goalsTotal, goalsActive, tasksOpen }, orgId: args.id };
      }
      break;
    }

    // ── Pulse (agent automation triggers) ──
    case 'pulse': {
      if (action === 'list') {
        const { data } = await admin
          .from('agent_pulses')
          .select(
            'id, agent_role, action, enabled, trigger_type, cron_expr, last_fired_at, next_due_at, created_at'
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        return { pulses: data || [], count: data?.length || 0 };
      }
      if (action === 'get') {
        const { data } = await admin
          .from('agent_pulses')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!data) return { error: 'pulse not found' };
        const { data: cycles } = await admin
          .from('pulse_cycles')
          .select('id, status, outcome, fired_at, duration_ms')
          .eq('pulse_id', args.id)
          .order('fired_at', { ascending: false })
          .limit(10);
        return { pulse: data, cycles: cycles || [] };
      }
      if (action === 'fireNow') {
        const { data: pulse } = await admin
          .from('agent_pulses')
          .select('*')
          .eq('id', args.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!pulse) return { error: 'pulse not found' };
        const { fireOne } = await import('../pulses/tick.js');
        const result = await fireOne(admin, pulse, {});
        return { fired: args.id, result };
      }
      if (action === 'pause' || action === 'resume') {
        const enabled = action === 'resume';
        const { data, error } = await admin
          .from('agent_pulses')
          .update({ enabled })
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, action, enabled')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'pulse not found' };
        return { updated: data };
      }
      if (action === 'create') {
        if (!args.action) return { error: 'action is required' };
        const { data, error } = await admin
          .from('agent_pulses')
          .insert({
            user_id: userId,
            agent_role: args.agent_role || '',
            action: args.action,
            trigger_type: args.trigger_type || 'manual',
            cron_expr: args.cron_expr || null,
            enabled: true,
          })
          .select('id, action, trigger_type, enabled')
          .single();
        if (error) throw new Error(error.message);
        return { created: data };
      }
      break;
    }

    // ── Loops (looping goals) ──
    case 'loop': {
      if (action === 'list') {
        const { data } = await admin
          .from('goals')
          .select(
            'id, title, status, iteration, max_iterations, loop_enabled, loop_paused, loop_paused_reason, budget_usd, created_at'
          )
          .eq('user_id', userId)
          .or('iteration.gt.0,loop_enabled.eq.true')
          .order('created_at', { ascending: false })
          .limit(30);
        return { loops: data || [], count: data?.length || 0 };
      }
      if (action === 'pauseResume') {
        const paused = args.paused === true || args.paused === 'true';
        const { data, error } = await admin
          .from('goals')
          .update({ loop_paused: paused })
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, title, loop_paused')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'goal not found' };
        return { updated: data };
      }
      if (action === 'updateSettings') {
        const patch = {};
        if (args.loop_settings && typeof args.loop_settings === 'object')
          patch.loop_settings = args.loop_settings;
        if (args.max_iterations != null) patch.max_iterations = Number(args.max_iterations);
        if (!Object.keys(patch).length) return { error: 'no loop settings provided' };
        const { data, error } = await admin
          .from('goals')
          .update(patch)
          .eq('id', args.id)
          .eq('user_id', userId)
          .select('id, title, max_iterations, loop_settings')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { error: 'goal not found' };
        return { updated: data };
      }
      break;
    }

    // ── Usage / cost ──
    case 'usage': {
      const since = args.from
        ? new Date(args.from).toISOString()
        : new Date(Date.now() - 30 * 86_400_000).toISOString();
      const until = args.to ? new Date(args.to).toISOString() : new Date().toISOString();
      if (action === 'costByEntity') {
        let q = admin
          .from('llm_usage')
          .select('estimated_cost_usd, total_tokens, provider, model, created_at')
          .eq('user_id', userId)
          .gte('created_at', since)
          .lte('created_at', until);
        const entityCol = {
          organization: 'organization_id',
          consilium: 'consilium_id',
          goal: 'goal_id',
          team: 'team_id',
          agent: 'agent_id',
        }[args.entity];
        if (entityCol && args.entityId) q = q.eq(entityCol, args.entityId);
        const { data } = await q.limit(5000);
        const rows = data || [];
        const costUsd = rows.reduce((s, r) => s + (Number(r.estimated_cost_usd) || 0), 0);
        const tokens = rows.reduce((s, r) => s + (Number(r.total_tokens) || 0), 0);
        return {
          entity: args.entity || 'all',
          entityId: args.entityId || null,
          calls: rows.length,
          costUsd: Math.round(costUsd * 10000) / 10000,
          tokens,
        };
      }
      if (action === 'topSpenders') {
        const { data } = await admin
          .from('llm_usage')
          .select('estimated_cost_usd, model, goal_id, agent_id')
          .eq('user_id', userId)
          .gte('created_at', since)
          .lte('created_at', until)
          .limit(5000);
        const rows = data || [];
        const byModel = {};
        for (const r of rows) {
          const key = r.model || 'unknown';
          byModel[key] = (byModel[key] || 0) + (Number(r.estimated_cost_usd) || 0);
        }
        const top = Object.entries(byModel)
          .map(([model, usd]) => ({ model, costUsd: Math.round(usd * 10000) / 10000 }))
          .sort((a, b) => b.costUsd - a.costUsd)
          .slice(0, 10);
        return { topByModel: top, calls: rows.length };
      }
      break;
    }

    // ── Activity feed ──
    case 'activity': {
      const range = args.range || 'week';
      const days = range === 'today' ? 1 : range === 'month' ? 30 : 7;
      const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data: goalRows } = await admin.from('goals').select('id').eq('user_id', userId);
      const goalIds = (goalRows || []).map((g) => g.id);
      const [goalLog, notifs] = await Promise.all([
        goalIds.length
          ? admin
              .from('goal_log')
              .select('goal_id, event_type, created_at')
              .in('goal_id', goalIds)
              .gte('created_at', sinceIso)
              .order('created_at', { ascending: false })
              .limit(40)
              .then(
                (r) => r.data || [],
                () => []
              )
          : Promise.resolve([]),
        admin
          .from('notification_log')
          .select('id, title, body, created_at')
          .eq('user_id', userId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(40)
          .then(
            (r) => r.data || [],
            () => []
          ),
      ]);
      const events = [
        ...goalLog.map((r) => ({
          source: 'goal',
          type: r.event_type,
          at: r.created_at,
          ref: r.goal_id,
        })),
        ...notifs.map((r) => ({
          source: 'notification',
          title: r.title,
          body: r.body,
          at: r.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 50);
      if (action === 'whatChanged') {
        const byType = {};
        for (const e of events) {
          const key = e.source === 'goal' ? `goal:${e.type}` : 'notification';
          byType[key] = (byType[key] || 0) + 1;
        }
        return { range, changes: byType, total: events.length };
      }
      return { range, events, count: events.length };
    }

    // ── Insights (dashboard-style aggregate) ──
    case 'insights': {
      const { buildInsights } = await import('../_shared/insights.js');
      if (action === 'save') {
        const range = args.range || 'overview';
        const insights = await buildInsights(admin, userId, range);
        const i = insights;
        const body = [
          `Range: ${i.range}`,
          `Tasks — due ${i.tasks.dueSoon}, overdue ${i.tasks.overdue}, blocked ${i.tasks.blocked}`,
          `Workflows — running ${i.workflows.running}, failed ${i.workflows.failed}`,
          `Goals — active ${i.goals.active}, at risk ${i.goals.atRisk}, looping ${i.goals.looping}`,
          `Consilium decisions: ${i.consilium.decisions}`,
          `New docs: ${i.knowledge.newDocs}`,
          `Pulses on: ${i.pulses.enabled}/${i.pulses.total}`,
          `Spend: $${i.spend.usd}`,
        ].join('\n');
        const { data, error } = await admin
          .from('knowledge_documents')
          .insert({
            user_id: userId,
            title: `Insights snapshot (${range})`,
            content: body,
            content_type: 'note',
            category: 'Quality',
            tags: ['insight'],
            owner_type: args.organization_id ? 'organization' : 'user',
            organization_id: args.organization_id || null,
          })
          .select('id, title')
          .single();
        if (error) throw new Error(error.message);
        return { saved: data, insights };
      }
      const range = action === 'weekly' ? 'weekly' : action === 'monthly' ? 'monthly' : 'overview';
      const insights = await buildInsights(admin, userId, range);
      return { insights };
    }

    // ── Business brief -> Knowledge Base ──
    case 'brief': {
      if (action === 'generate') {
        // Gather light org context (recent goals) to ground the brief.
        let goalsQ = admin
          .from('goals')
          .select('title, status, budget_usd, spent_usd')
          .eq('user_id', userId);
        if (args.organization_id) goalsQ = goalsQ.eq('org_id', args.organization_id);
        const { data: goals } = await goalsQ.order('created_at', { ascending: false }).limit(15);
        const context = `${args.focus ? `Focus: ${args.focus}\n` : ''}Recent goals/initiatives:\n${
          (goals || [])
            .map((g) => `- ${g.title} (${g.status}, $${g.spent_usd || 0}/$${g.budget_usd || 0})`)
            .join('\n') || '(no goals yet)'
        }`;
        // Use the model the user selected for their current assistant (the
        // in-chat chip persists it); fall back to Groq only when unset.
        const { provider, model, useTemplates } = await resolveAssistantLlm(admin, userId, {
          provider: defaultProvider(),
          model: defaultModel(),
        });
        const usage = { admin, userId, source: 'assistant-brief', operation: 'brief' };

        // "User templates" toggle ON: run the structured answer-template first -
        // the model fills fixed slots and a deterministic renderer owns the
        // layout, so the brief stays complete and well-formed even on a weak
        // model. Toggle OFF (default) keeps the legacy free-form prose below.
        // The structured path also self-falls-back to free-form on any failure.
        let content = null;
        if (useTemplates) {
          try {
            const { getAnswerTemplate } = await import('../_shared/answer-templates.js');
            const { runStructuredTemplate } = await import('../_shared/structured-llm.js');
            const template = getAnswerTemplate('brief');
            const { fields } = await runStructuredTemplate({
              template,
              context,
              userId,
              provider,
              model,
              usage,
            });
            if (fields) content = template.render(fields).content;
          } catch {
            /* fall through to free-form */
          }
        }
        if (!content) {
          const { executeLlmV2Tracked } = await import('../usage-handlers/tracked-llm.js');
          const llm = await executeLlmV2Tracked({
            userId,
            systemPrompt:
              'You are a business analyst. Write a concise, structured business brief (Overview, Current Focus, Risks, Next Steps) from the data. Be specific and short. No preamble.',
            prompt: context,
            provider,
            model,
            temperature: 0.3,
            maxTokens: 900,
            timeoutMs: 20000,
            usage,
          });
          content = llm.content || 'Business brief unavailable.';
        }
        const { data, error } = await admin
          .from('knowledge_documents')
          .insert({
            user_id: userId,
            title: 'Business brief',
            content,
            content_type: 'note',
            category: 'General',
            tags: ['brief'],
            // owner_type is constrained to user/agent/team/partner (chk_kd_owner_type);
            // org scoping is carried by organization_id, not owner_type.
            owner_type: 'user',
            organization_id: args.organization_id || null,
          })
          .select('id, title')
          .single();
        if (error) throw new Error(error.message);
        return { saved: data, brief: content };
      }
      break;
    }

    // ── System ──
    case 'system': {
      if (action === 'healthCheck') {
        const checks = {};
        const { count: partnerCount } = await admin
          .from('partners')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        const { count: agentCount } = await admin
          .from('agents')
          .select('agent_id', { count: 'exact', head: true })
          .eq('user_id', userId);
        const { count: goalCount } = await admin
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        checks.partners = partnerCount || 0;
        checks.agents = agentCount || 0;
        checks.goals = goalCount || 0;
        checks.status = 'healthy';
        return checks;
      }
      break;
    }

    // ── Navigation ──
    case 'navigate': {
      return { navigate: args.page || '/', message: `Navigate to: ${args.page}` };
    }

    // ── Settings ──
    case 'settings': {
      return { message: 'Settings update noted. Use the Settings page for changes.' };
    }

    // ── Chat history (search the user's PAST assistant conversations) ──
    case 'chat': {
      if (action === 'searchHistory') {
        const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50);
        let q = admin
          .from('assistant_chat_messages')
          .select('conversation_id, role, content, created_at')
          .eq('user_id', userId);
        if (args?.excludeConversationId) q = q.neq('conversation_id', args.excludeConversationId);
        const query = String(args?.query || '').trim();
        if (query) q = q.ilike('content', `%${query}%`);
        const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
        if (error) throw new Error(error.message);
        const matches = (data || []).map((m) => ({
          conversationId: m.conversation_id,
          role: m.role,
          content: (m.content || '').slice(0, 500),
          at: m.created_at,
        }));
        return { matches, count: matches.length, query: query || null };
      }
      break;
    }

    default:
      return { message: `Tool "${toolName}" acknowledged. Operation logged.` };
  }

  return { message: `${toolName} completed.` };
}

// ── Helpers ──

async function loadHistory(admin, userId, threadId) {
  try {
    let q = admin
      .from('command_history')
      .select('input, output, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const { data } = await q;
    if (!data || data.length === 0) return [];

    // Convert to chat history format (newest first → reverse to chronological)
    return data.reverse().flatMap((row) => [
      { role: 'user', content: row.input },
      { role: 'assistant', content: row.output?.slice(0, 300) || '' },
    ]);
  } catch (error) {
    if (isJobLeaseLostError(error)) throw error;
    return [];
  }
}

async function loadMemories(admin, userId) {
  try {
    const { data } = await admin
      .from('assistant_memory')
      .select('fact')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    return (data || []).map((m) => m.fact);
  } catch (error) {
    if (isJobLeaseLostError(error)) throw error;
    return [];
  }
}

async function logCommand(admin, userId, input, result, platform, threadId) {
  // Log to command_history
  await admin
    .from('command_history')
    .insert({
      user_id: userId,
      input,
      parsed_intent: result.calls?.[0]?.tool || 'conversation',
      output: result.message || '',
      status: result.status || (result.needsConfirmation ? 'pending' : 'success'),
      platform,
      metadata: {
        tools_called: result.calls?.map((c) => c.tool) || [],
        tool_results: result.toolResults?.slice(0, 5) || [],
        cost: result.cost,
        model: result.model,
        provider: result.provider,
        thread_id: threadId,
      },
    })
    .then(
      () => {},
      () => {}
    );

  // Log to communication_logs
  await admin
    .from('communication_logs')
    .insert({
      thread_id: threadId || crypto.randomUUID(),
      user_id: userId,
      sender_type: 'user',
      sender_id: userId,
      sender_name: 'User',
      content: input,
      context_type: 'command',
      platform,
      metadata: {
        type: 'assistant_command',
        tools_called: result.calls?.map((c) => c.tool) || [],
        cost: result.cost,
      },
    })
    .then(
      () => {},
      () => {}
    );
}

// Daily spend cap (cheap defense against injection / loops).
// Default $5/user/day; configurable per user via users.daily_llm_cap_usd if the
// column exists. Falls back to default silently when the column hasn't been added.
const DEFAULT_DAILY_CAP_USD = 5;

export async function checkDailySpendCap(admin, userId) {
  let cap = DEFAULT_DAILY_CAP_USD;
  try {
    const { data: u } = await admin
      .from('users')
      .select('daily_llm_cap_usd')
      .eq('id', userId)
      .maybeSingle();
    if (u?.daily_llm_cap_usd != null) cap = Number(u.daily_llm_cap_usd) || cap;
  } catch {
    /* column may not exist */
  }

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let spent = 0;
  try {
    const { data: rows } = await admin
      .from('command_history')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .limit(500);
    spent = (rows || []).reduce((acc, r) => acc + (Number(r.metadata?.cost) || 0), 0);
  } catch {
    /* table may not exist; fail open */
  }

  return { cap, spent, over: spent >= cap };
}

function escBridge(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function appBaseUrl() {
  const env = process.env.PUBLIC_APP_URL || process.env.PUBLIC_API_BASE_URL || '';
  if (env.startsWith('http')) return env;
  if (env) return `https://${env}`;
  return 'https://orchestratori.vercel.app';
}

// ── Report helpers (Phase 2) ────────────────────────────────────────────────

function mapReportType(label) {
  const l = String(label || '').toLowerCase();
  if (/finance|revenue|spend|profit/.test(l)) return 'finance';
  if (/partner|perf/.test(l)) return 'partner_perf';
  if (/ops|operation|task/.test(l)) return 'operations';
  return 'executive';
}

function uiTemplateForKpiSet(kpi) {
  return (
    {
      finance: 'tpl-finance-growth',
      partner_perf: 'tpl-partner-performance',
      operations: 'tpl-operations-tasks',
      executive: 'tpl-executive-summary',
    }[kpi] || 'tpl-executive-summary'
  );
}

async function loadFreshReportData(admin, userId) {
  // Minimal aggregation source — mirrors what ops-handlers/reports.js reads
  // from but lightweight and chat-friendly. RLS bypassed via service role,
  // so we filter by user_id ourselves where columns allow.
  const [partnersR, projectsR, goalsR, tasksR] = await Promise.all([
    admin
      .from('partners')
      .select('id, name, team, revenue, spend, ftd, clicks, status, funnelStatus, geos, geo')
      .eq('user_id', userId)
      .limit(500),
    admin.from('projects').select('id, name, status, created_at').eq('user_id', userId).limit(500),
    admin
      .from('goals')
      .select('id, title, status, budget_usd, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('team_tasks')
      .select('id, status, priority, created_at')
      .eq('user_id', userId)
      .limit(500),
  ]);
  return {
    partners: partnersR.data || [],
    projects: projectsR.data || [],
    goals: goalsR.data || [],
    tasks: tasksR.data || [],
  };
}

function aggregateForChat(kpiSet, data) {
  const { partners, projects, goals, tasks } = data;

  const totalRevenue = sum(partners, (p) => Number(p.revenue || 0));
  const totalSpend = sum(partners, (p) => Number(p.spend || 0));
  const totalFtd = sum(partners, (p) => Number(p.ftd || 0));
  const totalClicks = sum(partners, (p) => Number(p.clicks || 0));
  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? ((totalRevenue - totalSpend) / totalSpend) * 100 : 0;

  const activeProjects = projects.filter((p) => /active/i.test(p.status || '')).length;

  const goalsByStatus = bucket(goals, (g) => g.status || 'unknown');
  const tasksByStatus = bucket(tasks, (t) => t.status || 'unknown');

  const topPartners = [...partners]
    .map((p) => ({
      name: p.name || 'Unknown',
      revenue: Number(p.revenue || 0),
      spend: Number(p.spend || 0),
    }))
    .filter((p) => p.revenue > 0 || p.spend > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const lines = [];
  const period = new Date().toISOString().slice(0, 10);
  lines.push(`📊 <b>${humanLabel(kpiSet)}</b> · ${period}`);
  lines.push('');

  if (kpiSet === 'finance' || kpiSet === 'executive') {
    lines.push(
      `Revenue: <b>$${fmt(totalRevenue)}</b>   Spend: $${fmt(totalSpend)}   Profit: $${fmt(profit)}`
    );
    lines.push(`ROI: ${roi.toFixed(1)}%   FTDs: ${totalFtd}   Clicks: ${totalClicks}`);
  }
  if (kpiSet === 'partner_perf' || kpiSet === 'executive') {
    lines.push('');
    lines.push(`<b>Top partners by revenue</b>`);
    if (!topPartners.length) {
      lines.push('  (no partner revenue data yet)');
    } else {
      for (const p of topPartners) {
        lines.push(`  • ${p.name} — $${fmt(p.revenue)} rev · $${fmt(p.spend)} spend`);
      }
    }
  }
  if (kpiSet === 'operations' || kpiSet === 'executive') {
    lines.push('');
    lines.push(
      `Active projects: ${activeProjects}   Total goals: ${goals.length}   Total tasks: ${tasks.length}`
    );
    const gStatus = Object.entries(goalsByStatus)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    const tStatus = Object.entries(tasksByStatus)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    if (gStatus) lines.push(`Goals → ${gStatus}`);
    if (tStatus) lines.push(`Tasks → ${tStatus}`);
  }

  return {
    text: lines.join('\n'),
    metrics: {
      totalRevenue,
      totalSpend,
      profit,
      roi,
      totalFtd,
      totalClicks,
      activeProjects,
      goalsByStatus,
      tasksByStatus,
      topPartners,
    },
  };
}

function summarizeKpis(kpiSet, values) {
  const v = values || {};
  if (kpiSet === 'finance')
    return `Rev $${fmt(v.totalRevenue || 0)} · Spend $${fmt(v.totalSpend || 0)} · ROI ${(v.roi || 0).toFixed(1)}%`;
  if (kpiSet === 'partner_perf') return `${v.partnerCount || 0} partners`;
  if (kpiSet === 'operations') return `${v.activeProjects || 0} active projects`;
  return v.summary || 'executive snapshot';
}

function humanLabel(kpiSet) {
  return (
    {
      finance: 'Finance & growth',
      partner_perf: 'Partner performance',
      operations: 'Operations & tasks',
      executive: 'Executive summary',
    }[kpiSet] || kpiSet
  );
}

function sum(arr, fn) {
  return (arr || []).reduce((a, x) => a + (fn(x) || 0), 0);
}
function bucket(arr, fn) {
  const m = {};
  for (const x of arr || []) {
    const k = fn(x);
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}
function fmt(n) {
  const x = Math.round(Number(n) || 0);
  return x.toLocaleString('en-US');
}

/**
 * Format assistant result as plain text for messenger platforms.
 */
export function formatForMessenger(result) {
  const lines = [];

  if (result.message) lines.push(result.message);

  if (result.toolResults?.length > 0) {
    for (const tr of result.toolResults) {
      if (tr.status === 'awaiting_confirmation') {
        lines.push(`\n⚠️ Confirmation needed: ${tr.tool}`);
        lines.push(`Args: ${JSON.stringify(tr.args)}`);
      } else if (tr.status === 'error') {
        lines.push(`\n❌ ${tr.tool}: ${tr.error}`);
      } else if (tr.result) {
        // Format common result types
        const r = tr.result;
        if (r.report?.summary?.text) {
          lines.push('\n' + r.report.summary.text);
          if (r.report.deepLink) lines.push(`\n🔗 Full report: ${r.report.deepLink}`);
        } else if (r.reports) {
          lines.push(`\nReports (${r.count}):`);
          for (const rep of r.reports.slice(0, 10))
            lines.push(`  • ${rep.date} · ${rep.type} — ${rep.headline}`);
        } else if (r.files) {
          lines.push(`\nFiles (${r.count}):`);
          for (const f of r.files.slice(0, 10)) {
            const kb = Math.max(1, Math.round((f.size_bytes || 0) / 1024));
            lines.push(
              `  • ${f.filename} (${kb} KB) — ${new Date(f.created_at).toLocaleDateString()}`
            );
          }
        } else if (r.file) {
          lines.push(`\n📎 ${r.file.filename}`);
          if (r.file.extracted_text) {
            const preview = r.file.extracted_text.slice(0, 800);
            lines.push(`\n${preview}${r.file.extracted_text.length > 800 ? '…' : ''}`);
          }
        } else if (r.workflows) {
          lines.push(`\nWorkflows (${r.count}):`);
          for (const w of r.workflows.slice(0, 10))
            lines.push(`  • ${w.name} ${w.enabled ? '✓ active' : '⏸ paused'}`);
        } else if (r.workflow) lines.push(`\n${r.workflow.enabled ? '✓' : '⏸'} ${r.workflow.name}`);
        else if (r.documents) {
          lines.push(`\n📚 Knowledge (${r.count}${r.query ? ` for "${r.query}"` : ''}):`);
          for (const d of r.documents.slice(0, 10))
            lines.push(`  • ${d.title} [${d.content_type}]`);
        } else if (r.document) {
          lines.push(`\n📄 <b>${escBridge(r.document.title)}</b>`);
          if (r.document.content) lines.push(`\n${String(r.document.content).slice(0, 800)}`);
        } else if (r.tools) {
          lines.push(`\n🔧 Tools (${r.count}):`);
          for (const t of r.tools.slice(0, 10))
            lines.push(`  • ${t.name} [${t.connection_type || '?'}] ${t.status || ''}`);
        } else if (r.tool) lines.push(`\n🔧 ${r.tool.name}: ${r.tool.status || ''}`);
        else if (r.listings) {
          lines.push(`\n🛒 Listings (${r.count}):`);
          for (const l of r.listings.slice(0, 10)) {
            const price = l.price_usd != null ? `$${l.price_usd}` : '';
            const rating = l.avg_rating != null ? `★${Number(l.avg_rating).toFixed(1)}` : '';
            lines.push(`  • ${l.title} ${price} ${rating}`.trim());
          }
        } else if (r.listing)
          lines.push(
            `\n🛒 <b>${escBridge(r.listing.title)}</b> · $${r.listing.price_usd} · ★${r.listing.avg_rating || '—'}`
          );
        else if (r.purchases) {
          lines.push(`\n🛒 Purchases (${r.count}):`);
          for (const p of r.purchases.slice(0, 10)) {
            const t = p.marketplace_listings?.title || p.listing_id?.slice(0, 8);
            lines.push(`  • ${t} — $${p.price_paid} [${p.payment_status}]`);
          }
        } else if (r.boards) {
          lines.push(`\n🏛 Consilium boards (${r.count}):`);
          for (const b of r.boards.slice(0, 10)) lines.push(`  • ${b.name} [${b.status}]`);
        } else if (r.board)
          lines.push(`\n🏛 <b>${escBridge(r.board.name)}</b> — ${r.board.purpose || ''}`);
        else if (r.decisions) {
          lines.push(`\n🏛 Recent decisions (${r.count}):`);
          for (const d of r.decisions.slice(0, 10)) {
            const flag = d.approved ? '✓' : '✗';
            lines.push(`  ${flag} ${(d.topic || '').slice(0, 60)}`);
          }
        } else if (r.deals) {
          lines.push(`\n💼 Deals (${r.count}):`);
          for (const d of r.deals.slice(0, 10)) {
            const pct = d.required_amount
              ? Math.round((100 * (d.current_funded || 0)) / d.required_amount)
              : 0;
            lines.push(
              `  • ${d.title} — $${d.current_funded || 0}/$${d.required_amount || 0} (${pct}%) [${d.status}]`
            );
          }
        } else if (r.deal)
          lines.push(
            `\n💼 <b>${escBridge(r.deal.title)}</b> · $${r.deal.current_funded || 0}/$${r.deal.required_amount || 0} · ${r.deal.status}`
          );
        else if (r.investors) {
          lines.push(`\n👥 Investors (${r.count}):`);
          for (const i of r.investors.slice(0, 10))
            lines.push(`  • ${i.name} [${i.investor_type}] — $${i.total_invested || 0}`);
        } else if (r.pools) {
          lines.push(`\n🏦 Pools (${r.count}):`);
          for (const p of r.pools.slice(0, 10)) {
            const pct = p.target_amount
              ? Math.round((100 * (p.current_amount || 0)) / p.target_amount)
              : 0;
            lines.push(
              `  • ${p.name} — $${p.current_amount || 0}/$${p.target_amount || 0} (${pct}%)`
            );
          }
        } else if (r.commitments) {
          lines.push(`\n📝 Commitments (${r.count}):`);
          for (const c of r.commitments.slice(0, 10)) {
            const t = c.investment_deals?.title || 'deal';
            lines.push(`  • ${t} — $${c.amount}`);
          }
        } else if (r.organizations) {
          lines.push(`\n🏢 Organizations (${r.count}):`);
          for (const o of r.organizations.slice(0, 10)) lines.push(`  • ${o.name} [${o.org_type}]`);
        } else if (r.organization)
          lines.push(`\n🏢 <b>${escBridge(r.organization.name)}</b> [${r.organization.org_type}]`);
        else if (r.tree) {
          lines.push(`\n🏢 Org structure (${r.count} total):`);
          const walk = (nodes, depth = 0) => {
            for (const n of nodes) {
              lines.push(`  ${'  '.repeat(depth)}└ ${n.name} [${n.org_type}]`);
              if (n.children?.length) walk(n.children, depth + 1);
            }
          };
          walk(r.tree);
        } else if (r.partners)
          lines.push(`\nPartners (${r.count}): ${r.partners.map((p) => p.name).join(', ')}`);
        else if (r.agents)
          lines.push(
            `\nAgents (${r.count}): ${r.agents.map((a) => `${a.agent_id} [${a.availability_status}]`).join(', ')}`
          );
        else if (r.projects)
          lines.push(
            `\nProjects (${r.count}): ${r.projects.map((p) => `${p.name} [${p.status}]`).join(', ')}`
          );
        else if (r.goals)
          lines.push(
            `\nGoals (${r.count}): ${r.goals.map((g) => `${g.title} [${g.status}]`).join(', ')}`
          );
        else if (r.created) lines.push(`\n✅ Created: ${JSON.stringify(r.created)}`);
        else if (r.message) lines.push(`\n${r.message}`);
        else lines.push(`\n✅ ${tr.tool}: done`);
      }
    }
  }

  if (result.cost > 0) {
    lines.push(`\n💰 Cost: $${result.cost.toFixed(4)}`);
  }

  return lines.join('\n') || 'Done.';
}
