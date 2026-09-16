/**
 * Sub-agent executor — spawns another agent from a blueprint within a workflow.
 *
 * Config: { blueprint_id, wait_for_result }
 * Input: passed as job payload
 * Output: { job_id, status } or { result } if wait_for_result
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { deterministicAgentJobId, enqueueAgentJob } from '../../goal-handlers/_helpers.js';
import { checkQuotas } from '../../security/user-quotas.js';

const log = createLogger('sub-agent-executor');

export async function executeSubAgent(config, inputData, ctx) {
  const userId = typeof ctx?.userId === 'string' ? ctx.userId.trim() : '';
  if (!userId) {
    return {
      output: { error: 'userId is required to execute a sub-agent' },
      outputPort: 'error',
    };
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return { output: { error: 'Database not configured' }, outputPort: 'error' };
  }

  const blueprintId = config?.blueprint_id || inputData?.blueprint_id;
  if (!blueprintId) {
    return { output: { error: 'blueprint_id is required' }, outputPort: 'error' };
  }

  // The executor uses a service-role client, so ownership must be enforced in
  // the query rather than delegated to RLS.
  const { data: blueprint, error: blueprintError } = await admin
    .from('agent_blueprints')
    .select('id, name, description, category, system_prompt, provider, model')
    .eq('id', blueprintId)
    .eq('user_id', userId)
    .maybeSingle();

  if (blueprintError) {
    return {
      output: { error: blueprintError.message || 'Failed to load blueprint' },
      outputPort: 'error',
    };
  }

  if (!blueprint) {
    return { output: { error: `Blueprint ${blueprintId} not found` }, outputPort: 'error' };
  }

  // Workflow nodes enqueue through a trusted internal producer, so they do not
  // pass through the public enqueue quota boundary. Enforce the same durable
  // per-owner jobs/hour limit before every delegated child is inserted.
  const quota = await checkQuotas(admin, userId, { jobType: 'agent' });
  if (!quota.allowed) {
    return {
      output: {
        error: quota.message || 'Sub-agent execution quota exceeded',
        code: quota.code || 'QUOTA_EXCEEDED',
      },
      outputPort: 'error',
    };
  }

  // Enqueue a job for the sub-agent
  let job;
  try {
    const parentNodeId = ctx?.currentNodeId || ctx?.nodeId || null;
    const goalId = ctx?.triggerData?.goalId || ctx?.triggerData?.goal_id || null;
    const deterministicIdentity =
      ctx?.executionId && parentNodeId
        ? { userId, executionId: ctx.executionId, nodeId: parentNodeId, blueprintId }
        : null;
    const task = [
      config?.task,
      config?.instruction,
      config?.prompt,
      inputData?.task,
      inputData?.instruction,
      inputData?.prompt,
    ]
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim();
    job = await enqueueAgentJob(
      admin,
      {
        ...(deterministicIdentity
          ? { id: deterministicAgentJobId('workflow-sub-agent', deterministicIdentity) }
          : {}),
        user_id: userId,
        payload: {
          type: 'agent',
          userId,
          _userId: userId,
          user_id: userId,
          agentId: blueprintId,
          agentName: blueprint.name,
          blueprint_id: blueprintId,
          provider: blueprint.provider,
          model: blueprint.model,
          task: task || `Complete the delegated workflow step as ${blueprint.name}.`,
          context: inputData ?? {},
          parent_execution_id: ctx?.executionId,
          parent_node_id: parentNodeId,
          ...(goalId ? { goalId } : {}),
          agentContext: {
            id: blueprintId,
            _agentId: blueprintId,
            _userId: userId,
            blueprint_id: blueprintId,
            name: blueprint.name,
            role: blueprint.category || 'general',
            description: blueprint.description || '',
            // Even an intentionally empty prompt is an authoritative owned
            // snapshot; the worker must not search another tenant by name.
            system_prompt:
              typeof blueprint.system_prompt === 'string' ? blueprint.system_prompt : '',
          },
        },
      },
      { idempotent: Boolean(deterministicIdentity) }
    );
  } catch (error) {
    log.warn(null, 'sub_agent.enqueue.error', { error: error.message });
    return { output: { error: error.message }, outputPort: 'error' };
  }

  log.info('Sub-agent job enqueued', { jobId: job.id, blueprint: blueprint.name });

  // If wait_for_result, we return 'pending' and the runner should poll
  if (config?.wait_for_result) {
    return {
      output: {
        status: 'pending',
        job_id: job.id,
        agent_name: blueprint.name,
        message: 'Sub-agent job queued — waiting for result',
      },
      outputPort: 'pending',
    };
  }

  // Fire-and-forget
  return {
    output: {
      status: 'queued',
      job_id: job.id,
      agent_name: blueprint.name,
      message: 'Sub-agent job enqueued',
    },
    outputPort: 'out',
  };
}
