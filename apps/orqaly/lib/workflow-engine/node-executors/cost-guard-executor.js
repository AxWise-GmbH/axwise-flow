/**
 * Cost guard executor — checks remaining budget before proceeding.
 *
 * Config: { max_cost_usd, action_on_exceed: 'block' | 'warn' }
 * Input: { agent_id? }
 * Output: { within_budget, current_cost, max_cost }
 * OutputPort: 'out' (within budget) or 'exceeded' (over budget)
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  authorizeWorkflowResources,
  requireWorkflowUserId,
  resolveWorkflowResourceId,
  workflowAuthorizationFailure,
} from './resource-authorization.js';

const log = createLogger('cost-guard-executor');

export async function executeCostGuard(config = {}, inputData, ctx) {
  const maxCost = Number(config.max_cost_usd || 10);
  let userId;
  let agentId;
  let boardId;
  try {
    userId = requireWorkflowUserId(ctx);
    agentId = resolveWorkflowResourceId(config.agent_id, inputData?.agent_id, 'agent_id');
    boardId = resolveWorkflowResourceId(config.board_id, inputData?.board_id, 'board_id');
  } catch (error) {
    return workflowAuthorizationFailure(error);
  }

  if (!agentId && !boardId) {
    return {
      output: {
        within_budget: true,
        message: 'No agent_id — cannot check budget, allowing through',
      },
      outputPort: 'out',
    };
  }

  const admin = buildSupabaseAdminClient();
  try {
    await authorizeWorkflowResources(admin, userId, { agentId, boardId });
  } catch (error) {
    return workflowAuthorizationFailure(error);
  }

  if (!agentId) {
    return {
      output: {
        within_budget: true,
        message: 'No agent_id — cannot check budget, allowing through',
      },
      outputPort: 'out',
    };
  }

  const { data: limit, error: limitError } = await admin
    .from('concilium_rate_limits')
    .select('current_cost_day_usd, max_cost_per_day_usd')
    .eq('user_id', userId)
    .eq('entity_type', 'agent')
    .eq('entity_id', agentId)
    .maybeSingle();

  if (limitError) {
    return {
      output: { error: `Unable to check agent budget: ${limitError.message}` },
      outputPort: 'error',
    };
  }

  if (!limit) {
    return {
      output: { within_budget: true, message: 'No rate limit record found — allowing through' },
      outputPort: 'out',
    };
  }

  const currentCost = Number(limit.current_cost_day_usd) || 0;
  const effectiveMax = Math.min(maxCost, Number(limit.max_cost_per_day_usd) || maxCost);

  if (currentCost >= effectiveMax) {
    log.warn(null, 'cost_guard.exceeded', { agentId, currentCost, maxCost: effectiveMax });
    return {
      output: {
        within_budget: false,
        current_cost: currentCost,
        max_cost: effectiveMax,
        message: `Budget exceeded: $${currentCost.toFixed(4)} >= $${effectiveMax.toFixed(4)}`,
      },
      outputPort: 'exceeded',
    };
  }

  return {
    output: {
      within_budget: true,
      current_cost: currentCost,
      max_cost: effectiveMax,
      remaining: Math.round((effectiveMax - currentCost) * 10000) / 10000,
    },
    outputPort: 'out',
  };
}
