/**
 * [module: connection-hub]
 * Resolve a pending (confirmation-gated) tool call.
 *
 * Shared by the copilot HTTP resolve path and (potentially) the Telegram
 * callback-dispatcher. Loads the pending_tool_calls row user-scoped, enforces
 * the 10-minute TTL, and — on approve — claims the row atomically before
 * executing so a call can never be run twice.
 */
import { executeToolCall } from './assistant-bridge.js';
import { extractBlocks } from './chat-blocks-extractor.js';

/**
 * @param {object} admin Supabase admin client
 * @param {string} userId Authenticated user id (scopes the lookup)
 * @param {string} pendingCallId
 * @param {'approve'|'reject'} decision
 * @returns {Promise<{status, tool?, result?, blocks?, resolution?, error?}>}
 */
export async function resolvePendingToolCall(admin, userId, pendingCallId, decision) {
  if (!pendingCallId) return { status: 'invalid', error: 'pendingCallId is required' };

  const { data: pending } = await admin
    .from('pending_tool_calls')
    .select('*')
    .eq('id', pendingCallId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!pending) return { status: 'not_found', error: 'Pending action not found' };
  if (pending.resolved_at) return { status: 'already_resolved', resolution: pending.resolution };

  if (new Date(pending.expires_at) < new Date()) {
    await admin
      .from('pending_tool_calls')
      .update({ resolved_at: new Date().toISOString(), resolution: 'expired' })
      .eq('id', pendingCallId)
      .eq('user_id', userId);
    return { status: 'expired' };
  }

  if (decision === 'reject') {
    await admin
      .from('pending_tool_calls')
      .update({ resolved_at: new Date().toISOString(), resolution: 'rejected' })
      .eq('id', pendingCallId)
      .eq('user_id', userId);
    return { status: 'rejected', tool: pending.tool };
  }

  // Approve: claim the row atomically (only if still unresolved) to prevent
  // a double-execute race, THEN run the tool.
  const { data: claimed } = await admin
    .from('pending_tool_calls')
    .update({ resolved_at: new Date().toISOString(), resolution: 'approved' })
    .eq('id', pendingCallId)
    .eq('user_id', userId)
    .is('resolved_at', null)
    .select('id')
    .maybeSingle();

  if (!claimed) return { status: 'already_resolved' };

  try {
    const result = await executeToolCall(admin, userId, pending.tool, pending.args || {});
    const blocks = extractBlocks(pending.tool, pending.args || {}, result) || [];
    return { status: 'approved', tool: pending.tool, result, blocks };
  } catch (err) {
    return { status: 'error', tool: pending.tool, error: err.message };
  }
}

export default resolvePendingToolCall;
