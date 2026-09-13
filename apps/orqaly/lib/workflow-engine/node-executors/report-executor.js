/**
 * Report executor — submits a report to Consilium from within a workflow.
 *
 * Config: { report_type, template }
 * Input: { summary, details, agent_id?, board_id? }
 * Output: { report } or { error }
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { createLogger } from '../../../api/_lib/logger.js';
import {
  authorizeWorkflowResources,
  requireWorkflowUserId,
  resolveWorkflowResourceId,
  workflowAuthorizationFailure,
} from './resource-authorization.js';

const log = createLogger('report-executor');

export async function executeReport(config = {}, inputData, ctx) {
  let userId;
  let agentId;
  let boardId;
  try {
    userId = requireWorkflowUserId(ctx);
    agentId = resolveWorkflowResourceId(config.agent_id, inputData?.agent_id, 'agent_id');
    boardId = resolveWorkflowResourceId(config.board_id, inputData?.board_id, 'board_id');
    if (!agentId) {
      throw new Error('Report executor requires an owned agent_id');
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

  const reportType = config.report_type || inputData?.report_type || 'activity';
  const summary = config.template
    ? config.template.replace(/\{\{(\w+)\}\}/g, (_, key) => inputData?.[key] || '')
    : inputData?.summary || 'Workflow step report';

  const row = {
    user_id: userId,
    agent_id: agentId,
    board_id: boardId,
    report_type: reportType,
    summary,
    details: inputData?.details || inputData || {},
    requests_made: inputData?.requests_made || 0,
    tokens_used: inputData?.tokens_used || 0,
    cost_usd: inputData?.cost_usd || 0,
    verified: false,
  };

  const { data, error } = await admin
    .from('concilium_agent_reports')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    log.warn(null, 'report_executor.insert.error', { error: error.message });
    return { output: { error: error.message }, outputPort: 'error' };
  }

  return { output: { report: data }, outputPort: 'out' };
}
