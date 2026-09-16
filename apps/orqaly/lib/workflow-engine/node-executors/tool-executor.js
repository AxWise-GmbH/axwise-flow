/**
 * Tool node executor — invokes a registered tool from the tools table.
 * Wraps the existing api-executor and webhook-executor.
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { executeApiTool } from '../../tool-executors/api-executor.js';
import { executeWebhookTool } from '../../tool-executors/webhook-executor.js';

/**
 * @param {object} config - { toolId: string, payload?: object }
 * @param {object} inputData - Data from upstream nodes
 * @param {import('../execution-context.js').ExecutionContext} ctx
 */
export async function executeToolNode(config, inputData, ctx) {
  const toolId = config.toolId;
  if (!toolId) throw new Error('Tool node: toolId is required');

  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('Tool node: database not configured');

  // Load tool from DB (scoped to workflow owner — mandatory)
  const userId = ctx?.userId;
  if (!userId) throw new Error('Tool node: userId is required for tool access');
  const query = admin.from('tools').select('*').eq('id', toolId).eq('user_id', userId);
  const { data: toolRow, error } = await query.maybeSingle();

  if (error) throw new Error(error.message || 'Failed to load tool');
  if (!toolRow) throw new Error(`Tool not found or not owned by user: ${toolId}`);

  // Spread JSONB data into tool object (same pattern as execute-tool.js)
  const tool = { ...toolRow, ...(toolRow.data || {}) };
  const payload = config.payload || inputData || {};

  let result;

  switch (tool.connection_type) {
    case 'api':
      result = await executeApiTool(tool, { payload, timeoutMs: 10000 });
      break;
    case 'webhook':
      result = await executeWebhookTool(tool, { payload, timeoutMs: 10000 });
      break;
    case 'internal':
    case 'sdk':
      // Internal/SDK tools are not remotely executable in serverless
      result = { status: 200, body: { message: `Internal tool ${toolId} invoked`, payload } };
      break;
    default:
      throw new Error(`Unsupported tool connection type: ${tool.connection_type}`);
  }

  return {
    output: {
      toolId,
      toolName: tool.name,
      connectionType: tool.connection_type,
      status: result.status,
      body: result.body,
      durationMs: result.durationMs || 0,
    },
    outputPort: 'out',
  };
}
