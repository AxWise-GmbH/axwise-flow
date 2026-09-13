/**
 * Pure context builders: shape LOCAL Orqaly facts into an AxWise
 * EvaluationContext. No cognition here - these functions must not decide
 * anything, only assemble the payload the conditions engine will reason over.
 *
 * Each builder takes { requestId, tenant, ...facts } and returns a full
 * EvaluationContext. Callers own requestId (UUID) and tenant ({ userId, orgId }).
 */

/**
 * @param {{ requestId: string, tenant: object, board: { name?: string, purpose?: string, description?: string, security_level?: string } }} args
 * @returns {import('./types.js').EvaluationContext}
 */
export function buildConsiliumCreateContext({ requestId, tenant, board = {} }) {
  return {
    integrationPoint: 'consilium.create',
    requestId,
    tenant,
    payload: {
      name: board.name || '',
      purpose: board.purpose || '',
      description: board.description || '',
      security_level: board.security_level || 'standard',
    },
  };
}

/**
 * @param {{ requestId: string, tenant: object, config: object, boardId?: string|null, requestContext?: object|null }} args
 * @returns {import('./types.js').EvaluationContext}
 */
export function buildAgentGenerateContext({ requestId, tenant, config = {}, boardId = null, requestContext = null }) {
  return {
    integrationPoint: 'agent.generate',
    requestId,
    tenant,
    payload: {
      config: {
        name: config.name || '',
        system_prompt: config.system_prompt || '',
        tools: Array.isArray(config.tools) ? config.tools : [],
        provider: config.provider || null,
        model: config.model || null,
      },
      board_id: boardId,
      requestContext,
    },
  };
}

/**
 * @param {{ requestId: string, tenant: object, message: string, history?: any[], pageContext?: object, toolCatalog?: any[], activeTwinId?: string }} args
 * @returns {import('./types.js').EvaluationContext}
 */
export function buildCopilotContext({ requestId, tenant, message, history = [], pageContext = null, toolCatalog = null, activeTwinId = null }) {
  return {
    integrationPoint: 'copilot.chat',
    requestId,
    tenant,
    payload: {
      message: message || '',
      history: Array.isArray(history) ? history.slice(-12) : [],
      pageContext,
      toolCatalog,
      active_twin_id: activeTwinId,
    },
  };
}

/**
 * Post-hoc grounding of the assistant's DRAFT answer against retrieved sources.
 *
 * @param {{ requestId: string, tenant: object, draftAnswer: string, sources?: any[] }} args
 * @returns {import('./types.js').EvaluationContext}
 */
export function buildCopilotGroundContext({ requestId, tenant, draftAnswer, sources = [] }) {
  return {
    integrationPoint: 'copilot.ground',
    requestId,
    tenant,
    payload: {
      draft_response: draftAnswer || '',
      grounded_resources: Array.isArray(sources) ? sources : [],
    },
  };
}
