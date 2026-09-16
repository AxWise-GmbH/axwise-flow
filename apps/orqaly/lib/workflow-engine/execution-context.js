/**
 * ExecutionContext — carries state through a workflow execution.
 * Created once per workflow run, updated as each node completes.
 */

export class ExecutionContext {
  constructor({ executionId, workflowId, userId, triggerData = {} }) {
    this.executionId = executionId;
    this.workflowId = workflowId;
    this.userId = userId;
    this.triggerData = triggerData;
    this.nodeOutputs = {};       // nodeId → output data
    this.variables = {};          // user-defined variables
    this.executionPath = [];      // ordered list of executed nodeIds
    this.currentNodeId = null;
    this.status = 'running';      // running | paused | completed | failed
    this.error = null;
    this.startedAt = new Date().toISOString();
    this.completedAt = null;
  }

  /** Get input data for a node by collecting outputs from its upstream connections. */
  getNodeInput(nodeId, connections) {
    const incoming = connections.filter((c) => c.targetBlockId === nodeId);
    if (incoming.length === 0) return this.triggerData;
    if (incoming.length === 1) {
      return this.nodeOutputs[incoming[0].sourceBlockId] ?? {};
    }
    // Multiple inputs: merge all upstream outputs
    const merged = {};
    for (const conn of incoming) {
      const output = this.nodeOutputs[conn.sourceBlockId];
      if (output && typeof output === 'object') Object.assign(merged, output);
    }
    return merged;
  }

  /** Record a node's output and add to execution path. */
  setNodeOutput(nodeId, output) {
    this.nodeOutputs[nodeId] = output;
    this.executionPath.push(nodeId);
  }

  /** Mark execution complete. */
  complete() {
    this.status = 'completed';
    this.completedAt = new Date().toISOString();
  }

  /** Mark execution failed. */
  fail(error) {
    this.status = 'failed';
    this.error = typeof error === 'string' ? error : error?.message || 'Unknown error';
    this.completedAt = new Date().toISOString();
  }

  /** Serialize for storage in DB. */
  toJSON() {
    return {
      execution_id: this.executionId,
      workflow_id: this.workflowId,
      user_id: this.userId,
      status: this.status,
      trigger_data: this.triggerData,
      node_outputs: this.nodeOutputs,
      variables: this.variables,
      current_node_id: this.currentNodeId,
      execution_path: this.executionPath,
      error: this.error,
      started_at: this.startedAt,
      completed_at: this.completedAt,
    };
  }

  /** Restore from DB row. */
  static fromRow(row) {
    const ctx = new ExecutionContext({
      executionId: row.id,
      workflowId: row.workflow_id,
      userId: row.user_id,
      triggerData: row.trigger_data || {},
    });
    ctx.nodeOutputs = row.node_outputs || {};
    ctx.variables = row.variables || {};
    ctx.executionPath = row.execution_path || [];
    ctx.currentNodeId = row.current_node_id;
    ctx.status = row.status;
    ctx.error = row.error;
    ctx.startedAt = row.started_at;
    ctx.completedAt = row.completed_at;
    return ctx;
  }
}
