/**
 * Domain tool executor — calls domain-tools handler from within a workflow.
 *
 * Config: { tool_id, params, tracking_token? }
 * Input: merged into params
 * Output: tool result data
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { enforceAgentToolScope, resolveAgentFromToken } from '../../concilium-handlers/agent-config-validator.js';

const log = createLogger('domain-tool-executor');

export async function executeDomainTool(config, inputData, ctx) {
  const toolId = config.tool_id || inputData?.tool_id;
  if (!toolId) {
    return { output: { error: 'tool_id is required in config' }, outputPort: 'error' };
  }

  const params = { ...(config.params || {}), ...(inputData || {}) };
  delete params.tool_id; // Don't pass tool_id as a param

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return { output: { error: 'Database not configured' }, outputPort: 'error' };
  }

  // If agent context, enforce scope
  const trackingToken = config.tracking_token || ctx?.trackingToken;
  let userId = ctx?.userId;
  let agentId = null;

  if (trackingToken) {
    const { agent } = await resolveAgentFromToken(admin, trackingToken);
    if (agent) {
      agentId = agent.id;
      userId = agent.user_id;
      const scope = await enforceAgentToolScope(admin, agentId, toolId);
      if (!scope.allowed) {
        return { output: { error: scope.reason }, outputPort: 'error' };
      }
    }
  }

  // Import and call the tool handler logic directly
  // We replicate the core tool dispatch here to avoid HTTP round-trips
  try {
    const domainTools = await import('../../concilium-handlers/domain-tools.js');
    // Create a mock req/res to call the handler
    const mockRes = {
      _status: 200,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; return this; },
      setHeader() {},
      end() {},
    };
    const mockReq = {
      method: 'POST',
      headers: {},
      query: { path: 'domain-tools' },
      body: { tool_id: toolId, params },
    };

    if (trackingToken) {
      mockReq.headers['x-tracking-token'] = trackingToken;
    } else if (ctx?.token) {
      mockReq.headers.authorization = `Bearer ${ctx.token}`;
    }

    await domainTools.default(mockReq, mockRes);

    if (mockRes._status >= 400) {
      return { output: { error: mockRes._body?.error || 'Tool call failed', status: mockRes._status }, outputPort: 'error' };
    }

    return { output: mockRes._body || {}, outputPort: 'out' };
  } catch (err) {
    log.warn(null, 'domain_tool_executor.error', { toolId, error: err.message });
    return { output: { error: err.message }, outputPort: 'error' };
  }
}
