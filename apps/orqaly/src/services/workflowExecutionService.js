/**
 * Workflow Execution Service — frontend interface for running workflows
 * and tracking execution status.
 */
import { supabase, hasSupabase } from '../lib/supabase';

/**
 * Start a workflow execution by enqueuing an execute-workflow job.
 * @param {string} workflowId
 * @param {object} triggerData - Optional trigger data
 * @returns {Promise<{ jobId: string, status: string }>}
 */
export async function startExecution(workflowId, triggerData = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const res = await fetch('/api/app?path=workflows&action=execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      workflowId,
      triggerData,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to start execution (${res.status})`);
  }

  return res.json();
}

/**
 * Get execution details by ID.
 * @param {string} executionId
 * @returns {Promise<object|null>}
 */
export async function getExecution(executionId) {
  if (!hasSupabase()) return null;
  const { data, error } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('id', executionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * List executions for a workflow.
 * @param {string} workflowId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function listExecutions(workflowId, limit = 20) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('workflow_executions')
    .select('id, status, trigger_data, execution_path, error, started_at, completed_at, created_at')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Get step results for an execution.
 * @param {string} executionId
 * @returns {Promise<Array>}
 */
export async function getStepResults(executionId) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('workflow_step_results')
    .select('*')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Poll execution until it completes or fails.
 * @param {string} jobId - Agent job ID (from enqueue)
 * @param {function} onUpdate - Callback with execution data
 * @param {number} intervalMs - Poll interval
 * @param {number} timeoutMs - Max wait time
 */
export async function pollExecution(jobId, onUpdate, intervalMs = 2000, timeoutMs = 60000) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const start = Date.now();

  const poll = async () => {
    if (Date.now() - start > timeoutMs) {
      onUpdate({ status: 'timeout', error: 'Execution timed out' });
      return;
    }

    try {
      const res = await fetch(`/api/agent?path=status&id=${jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      onUpdate(data);

      if (data.status === 'done' || data.status === 'failed') return;

      setTimeout(poll, intervalMs);
    } catch {
      setTimeout(poll, intervalMs);
    }
  };

  poll();
}
