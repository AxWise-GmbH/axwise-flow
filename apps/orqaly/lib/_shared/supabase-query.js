/**
 * Await a Supabase/PostgREST query whose failure must not block the primary
 * workflow.
 *
 * Supabase query builders are thenables, but they are not guaranteed to expose
 * Promise.prototype.catch(). Always await them inside try/catch instead of
 * chaining `.catch()` directly on the builder.
 */
import { isJobLeaseLostError } from '../agent-handlers/job-lease-runtime.js';

export async function runBestEffortSupabaseQuery(query, { onError } = {}) {
  try {
    const result = await query;
    if (result?.error) onError?.(result.error);
    return result;
  } catch (error) {
    if (isJobLeaseLostError(error)) throw error;
    onError?.(error);
    return { data: null, error };
  }
}
