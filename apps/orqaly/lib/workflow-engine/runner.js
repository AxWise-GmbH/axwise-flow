/**
 * Workflow Runner — orchestrates the execution of a workflow graph.
 *
 * Called as a job handler from process-next.js when type = 'execute-workflow'.
 * Loads the workflow, creates an execution record, and runs nodes in order.
 *
 * For serverless: each node executes within the same invocation (sequential).
 * The 10s Vercel limit applies, so workflows with many LLM calls should be
 * broken into chained jobs in the future. For now, we execute what we can.
 */
import { ExecutionContext } from './execution-context.js';
import { topoSort, getNextNodes } from './topo-sort.js';
import { getExecutor } from './node-executors/index.js';
import { createLogger } from '../../api/_lib/logger.js';
import { runBestEffortSupabaseQuery } from '../_shared/supabase-query.js';
import {
  assertCurrentJobLeaseLive,
  isJobLeaseLostError,
} from '../agent-handlers/job-lease-runtime.js';

const log = createLogger('workflow-runner');

/**
 * Execute a full workflow.
 *
 * @param {object} admin - Supabase admin client
 * @param {object} payload - { workflowId, triggerData, userId }
 * @param {object} req - HTTP request for logging
 * @returns {object} execution result
 */
export async function executeWorkflow(admin, payload, req) {
  const { workflowId, triggerData = {}, userId } = payload;
  if (!workflowId) throw new Error('Missing workflowId');
  const ownerId = typeof userId === 'string' ? userId.trim() : '';
  if (!ownerId) throw new Error('Missing workflow userId');

  const trustedTriggerData = normalizeWorkflowTriggerData(triggerData);

  // The worker uses a service-role client. Treat both the workflow id and any
  // goal attribution in trigger data as tenant-scoped references, even when an
  // internal producer was expected to validate them before enqueue.
  const { data: workflow, error: wfErr } = await admin
    .from('workflows')
    .select('id, name, data')
    .eq('id', workflowId)
    .eq('user_id', ownerId)
    .maybeSingle();

  if (wfErr) throw new Error(wfErr.message || 'Failed to load workflow');
  if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

  const triggerGoalId = trustedTriggerData.goalId || null;
  if (triggerGoalId) {
    const { data: goal, error: goalError } = await admin
      .from('goals')
      .select('id')
      .eq('id', triggerGoalId)
      .eq('user_id', ownerId)
      .maybeSingle();
    if (goalError) throw new Error(goalError.message || 'Failed to validate workflow goal');
    if (!goal) throw new Error('Workflow goal not found');
  }

  const wfData = workflow.data || {};
  const nodes = wfData.nodes || [];
  const edges = wfData.edges || [];

  if (nodes.length === 0) throw new Error('Workflow has no nodes');

  // Convert ReactFlow nodes/edges to WorkflowGraph shape
  const blocks = {};
  for (const node of nodes) {
    blocks[node.id] = {
      id: node.id,
      type: node.data?.blockType || node.data?.blockId || node.type || 'unknown',
      displayName: node.data?.label || 'Node',
      properties: node.data?.config || node.data || {},
      position: node.position || { x: 0, y: 0 },
    };
  }

  const connections = edges.map((e) => ({
    id: e.id,
    sourceBlockId: e.source,
    targetBlockId: e.target,
    sourcePortId: e.sourceHandle || null,
    targetPortId: e.targetHandle || null,
  }));

  // Create execution record
  const { data: execRow, error: execErr } = await admin
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      user_id: ownerId,
      status: 'running',
      trigger_data: trustedTriggerData,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (execErr) throw new Error(execErr.message || 'Failed to create execution');

  const ctx = new ExecutionContext({
    executionId: execRow.id,
    workflowId,
    userId: ownerId,
    triggerData: trustedTriggerData,
  });

  // Topo sort for initial order
  const sortedIds = topoSort(blocks, connections);

  log.info(req, 'workflow.execution.start', {
    executionId: execRow.id,
    workflowId,
    nodeCount: sortedIds.length,
  });

  // Execute nodes — walk the graph respecting branches
  const executed = new Set();
  const skipped = new Set();

  async function executeNode(nodeId) {
    if (executed.has(nodeId) || skipped.has(nodeId)) return;

    await assertCurrentJobLeaseLive(`workflow node ${nodeId}`);

    const block = blocks[nodeId];
    if (!block) return;

    ctx.currentNodeId = nodeId;
    const inputData = ctx.getNodeInput(nodeId, connections);
    const executor = getExecutor(block.type);
    const stepStart = Date.now();

    // Record step start
    await runBestEffortSupabaseQuery(
      admin.from('workflow_step_results').insert({
        execution_id: execRow.id,
        node_id: nodeId,
        node_type: block.type,
        status: 'running',
        input_data: inputData,
      }),
      {
        onError: (error) =>
          log.warn(req, 'workflow.step.start-record-failed', {
            executionId: execRow.id,
            nodeId,
            error: error?.message || String(error),
          }),
      }
    );

    let output = null;
    let stepError = null;
    let outputPort = 'out';

    try {
      await assertCurrentJobLeaseLive(`workflow node ${nodeId} execution`);
      const result = await executor(block.properties, inputData, ctx);
      await assertCurrentJobLeaseLive(`workflow node ${nodeId} completion`);
      output = result?.output ?? result;
      outputPort = result?.outputPort || 'out';
      ctx.setNodeOutput(nodeId, output);
      executed.add(nodeId);
    } catch (err) {
      if (isJobLeaseLostError(err)) throw err;
      stepError = err.message || 'Node execution failed';
      executed.add(nodeId);

      log.error(req, 'workflow.node.failed', err, {
        executionId: execRow.id,
        nodeId,
        nodeType: block.type,
      });
    }

    const durationMs = Date.now() - stepStart;

    // Update step result
    await runBestEffortSupabaseQuery(
      admin
        .from('workflow_step_results')
        .update({
          status: stepError ? 'failed' : 'completed',
          output_data: output || {},
          error: stepError,
          duration_ms: durationMs,
        })
        .eq('execution_id', execRow.id)
        .eq('node_id', nodeId),
      {
        onError: (error) =>
          log.warn(req, 'workflow.step.finish-record-failed', {
            executionId: execRow.id,
            nodeId,
            error: error?.message || String(error),
          }),
      }
    );

    // Update execution state
    await runBestEffortSupabaseQuery(
      admin
        .from('workflow_executions')
        .update({
          node_outputs: ctx.nodeOutputs,
          current_node_id: nodeId,
          execution_path: ctx.executionPath,
        })
        .eq('id', execRow.id),
      {
        onError: (error) =>
          log.warn(req, 'workflow.execution.checkpoint-failed', {
            executionId: execRow.id,
            nodeId,
            error: error?.message || String(error),
          }),
      }
    );

    if (stepError) {
      ctx.fail(stepError);
      return;
    }

    // Continue to next nodes
    const nextIds = getNextNodes(nodeId, outputPort, connections);
    for (const nextId of nextIds) {
      // Check all dependencies of nextId are met
      const deps = connections
        .filter((c) => c.targetBlockId === nextId)
        .map((c) => c.sourceBlockId);
      const allDepsMet = deps.every((d) => executed.has(d));
      if (allDepsMet) {
        await executeNode(nextId);
      }
    }
  }

  // Start from root nodes (nodes with no incoming edges)
  const roots = sortedIds.filter((id) => {
    return !connections.some((c) => c.targetBlockId === id);
  });

  try {
    for (const rootId of roots) {
      await executeNode(rootId);
      if (ctx.status === 'failed') break;
    }

    if (ctx.status !== 'failed') {
      ctx.complete();
    }
  } catch (err) {
    if (isJobLeaseLostError(err)) throw err;
    ctx.fail(err);
  }

  // Finalize execution record
  await runBestEffortSupabaseQuery(
    admin
      .from('workflow_executions')
      .update({
        status: ctx.status,
        node_outputs: ctx.nodeOutputs,
        execution_path: ctx.executionPath,
        error: ctx.error,
        completed_at: ctx.completedAt,
      })
      .eq('id', execRow.id),
    {
      onError: (error) =>
        log.warn(req, 'workflow.execution.finalize-failed', {
          executionId: execRow.id,
          error: error?.message || String(error),
        }),
    }
  );

  log.info(req, 'workflow.execution.complete', {
    executionId: execRow.id,
    status: ctx.status,
    nodeCount: executed.size,
    durationMs: Date.now() - new Date(ctx.startedAt).getTime(),
  });

  return {
    type: 'execute-workflow',
    executionId: execRow.id,
    workflowId,
    status: ctx.status,
    nodeOutputs: ctx.nodeOutputs,
    executionPath: ctx.executionPath,
    error: ctx.error,
  };
}

/**
 * Normalize the only tenant-backed identifier accepted in public workflow
 * trigger data. Preserve ordinary workflow inputs, but reject ambiguous or
 * non-string goal references and canonicalize both legacy spellings.
 */
export function normalizeWorkflowTriggerData(triggerData = {}) {
  const source =
    triggerData && typeof triggerData === 'object' && !Array.isArray(triggerData)
      ? triggerData
      : {};
  const hasCamel = Object.hasOwn(source, 'goalId');
  const hasSnake = Object.hasOwn(source, 'goal_id');
  if (hasCamel && typeof source.goalId !== 'string') {
    throw new Error('Workflow trigger goalId must be a string');
  }
  if (hasSnake && typeof source.goal_id !== 'string') {
    throw new Error('Workflow trigger goal_id must be a string');
  }

  const camel = hasCamel ? source.goalId.trim() : '';
  const snake = hasSnake ? source.goal_id.trim() : '';
  if (camel && snake && camel !== snake) {
    throw new Error('Workflow trigger goal identifiers do not match');
  }

  const goalId = camel || snake;
  const normalized = { ...source };
  delete normalized.goalId;
  delete normalized.goal_id;
  if (goalId) {
    normalized.goalId = goalId;
    normalized.goal_id = goalId;
  }
  return normalized;
}
