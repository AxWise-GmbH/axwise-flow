/**
 * Shared job processing core.
 *
 * Extracted from process-next.js so both the cron handler and the
 * Supabase webhook handler can reuse the same claim → execute → finalize
 * pipeline without duplicating logic.
 */
import { isDeepStrictEqual } from 'node:util';
import { generateEmbedding, estimateTokens } from '../_shared/embeddings.js';
import { resolveGoalKbScope, resolveAgentKbScope } from '../_shared/kb-scope.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlm, parseLlmJson } from './llm-executor.js';
import { runAgentWithTools } from './tool-runner.js';
import { handleExecuteTask } from './execute-task.js';
import { executeWorkflow } from '../workflow-engine/runner.js';
import { checkConciliumRateLimit } from '../concilium-handlers/rate-limit-check.js';
import { scanInput } from '../concilium-handlers/security-scanner.js';
import { analyzeRequest } from '../concilium-handlers/fraud-detector.js';
import { recordUsage } from '../concilium-handlers/cost-tracker.js';
import { hasV2Members, handleConciliumEvaluateV2 } from '../concilium-handlers/evaluate-v2.js';
import { loadOwnedConciliumBoard } from '../concilium-handlers/evaluation-engine.js';
import { handleGoalOrchestration } from '../goal-handlers/goal-orchestrator.js';
import { loadActiveSkills } from './load-active-skills.js';
import { handle as handleLibraryCalibration } from '../goal-handlers/stages/library-calibration.js';
import { handlePulseCycle, handlePromptRefinement } from './pulse-handler.js';
import { handleCommunicatorProcess } from './communicator-process.js';
import {
  authorizeQueuedJob,
  isJobOwnerValidationError,
  jobOwnerValidationError,
} from './job-authority.js';
import { commLog } from '../utils/commLog.js';
import {
  searchAgentMemory,
  formatMemoryForPrompt,
  UNTRUSTED_REFERENCE_SYSTEM_RULE,
} from '../workflow-engine/memory-manager.js';
import { queryAgentGraph } from '../_shared/graphify-agent.js';
import { agentMemoryOwnerId, isAgentMemoryEnabled } from '../_shared/agent-memory.js';
import { defaultProvider, defaultModel, defaultCheapModel } from '../_shared/llm-defaults.js';
import { resolveToolCredential } from './tool-credentials.js';
import { resolveUserKey } from '../security/resolve-user-key.js';
import { PREDEFINED_TOOLS } from '../../src/config/predefinedTools.js';
import {
  handleAxwiseOutcomeJob,
  markAxwiseOutcomeFinalFailure,
} from '../integrations/axwise/outcome-delivery.js';
import { handleAxwiseGroundJob } from '../integrations/axwise/grounding-job.js';
import { stripPersistedCredentials } from '../security/persisted-credential-sanitizer.js';
import {
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from './worker-scope.js';
import {
  createProcessNextTriggerCapture,
  withProcessNextTriggerCapture,
} from './process-next-trigger-capture.js';
import {
  clearJobLease,
  createJobLeaseClaim,
  createJobLeaseRuntime,
  guardSupabaseClientForCurrentJobLease,
  hasCompleteJobLease,
  incompleteJobLeaseError,
  isJobLeaseLostError,
  jobLeaseLostError,
  withVerifiedJobFinalizationReceipt,
  withJobLeaseRuntime,
} from './job-lease-runtime.js';

const log = createLogger('job-processor');
const MAX_RETRIES = 3;
const BYOK_REQUIRED_RE = /\b(?:BYOK_REQUIRED|SYSTEM_API_KEY_MISSING):/i;
const JOB_LEASE_TRANSITION_ERROR = 'JOB_LEASE_TRANSITION_ERROR';
const JOB_CLAIM_RECONCILIATION_REQUIRED = 'JOB_CLAIM_RECONCILIATION_REQUIRED';
export const JOB_EXECUTION_UNSETTLED = 'JOB_EXECUTION_UNSETTLED';
export const JOB_ABORT_SETTLEMENT_GRACE_MS = 5_000;
export { JOB_OWNER_VALIDATION_ERROR, canonicalizeJobOwner } from './job-authority.js';
const JOB_SNAPSHOT_SELECT =
  'id, user_id, status, payload, retry_count, max_retries, worker_scope, updated_at, error, result, lease_token, heartbeat_at, lease_expires_at';
const JOB_AUTHORITY_SNAPSHOTS = new WeakMap();
const JOB_LEASE_SNAPSHOTS = new WeakMap();

function immutableLeaseSnapshot(job) {
  const snapshot = {};
  for (const field of [
    'id',
    'user_id',
    'status',
    'worker_scope',
    'payload',
    'retry_count',
    'max_retries',
    'updated_at',
    'error',
    'result',
    'lease_token',
    // Heartbeats may advance these timestamps after the claim snapshot. They
    // are retained only as proof that this generation was a complete durable
    // lease; exact running-state transitions compare the immutable token and
    // include lease_expires_at only for stale-recovery CAS.
    'heartbeat_at',
    'lease_expires_at',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(job || {}, field)) continue;
    const value = job[field];
    snapshot[field] =
      value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  }
  return Object.freeze(snapshot);
}

function rememberJobAuthority(originalJob, canonicalJob, authority) {
  const leaseSnapshot = immutableLeaseSnapshot(originalJob);
  if (originalJob && typeof originalJob === 'object') {
    JOB_AUTHORITY_SNAPSHOTS.set(originalJob, authority);
    JOB_LEASE_SNAPSHOTS.set(originalJob, leaseSnapshot);
  }
  if (canonicalJob && typeof canonicalJob === 'object') {
    JOB_AUTHORITY_SNAPSHOTS.set(canonicalJob, authority);
    JOB_LEASE_SNAPSHOTS.set(canonicalJob, leaseSnapshot);
  }
}

/**
 * Errors that cannot improve on a retry and have one concrete user remedy.
 * Keep the persisted/UI copy separate from the provider's diagnostic string:
 * the latter belongs on the failed queue row and in server logs, while the
 * former should tell a person exactly what to do next.
 */
export function classifyActionableJobError(value) {
  const diagnostic = String(value instanceof Error ? value.message : value || '');
  if (!BYOK_REQUIRED_RE.test(diagnostic)) return null;

  const provider = diagnostic.match(/Add a key for ([a-z0-9_-]+)/i)?.[1]?.toLowerCase() || null;
  const providerLabel = provider === 'gemini' ? 'Gemini' : 'AI';
  return {
    code: 'llm_api_key_required',
    goalStatus: 'needs_human',
    eventType: 'goal_needs_human',
    message: `Connect a ${providerLabel} API key in Settings → API Keys, then retry this goal.`,
    action: {
      type: 'navigate',
      label: 'Open API Keys',
      target_url: '/settings/keys',
    },
  };
}

// ── Job type handlers ─────────────────────────────────────────────

async function handleRunLlm(payload, req) {
  const { prompt, systemPrompt, provider, model, temperature, maxTokens, jsonMode, memory } =
    payload;
  if (!prompt) throw new Error('Missing prompt in payload');

  // Append retrieved agent memory to the user request as explicitly untrusted
  // reference data. The fixed system rule is trusted code; retrieved bytes are
  // never system policy.
  // Long-term memory is active by default; for agent owners, honor an explicit
  // deactivation (metadata.long_term_memory_enabled === false) — enforced
  // server-side so a stale/absent client flag can't bypass it.
  const finalSystemPrompt = [systemPrompt, UNTRUSTED_REFERENCE_SYSTEM_RULE]
    .filter(Boolean)
    .join('\n\n');
  let finalPrompt = prompt;
  if (memory?.owner_type && memory?.owner_id && payload._userId) {
    try {
      const admin = buildSupabaseAdminClient();
      let memoryEnabled = true;
      if (memory.owner_type === 'agent') {
        const { data: ownerAgent } = await admin
          .from('agents')
          .select('metadata')
          .eq('id', memory.owner_id)
          .eq('user_id', payload._userId)
          .maybeSingle();
        memoryEnabled = isAgentMemoryEnabled(ownerAgent?.metadata);
      }
      if (memoryEnabled) {
        const memResults = await searchAgentMemory(
          prompt,
          payload._userId,
          memory.owner_type,
          memory.owner_id,
          { limit: 3, threshold: 0.3 }
        );
        let graphCtx = '';
        if (memory.owner_type === 'agent') {
          try {
            graphCtx = await queryAgentGraph(memory.owner_id, prompt, admin, {
              userId: payload._userId,
            });
          } catch {
            /* graph optional */
          }
        }
        const memBlock = formatMemoryForPrompt(memResults, graphCtx);
        if (memBlock) {
          finalPrompt = `${prompt}\n\n${memBlock}`;
        }
      }
    } catch (e) {
      log.warn(req, 'memory.inject.failed', { error: e.message });
    }
  }

  const llmResult = await executeLlm({
    userId: payload._userId,
    prompt: finalPrompt,
    systemPrompt: finalSystemPrompt,
    provider,
    model,
    temperature,
    maxTokens,
    jsonMode,
    req,
  });

  return {
    type: 'run-llm',
    content: llmResult.content,
    parsed: jsonMode ? parseLlmJson(llmResult.content) : undefined,
    usage: llmResult.usage,
    model: llmResult.model,
    provider: llmResult.provider,
    durationMs: llmResult.durationMs,
    estimatedCostUsd: llmResult.estimatedCostUsd,
  };
}

/**
 * Build the system prompt for an agent, optionally enriching with platform rules.
 */
export async function buildAgentSystemPrompt(agentName, toolNames, agentContext) {
  const parts = [
    `You are ${agentName || 'an AI agent'} working within the Orqaly platform.`,
    'You are given a task to complete. Analyze it carefully and provide a thorough response.',
    'If the task requires structured output, respond with valid JSON.',
    'Always be specific, actionable, and concise.',
  ];

  if (toolNames?.length) {
    parts.push(
      `\nYou have access to tools: ${toolNames.join(', ')}.`,
      'Use tools when the task requires interacting with external services.',
      'If a tool call fails, explain what went wrong and suggest alternatives.'
    );
  }

  const defaultSystemPrompt = parts.join(' ');
  const hasAuthoritativeAgentPrompt = agentContext && Object.hasOwn(agentContext, 'system_prompt');
  if (hasAuthoritativeAgentPrompt) {
    const storedPrompt =
      typeof agentContext.system_prompt === 'string' ? agentContext.system_prompt.trim() : '';
    let systemPrompt = storedPrompt || defaultSystemPrompt;
    if (storedPrompt && toolNames?.length) {
      systemPrompt += `\n\nYou have access to tools: ${toolNames.join(', ')}. Use tools when the task requires interacting with external services. If a tool call fails, explain what went wrong and suggest alternatives.`;
    }
    // Inject active skills for this exact owned agent/blueprint snapshot.
    if (agentContext._agentId || agentContext._userId) {
      const admin = buildSupabaseAdminClient();
      const agentId = agentContext._agentId || agentName;
      systemPrompt += await loadActiveSkills(admin, agentId, agentContext._userId);
    }
    return systemPrompt;
  }

  let systemPrompt = defaultSystemPrompt;

  const fallbackOwnerId =
    typeof agentContext?._userId === 'string' ? agentContext._userId.trim() : '';
  if (agentName && fallbackOwnerId) {
    try {
      const admin = buildSupabaseAdminClient();
      // Check agents table for system_prompt (predefined agents)
      const { data: agentsRow } = await admin
        .from('agents')
        .select('metadata')
        .eq('name', agentName)
        .eq('user_id', fallbackOwnerId)
        .limit(1)
        .maybeSingle();
      if (agentsRow?.metadata?.system_prompt) {
        systemPrompt = agentsRow.metadata.system_prompt;
        if (toolNames?.length) {
          systemPrompt += `\n\nYou have access to tools: ${toolNames.join(', ')}. Use tools when the task requires interacting with external services. If a tool call fails, explain what went wrong and suggest alternatives.`;
        }
        return systemPrompt;
      }

      // Fallback: check concilium_agents for rules
      const { data: agentRow } = await admin
        .from('concilium_agents')
        .select('metadata')
        .eq('name', agentName)
        .eq('user_id', fallbackOwnerId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (agentRow?.metadata?.rules) {
        const rules = Object.entries(agentRow.metadata.rules)
          .map(([k, v]) => `- ${k.replaceAll('_', ' ')}: ${v}`)
          .join('\n');
        systemPrompt += `\n\nPlatform Operating Rules:\n${rules}`;
      }
    } catch {
      /* non-blocking — agent works without instructions */
    }
  }

  // Inject active skills (fallback path — when no agentContext.system_prompt)
  if (agentContext?._agentId || agentContext?._userId) {
    const admin2 = buildSupabaseAdminClient();
    const agentId = agentContext._agentId || agentName;
    systemPrompt += await loadActiveSkills(admin2, agentId, agentContext._userId);
  }

  return systemPrompt;
}

/**
 * Load tool records from Supabase by IDs.
 * Returns public records plus credentials resolved into memory from Vault.
 */
async function loadToolRecords(admin, toolIds, userId) {
  if (!toolIds?.length || !admin) return [];

  const { data, error } = await admin
    .from('tools')
    .select('*')
    .in('id', toolIds)
    .eq('user_id', userId);

  if (error) {
    log.warn(null, 'tools.load.failed', { error: error.message });
    return [];
  }

  const records = [];
  for (const row of data || []) {
    const publicData = stripPersistedCredentials(row.data || {});

    const def = PREDEFINED_TOOLS.find((candidate) => candidate.id === row.id);
    let credential = null;
    if (def) {
      const resolved = await resolveToolCredential({ def, userId });
      if (!resolved.ready) continue;
      credential = resolved.apiKey;
    } else if (!['internal', 'composio'].includes(row.connection_type)) {
      const resolved = await resolveUserKey({
        userId,
        provider: `tool:${row.id}`,
        slot: row.connection_type === 'webhook' ? 'webhook_secret' : 'default',
        reason: 'job-processor.tool',
      });
      if (!resolved.key) continue;
      credential = resolved.key;
    }

    records.push({
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: row.status || 'active',
      connectionType: row.connection_type || 'internal',
      ...publicData,
      apiKey: credential || undefined,
    });
  }
  return records;
}

async function handleAgentTask(payload, req) {
  const {
    task,
    context,
    agentName,
    provider,
    model,
    tools: toolIds,
    _userId,
    agentContext,
  } = payload;
  if (!task) throw new Error('Missing task in payload');

  const contextStr = typeof context === 'string' ? context : JSON.stringify(context, null, 2);
  const prompt = context ? `Task: ${task}\n\nContext:\n${contextStr}` : `Task: ${task}`;

  // If agent has tools, try the ReAct loop with tool-use
  if (toolIds?.length && _userId) {
    try {
      const admin = buildSupabaseAdminClient();
      const toolRecords = await loadToolRecords(admin, toolIds, _userId);
      // Only use tool runner if we actually have usable tools
      const usableTools = toolRecords.filter(
        (t) => t.connectionType === 'internal' || t.connectionType === 'composio' || t.apiKey
      );

      if (usableTools.length > 0) {
        const toolNames = usableTools.map((t) => t.name);
        const systemPrompt = await buildAgentSystemPrompt(agentName, toolNames, agentContext);

        const result = await runAgentWithTools({
          prompt,
          systemPrompt,
          provider,
          model,
          toolDefs: usableTools,
          toolRecords: usableTools,
          entityId: _userId,
          userId: _userId,
        });

        return {
          type: 'agent',
          agentName: agentName || 'default',
          content: result.content,
          parsed: parseLlmJson(result.content),
          toolLog: result.toolLog,
          usage: result.usage,
          model: result.model,
          provider: result.provider,
          durationMs: result.durationMs,
          estimatedCostUsd: result.estimatedCostUsd,
        };
      }
    } catch (err) {
      log.warn(req, 'agent.tool_runner.failed', { error: err.message, agentName });
      // Fall through to text-only mode
    }
  }

  // Text-only fallback (no tools or tools unavailable)
  const systemPrompt = await buildAgentSystemPrompt(agentName, undefined, agentContext);

  const llmResult = await executeLlm({
    userId: _userId,
    prompt,
    systemPrompt,
    provider,
    model,
    temperature: 0.3,
    maxTokens: 3000,
    req,
  });

  return {
    type: 'agent',
    agentName: agentName || 'default',
    content: llmResult.content,
    parsed: parseLlmJson(llmResult.content),
    usage: llmResult.usage,
    model: llmResult.model,
    provider: llmResult.provider,
    durationMs: llmResult.durationMs,
    estimatedCostUsd: llmResult.estimatedCostUsd,
  };
}

async function handleEvaluate(payload, req) {
  const { jobDescription, agentOutput, criteria, conciliumId, provider, model, _userId } = payload;
  if (!agentOutput) throw new Error('Missing agentOutput in payload');

  const systemPrompt =
    'You are a quality evaluator on the Consilium board. ' +
    'Evaluate agent output against the job requirements. ' +
    'Score each criterion 0-10 and provide specific feedback. Respond ONLY with valid JSON.';

  const criteriaList = criteria || ['quality', 'completeness', 'accuracy', 'actionability'];

  const prompt = [
    'Evaluate the following agent output:',
    '',
    `Job Description: ${jobDescription || 'Not specified'}`,
    '',
    'Agent Output:',
    typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput, null, 2),
    '',
    `Score on these criteria (0-10 each): ${criteriaList.join(', ')}`,
    '',
    'Respond with JSON:',
    '{ "scores": { "criteria_name": score }, "overall_score": average, "feedback": "suggestions", "approved": true_or_false, "summary": "verdict" }',
  ].join('\n');

  const llmResult = await executeLlm({
    userId: _userId,
    prompt,
    systemPrompt,
    provider,
    model,
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    req,
  });

  const evaluation = parseLlmJson(llmResult.content) || { raw: llmResult.content };

  return {
    type: 'evaluate',
    conciliumId,
    evaluation,
    usage: llmResult.usage,
    model: llmResult.model,
    provider: llmResult.provider,
    durationMs: llmResult.durationMs,
    estimatedCostUsd: llmResult.estimatedCostUsd,
  };
}

async function handleConciliumEvaluate(payload, req, runtimeAdmin = null) {
  const { conciliumId, jobId, jobDescription, agentOutput, criteria } = payload;
  if (!conciliumId) throw new Error('Missing conciliumId in payload');
  if (!agentOutput) throw new Error('Missing agentOutput in payload');

  const admin = runtimeAdmin || buildSupabaseAdminClient();
  const userId = typeof payload._userId === 'string' ? payload._userId.trim() : '';
  if (!userId) throw jobOwnerValidationError('concilium-evaluate requires a durable owner');

  // Authorize the board before rate-limit, security, member, model, usage, or
  // evaluation writes. The worker client bypasses RLS, so every service-role
  // lookup must carry the durable queue owner explicitly.
  const concilium = await loadOwnedConciliumBoard(admin, conciliumId, userId);

  const useV2 = await hasV2Members(admin, conciliumId, userId);
  if (useV2) {
    return handleConciliumEvaluateV2(payload, req, admin);
  }

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const rlResult = await checkConciliumRateLimit(admin, {
    entityType: 'board',
    entityId: conciliumId,
    userId,
    req,
  });
  if (!rlResult.allowed) {
    log.warn(req, 'concilium_eval.rate_limited', { conciliumId, reason: rlResult.reason });
    if (userId) {
      await checkConciliumRateLimit(admin, { entityType: 'user', entityId: userId, userId, req });
    }
    throw new Error(`Rate limit exceeded: ${rlResult.reason}`);
  }

  const inputContent = typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput);
  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const scanResult = await scanInput(admin, {
    content: inputContent,
    boardId: conciliumId,
    userId,
    req,
  });
  if (!scanResult.safe) {
    const threatTypes = scanResult.threats.map((t) => t.type).join(', ');
    log.warn(req, 'concilium_eval.security_blocked', { conciliumId, threats: threatTypes });
    throw new Error(`Security scan failed: ${threatTypes}`);
  }

  const purpose = concilium?.purpose || 'General quality evaluation';
  const conciliumName = concilium?.name || 'Consilium';
  const criteriaList = criteria || ['quality', 'completeness', 'accuracy', 'actionability'];

  const systemPrompt = [
    `You are the "${conciliumName}" evaluation board.`,
    `Your purpose: ${purpose}`,
    'Evaluate the agent output against the job requirements.',
    'Score each criterion 0-10 and provide specific, actionable feedback.',
    'Respond ONLY with valid JSON.',
  ].join(' ');

  const prompt = [
    'Evaluate the following agent output:',
    '',
    `Job Description: ${jobDescription || 'Not specified'}`,
    '',
    'Agent Output:',
    typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput, null, 2),
    '',
    `Score on these criteria (0-10 each): ${criteriaList.join(', ')}`,
    '',
    'Respond with JSON:',
    '{ "scores": { "criteria_name": score }, "overall_score": average, "feedback": "suggestions", "approved": true_or_false, "summary": "verdict" }',
  ].join('\n');

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const llmResult = await executeLlm({
    userId,
    prompt,
    systemPrompt,
    provider: payload.provider || defaultProvider(),
    model: payload.model || (payload.provider ? undefined : defaultModel()),
    temperature: 0.2,
    maxTokens: 1500,
    jsonMode: true,
    req,
  });

  const evaluation = parseLlmJson(llmResult.content) || { raw: llmResult.content };

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const { error: insertErr } = await admin.from('concilium_evaluations').insert({
    concilium_id: conciliumId,
    job_id: jobId || null,
    user_id: userId,
    scores: evaluation.scores || {},
    overall_score: evaluation.overall_score || 0,
    feedback: evaluation.feedback || '',
    approved: evaluation.approved || false,
    summary: evaluation.summary || '',
    model: llmResult.model,
    provider: llmResult.provider,
    usage: llmResult.usage,
    estimated_cost_usd: llmResult.estimatedCostUsd,
    duration_ms: llmResult.durationMs,
  });
  if (insertErr) {
    log.warn(req, 'concilium_eval.insert.failed', { error: insertErr.message });
  }

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  await recordUsage(admin, {
    entityType: 'board',
    entityId: conciliumId,
    tokensUsed: llmResult.usage?.total_tokens || 0,
    costUsd: llmResult.estimatedCostUsd || 0,
    req,
  });

  if (userId) {
    await loadOwnedConciliumBoard(admin, conciliumId, userId);
    await recordUsage(admin, {
      entityType: 'user',
      entityId: userId,
      tokensUsed: llmResult.usage?.total_tokens || 0,
      costUsd: llmResult.estimatedCostUsd || 0,
      req,
    });
  }

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  analyzeRequest(admin, {
    entityType: 'board',
    entityId: conciliumId,
    userId,
    boardId: conciliumId,
    requestCostUsd: llmResult.estimatedCostUsd || 0,
    requestFailed: !evaluation.approved,
    req,
  }).catch((err) => {
    log.warn(req, 'concilium_eval.fraud_analysis.error', { error: err.message });
  });

  return {
    type: 'concilium-evaluate',
    conciliumId,
    conciliumName,
    evaluation,
    usage: llmResult.usage,
    model: llmResult.model,
    provider: llmResult.provider,
    durationMs: llmResult.durationMs,
    estimatedCostUsd: llmResult.estimatedCostUsd,
  };
}

async function handleExecuteWorkflow(payload, req) {
  const admin = buildSupabaseAdminClient();
  return executeWorkflow(admin, payload, req);
}

async function loadActiveCouncilTeam(admin, teamId, userId, expectedLeaderId = null) {
  const { data: team, error } = await admin
    .from('agent_teams')
    .select('id, name, leader_id, is_active')
    .eq('id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw jobOwnerValidationError(`council-meeting team authority lookup failed: ${error.message}`);
  }
  if (!team || team.id !== teamId || team.is_active !== true) {
    throw jobOwnerValidationError('council-meeting team is missing, foreign, or inactive');
  }
  if (expectedLeaderId && team.leader_id !== expectedLeaderId) {
    throw jobOwnerValidationError('council-meeting team leader changed after admission');
  }
  return team;
}

async function handleCouncilMeeting(payload, req, runtimeAdmin = null) {
  const { team_id, user_id } = payload;
  if (!team_id || !user_id) throw new Error('Missing team_id or user_id');

  const admin = runtimeAdmin || buildSupabaseAdminClient();

  // 1. Fetch team + leader
  const team = await loadActiveCouncilTeam(admin, team_id, user_id);

  // 2. Fetch all team members with their agent details
  const { data: members, error: membersErr } = await admin
    .from('agent_team_members')
    .select('member_id, role')
    .eq('team_id', team_id)
    .eq('user_id', user_id);
  if (membersErr) throw membersErr;

  // 3. Fetch agent names/roles for member IDs
  const memberIds = (members || []).map((m) => m.member_id);
  const requiredAgentIds = [...new Set([...memberIds, team.leader_id].filter(Boolean))];
  let agentInfoMap = {};
  if (requiredAgentIds.length > 0) {
    const { data: agentRows } = await admin
      .from('agents')
      .select('id, name, metadata')
      .in('id', requiredAgentIds)
      .eq('user_id', user_id);
    const ownedAgentIds = new Set((agentRows || []).map((agent) => agent.id));
    for (const requiredAgentId of requiredAgentIds) {
      if (!ownedAgentIds.has(requiredAgentId)) {
        throw jobOwnerValidationError(
          `council-meeting agent ${requiredAgentId} is not owned by the durable owner`
        );
      }
    }
    for (const a of agentRows || []) {
      agentInfoMap[a.id] = { name: a.name, role: a.metadata?.role || a.name };
    }
  }

  // 4. Ask each non-leader member for their deal recommendation (parallel, cheap model)
  const nonLeaderMembers = (members || []).filter((m) => m.member_id !== team.leader_id);

  const memberResponses = await Promise.all(
    nonLeaderMembers.slice(0, 10).map(async (m) => {
      const agentInfo = agentInfoMap[m.member_id] || { name: 'Team Member', role: 'Advisor' };
      try {
        await loadActiveCouncilTeam(admin, team_id, user_id, team.leader_id);
        const result = await executeLlm({
          userId: user_id,
          prompt: `You are ${agentInfo.role} on team "${team.name}". The team is considering posting an investment deal today. In 2-3 sentences: what opportunity should you pursue, what is the main risk, and do you recommend proceeding? Be specific and concise.`,
          provider: defaultProvider(),
          model: defaultCheapModel(),
          temperature: 0.4,
          maxTokens: 150,
          req,
        });
        return { agent: agentInfo.name, role: agentInfo.role, opinion: result.content };
      } catch (error) {
        if (isJobOwnerValidationError(error)) throw error;
        return { agent: agentInfo.name, role: agentInfo.role, opinion: 'No response.' };
      }
    })
  );

  // 5. Team Lead synthesizes all opinions into a structured deal
  const leaderInfo = agentInfoMap[team.leader_id] || { name: 'Team Lead', role: 'Team Lead' };
  const opinionsText = memberResponses
    .map((r) => `- ${r.role} (${r.agent}): ${r.opinion}`)
    .join('\n');

  await loadActiveCouncilTeam(admin, team_id, user_id, team.leader_id);
  const synthesisResult = await executeLlm({
    userId: user_id,
    prompt: [
      `You are ${leaderInfo.role}, Team Lead of "${team.name}".`,
      `Your team discussed and provided these opinions:\n${opinionsText}`,
      '',
      'Based on this council discussion, draft a structured investment deal.',
      'Respond ONLY with valid JSON in this exact shape:',
      '{',
      '  "title": "Deal title (max 80 chars)",',
      '  "description": "2-3 sentence description of the opportunity",',
      '  "industry": "one of: Technology, Healthcare, Finance, Real Estate, Energy, Retail, Other",',
      '  "required_amount": 50000,',
      '  "roi_projections": { "expected": 25, "timeframe_months": 18 },',
      '  "revenue_share_terms": { "share_pct": 10 },',
      '  "risk_level": "one of: low, medium, high",',
      '  "strategy_plan": { "council_summary": "one sentence summary of team consensus" }',
      '}',
    ].join('\n'),
    provider: defaultProvider(),
    model: defaultCheapModel(),
    temperature: 0.3,
    maxTokens: 400,
    jsonMode: true,
    req,
  });

  const draft = parseLlmJson(synthesisResult.content);
  if (!draft?.title) throw new Error('Council failed to produce a valid deal draft');

  // Merge council_summary with member responses
  if (!draft.strategy_plan) draft.strategy_plan = {};
  draft.strategy_plan.council_responses = memberResponses;
  draft.strategy_plan.council_team = team.name;

  // 6. Create the deal as pending_review
  await loadActiveCouncilTeam(admin, team_id, user_id, team.leader_id);
  const { data: deal, error: dealErr } = await admin
    .from('investment_deals')
    .insert({
      user_id,
      title: draft.title,
      description: draft.description || '',
      industry: draft.industry || null,
      tags: [],
      required_amount: Number(draft.required_amount) || 10000,
      min_investment: 1,
      roi_projections: draft.roi_projections || {},
      revenue_share_terms: draft.revenue_share_terms || {},
      strategy_plan: draft.strategy_plan || {},
      risk_level: draft.risk_level || 'medium',
      status: 'pending_review',
      created_by_agent_id: team.leader_id || null,
    })
    .select('id, title, status')
    .single();
  if (dealErr) throw dealErr;

  // 7. Update team cooldown
  await loadActiveCouncilTeam(admin, team_id, user_id, team.leader_id);
  await admin
    .from('agent_teams')
    .update({ last_deal_posted_at: new Date().toISOString() })
    .eq('id', team_id)
    .eq('user_id', user_id);

  return {
    type: 'council-meeting',
    deal_id: deal.id,
    deal_title: deal.title,
    member_responses: memberResponses,
    council_team: team.name,
  };
}

// ── Job dispatcher ────────────────────────────────────────────────

const JOB_HANDLERS = {
  'run-llm': handleRunLlm,
  agent: handleAgentTask,
  evaluate: handleEvaluate,
  'concilium-evaluate': handleConciliumEvaluate,
  'execute-workflow': handleExecuteWorkflow,
  'council-meeting': handleCouncilMeeting,
  'orchestrate-goal': (payload, req) => {
    const admin = buildSupabaseAdminClient();
    return handleGoalOrchestration(admin, payload, req);
  },
  'library-calibration': (payload, req) => {
    const admin = buildSupabaseAdminClient();
    return handleLibraryCalibration(admin, payload, req);
  },
  'pulse-cycle': (payload, req) => {
    const admin = buildSupabaseAdminClient();
    return handlePulseCycle(admin, payload, req);
  },
  'prompt-refinement': (payload, req) => {
    const admin = buildSupabaseAdminClient();
    return handlePromptRefinement(admin, payload, req);
  },
  'axwise-outcome': (payload, req, admin, job) => handleAxwiseOutcomeJob(admin, payload, job, req),
  'axwise-ground': (payload, _req, admin, job) => handleAxwiseGroundJob(admin, payload, job),
  'communicator-process': (payload, req, _admin, job) =>
    handleCommunicatorProcess(payload, req, job.user_id),
  'loop-refine-parent-deliverables': async (payload, req, _admin, job) => {
    const admin = buildSupabaseAdminClient();
    const { handleLoopRefineParentDeliverables } =
      await import('../goal-handlers/loop-refine-parent.js');
    return handleLoopRefineParentDeliverables(admin, payload, req, job.user_id);
  },
};

export async function logLlmUsage(
  admin,
  jobId,
  result,
  {
    goalId = null,
    runtimeJobId = null,
    taskId = null,
    userId = null,
    source = 'agent-job',
    phaseIndex = null,
    agentName = null,
    agentId = null,
    agentTable = null,
    organizationId = null,
    teamId = null,
    consiliumId = null,
    operation = null,
  } = {}
) {
  if (!result?.usage && !result?.estimatedCostUsd && !result?.error) return;
  const { recordLlmUsage, extractTokenUsage } = await import('../goal-handlers/_helpers.js');
  const { promptTokens, completionTokens, totalTokens, cachedTokens } = extractTokenUsage(result);
  await recordLlmUsage(admin, {
    userId,
    goalId,
    jobId,
    runtimeJobId,
    taskId,
    agentName,
    agentId,
    agentTable,
    organizationId,
    teamId,
    consiliumId,
    provider: result.provider || 'unknown',
    model: result.model || 'unknown',
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    estimatedCostUsd: Number(result.estimatedCostUsd || 0),
    durationMs: Number(result.durationMs || 0),
    finishReason: result.finishReason || result.finish_reason || null,
    status: result.status === 'error' || result.error ? 'error' : 'ok',
    errorType: result.error ? result.errorType || 'llm_error' : null,
    source,
    operation: operation || source,
    description: source,
    phaseIndex,
    updateTask: false,
    updateGoalRollup: Boolean(goalId),
  });
}

export async function executeJob(admin, job, req) {
  const authorization = await authorizeQueuedJob(admin, job);
  const authority = authorization.authority;
  const payload = authority.payload || authorization.canonicalJob.payload;
  const canonicalJob = { ...authorization.canonicalJob, payload };
  rememberJobAuthority(job, canonicalJob, authority);
  const type = payload.type || 'unknown';

  if (type === 'execute-task') {
    return {
      result: await handleExecuteTask(admin, payload, req, {
        userId: authority.userId,
        queueJobId: authority.queueJobId,
      }),
      error: null,
      authority,
    };
  }

  const jobHandler = JOB_HANDLERS[type];
  if (jobHandler) {
    return {
      result: await jobHandler(payload, req, admin, canonicalJob),
      error: null,
      authority,
    };
  }

  throw new Error(
    `Unknown job type: ${type}. Supported: ${[...Object.keys(JOB_HANDLERS), 'execute-task'].join(', ')}`
  );
}

// ── Claim next queued job ─────────────────────────────────────────

export async function claimNextJob(admin) {
  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (workerScope === 'preview' && !deploymentIdentity) {
    log.warn(null, 'claim.preview-deployment-identity-missing', { scope: workerScope });
    return null;
  }
  // Scan up to 20 oldest queued jobs to find one we can actually run.
  // Skipping happens when the job belongs to a local_only goal and we're
  // on Vercel — compare-mode goals (pinned to claude-code via Agent SDK)
  // must only run on the developer's machine where ~/.claude/ tokens
  // exist. Without this filter, Vercel's cron picks up the job first
  // and the claude-code guard throws "localhost-only" → goal fails at
  // feasibility-analysis. Shared Supabase DB means both processors see
  // the same queue; only this check differentiates them.
  let candidateQuery = admin
    .from('agent_jobs')
    .select(JOB_SNAPSHOT_SELECT)
    .eq('status', 'queued')
    .eq('worker_scope', workerScope);
  if (deploymentIdentity) {
    candidateQuery = candidateQuery.eq(
      `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
      deploymentIdentity
    );
  }
  const { data: candidates, error: fetchErr } = await candidateQuery
    .order('created_at', { ascending: true })
    .limit(20);

  // A transient read failure is not a reason to 500 the worker. The poll runs
  // every 15s; returning null retries on the next one, while throwing surfaces
  // as a 500 that makes a healthy queue look broken.
  if (fetchErr) {
    log.warn(null, 'claim.fetch_failed', { scope: workerScope, error: fetchErr.message });
    return null;
  }
  if (!candidates || candidates.length === 0) return null;

  const isVercel = !!process.env.VERCEL;
  // Cache lookups so we don't hammer DB when many candidates share a goal.
  const goalLocalOnly = new Map(); // owner:goalId -> true/false
  const taskToGoal = new Map(); // owner:taskId -> goalId

  // Resolve a job's goalId from its payload OR by looking up the task it
  // references. orchestrate-goal jobs carry payload.goalId directly;
  // execute-task jobs carry payload.taskId but not goalId, so we join
  // through team_tasks.data.goal_id. Critical for the local_only filter
  // below — without this, Vercel's cron would still grab execute-task
  // jobs of compare-mode (Opus/GLM/Qwen) goals and throw "localhost-only".
  const resolveGoalId = async (job) => {
    const payload = job?.payload;
    const userId = typeof job?.user_id === 'string' ? job.user_id.trim() : '';
    if (!userId) return null;
    if (payload?.type !== 'execute-task' && payload?.goalId) return payload.goalId;
    const taskId = payload?.taskId;
    const workJobId = payload?.jobId;
    if (!taskId || !workJobId) return null;
    const taskKey = `${userId}:${taskId}:${workJobId}:${payload?.goalId || ''}`;
    if (taskToGoal.has(taskKey)) return taskToGoal.get(taskKey);
    const { data: task } = await admin
      .from('team_tasks')
      .select('job_pool_id, goal_id, data')
      .eq('id', taskId)
      .eq('user_id', userId)
      .maybeSingle();
    const columnGoalId = task?.goal_id || null;
    const dataGoalId = task?.data?.goal_id || null;
    let gid =
      columnGoalId &&
      dataGoalId &&
      columnGoalId === dataGoalId &&
      task?.job_pool_id === workJobId &&
      (!payload?.goalId || payload.goalId === columnGoalId)
        ? columnGoalId
        : null;
    if (gid) {
      const { data: workJob } = await admin
        .from('jobs')
        .select('goal_id')
        .eq('id', workJobId)
        .eq('user_id', userId)
        .maybeSingle();
      if (workJob?.goal_id !== gid) gid = null;
    }
    taskToGoal.set(taskKey, gid);
    return gid;
  };

  for (const job of candidates) {
    // Browser automation has its own worker, audit row and irreversible-action
    // fencing. The central scanner must leave these rows queued for that
    // executor instead of claiming a type it cannot dispatch.
    if (job?.payload?.type === 'browser-task') continue;

    if (isVercel) {
      const goalId = await resolveGoalId(job);
      if (goalId) {
        const goalKey = `${job.user_id}:${goalId}`;
        let localOnly = goalLocalOnly.get(goalKey);
        if (localOnly === undefined) {
          const { data: g } = await admin
            .from('goals')
            .select('data')
            .eq('id', goalId)
            .eq('user_id', job.user_id)
            .maybeSingle();
          localOnly = g?.data?.local_only === true;
          goalLocalOnly.set(goalKey, localOnly);
        }
        if (localOnly) continue; // leave for localhost worker
      }
    }

    const claimedAtMs = Date.now();
    const claimPatch = {
      status: 'running',
      error: null,
      updated_at: new Date(claimedAtMs).toISOString(),
      ...createJobLeaseClaim(claimedAtMs),
    };
    const claimOutcome = await exactJobTransition(admin, job, claimPatch);
    const claimed = claimOutcome.state === 'committed' ? claimOutcome.job : null;
    const claimErr = claimOutcome.error || claimOutcome.writeError || null;

    // A failed claim means this row is not ours to take: another worker won
    // the race, or migration 199's scope guard rejected it. Neither is fatal —
    // keep scanning the rest of the batch instead of failing the whole poll.
    if (claimErr) {
      log.warn(null, 'claim.rejected', {
        scope: workerScope,
        jobId: job.id,
        error: claimErr.message,
      });
      continue;
    }
    if (claimed) return claimed;
    // Otherwise another worker claimed it — keep scanning.
  }
  return null;
}

// ── Claim a specific job by ID ────────────────────────────────────

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function normalizedJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
  return isDeepStrictEqual(normalizedJson(left), normalizedJson(right));
}

function sameTimestamp(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function sameJobIdentity(current, expected) {
  if (!current || current.id !== expected?.id) return false;
  if (hasOwn(expected, 'user_id') && (current.user_id ?? null) !== (expected.user_id ?? null)) {
    return false;
  }
  if (hasOwn(expected, 'worker_scope') && current.worker_scope !== expected.worker_scope) {
    return false;
  }
  if (hasOwn(expected, 'payload') && !sameJson(current.payload, expected.payload)) return false;
  const expectedDeployment = expected?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY];
  if (
    expectedDeployment &&
    current?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY] !== expectedDeployment
  ) {
    return false;
  }
  return true;
}

function sameJobState(current, expected) {
  if (!sameJobIdentity(current, expected)) return false;
  if (hasOwn(expected, 'status') && current.status !== expected.status) return false;
  if (
    hasOwn(expected, 'retry_count') &&
    Number(current.retry_count || 0) !== Number(expected.retry_count || 0)
  ) {
    return false;
  }
  if (
    hasOwn(expected, 'max_retries') &&
    (current.max_retries ?? null) !== (expected.max_retries ?? null)
  ) {
    return false;
  }
  if (hasOwn(expected, 'updated_at') && !sameTimestamp(current.updated_at, expected.updated_at)) {
    return false;
  }
  if (hasOwn(expected, 'error') && (current.error ?? null) !== (expected.error ?? null)) {
    return false;
  }
  if (hasOwn(expected, 'result') && !sameJson(current.result, expected.result)) return false;
  if (
    hasOwn(expected, 'lease_token') &&
    (current.lease_token ?? null) !== (expected.lease_token ?? null)
  ) {
    return false;
  }
  return true;
}

function applyNullableFilter(query, column, value, { json = false } = {}) {
  if (value === null || value === undefined) return query.is(column, null);
  return query.eq(column, json ? JSON.stringify(normalizedJson(value)) : value);
}

function applyExactJobSnapshot(query, snapshot, { includeLeaseExpiry = false } = {}) {
  let exact = query.eq('id', snapshot.id);
  if (hasOwn(snapshot, 'user_id')) {
    exact = applyNullableFilter(exact, 'user_id', snapshot.user_id);
  }
  if (hasOwn(snapshot, 'status')) exact = exact.eq('status', snapshot.status);
  if (hasOwn(snapshot, 'worker_scope')) exact = exact.eq('worker_scope', snapshot.worker_scope);
  const deploymentIdentity = snapshot?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY];
  if (deploymentIdentity) {
    exact = exact.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  }
  if (hasOwn(snapshot, 'payload')) {
    exact = exact.eq('payload', JSON.stringify(normalizedJson(snapshot.payload)));
  }
  if (hasOwn(snapshot, 'retry_count')) exact = exact.eq('retry_count', snapshot.retry_count);
  if (hasOwn(snapshot, 'max_retries')) {
    exact = applyNullableFilter(exact, 'max_retries', snapshot.max_retries);
  }
  if (hasOwn(snapshot, 'updated_at')) exact = exact.eq('updated_at', snapshot.updated_at);
  if (hasOwn(snapshot, 'error')) exact = applyNullableFilter(exact, 'error', snapshot.error);
  if (hasOwn(snapshot, 'result')) {
    exact = applyNullableFilter(exact, 'result', snapshot.result, { json: true });
  }
  if (hasOwn(snapshot, 'lease_token')) {
    exact = applyNullableFilter(exact, 'lease_token', snapshot.lease_token);
  }
  if (includeLeaseExpiry && hasOwn(snapshot, 'lease_expires_at')) {
    exact = applyNullableFilter(exact, 'lease_expires_at', snapshot.lease_expires_at);
  }
  return exact;
}

async function inspectExactJobTransition(
  admin,
  original,
  patch,
  { includeLeaseExpiry = false } = {}
) {
  try {
    const { data: current, error } = await admin
      .from('agent_jobs')
      .select(JOB_SNAPSHOT_SELECT)
      .eq('id', original.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'absent' };
    if (sameJobState(current, { ...original, ...patch })) {
      return { state: 'committed', job: current };
    }
    if (
      sameJobState(current, original) &&
      (!includeLeaseExpiry ||
        (current.lease_expires_at ?? null) === (original.lease_expires_at ?? null))
    ) {
      return { state: 'original', job: current };
    }
    return { state: 'conflict', job: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function exactJobTransition(admin, original, patch, { includeLeaseExpiry = false } = {}) {
  const durablePatch =
    patch?.status && patch.status !== 'running' ? { ...patch, ...clearJobLease() } : patch;
  let lastWriteError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = null;
    try {
      const transition = applyExactJobSnapshot(
        admin.from('agent_jobs').update(durablePatch),
        original,
        {
          includeLeaseExpiry,
        }
      );
      response = await transition.select(JOB_SNAPSHOT_SELECT).maybeSingle();
    } catch (error) {
      lastWriteError = error;
    }

    if (!lastWriteError && !response?.error && response?.data) {
      return sameJobState(response.data, { ...original, ...durablePatch })
        ? { state: 'committed', job: response.data }
        : { state: 'conflict', job: response.data };
    }
    if (response?.error) lastWriteError = response.error;

    const inspection = await inspectExactJobTransition(admin, original, durablePatch, {
      includeLeaseExpiry,
    });
    if (inspection.state === 'committed') return inspection;
    if (inspection.state !== 'original' || attempt === 1) {
      return { ...inspection, writeError: lastWriteError };
    }
    lastWriteError = null;
  }
  return { state: 'unknown', writeError: lastWriteError };
}

function claimReconciliationError(jobId, outcome) {
  const error = new Error(
    `Exact claim outcome could not be verified for job ${jobId} (${outcome.state})`
  );
  error.code = JOB_CLAIM_RECONCILIATION_REQUIRED;
  error.jobId = jobId;
  error.cause = outcome.error || outcome.writeError || null;
  return error;
}

export async function claimSpecificJob(admin, jobId, expectedGoalId = null, allowedTypes = null) {
  if (!jobId) return null;
  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (workerScope === 'preview' && !deploymentIdentity) {
    log.warn(null, 'claim.preview-deployment-identity-missing', { scope: workerScope, jobId });
    return null;
  }
  const exactGoalId =
    typeof expectedGoalId === 'string' && expectedGoalId.trim() ? expectedGoalId.trim() : null;

  let candidateQuery = admin
    .from('agent_jobs')
    .select(JOB_SNAPSHOT_SELECT)
    .eq('id', jobId)
    .eq('status', 'queued')
    .eq('worker_scope', workerScope);
  if (deploymentIdentity) {
    candidateQuery = candidateQuery.eq(
      `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
      deploymentIdentity
    );
  }
  if (exactGoalId) candidateQuery = candidateQuery.eq('payload->>goalId', exactGoalId);
  if (Array.isArray(allowedTypes) && allowedTypes.length > 0) {
    candidateQuery = candidateQuery.in('payload->>type', allowedTypes);
  }

  const { data: candidate, error: candidateError } = await candidateQuery.maybeSingle();
  if (candidateError) throw new Error(candidateError.message || 'Claim lookup failed');
  if (!candidate) return null;
  // The ops browser worker owns browser-task claims and irreversible-action
  // fencing. Exact wakes must not route that row through the central worker.
  if (candidate.payload?.type === 'browser-task') return null;
  if (!sameJobIdentity(candidate, { ...candidate, id: jobId, worker_scope: workerScope })) {
    return null;
  }
  if (!candidate.updated_at) throw claimReconciliationError(jobId, { state: 'incomplete' });

  const claimedAtMs = Date.now();
  const claimPatch = {
    status: 'running',
    error: null,
    updated_at: new Date(claimedAtMs).toISOString(),
    ...createJobLeaseClaim(claimedAtMs),
  };
  const outcome = await exactJobTransition(admin, candidate, claimPatch);
  if (outcome.state === 'committed') return outcome.job;
  if (['absent', 'conflict', 'original'].includes(outcome.state)) return null;

  throw claimReconciliationError(jobId, outcome);
}

// ── Agent memory write-back ───────────────────────────────────────

const SKIP_MEMORY_TYPES = new Set(['evaluate', 'concilium-evaluate']);

async function saveAgentMemory(admin, job, result, authority) {
  const payload = authority?.payload || {};
  const jobType = payload.type || 'unknown';

  // Skip meta-jobs and jobs without an agent identity
  if (SKIP_MEMORY_TYPES.has(jobType)) return;
  const hasDeclaredAgent = Boolean(
    payload.agentId || payload.agent_id || payload.assignedAgentId || payload.assigned_agent_id
  );
  const agentId = hasDeclaredAgent ? authority?.agentId || null : null;
  const ownedAgent =
    authority?.agentTable === 'agents'
      ? (authority?.resources?.agents || []).find((agent) => agent.id === agentId) || null
      : null;
  const memoryOwnerId = ownedAgent ? agentMemoryOwnerId(ownedAgent) : agentId;
  const userId = authority?.userId || null;
  if (!agentId || !memoryOwnerId || !userId) return;

  try {
    const agentName = payload.agentName || 'Agent';
    const task = payload.task || payload.prompt || payload.jobDescription || '';
    const output = result?.content || JSON.stringify(result).slice(0, 500);

    const summary = [
      `## Job Summary`,
      `- **Agent:** ${agentName}`,
      `- **Type:** ${jobType}`,
      `- **Task:** ${task.slice(0, 200)}`,
      `- **Model:** ${result?.model || 'unknown'} (${result?.provider || 'unknown'})`,
      `- **Cost:** $${(result?.estimatedCostUsd || 0).toFixed(4)}`,
      `- **Duration:** ${result?.durationMs || 0}ms`,
      '',
      `### Output`,
      output.slice(0, 500),
    ].join('\n');

    const embedding = await generateEmbedding(summary);
    const tokenCount = estimateTokens(summary);

    // Stamp the org/consilium this agent worked under, so the memory shows up
    // under that organization. orchestrate-goal jobs carry goalId; execute-task
    // jobs carry only taskId, so fall back to the task's goal_id.
    const goalId = authority?.goalId || null;
    let kbScope = await resolveGoalKbScope(admin, goalId, userId);
    if (!kbScope.organization_id) {
      // Non-goal job: fall back to the agent's static org assignment.
      const agentScope = await resolveAgentKbScope(admin, agentId, userId);
      if (agentScope.organization_id) kbScope = agentScope;
    }

    await admin.from('knowledge_documents').insert({
      user_id: userId,
      owner_type: 'agent',
      owner_id: memoryOwnerId,
      content_type: 'note',
      category: 'job-memory',
      title: `Job: ${(task || 'Untitled task').slice(0, 80)}`,
      content: summary,
      tags: ['auto-memory', jobType],
      embedding: `[${embedding.join(',')}]`,
      token_count: tokenCount,
      is_pinned: false,
      refs: [],
      ...kbScope,
    });

    log.info(null, 'agent.memory.saved', { agentId, jobId: job.id });
  } catch (err) {
    // Non-critical — don't fail the job if memory write fails
    log.warn(null, 'agent.memory.failed', { error: err.message, jobId: job.id });
  }
}

// ── Job event notifications ──────────────────────────────────────

async function notifyJobEvent(admin, job, status, result, authority) {
  const payload = authority?.payload || {};
  const userId = authority?.userId;
  if (!userId) return;

  try {
    const agentName = payload.agentName || 'Agent';
    const task = (payload.task || payload.prompt || payload.jobDescription || '').slice(0, 120);

    const isDone = status === 'done';
    const title = isDone ? `Job completed: ${agentName}` : `Job failed: ${agentName}`;
    const description = task || (isDone ? 'Task finished successfully' : 'Task execution failed');

    await admin.from('notification_log').insert({
      user_id: userId,
      channel: 'in_app',
      event_type: isDone ? 'job_completed' : 'job_failed',
      subject: title,
      body: description,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        job_id: authority.queueJobId,
        agent_name: agentName,
        cost: result?.estimatedCostUsd || 0,
        priority: isDone ? 'low' : 'high',
      },
    });
  } catch (err) {
    // Non-critical
    log.warn(null, 'notification.failed', {
      error: err.message,
      jobId: authority?.queueJobId || job.id,
    });
  }
}

// ── Finalize job ──────────────────────────────────────────────────

function jobLeaseTransitionError(message) {
  const error = new Error(message);
  error.code = JOB_LEASE_TRANSITION_ERROR;
  return error;
}

async function transitionRunningJob(admin, job, patch, operation) {
  if (!hasCompleteJobLease({ ...job, status: 'running' })) {
    throw jobLeaseTransitionError(incompleteJobLeaseError(job?.id || 'unknown').message);
  }
  const outcome = await exactJobTransition(admin, { ...job, status: 'running' }, patch);
  if (outcome.state === 'committed') return outcome.job;

  const transitionError = outcome.writeError || outcome.error || null;
  if (transitionError) {
    throw jobLeaseTransitionError(
      `Failed to ${operation} job ${job.id}: ${transitionError.message || String(transitionError)}`
    );
  }
  const gerund =
    operation === 'finalize' ? 'finalizing' : operation === 'retry' ? 'retrying' : operation;
  throw jobLeaseTransitionError(`Lost running lease while ${gerund} job ${job.id}`);
}

async function resolveFinalizationAuthority(admin, job, override = null) {
  const remembered = job && typeof job === 'object' ? JOB_AUTHORITY_SNAPSHOTS.get(job) : null;
  if (override) {
    if (remembered === override) return override;
    throw jobOwnerValidationError(
      'finalization authority override is not the remembered validated snapshot'
    );
  }
  if (remembered) return remembered;
  const authorization = await authorizeQueuedJob(admin, job);
  rememberJobAuthority(job, authorization.canonicalJob, authorization.authority);
  return authorization.authority;
}

const FINALIZER_TERMINAL_GOAL_STATUSES = new Set([
  'completed',
  'completed_with_warnings',
  'cancelled',
]);

async function markOrchestratedGoalFailure(admin, authority, payload, failure) {
  const goalId = authority.goalId;
  const userId = authority.userId;
  const goalSnapshot = authority.resources?.goals?.find((goal) => goal.id === goalId) || null;
  if (!goalSnapshot || goalSnapshot.user_id !== userId) {
    throw jobOwnerValidationError('finalizer goal authority snapshot is missing or ownerless');
  }
  if (FINALIZER_TERMINAL_GOAL_STATUSES.has(goalSnapshot.status)) return false;
  if (!goalSnapshot.status || !goalSnapshot.updated_at) {
    throw jobOwnerValidationError('finalizer goal authority snapshot is incomplete');
  }
  const reason =
    failure instanceof Error
      ? failure.message || 'Unknown error'
      : typeof failure === 'string'
        ? failure
        : failure?.message || 'Unknown error';
  const stack =
    failure instanceof Error && failure.stack ? String(failure.stack).slice(0, 2000) : null;
  const failureStage = payload.action || null;
  const failurePhaseIndex =
    Number.isInteger(payload.phaseIndex) && payload.phaseIndex >= 0
      ? payload.phaseIndex
      : Number.isInteger(payload.phase_index) && payload.phase_index >= 0
        ? payload.phase_index
        : null;
  const actionable = classifyActionableJobError(reason);
  const userReason = actionable?.message || reason;

  const failedAt = new Date().toISOString();
  const mergedData = {
    ...(goalSnapshot.data || {}),
    failure_reason: userReason,
    failure_stage: failureStage,
    failure_phase_index: failurePhaseIndex,
    failure_at: failedAt,
    failure_stack: stack,
    ...(actionable
      ? {
          failure_code: actionable.code,
          recovery_action: actionable.action,
        }
      : {}),
  };
  let update = admin
    .from('goals')
    .update({
      status: actionable?.goalStatus || 'failed',
      data: mergedData,
      updated_at: failedAt,
    })
    .eq('id', goalId)
    .eq('user_id', userId)
    .eq('status', goalSnapshot.status)
    .eq('updated_at', goalSnapshot.updated_at);
  update =
    goalSnapshot.data === null || goalSnapshot.data === undefined
      ? update.is('data', null)
      : update.eq('data', JSON.stringify(normalizedJson(goalSnapshot.data)));
  const { data: committed, error: updateError } = await update.select('id').maybeSingle();
  if (updateError) throw updateError;
  if (!committed?.id) {
    log.warn(null, 'goal.fail-update.conflict', { goalId, userId });
    return false;
  }

  const { error: logError } = await admin.from('goal_log').insert({
    goal_id: goalId,
    event_type: actionable?.eventType || 'goal_failed',
    details: {
      reason: userReason,
      action: failureStage,
      phase_index: failurePhaseIndex,
      stack,
      ...(actionable
        ? {
            classification: actionable.code,
            recovery_action: actionable.action,
          }
        : {}),
    },
  });
  if (logError) {
    log.warn(null, 'goal.fail-log.error', { goalId, error: logError.message });
  }
  return true;
}

export async function finalizeJob(admin, job, result, error, authorityOverride = null) {
  let authority = null;
  let authorityError = null;
  try {
    authority = await resolveFinalizationAuthority(admin, job, authorityOverride);
  } catch (authorizationError) {
    authorityError = isJobOwnerValidationError(authorizationError)
      ? authorizationError
      : jobOwnerValidationError(
          `finalization authority could not be established: ${authorizationError.message}`
        );
  }
  const effectiveError = error || authorityError;
  const finalStatus = effectiveError ? 'failed' : 'done';
  const persistedError = effectiveError
    ? effectiveError instanceof Error
      ? effectiveError.message || String(effectiveError)
      : typeof effectiveError === 'string'
        ? effectiveError
        : effectiveError?.message || String(effectiveError)
    : null;

  const leaseSnapshot = JOB_LEASE_SNAPSHOTS.get(job) || job;
  const terminalJob = await transitionRunningJob(
    admin,
    leaseSnapshot,
    {
      status: finalStatus,
      result: effectiveError ? null : result,
      error: persistedError,
      updated_at: new Date().toISOString(),
    },
    'finalize'
  );

  // Invalid/mismatched legacy owners are terminal security failures. Persist
  // the failed queue state, but do not fan out notifications, logs, usage,
  // goal changes, memory writes, or any other attacker-selected side effect.
  if (isJobOwnerValidationError(persistedError) || !authority) return finalStatus;

  return withVerifiedJobFinalizationReceipt(
    { claimedJob: { ...leaseSnapshot, status: 'running' }, terminalJob },
    async () => {
      admin = guardSupabaseClientForCurrentJobLease(admin);

      if (result && !effectiveError) {
        const payload = authority.payload;
        // Handlers that already record their own per-call usage (e.g. execute-task,
        // consilium evaluation) flag the result with usageRecorded so we don't
        // double-count by also recording the aggregate here.
        if (!result.usageRecorded) {
          await logLlmUsage(admin, authority.queueJobId, result, {
            goalId: authority.goalId,
            runtimeJobId: authority.workJobId,
            taskId: authority.taskId,
            userId: authority.userId,
            source: payload.type || payload.action || 'agent-job',
            phaseIndex: payload.phaseIndex ?? payload.phase_index ?? null,
            agentName: payload.agentName || payload.assigned_to || result.agentName || null,
            agentId: authority.agentId,
            agentTable: authority.agentTable,
            organizationId: authority.organizationId,
            teamId: authority.teamId,
            consiliumId: authority.conciliumId,
            operation: payload.operation || null,
          });
        }
        await saveAgentMemory(admin, job, result, authority);
      }

      // When an orchestrate-goal job fails permanently, mark the goal as failed
      // and write the REAL error reason into goals.data so the UI and the
      // self-healer can read it. Previously this wrote the literal string
      // "Job processing failed" whenever error wasn't a string, losing the
      // real Error.message — which made every failed goal undiagnosable.
      const payload = authority.payload;
      if (effectiveError && authority.type === 'orchestrate-goal' && authority.goalId) {
        try {
          await markOrchestratedGoalFailure(admin, authority, payload, effectiveError);
        } catch (goalErr) {
          log.warn(null, 'goal.fail-update.error', {
            goalId: authority.goalId,
            error: goalErr.message,
          });
        }
      }

      // AxWise feedback delivery has its own lifecycle. Exhausting the retry
      // budget records a terminal delivery failure but deliberately leaves the
      // already-completed Orqaly goal untouched.
      if (effectiveError && authority.type === 'axwise-outcome' && authority.goalId) {
        try {
          await markAxwiseOutcomeFinalFailure(
            admin,
            payload,
            effectiveError,
            job,
            authority.userId
          );
        } catch (outcomeError) {
          log.warn(null, 'goal.axwise-outcome.final-failure-update.error', {
            goalId: authority.goalId,
            error: outcomeError.message,
          });
        }
      }

      await notifyJobEvent(admin, job, finalStatus, result, authority);

      // Write to communication_logs — fire-and-forget, never blocks finalize
      const _agentName = payload.agentName || 'Agent';
      const _task = (payload.task || payload.prompt || payload.jobDescription || '').slice(0, 200);
      const _jobType = authority.type || '';
      const _ctxType = _jobType.includes('concilium') ? 'consilium' : 'build';
      const _ctxId =
        authority.conciliumId || authority.goalId || authority.workflowId || authority.queueJobId;
      let _errorMsg = '';
      if (effectiveError) {
        _errorMsg =
          typeof effectiveError === 'string'
            ? effectiveError
            : effectiveError?.message || 'Unknown error';
      }
      let _content = '';
      if (effectiveError) {
        _content = _task ? `Job failed: ${_errorMsg} — ${_task}` : `Job failed: ${_errorMsg}`;
      } else {
        _content = _task ? `Job completed: ${_task}` : 'Job completed';
      }
      const _senderType = effectiveError ? 'system' : 'agent';
      await commLog({
        user_id: authority.userId,
        thread_id: authority.queueJobId,
        sender_type: _senderType,
        sender_name: _agentName,
        content: _content,
        context_type: _ctxType,
        context_id: _ctxId,
        context_label: _task || _agentName,
        platform: 'internal',
        metadata: {
          job_id: authority.queueJobId,
          job_type: _jobType,
          status: finalStatus,
          cost_usd: result?.estimatedCostUsd || 0,
          model: result?.model,
          tokens: result?.usage,
          agent_name: _agentName,
        },
      });

      return finalStatus;
    }
  );
}

// ── Retry logic ───────────────────────────────────────────────────

export async function handleRetry(admin, job, errorMsg) {
  // Missing credentials and other BYOK configuration errors are not transient.
  // Replaying the same LLM request three times only delays the one useful next
  // step: showing the API Keys screen to the owner.
  if (
    classifyActionableJobError(errorMsg) ||
    isJobOwnerValidationError(errorMsg) ||
    /Durable execution lease was lost|timed out after \d+ms/i.test(String(errorMsg || ''))
  ) {
    return false;
  }
  const leaseSnapshot = JOB_LEASE_SNAPSHOTS.get(job) || job;
  const retryCount = (leaseSnapshot.retry_count || 0) + 1;
  const configuredMaxRetries = Number(leaseSnapshot.max_retries);
  const maxRetries =
    leaseSnapshot.max_retries !== null &&
    leaseSnapshot.max_retries !== undefined &&
    Number.isFinite(configuredMaxRetries)
      ? Math.max(0, configuredMaxRetries)
      : MAX_RETRIES;
  if (retryCount >= maxRetries) return false;

  try {
    await transitionRunningJob(
      admin,
      leaseSnapshot,
      {
        status: 'queued',
        retry_count: retryCount,
        result: null,
        error: `Attempt ${retryCount}: ${errorMsg}`,
        updated_at: new Date().toISOString(),
      },
      'retry'
    );
    return true;
  } catch (retryError) {
    log.warn(null, 'job.retry.failed', { jobId: job.id, error: retryError.message });
    return false;
  }
}

// ── Chain processing for goal pipeline ────────────────────────────

const CHAINABLE_GOAL_JOB_TYPES = new Set(['orchestrate-goal', 'execute-task']);

function mergeCapturedJobIds(target, capture) {
  for (const jobId of capture.jobIds) target.add(jobId);
}

async function executeWithTriggerCapture(jobIds, callback) {
  const capture = createProcessNextTriggerCapture();
  try {
    return await withProcessNextTriggerCapture(capture, callback);
  } finally {
    mergeCapturedJobIds(jobIds, capture);
  }
}

async function claimNextCapturedJob(admin, jobIds, expectedGoalId, restoreJobIds, req) {
  while (jobIds?.size > 0) {
    const [jobId] = jobIds;
    jobIds.delete(jobId);
    try {
      const claimed = await claimSpecificJob(admin, jobId, expectedGoalId, [
        ...CHAINABLE_GOAL_JOB_TYPES,
      ]);
      if (claimed) return claimed;
    } catch (error) {
      log.warn(req, 'job.chain.claim-failed', { jobId, error: error.message });
    }
    restoreJobIds.add(jobId);
  }
  return null;
}

const CAPTURED_WAKE_FAILURE_CODE = 'preview_captured_job_wake_failed';
const TERMINAL_GOAL_STATUSES = new Set(['completed', 'completed_with_warnings', 'cancelled']);

async function inspectCapturedWakeGoalPark(admin, goal, parkedAt, marker) {
  try {
    if (!goal?.user_id) return { state: 'invalid-owner' };
    const query = admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', goal.user_id);
    const { data: current, error } = await query.maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!current) return { state: 'absent' };
    if (
      current.status === 'needs_human' &&
      sameTimestamp(current.updated_at, parkedAt) &&
      sameJson(current.data?.agent_job_reconciliation, marker)
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === goal.status &&
      sameTimestamp(current.updated_at, goal.updated_at) &&
      sameJson(current.data, goal.data)
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function parkGoalForCapturedWakeFailure(admin, job, reason, req) {
  let authority = JOB_AUTHORITY_SNAPSHOTS.get(job) || null;
  if (!authority) {
    try {
      const authorization = await authorizeQueuedJob(admin, job);
      authority = authorization.authority;
      rememberJobAuthority(job, authorization.canonicalJob, authority);
    } catch (error) {
      log.warn(req, 'job.chain.restore-goal-authority-rejected', {
        jobId: job?.id || null,
        error: error.message,
      });
      return false;
    }
  }
  const goalId = authority.goalId;
  const userId = authority.userId;
  if (!goalId || !userId) return false;

  try {
    const goalQuery = admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goalId)
      .eq('user_id', userId);
    const { data: goal, error: goalError } = await goalQuery.maybeSingle();
    if (goalError || !goal || TERMINAL_GOAL_STATUSES.has(goal.status)) return false;
    if (!goal.updated_at) {
      log.warn(req, 'job.chain.restore-goal-snapshot-incomplete', { goalId, jobId: job.id });
      return false;
    }

    const parkedAt = new Date().toISOString();
    const marker = {
      status: 'wake_failed',
      code: CAPTURED_WAKE_FAILURE_CODE,
      job_id: job.id,
      at: parkedAt,
      reconciliation_required: true,
      reason: String(reason || 'Exact Preview worker wake failed').slice(0, 500),
    };
    const parkedData = { ...(goal.data || {}), agent_job_reconciliation: marker };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response = null;
      let writeError = null;
      try {
        let park = admin
          .from('goals')
          .update({ status: 'needs_human', data: parkedData, updated_at: parkedAt })
          .eq('id', goal.id)
          .eq('user_id', userId)
          .eq('status', goal.status)
          .eq('updated_at', goal.updated_at);
        park =
          goal.data === null || goal.data === undefined
            ? park.is('data', null)
            : park.eq('data', JSON.stringify(normalizedJson(goal.data)));
        response = await park.select('id, user_id, status, data, updated_at').maybeSingle();
      } catch (error) {
        writeError = error;
      }

      if (
        !writeError &&
        !response?.error &&
        response?.data?.id === goal.id &&
        response.data.status === 'needs_human' &&
        sameJson(response.data.data?.agent_job_reconciliation, marker)
      ) {
        return true;
      }

      const inspection = await inspectCapturedWakeGoalPark(admin, goal, parkedAt, marker);
      if (inspection.state === 'committed') return true;
      if (inspection.state !== 'original' || attempt === 1) {
        log.warn(req, 'job.chain.restore-goal-park-unverified', {
          goalId,
          jobId: job.id,
          state: inspection.state,
          error:
            inspection.error?.message || writeError?.message || response?.error?.message || null,
        });
        return false;
      }
    }
  } catch (error) {
    log.warn(req, 'job.chain.restore-goal-park-failed', {
      goalId,
      jobId: job.id,
      error: error.message,
    });
  }
  return false;
}

async function reconcileCapturedWakeFailure(admin, jobId, reason, req) {
  if (resolveWorkerScope() !== 'preview') return;
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (!deploymentIdentity) {
    log.warn(req, 'job.chain.restore-reconciliation-unavailable', {
      jobId,
      reason: 'preview deployment identity missing',
    });
    return;
  }

  const query = admin
    .from('agent_jobs')
    .select(JOB_SNAPSHOT_SELECT)
    .eq('id', jobId)
    .eq('worker_scope', 'preview')
    .eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  let job;
  try {
    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      log.warn(req, 'job.chain.restore-job-inspection-failed', {
        jobId,
        error: error?.message || null,
      });
      return;
    }
    job = data;
  } catch (error) {
    log.warn(req, 'job.chain.restore-job-inspection-failed', { jobId, error: error.message });
    return;
  }

  let recoveryReason = String(reason || 'Exact Preview worker wake failed').slice(0, 1200);
  if (job.status === 'queued') {
    const terminalizedAt = new Date().toISOString();
    const terminalError = `Preview captured job could not be awakened: ${recoveryReason}`;
    const outcome = await exactJobTransition(admin, job, {
      status: 'failed',
      retry_count: job.retry_count,
      result: null,
      error: terminalError,
      updated_at: terminalizedAt,
    });
    if (outcome.state === 'committed') {
      job = outcome.job;
      recoveryReason = terminalError;
    } else {
      recoveryReason = `Captured job wake and terminalization require reconciliation (${outcome.state})`;
      log.warn(req, 'job.chain.restore-terminalize-unverified', {
        jobId,
        state: outcome.state,
        error: outcome.error?.message || outcome.writeError?.message || null,
      });
    }
  } else if (['done', 'failed', 'cancelled'].includes(job.status)) {
    return;
  } else {
    recoveryReason = `Captured job is ${job.status} after an unconfirmed Preview wake`;
  }

  await parkGoalForCapturedWakeFailure(admin, job, recoveryReason, req);
}

async function restoreCapturedJobWakes(admin, jobIds, req) {
  if (!jobIds?.size) return;

  let triggerProcessNext;
  try {
    ({ triggerProcessNext } = await import('../goal-handlers/_helpers.js'));
  } catch (error) {
    log.warn(req, 'job.chain.restore-import-failed', { error: error.message });
    for (const jobId of jobIds) {
      await reconcileCapturedWakeFailure(admin, jobId, error.message, req);
    }
    return;
  }

  for (const jobId of jobIds) {
    try {
      const triggered = await triggerProcessNext({ jobId });
      if (triggered === false) {
        await reconcileCapturedWakeFailure(
          admin,
          jobId,
          'Exact Preview worker trigger returned false',
          req
        );
      }
    } catch (error) {
      log.warn(req, 'job.chain.restore-wake-failed', { jobId, error: error.message });
      await reconcileCapturedWakeFailure(admin, jobId, error.message, req);
    }
  }
}

async function finalizeDescendantFailure(admin, job, error, restoreJobIds, req) {
  if (isJobLeaseLostError(error) || error?.code === JOB_EXECUTION_UNSETTLED) {
    log.warn(req, 'job.chain.execution-reconciliation-required', {
      jobId: job.id,
      error: error?.message || String(error),
    });
    return;
  }
  const message = String(error?.message || error || 'Job execution failed');
  let retried = false;
  try {
    retried = await handleRetry(admin, job, message);
  } catch (retryError) {
    log.warn(req, 'job.chain.retry-failed', { jobId: job.id, error: retryError.message });
  }
  if (retried) {
    restoreJobIds.add(job.id);
    return;
  }

  try {
    await finalizeJob(admin, job, null, message);
  } catch (finalizeError) {
    // finalizeJob can fail during the terminal transition or during a later
    // non-critical side effect. Retain a final CAS fallback so a captured
    // child is not left running after its execution has settled.
    try {
      await transitionRunningJob(
        admin,
        job,
        {
          status: 'failed',
          result: null,
          error: message,
          updated_at: new Date().toISOString(),
        },
        'finalize'
      );
    } catch (fallbackError) {
      log.warn(req, 'job.chain.finalize-fallback-failed', {
        jobId: job.id,
        error: fallbackError.message,
        originalError: finalizeError.message,
      });
      throw fallbackError;
    }
    log.warn(req, 'job.chain.finalize-failed', {
      jobId: job.id,
      error: finalizeError.message,
    });
  }
}

/**
 * After a goal-related job completes, immediately process follow-up jobs
 * so the pipeline progresses without relying solely on Supabase webhooks.
 */
async function chainProcessGoalJobs(
  admin,
  req,
  invokeStartMs = Date.now(),
  { exactGoalId = null, causalJobIds = null, restoreJobIds = null } = {}
) {
  // 180s api/agent.js maxDuration minus 10s safety margin. Bumped from 60s
  // because execute-task jobs for Cloudflare deploy tasks need ~30-90s
  // (two LLM rounds + 3 Cloudflare API calls) and were consistently
  // 504'ing the function at the old ceiling.
  const remainingMs = VERCEL_WORK_BUDGET_MS - (Date.now() - invokeStartMs);
  if (remainingMs < 3000) return; // not enough time for even one chain job

  let chainCount = 0;
  const chainStart = Date.now();
  const chainBudgetMs = Math.min(
    Number.parseInt(process.env.CHAIN_BUDGET_MS || '150000', 10),
    remainingMs
  );

  while (chainCount < 8 && Date.now() - chainStart < chainBudgetMs) {
    const invocationElapsedMs = Date.now() - invokeStartMs;
    if (VERCEL_WORK_BUDGET_MS - invocationElapsedMs < 3000) break;

    const next = causalJobIds
      ? await claimNextCapturedJob(admin, causalJobIds, exactGoalId, restoreJobIds, req)
      : await claimNextJob(admin).catch(() => null);
    if (!next) break;

    const nextType = next.payload?.type;
    const nextGoalId = typeof next.payload?.goalId === 'string' ? next.payload.goalId.trim() : '';

    // evaluate-phase is now safe to run in chain processing.
    // checkPhaseCompletion in execute-task.js has its own deduplication guard
    // (checks for existing queued/running evaluate-phase jobs) and the
    // evaluate-phase handler itself defers if tasks are still pending.
    // Previously skipped here, which caused goals to get stuck forever
    // because no other trigger picked up the queued evaluate-phase job.

    if (!CHAINABLE_GOAL_JOB_TYPES.has(nextType) || (causalJobIds && nextGoalId !== exactGoalId)) {
      // Release a captured non-pipeline job back to its durable queue state.
      await transitionRunningJob(
        admin,
        next,
        {
          status: 'queued',
          error: null,
          updated_at: new Date().toISOString(),
        },
        'release'
      );
      if (causalJobIds) {
        restoreJobIds.add(next.id);
        continue;
      }
      break;
    }

    const chainTimeoutMs = getJobTimeoutMs(nextType, { elapsedMs: invocationElapsedMs });

    if (causalJobIds) {
      let chainResult = null;
      let chainError = null;
      try {
        const execution = await executeClaimedJobWithLease(
          admin,
          next,
          req,
          chainTimeoutMs,
          (guardedAdmin) =>
            executeWithTriggerCapture(causalJobIds, () => executeJob(guardedAdmin, next, req)),
          { chain: true }
        );
        chainResult = execution.result;
        if (execution.error) chainError = new Error(execution.error);
      } catch (error) {
        chainError = error;
      }

      chainCount++;
      if (chainError) {
        await finalizeDescendantFailure(admin, next, chainError, restoreJobIds, req);
        break;
      }

      try {
        await finalizeJob(admin, next, chainResult, null);
      } catch (finalizeError) {
        try {
          await transitionRunningJob(
            admin,
            next,
            {
              status: 'done',
              result: chainResult,
              error: null,
              updated_at: new Date().toISOString(),
            },
            'finalize'
          );
        } catch (fallbackError) {
          log.warn(req, 'job.chain.finalize-fallback-failed', {
            jobId: next.id,
            error: fallbackError.message,
            originalError: finalizeError.message,
          });
          throw fallbackError;
        }
        log.warn(req, 'job.chain.finalize-failed', {
          jobId: next.id,
          error: finalizeError.message,
        });
      }
      continue;
    }

    try {
      const executeChainJob = () =>
        executeClaimedJobWithLease(
          admin,
          next,
          req,
          chainTimeoutMs,
          (guardedAdmin) => executeJob(guardedAdmin, next, req),
          { chain: true }
        );
      const { result: chainResult, error: chainError } = await executeChainJob();
      await finalizeJob(admin, next, chainResult, chainError || null);
      chainCount++;
      if (chainError) break;
    } catch (chainErr) {
      log.warn(req, 'job.chain.error', { error: chainErr.message });
      break;
    }
  }

  if (chainCount > 0) {
    log.info(req, 'job.chain.completed', {
      chainCount,
      durationMs: Date.now() - chainStart,
      ...(exactGoalId ? { goalId: exactGoalId } : {}),
    });
  }
}

// ── Main entry point ──────────────────────────────────────────────

/**
 * Claim and process a job. If jobId is provided, claims that specific job
 * (used by the webhook handler). Otherwise claims the oldest queued job
 * (used by the cron handler).
 *
 * @param {object} admin — Supabase admin client
 * @param {object} [req=null] — HTTP request (for logging context)
 * @param {string} [jobId=null] — Specific job ID to process (from webhook payload)
 * @returns {{ processed: number, job_id?: string, status?: string, error?: string }}
 */
// Vercel terminates api/agent.js at 180s (vercel.json). Reserve ten seconds for
// retry/finalization writes so a timed-out job is put back into a durable state
// before the platform can kill the invocation. Local workers are not subject to
// that ceiling and may retain the longer execute-task budget.
export const VERCEL_WORK_BUDGET_MS = 170_000;

function positiveTimeout(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getJobTimeoutMs(jobType, { env = process.env, elapsedMs = 0 } = {}) {
  const defaultTimeoutMs = positiveTimeout(env.JOB_TIMEOUT_MS, 160_000);
  const configuredTimeoutMs =
    jobType === 'execute-task'
      ? positiveTimeout(env.EXECUTE_TASK_TIMEOUT_MS, 900_000)
      : defaultTimeoutMs;

  if (!env.VERCEL) return configuredTimeoutMs;

  const remainingWorkBudgetMs = Math.max(1_000, VERCEL_WORK_BUDGET_MS - elapsedMs);
  return Math.min(configuredTimeoutMs, remainingWorkBudgetMs);
}

function executionTimeoutError(jobId, timeoutMs, chain = false) {
  const error = new Error(`${chain ? 'Chain job' : 'Job'} ${jobId} timed out after ${timeoutMs}ms`);
  error.code = 'JOB_EXECUTION_TIMEOUT';
  return error;
}

async function waitForExecutionSettlement(execution, graceMs) {
  let graceTimer = null;
  try {
    return await Promise.race([
      execution.then(
        () => true,
        () => true
      ),
      new Promise((resolve) => {
        graceTimer = setTimeout(() => resolve(false), graceMs);
      }),
    ]);
  } finally {
    if (graceTimer) clearTimeout(graceTimer);
  }
}

async function executeClaimedJobWithLease(
  admin,
  job,
  req,
  timeoutMs,
  callback,
  { chain = false } = {}
) {
  const runtime = createJobLeaseRuntime({
    admin,
    job,
    onLost: (error) => log.warn(req, 'job.lease-lost', { job_id: job.id, error: error.message }),
  });
  runtime.start();

  return withJobLeaseRuntime(runtime, async () => {
    const guardedAdmin = guardSupabaseClientForCurrentJobLease(admin);
    let timeoutId = null;
    let abortListener = null;
    try {
      await runtime.assertLive('handler start');
      const execution = Promise.resolve().then(() => callback(guardedAdmin));
      // If a provider ignores AbortSignal, its eventual rejection must not
      // become unhandled after the durable attempt has already transferred.
      execution.catch(() => {});
      const aborted = new Promise((_, reject) => {
        abortListener = () => reject(runtime.signal.reason || jobLeaseLostError(job.id, 'handler'));
        runtime.signal.addEventListener('abort', abortListener, { once: true });
      });
      timeoutId = setTimeout(
        () => runtime.abort(executionTimeoutError(job.id, timeoutMs, chain)),
        timeoutMs
      );
      try {
        const result = await Promise.race([execution, aborted]);
        await runtime.assertLive('handler completion');
        return result;
      } catch (error) {
        if (!runtime.signal.aborted) throw error;
        const settled = await waitForExecutionSettlement(execution, JOB_ABORT_SETTLEMENT_GRACE_MS);
        if (settled) throw error;

        const unsettled = new Error(
          `Job ${job.id} did not settle after cancellation; awaiting lease-expiry reconciliation`
        );
        unsettled.code = JOB_EXECUTION_UNSETTLED;
        unsettled.cause = runtime.signal.reason || error;
        throw unsettled;
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (abortListener) runtime.signal.removeEventListener('abort', abortListener);
      await runtime.stop();
    }
  });
}

async function quarantineIncompleteRunningLease(admin, job, req = null) {
  const error = incompleteJobLeaseError(job?.id || 'unknown');
  const transition = await exactJobTransition(
    admin,
    { ...job, status: 'running' },
    {
      status: 'failed',
      result: null,
      error: error.message,
      updated_at: new Date().toISOString(),
    }
  );
  if (transition.state !== 'committed') {
    log.warn(req, 'job.legacy-lease-quarantine-conflict', {
      job_id: job?.id,
      state: transition.state,
      error: (transition.error || transition.writeError)?.message,
    });
  }
  return { error, transition };
}

export async function processNextJob(
  admin,
  req = null,
  jobId = null,
  { preclaimedJob = null } = {}
) {
  const invokeStartMs = Date.now();
  // A targeted wake claims only its requested row initially and never sweeps a
  // stale running row: two concurrent targeted wakes could otherwise both
  // observe that row, re-queue it, and overwrite the winner's running claim.
  // A successful Preview pickup may continue only exact child IDs emitted by
  // that handler and bound to the same goal below. The untargeted durable
  // worker owns stale recovery.
  if (!jobId) await sweepStaleJobs(admin, req);

  // Ralph-mode watchdog tick: intervene on stuck tasks for any goals with
  // goal.data.pm_strategy = 'ralph'. No-op (fast path) if no such goals.
  // Runs on every process-next call — in dev:local that's every 15s
  // (curl loop), in prod that's Vercel cron every 60s.
  if (resolveWorkerScope() === 'production') {
    try {
      const { runWatchdogTick } = await import('../goal-handlers/active-pm/watchdog.js');
      await runWatchdogTick(admin);
    } catch (wdErr) {
      log.warn(req, 'job.watchdog-failed', { error: wdErr.message });
    }
  }

  if (preclaimedJob && (!jobId || preclaimedJob.id !== jobId)) {
    throw new Error('Preclaimed job does not match the requested exact job');
  }
  const job =
    preclaimedJob || (jobId ? await claimSpecificJob(admin, jobId) : await claimNextJob(admin));
  if (!job) return { processed: 0 };
  if (!hasCompleteJobLease(job)) {
    const quarantine = await quarantineIncompleteRunningLease(admin, job, req);
    return {
      processed: quarantine.transition.state === 'committed' ? 1 : 0,
      job_id: job.id,
      status: quarantine.transition.state === 'committed' ? 'failed' : 'reconciliation_required',
      error: quarantine.error.message,
    };
  }

  const targetedPreviewPickup = Boolean(jobId && resolveWorkerScope() === 'preview');
  const causalJobIds = targetedPreviewPickup ? new Set() : null;
  const restoreJobIds = targetedPreviewPickup ? new Set() : null;
  let result = null;
  let error = null;
  let retryResponse = null;
  let reconciliationResponse = null;
  let authority = null;

  try {
    // End before Vercel's 180s hard ceiling so retry/finalization state is
    // persisted instead of leaving the claimed job stranded as "running".
    const timeoutMs = getJobTimeoutMs(job?.payload?.type, {
      elapsedMs: Date.now() - invokeStartMs,
    });
    const executeClaimedJob = () =>
      executeClaimedJobWithLease(admin, job, req, timeoutMs, (guardedAdmin) =>
        executeJob(guardedAdmin, job, req)
      );
    ({ result, error, authority } = await (causalJobIds
      ? executeWithTriggerCapture(causalJobIds, executeClaimedJob)
      : executeClaimedJob()));
    if (error) throw new Error(error);
  } catch (err) {
    authority = authority || JOB_AUTHORITY_SNAPSHOTS.get(job) || null;
    error = err.message || 'Job execution failed';
    log.error(req, 'job.execution.failed', err, { job_id: job.id });

    if (isJobLeaseLostError(err) || err?.code === JOB_EXECUTION_UNSETTLED) {
      reconciliationResponse = {
        processed: 1,
        job_id: job.id,
        status: 'reconciliation_required',
        error,
      };
    } else {
      let retried = false;
      try {
        retried = await handleRetry(admin, job, error);
      } catch (retryError) {
        log.warn(req, 'job.retry.failed', { jobId: job.id, error: retryError.message });
      }
      if (retried) {
        if (restoreJobIds) restoreJobIds.add(job.id);
        retryResponse = {
          processed: 1,
          job_id: job.id,
          status: 'retrying',
          retry_count: (job.retry_count || 0) + 1,
        };
      }
    }
  }

  if (reconciliationResponse) {
    for (const capturedJobId of causalJobIds || []) restoreJobIds.add(capturedJobId);
    await restoreCapturedJobWakes(admin, restoreJobIds, req);
    return reconciliationResponse;
  }

  if (retryResponse) {
    for (const capturedJobId of causalJobIds || []) restoreJobIds.add(capturedJobId);
    await restoreCapturedJobWakes(admin, restoreJobIds, req);
    return retryResponse;
  }

  // A failed lease transition means this invocation did not durably finalize
  // its claim. Report failure and do not chain more work. Errors from later
  // best-effort side effects retain the durable final status.
  let finalStatus = error ? 'failed' : 'done';
  try {
    finalStatus = await finalizeJob(admin, job, result, error, authority);
  } catch (finalizeErr) {
    log.error(req, 'job.finalize.failed', finalizeErr, { job_id: job.id });
    if (finalizeErr?.code === JOB_LEASE_TRANSITION_ERROR) {
      error = finalizeErr.message;
      finalStatus = 'failed';
    }
  }

  // ── Chain processing for goal pipeline continuity ──────────────
  // When an untargeted worker poll completes a goal-related job, immediately
  // try to process follow-up jobs so the pipeline progresses without relying
  // solely on the Supabase webhook (which may not be configured). Preview
  // self-wakes can be rejected by Vercel's recursion guard, so a targeted
  // Preview pickup also drains causally emitted child IDs for the same goal.
  // It never scans or widens into the shared Preview queue.
  const jobType = authority?.type || null;
  const jobGoalId = authority?.goalId || '';
  const targetedPreviewGoal = Boolean(targetedPreviewPickup && jobGoalId);
  if (!error && CHAINABLE_GOAL_JOB_TYPES.has(jobType) && (!jobId || targetedPreviewGoal)) {
    try {
      await chainProcessGoalJobs(admin, req, invokeStartMs, {
        exactGoalId: targetedPreviewGoal ? jobGoalId : null,
        causalJobIds,
        restoreJobIds,
      });
    } catch (chainErr) {
      // The job itself is done; a failed follow-up is the next poll's problem.
      log.warn(req, 'job.chain.failed', { job_id: job.id, error: chainErr.message });
    }
  }

  if (targetedPreviewPickup) {
    for (const capturedJobId of causalJobIds) restoreJobIds.add(capturedJobId);
    await restoreCapturedJobWakes(admin, restoreJobIds, req);
  }

  return { processed: 1, job_id: job.id, status: finalStatus };
}

/**
 * Sweep jobs whose durable lease has expired. Ordinary jobs are re-queued
 * when retries remain; browser jobs fail closed for external reconciliation.
 */
export async function sweepStaleJobs(admin, req) {
  const sweepNowMs = Date.now();
  const expiredBefore = new Date(sweepNowMs).toISOString();
  const workerScope = resolveWorkerScope();
  const deploymentIdentity = resolveWorkerDeploymentIdentity();
  if (workerScope === 'preview' && !deploymentIdentity) {
    log.warn(req, 'job.stale-sweep.preview-deployment-identity-missing', {
      scope: workerScope,
    });
    return;
  }

  let staleQuery = admin
    .from('agent_jobs')
    .select(JOB_SNAPSHOT_SELECT)
    .eq('status', 'running')
    .eq('worker_scope', workerScope);
  if (deploymentIdentity) {
    staleQuery = staleQuery.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  }
  const { data: staleJobs } = await staleQuery.lt('lease_expires_at', expiredBefore).limit(10);

  if (!staleJobs?.length) return;

  for (const stale of staleJobs) {
    // Migration 227 quarantines pre-lease running rows. Runtime recovery never
    // guesses ownership for a markerless/incomplete generation.
    if (!hasCompleteJobLease(stale)) continue;
    if (Date.parse(stale.lease_expires_at) > sweepNowMs) continue;

    // A browser task may already have created an account, rented a number, or
    // stored a credential before its worker crashed. Never replay that work.
    // Terminalize only the exact expired generation and leave its one-to-one
    // browser_task_runs row as the durable reconciliation record.
    if (stale.payload?.type === 'browser-task') {
      const browserRecovery = await exactJobTransition(
        admin,
        stale,
        {
          status: 'failed',
          result: {
            type: 'browser-task',
            reconciliation_required: true,
            expired_lease_observed_at: stale.lease_expires_at,
          },
          error: 'Browser task lease expired; external work requires reconciliation',
          updated_at: new Date(sweepNowMs).toISOString(),
        },
        { includeLeaseExpiry: true }
      );
      if (browserRecovery.state !== 'committed') {
        log.warn(req, 'job.stale-browser-recovery-unresolved', {
          jobId: stale.id,
          state: browserRecovery.state,
          error: browserRecovery.error?.message || browserRecovery.writeError?.message,
        });
      }
      continue;
    }

    let staleAuthority = null;
    let staleAuthorityError = null;
    try {
      const authorization = await authorizeQueuedJob(admin, stale);
      staleAuthority = authorization.authority;
      rememberJobAuthority(stale, authorization.canonicalJob, staleAuthority);
    } catch (error) {
      staleAuthorityError = isJobOwnerValidationError(error)
        ? error
        : jobOwnerValidationError(`stale job authority could not be established: ${error.message}`);
    }
    const retryCount = Number(stale.retry_count) || 0;
    const configuredMaxRetries = Number(stale.max_retries);
    const maxRetries =
      stale.max_retries !== null &&
      stale.max_retries !== undefined &&
      Number.isFinite(configuredMaxRetries)
        ? Math.max(0, configuredMaxRetries)
        : 3;
    // retry_count describes the attempt currently running. Re-queuing first
    // increments it, and handleRetry rejects that transition when the next
    // value reaches max_retries. Keep stale recovery on the same boundary so
    // it cannot manufacture an exhausted queued row.
    const exhausted = Boolean(staleAuthorityError) || retryCount + 1 >= maxRetries;
    const update = exhausted
      ? {
          status: 'failed',
          error: staleAuthorityError?.message || 'Job timed out (stale — exceeded max retries)',
          updated_at: new Date().toISOString(),
        }
      : {
          status: 'queued',
          retry_count: retryCount + 1,
          error: 'Re-queued after stale timeout',
          updated_at: new Date().toISOString(),
        };

    // Compare-and-swap the complete stale lease, including durable owner,
    // payload, and unique marker. A concurrent claimant or authority change
    // must revoke this sweep's snapshot instead of being overwritten.
    const transition = await exactJobTransition(
      admin,
      { ...stale, status: 'running', worker_scope: workerScope },
      update,
      { includeLeaseExpiry: true }
    );

    if (transition.error || transition.writeError) {
      log.warn(req, 'job.stale-sweep.transition-failed', {
        job_id: stale.id,
        error: (transition.error || transition.writeError).message,
      });
      continue;
    }
    if (transition.state !== 'committed') continue;

    if (exhausted && staleAuthority && !staleAuthorityError) {
      if (staleAuthority.type === 'axwise-outcome' && staleAuthority.goalId) {
        try {
          await markAxwiseOutcomeFinalFailure(
            admin,
            staleAuthority.payload,
            'Job timed out (stale — exceeded max retries)',
            stale,
            staleAuthority.userId
          );
        } catch (outcomeError) {
          log.warn(req, 'goal.axwise-outcome.stale-final-failure-update.error', {
            goalId: staleAuthority.goalId,
            error: outcomeError.message,
          });
        }
      }
    }
    log.warn(req, 'job.stale-sweep', { job_id: stale.id, retry_count: retryCount });
  }
}
