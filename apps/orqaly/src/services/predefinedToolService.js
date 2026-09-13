/**
 * Predefined tool seeding service.
 *
 * Seeds agent tools into the tools table on first load.
 * Internal tools (doc-generator, http-client) are active immediately.
 * API tools start inactive until credentials are configured.
 */
import { PREDEFINED_TOOLS } from '../config/predefinedTools';
import { createTool, updateTool, getAllTools } from './toolService';

// Bump the version suffix whenever a new platform tool is added to
// PREDEFINED_TOOLS so that existing users (with the old flag set to true)
// re-run the seeder and pick up the new entry. The incremental logic in
// processDef() prevents duplicates for tools already present.
const LOADED_KEY = 'orch_predefined_tools_loaded_v2';
const MCP_LOADED_KEY = 'orch_mcp_tools_v3';

export function hasLoadedPredefinedTools() {
  try {
    return localStorage.getItem(LOADED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if MCP tools actually exist in the DB (not just the flag).
 * Clears the flag if the DB has no composio tools so re-seeding triggers.
 */
async function verifyMcpToolsExist(tools) {
  const hasComposio = tools.some((t) => t.connectionType === 'composio');
  if (hasComposio) return true;
  try {
    localStorage.removeItem(MCP_LOADED_KEY);
  } catch {}
  return false;
}

/** Seed a single predefined tool definition into the DB. */
async function seedTool(def) {
  const isInternal = def.connectionType === 'internal';
  return createTool({
    id: def.id,
    name: def.name,
    description: def.description,
    status: isInternal ? 'active' : 'inactive',
    connectionType: def.connectionType,
    category: def.category || 'platform',
    composioApp: def.composioApp || undefined,
    subcategory: def.subcategory || undefined,
    usedBy: [],
    baseUrl: def.baseUrl || '',
    required: def.required ?? false,
    credentials: def.credentials || [],
    endpoints: def.endpoints || [],
  });
}

/** Repair an MCP tool that was seeded with wrong connectionType. */
async function repairMcpTool(def) {
  return updateTool(def.id, {
    connectionType: 'composio',
    category: 'mcp',
    composioApp: def.composioApp || undefined,
    subcategory: def.subcategory || undefined,
  });
}

/** Decide whether a definition should be processed given current flags. */
function shouldProcess(def, platformDone, mcpDone) {
  if (platformDone && def.category !== 'mcp') return false;
  if (mcpDone && def.category === 'mcp') return false;
  return true;
}

/** Process a single tool definition: repair, skip, or create. */
async function processDef(def, existingMap) {
  const prev = existingMap.get(def.id);
  if (prev && def.category === 'mcp' && prev.connectionType !== 'composio') {
    await repairMcpTool(def);
    return null;
  }
  if (prev) return null;
  return seedTool(def);
}

/**
 * Seed all predefined tools into the tools table.
 * Skips tools that already exist (matched by id).
 * Only runs once (flag-guarded via localStorage).
 * Self-heals: if the flag is set but no composio tools exist, re-seeds MCP.
 */
export async function loadPredefinedTools() {
  const platformDone = hasLoadedPredefinedTools();
  let mcpDone = hasMcpToolsLoaded();

  const existing = await getAllTools();
  const existingMap = new Map(existing.map((t) => [t.id, t]));

  // Self-heal: flag says done but DB has no composio tools → re-seed
  if (mcpDone && !(await verifyMcpToolsExist(existing))) {
    mcpDone = false;
  }

  // Always seed missing MCP entries (new catalog additions)
  if (platformDone && mcpDone) {
    const mcpDefs = PREDEFINED_TOOLS.filter((d) => d.category === 'mcp');
    const missing = mcpDefs.filter((d) => !existingMap.has(d.id));
    if (missing.length === 0) return { tools: [] };
    const created = [];
    for (const def of missing) {
      const tool = await seedTool(def);
      if (tool) created.push(tool);
    }
    return { tools: created };
  }

  const created = [];
  for (const def of PREDEFINED_TOOLS) {
    if (!shouldProcess(def, platformDone, mcpDone)) continue;
    const tool = await processDef(def, existingMap);
    if (tool) created.push(tool);
  }

  try {
    if (!platformDone) localStorage.setItem(LOADED_KEY, 'true');
    if (!mcpDone) localStorage.setItem(MCP_LOADED_KEY, 'true');
  } catch {}

  return { tools: created };
}

export function hasMcpToolsLoaded() {
  try {
    return localStorage.getItem(MCP_LOADED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Reset the loaded flag so tools can be re-seeded.
 */
export function resetPredefinedToolsFlag() {
  try {
    localStorage.removeItem(LOADED_KEY);
    localStorage.removeItem(MCP_LOADED_KEY);
  } catch {}
}
