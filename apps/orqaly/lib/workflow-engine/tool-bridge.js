/**
 * Tool Bridge — unified interface for invoking tools.
 * Wraps existing executors and can format tools as LLM function schemas.
 */
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeApiTool } from '../tool-executors/api-executor.js';
import { executeWebhookTool } from '../tool-executors/webhook-executor.js';

/**
 * Execute a tool by ID.
 *
 * @param {string} toolId - Tool ID from the tools table
 * @param {object} input - Input data for the tool
 * @param {string} userId - For RLS scoping
 * @returns {Promise<object>} Tool execution result
 */
export async function invokeTool(toolId, input, userId) {
  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('Database not configured');

  const { data: toolRow, error } = await admin
    .from('tools')
    .select('*')
    .eq('id', toolId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load tool');
  if (!toolRow) throw new Error(`Tool not found or not owned by user: ${toolId}`);

  const tool = { ...toolRow, ...(toolRow.data || {}) };

  switch (tool.connection_type) {
    case 'api':
      return executeApiTool(tool, { payload: input, timeoutMs: 10000 });
    case 'webhook':
      return executeWebhookTool(tool, { payload: input, timeoutMs: 10000 });
    default:
      return { status: 200, body: { message: `Tool ${toolId} invoked`, input } };
  }
}

/**
 * Load user's tools and format as LLM function definitions.
 * Used when an LLM node has tools attached for function calling.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ name: string, description: string, parameters: object }>>}
 */
export async function getToolsAsLlmFunctions(userId) {
  const admin = buildSupabaseAdminClient();
  if (!admin) return [];

  const { data: tools, error } = await admin
    .from('tools')
    .select('id, name, description, connection_type, data')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !tools) return [];

  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.id,
      description: t.description || t.name || t.id,
      parameters: {
        type: 'object',
        properties: {
          payload: {
            type: 'object',
            description: 'Input data for the tool',
          },
        },
      },
    },
  }));
}
