export const WORKFLOW_RESOURCE_AUTHORIZATION_ERROR = 'WORKFLOW_RESOURCE_AUTHORIZATION_ERROR';

function authorizationError(message) {
  const error = new Error(`${WORKFLOW_RESOURCE_AUTHORIZATION_ERROR}: ${message}`);
  error.code = WORKFLOW_RESOURCE_AUTHORIZATION_ERROR;
  return error;
}

export function requireWorkflowUserId(ctx) {
  const userId = typeof ctx?.userId === 'string' ? ctx.userId.trim() : '';
  if (!userId) throw authorizationError('ctx.userId is required');
  return userId;
}

function optionalReference(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw authorizationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function resolveWorkflowResourceId(configValue, inputValue, label) {
  const configured = optionalReference(configValue, `config.${label}`);
  const incoming = optionalReference(inputValue, `input.${label}`);
  if (configured && incoming && configured !== incoming) {
    throw authorizationError(`${label} references do not match`);
  }
  return incoming || configured || null;
}

async function loadOwnedReference(admin, table, id, userId, label) {
  const { data, error } = await admin
    .from(table)
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw authorizationError(`unable to authorize ${label}: ${error.message}`);
  if (!data || data.id !== id || data.user_id !== userId) {
    throw authorizationError(`${label} is not owned by ctx.userId`);
  }
  return data;
}

/**
 * Validate every optional tenant-backed reference before a node can read
 * limits or insert reports through the service-role client.
 */
export async function authorizeWorkflowResources(admin, userId, { agentId, boardId } = {}) {
  if (!admin) throw authorizationError('database is not configured');
  if (agentId) {
    await loadOwnedReference(admin, 'concilium_agents', agentId, userId, 'agent_id');
  }
  if (boardId) {
    await loadOwnedReference(admin, 'concilium', boardId, userId, 'board_id');
  }
  return { agentId: agentId || null, boardId: boardId || null };
}

export function workflowAuthorizationFailure(error) {
  return {
    output: {
      error: error?.message || `${WORKFLOW_RESOURCE_AUTHORIZATION_ERROR}: authorization failed`,
      code: WORKFLOW_RESOURCE_AUTHORIZATION_ERROR,
    },
    outputPort: 'error',
  };
}
