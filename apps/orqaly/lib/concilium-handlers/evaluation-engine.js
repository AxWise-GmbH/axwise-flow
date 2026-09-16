/**
 * Evaluation Engine v2: multi-member parallel evaluation with consensus.
 *
 * Flow:
 * 1. Load board config + members + criteria + consensus rules
 * 2. Build member-specific prompts (role, resume, criteria rubrics)
 * 3. Execute all members in parallel via Promise.allSettled (per-member timeout)
 * 4. Run security scanner on each response (collusion detection)
 * 5. Calculate consensus
 * 6. Determine decision level via risk assessor
 * 7. Store full evaluation with member_responses
 * 8. Return structured result
 */
import { executeLlmV2, parseLlmJson } from './llm-executor-v2.js';
import { calculateConsensus, aggregateScores } from './consensus-calculator.js';
import { assessRisk } from './risk-assessor.js';
import { detectCollusion } from './security-scanner.js';
import { createLogger } from '../../api/_lib/logger.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('evaluation-engine');

const MEMBER_TIMEOUT_MS = 25000; // Per-member timeout
const CONCILIUM_BOARD_AUTHORITY_ERROR = 'CONCILIUM_BOARD_AUTHORITY_ERROR';

const BOARD_SELECT =
  'id, name, purpose, security_level, approval_threshold, confidence_threshold, auto_quarantine_on_violation, status, user_id';

function expectedOwnerId(value) {
  const userId = typeof value === 'string' ? value.trim() : '';
  if (!userId) throw new Error('Concilium evaluation requires an expected user owner');
  return userId;
}

function boardAuthorityError(message) {
  const error = new Error(message);
  error.code = CONCILIUM_BOARD_AUTHORITY_ERROR;
  return error;
}

/**
 * Resolve a board through the durable caller owner before any rate-limit,
 * prompt, member, or usage work can run under the service-role client.
 */
export async function loadOwnedConciliumBoard(admin, conciliumId, expectedUserId) {
  const userId = expectedOwnerId(expectedUserId);
  const boardId = typeof conciliumId === 'string' ? conciliumId.trim() : '';
  if (!admin || !boardId) throw new Error('Concilium evaluation requires a board id');

  const { data: board, error } = await admin
    .from('concilium')
    .select(BOARD_SELECT)
    .eq('id', boardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw boardAuthorityError(`Unable to authorize Concilium board: ${error.message}`);
  if (!board || board.id !== boardId || board.user_id !== userId) {
    throw boardAuthorityError(`Board not found for expected owner: ${boardId}`);
  }
  if (board.status !== 'active') {
    throw boardAuthorityError(`Concilium board is not active: ${boardId}`);
  }
  return board;
}

/**
 * Build an evaluation prompt for a specific member.
 */
function buildMemberPrompt(member, { jobDescription, agentOutput, criteria }) {
  const outputStr =
    typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput, null, 2);

  const systemParts = [
    `You are "${member.name}", a ${member.role} on the Consilium evaluation board.`,
  ];
  if (member.resume) systemParts.push(`Your background: ${member.resume}`);
  if (member.skills?.length) systemParts.push(`Your expertise: ${member.skills.join(', ')}`);
  systemParts.push(
    'Evaluate the agent output against the criteria below.',
    'Score each criterion 0-10 and provide specific, actionable feedback.',
    'Respond ONLY with valid JSON.'
  );

  const promptParts = [
    'Evaluate the following agent output:',
    '',
    `Job Description: ${jobDescription || 'Not specified'}`,
    '',
    'Agent Output:',
    outputStr,
    '',
  ];

  // Add criteria with rubrics
  if (criteria?.length) {
    promptParts.push('Evaluation Criteria:');
    for (const c of criteria) {
      promptParts.push(`- ${c.name} (weight: ${c.weight}): ${c.rubric || 'Score 0-10'}`);
    }
    promptParts.push('');
  } else {
    promptParts.push('Score on: quality, completeness, accuracy, actionability (0-10 each)', '');
  }

  promptParts.push(
    'Respond with JSON:',
    '{ "scores": { "criteria_name": score }, "overall_score": average, "feedback": "suggestions", "approved": true_or_false, "summary": "verdict" }'
  );

  return {
    systemPrompt: systemParts.join(' '),
    prompt: promptParts.join('\n'),
  };
}

/**
 * Execute a single member evaluation with timeout.
 */
async function executeMemberEvaluation(
  member,
  promptOpts,
  llm = null,
  userId = null,
  assertLive = null
) {
  const { systemPrompt, prompt } = buildMemberPrompt(member, promptOpts);

  // Admission can become stale while members/criteria are loading. Re-resolve
  // the durable board immediately before every external model call so a board
  // deactivation revokes work that was already claimed.
  if (assertLive) await assertLive();

  const llmResult = await executeLlmV2({
    prompt,
    systemPrompt,
    provider: llm?.provider || member.provider || defaultProvider(),
    model: llm?.model || member.model || (member.provider ? undefined : defaultModel()),
    pinnedProvider: llm?.pinnedProvider === true,
    temperature: member.temperature ?? 0.2,
    maxTokens: member.max_tokens ?? 1500,
    jsonMode: (llm?.provider || member.provider) !== 'anthropic', // Anthropic doesn't support json_mode
    timeoutMs: MEMBER_TIMEOUT_MS,
    ...(userId ? { userId } : {}),
  });

  const parsed = parseLlmJson(llmResult.content) || { raw: llmResult.content };

  return {
    memberId: member.id,
    memberName: member.name,
    role: member.role,
    provider: llmResult.provider,
    model: llmResult.model,
    scores: parsed.scores || {},
    overallScore: parsed.overall_score || 0,
    feedback: parsed.feedback || '',
    approved: parsed.approved || false,
    summary: parsed.summary || '',
    usage: llmResult.usage,
    durationMs: llmResult.durationMs,
    estimatedCostUsd: llmResult.estimatedCostUsd,
    finishReason: llmResult.finishReason || null,
    content: llmResult.content,
  };
}

/**
 * Run the full multi-member evaluation engine.
 *
 * @param {object} admin - Supabase admin client
 * @param {object} opts
 * @param {string} opts.conciliumId - Board ID
 * @param {string} [opts.jobId] - Job ID
 * @param {string} [opts.jobDescription] - Job description
 * @param {string|object} opts.agentOutput - Output to evaluate
 * @param {string} [opts.userId] - User ID
 * @returns {Promise<object>} Full evaluation result
 */
export async function runEvaluation(admin, opts) {
  const {
    conciliumId: requestedConciliumId,
    jobId,
    jobDescription,
    agentOutput,
    userId: requestedUserId,
    llm = null,
  } = opts;
  const userId = expectedOwnerId(requestedUserId);
  const conciliumId = typeof requestedConciliumId === 'string' ? requestedConciliumId.trim() : '';
  const endTimer = log.startTimer();

  // ── 1. Load board config ──
  const board = await loadOwnedConciliumBoard(admin, conciliumId, userId);

  // ── 2. Load active members ──
  const { data: memberRows, error: membersError } = await admin
    .from('concilium_members')
    .select('id, user_id, name, role, provider, model, resume, skills, temperature, max_tokens')
    .eq('concilium_id', conciliumId)
    .eq('user_id', userId)
    .eq('active', true)
    .eq('quarantined', false);

  if (membersError) throw new Error(`Unable to load Concilium members: ${membersError.message}`);
  const members = (memberRows || []).filter((member) => member.user_id === userId);

  if (!members || members.length === 0) {
    throw new Error(`No active members for board: ${conciliumId}`);
  }

  // ── 3. Load criteria ──
  const { data: criteriaRows, error: criteriaError } = await admin
    .from('concilium_criteria')
    .select('user_id, name, weight, rubric')
    .eq('concilium_id', conciliumId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (criteriaError) throw new Error(`Unable to load Concilium criteria: ${criteriaError.message}`);
  const criteria = (criteriaRows || []).filter((criterion) => criterion.user_id === userId);

  // ── 4. Load consensus rules ──
  const { data: consensusRule, error: consensusError } = await admin
    .from('concilium_consensus_rules')
    .select('user_id, consensus_type, quorum, approval_threshold, split_decision_strategy')
    .eq('concilium_id', conciliumId)
    .eq('user_id', userId)
    .maybeSingle();
  if (consensusError) {
    throw new Error(`Unable to load Concilium consensus rules: ${consensusError.message}`);
  }
  const consensusRules = consensusRule?.user_id === userId ? consensusRule : null;

  const rules = consensusRules || {
    consensus_type: 'majority',
    quorum: 2,
    approval_threshold: board.approval_threshold || 0.5,
    split_decision_strategy: 'chairman_decides',
  };

  // ── 5. Execute all members in parallel ──
  log.info('eval-v2.start', {
    boardId: conciliumId,
    memberCount: members.length,
    criteriaCount: criteria?.length || 0,
  });

  const promptOpts = { jobDescription, agentOutput, criteria: criteria || [] };
  const results = await Promise.allSettled(
    members.map((member) =>
      executeMemberEvaluation(member, promptOpts, llm, userId, () =>
        loadOwnedConciliumBoard(admin, conciliumId, userId)
      )
    )
  );

  const revoked = results.find(
    (result) =>
      result.status === 'rejected' && result.reason?.code === CONCILIUM_BOARD_AUTHORITY_ERROR
  );
  if (revoked) throw revoked.reason;

  const successfulResponses = [];
  const failedMembers = [];

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      successfulResponses.push(results[i].value);
    } else {
      failedMembers.push({
        memberId: members[i].id,
        memberName: members[i].name,
        provider: llm?.provider || members[i].provider || 'unknown',
        model: llm?.model || members[i].model || 'unknown',
        error: results[i].reason?.message || 'Unknown error',
      });
      log.warn('eval-v2.member.failed', {
        memberId: members[i].id,
        error: results[i].reason?.message,
      });
    }
  }

  // ── 6. Collusion detection ──
  const collusionResult = detectCollusion(
    successfulResponses.map((r) => ({
      memberId: r.memberId,
      provider: r.provider,
      content: r.content,
    }))
  );

  // ── 7. Calculate consensus ──
  const consensusInput = successfulResponses.map((r) => ({
    memberId: r.memberId,
    approved: r.approved,
    overallScore: r.overallScore,
    role: r.role,
    weight: 1, // Equal weight for now; can be extended
  }));

  const consensus = calculateConsensus({ responses: consensusInput, rules });

  // ── 8. Aggregate scores ──
  const { aggregatedScores, overallScore } = aggregateScores(successfulResponses);

  // ── 9. Risk assessment ──
  const risk = assessRisk({
    overallScore,
    approvalRatio: consensus.approvalRatio,
    consensusReached: consensus.consensusReached,
    approved: consensus.approved,
    collusionDetected: collusionResult.detected,
    memberCount: successfulResponses.length,
    boardConfig: board,
  });

  // ── 10. Total costs ──
  const totalCostUsd = successfulResponses.reduce((sum, r) => sum + (r.estimatedCostUsd || 0), 0);
  const totalTokens = successfulResponses.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0);
  const totalDurationMs = Math.max(...successfulResponses.map((r) => r.durationMs || 0), 0);

  // ── 11. Build member_responses for storage ──
  const memberResponses = successfulResponses.map((r) => ({
    memberId: r.memberId,
    memberName: r.memberName,
    role: r.role,
    provider: r.provider,
    model: r.model,
    scores: r.scores,
    overallScore: r.overallScore,
    approved: r.approved,
    feedback: r.feedback,
    summary: r.summary,
    durationMs: r.durationMs,
    estimatedCostUsd: r.estimatedCostUsd,
    tokensUsed: r.usage?.total_tokens || 0,
  }));

  // ── 12. Store evaluation ──
  const evalRow = {
    concilium_id: conciliumId,
    board_id: conciliumId,
    job_id: jobId || null,
    user_id: userId,
    scores: aggregatedScores,
    overall_score: overallScore,
    feedback: successfulResponses.map((r) => `[${r.memberName}]: ${r.feedback}`).join('\n\n'),
    approved: consensus.approved,
    summary: `${consensus.strategy} consensus (${(consensus.approvalRatio * 100).toFixed(0)}%): ${consensus.approved ? 'APPROVED' : 'REJECTED'}`,
    member_responses: memberResponses,
    decision_level: risk.level,
    consensus_type: consensus.strategy,
    human_review_required: risk.humanReviewRequired,
    human_review_status: risk.humanReviewRequired ? 'pending' : 'not_required',
    total_cost_usd: totalCostUsd,
    total_tokens: totalTokens,
    duration_ms: totalDurationMs,
    model: members.map((m) => `${m.provider}/${m.model}`).join(', '),
    provider: [...new Set(members.map((m) => m.provider))].join(', '),
    usage: { totalTokens, totalCostUsd, memberCount: successfulResponses.length },
    estimated_cost_usd: totalCostUsd,
  };

  await loadOwnedConciliumBoard(admin, conciliumId, userId);
  const { error: insertErr } = await admin.from('concilium_evaluations').insert(evalRow);

  if (insertErr) {
    log.warn('eval-v2.insert.failed', { error: insertErr.message });
  }

  // Mirror each board member's call into llm_usage so consilium spend is
  // sliceable by provider/model/agent alongside goals and agents. One row per
  // member (no summary row) keeps the sum equal to the evaluation total.
  try {
    await loadOwnedConciliumBoard(admin, conciliumId, userId);
    const { recordLlmUsage, extractTokenUsage } = await import('../goal-handlers/_helpers.js');
    await Promise.all(
      successfulResponses.map((r) => {
        const {
          promptTokens,
          completionTokens,
          totalTokens: memberTokens,
          cachedTokens,
        } = extractTokenUsage(r);
        return recordLlmUsage(admin, {
          userId,
          // concilium_id (with s) is the llm_usage column; the board id lives in
          // the local `conciliumId` var (with n). The previous shorthand
          // `consiliumId` referenced an undefined var and threw, so every
          // consilium evaluation silently recorded zero usage rows.
          consiliumId: conciliumId,
          jobId: jobId || null,
          agentId: r.memberId || null,
          agentName: r.memberName || null,
          provider: r.provider || 'unknown',
          model: r.model || 'unknown',
          promptTokens,
          completionTokens,
          totalTokens: memberTokens,
          cachedTokens,
          estimatedCostUsd: Number(r.estimatedCostUsd || 0),
          durationMs: Number(r.durationMs || 0),
          finishReason: r.finishReason || null,
          source: 'consilium',
          operation: 'evaluation',
          description: 'concilium-evaluate',
        });
      })
    );
    // Record failed members too so wasted spend / reliability stays visible.
    await Promise.all(
      failedMembers.map((fm) => {
        const failStatus = /timeout|did not respond/i.test(fm.error || '') ? 'timeout' : 'error';
        return recordLlmUsage(admin, {
          userId,
          consiliumId: conciliumId,
          jobId: jobId || null,
          agentId: fm.memberId || null,
          agentName: fm.memberName || null,
          provider: fm.provider || 'unknown',
          model: fm.model || 'unknown',
          estimatedCostUsd: 0,
          status: failStatus,
          errorType: failStatus === 'timeout' ? 'timeout' : 'llm_error',
          source: 'consilium',
          operation: 'evaluation',
          description: 'concilium-evaluate-failed',
        });
      })
    );
  } catch (err) {
    log.warn('eval-v2.llm-usage.failed', { error: err.message });
  }

  endTimer('eval-v2.complete');

  return {
    type: 'concilium-evaluate',
    // Per-member usage is recorded above, so the job finalizer must not
    // re-record the aggregate at the job level (avoids double-counting).
    usageRecorded: true,
    conciliumId,
    conciliumName: board.name,
    evaluation: {
      scores: aggregatedScores,
      overall_score: overallScore,
      approved: consensus.approved,
      summary: evalRow.summary,
      feedback: evalRow.feedback,
    },
    consensus: {
      type: consensus.strategy,
      approved: consensus.approved,
      approvalRatio: consensus.approvalRatio,
      consensusReached: consensus.consensusReached,
    },
    risk: {
      level: risk.level,
      humanReviewRequired: risk.humanReviewRequired,
      reasons: risk.reasons,
    },
    collusion: collusionResult,
    memberResponses,
    failedMembers,
    usage: { totalTokens, totalCostUsd, memberCount: successfulResponses.length },
    durationMs: totalDurationMs,
    estimatedCostUsd: totalCostUsd,
  };
}
