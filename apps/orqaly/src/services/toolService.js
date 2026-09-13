/**
 * Tool service — CRUD for system-defined tools (Data Hub, SMS Sendout, Mail Sendout).
 */
import * as toolBackend from './toolBackend';
import { maybeNotify } from './emailNotificationDispatcher';
import { saveEncryptedToolCredential } from './toolCredentialService';
import { stripPersistedCredentials } from './persistedCredentialSanitizer';

const TOOL_STATUSES = ['active', 'blocked', 'inactive'];
const CONNECTION_TYPES = ['api', 'internal', 'webhook', 'sdk', 'composio'];

const SEED_TOOLS = [
  {
    name: 'Data Hub',
    description: 'Central data management and processing hub',
    status: 'active',
    connectionType: 'internal',
    usedBy: [],
  },
  {
    name: 'SMS Sendout',
    description: 'Bulk SMS sending and campaign management',
    status: 'active',
    connectionType: 'api',
    usedBy: [],
  },
  {
    name: 'Mail Sendout',
    description: 'Email campaign delivery and tracking',
    status: 'active',
    connectionType: 'api',
    usedBy: [],
  },
];

function generateId() {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildTool(data) {
  return stripPersistedCredentials({
    id: data.id || generateId(),
    name: data.name || 'Untitled Tool',
    description: data.description || '',
    status: TOOL_STATUSES.includes(data.status) ? data.status : 'active',
    connectionType: CONNECTION_TYPES.includes(data.connectionType)
      ? data.connectionType
      : 'internal',
    category: data.category || null,
    subcategory: data.subcategory || null,
    composioApp: data.composioApp || null,
    url: data.url || '',
    usedBy: Array.isArray(data.usedBy) ? data.usedBy : [],
    // API fields (credentials are persisted separately in Vault)
    apiHeaders: data.apiHeaders || '',
    apiMethod: data.apiMethod || 'POST',
    // Webhook fields (the signing secret is persisted separately in Vault)
    webhookEvents: data.webhookEvents || '',
    // SDK fields
    sdkPackage: data.sdkPackage || '',
    sdkVersion: data.sdkVersion || '',
    sdkConfig: data.sdkConfig || '',
    // Internal fields
    modulePath: data.modulePath || '',
    entryFunction: data.entryFunction || '',
    createdBy: data.createdBy || 'System',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ── Public API ────────────────────────────────────────────────
export const TOOL_STATUSES_LIST = TOOL_STATUSES;
export const TOOL_CONNECTION_TYPES = CONNECTION_TYPES;

export { buildTool };

export async function createTool(data, agentContext = null) {
  const tool = buildTool(data);
  await toolBackend.createTool(tool, agentContext);
  const savedCredential = await saveEncryptedToolCredential(tool.id, {
    apiKey: data.apiKey,
    webhookSecret: data.webhookSecret,
  });
  if (savedCredential) tool.credentialConfigured = true;
  maybeNotify('tool_created', { name: tool.name });
  return tool;
}

export async function getAllTools() {
  let tools = await toolBackend.loadTools();
  // Seed if empty — creates the 3 default tools on first load
  if (tools.length === 0) {
    for (const seed of SEED_TOOLS) {
      const tool = buildTool(seed);
      await toolBackend.createTool(tool);
      tools.push(tool);
    }
  }
  return tools;
}

export async function getToolById(id) {
  const list = await toolBackend.loadTools();
  return list.find((t) => t.id === id) || null;
}

export async function updateTool(id, data, agentContext = null) {
  const list = await toolBackend.loadTools();
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = stripPersistedCredentials({
    ...existing,
    name: data.name !== undefined ? data.name : existing.name,
    description: data.description !== undefined ? data.description : existing.description,
    status: data.status !== undefined ? data.status : existing.status,
    connectionType:
      data.connectionType !== undefined ? data.connectionType : existing.connectionType,
    category: data.category !== undefined ? data.category : existing.category || null,
    subcategory: data.subcategory !== undefined ? data.subcategory : existing.subcategory || null,
    composioApp: data.composioApp !== undefined ? data.composioApp : existing.composioApp || null,
    url: data.url !== undefined ? data.url : existing.url || '',
    usedBy: data.usedBy !== undefined ? data.usedBy : existing.usedBy || [],
    // API fields (credentials are persisted separately in Vault)
    apiHeaders: data.apiHeaders !== undefined ? data.apiHeaders : existing.apiHeaders || '',
    apiMethod: data.apiMethod !== undefined ? data.apiMethod : existing.apiMethod || 'POST',
    // Webhook fields (the signing secret is persisted separately in Vault)
    webhookEvents:
      data.webhookEvents !== undefined ? data.webhookEvents : existing.webhookEvents || '',
    // SDK fields
    sdkPackage: data.sdkPackage !== undefined ? data.sdkPackage : existing.sdkPackage || '',
    sdkVersion: data.sdkVersion !== undefined ? data.sdkVersion : existing.sdkVersion || '',
    sdkConfig: data.sdkConfig !== undefined ? data.sdkConfig : existing.sdkConfig || '',
    // Internal fields
    modulePath: data.modulePath !== undefined ? data.modulePath : existing.modulePath || '',
    entryFunction:
      data.entryFunction !== undefined ? data.entryFunction : existing.entryFunction || '',
    updatedAt: new Date().toISOString(),
  });
  await toolBackend.updateToolById(id, updated, agentContext);
  const savedCredential = await saveEncryptedToolCredential(id, {
    apiKey: data.apiKey,
    webhookSecret: data.webhookSecret,
  });
  if (savedCredential) updated.credentialConfigured = true;
  maybeNotify('tool_updated', { name: updated.name });
  return updated;
}

export async function deleteTool(id, agentContext = null) {
  await toolBackend.deleteToolById(id, agentContext);
  maybeNotify('tool_deleted', { id });
  return true;
}

export async function blockTool(id, agentContext = null) {
  const tool = await getToolById(id);
  if (!tool) return null;
  const newStatus = tool.status === 'blocked' ? 'active' : 'blocked';
  return updateTool(id, { status: newStatus }, agentContext);
}

/**
 * Fetch tool whitelist entries for risk level display.
 * Returns [{tool_id, risk_level, requires_approval}].
 */
export async function getToolWhitelist() {
  const { supabase, hasSupabase } = await import('../lib/supabase');
  if (!hasSupabase() || !supabase) return [];
  const { data, error } = await supabase
    .from('agent_tool_whitelist')
    .select('tool_id, risk_level, requires_approval')
    .eq('is_active', true);
  if (error) return [];
  return data || [];
}
