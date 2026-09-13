/**
 * Platform Copilot API service.
 *
 * Frontend client for the agentic copilot loop (POST /api/agent?path=copilot)
 * and the confirmation resolve path. The copilot reads live platform data,
 * answers, and returns proposedActions the user confirms via a button.
 */

const COPILOT_URL = '/api/agent?path=copilot';

async function postCopilot(body, token) {
  const res = await fetch(COPILOT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Run the copilot loop.
 * @returns {Promise<{ message, blocks, proposedActions, toolTrace, iterations, usage, cost, model, provider, capExceeded? }>}
 */
export async function copilotChat({ token, message, history, personality, provider, model, pageContext, attachments, orgId, conversationId } = {}) {
  return postCopilot(
    {
      action: 'copilot',
      message,
      history,
      personality,
      provider,
      model,
      pageContext,
      attachments,
      orgId,
      conversationId,
    },
    token
  );
}

/**
 * Approve or reject a confirmation-gated proposed action.
 * @returns {Promise<{ status, tool?, result?, blocks?, error? }>}
 */
export async function resolveCopilotAction({ token, pendingCallId, decision }) {
  return postCopilot({ action: 'resolve-action', pendingCallId, decision }, token);
}

export default copilotChat;
