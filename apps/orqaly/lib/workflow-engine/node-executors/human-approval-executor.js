/**
 * Human approval executor — pauses workflow and waits for human approval.
 *
 * Config: { timeout_ms, approvers, escalation }
 * Input: passed through
 * Output: { status: 'pending_approval', approval_id }
 *
 * In practice this creates a pending approval record and the workflow
 * runner should stop execution at this node until approval is granted.
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  authorizeWorkflowResources,
  requireWorkflowUserId,
  resolveWorkflowResourceId,
  workflowAuthorizationFailure,
} from './resource-authorization.js';

const log = createLogger('human-approval-executor');

export async function executeHumanApproval(config = {}, inputData, ctx) {
  let userId;
  let agentId;
  let boardId;
  try {
    userId = requireWorkflowUserId(ctx);
    agentId = resolveWorkflowResourceId(config.agent_id, inputData?.agent_id, 'agent_id');
    boardId = resolveWorkflowResourceId(config.board_id, inputData?.board_id, 'board_id');
    if (!agentId) {
      throw new Error('Human approval executor requires an owned agent_id');
    }
  } catch (error) {
    return workflowAuthorizationFailure(error);
  }

  const admin = buildSupabaseAdminClient();
  try {
    await authorizeWorkflowResources(admin, userId, { agentId, boardId });
  } catch (error) {
    return workflowAuthorizationFailure(error);
  }

  const timeoutMs = config.timeout_ms || 86400_000; // Default 24h

  // Create an approval request as a special agent report
  const { data, error } = await admin
    .from('concilium_agent_reports')
    .insert({
      user_id: userId,
      agent_id: agentId,
      board_id: boardId,
      report_type: 'approval_request',
      summary: config.message || 'Workflow requires human approval to continue',
      details: {
        workflow_execution_id: ctx?.executionId,
        node_id: ctx?.nodeId,
        input_data: inputData,
        approvers: config.approvers || [],
        timeout_ms: timeoutMs,
        expires_at: new Date(Date.now() + timeoutMs).toISOString(),
      },
      verified: false,
    })
    .select('id')
    .single();

  if (error) {
    log.warn(null, 'human_approval.insert.error', { error: error.message });
    return { output: { error: error.message }, outputPort: 'error' };
  }

  // Return pending status — the workflow runner should pause here
  return {
    output: {
      status: 'pending_approval',
      approval_id: data.id,
      message: 'Waiting for human approval',
      expires_at: new Date(Date.now() + timeoutMs).toISOString(),
      input_data: inputData,
    },
    outputPort: 'pending',
  };
}
