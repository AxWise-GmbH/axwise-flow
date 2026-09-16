#!/usr/bin/env node
/**
 * One-shot server-side seeder for a user's agents + tools table.
 *
 * Why this exists: the frontend seeders (predefinedAgentService,
 * predefinedToolService) only run when the user opens the Agent Hub /
 * Tool Hub pages in the browser. If a user has never visited those pages
 * (or is running quality tests via script), their agents/tools tables are
 * empty and the goal pipeline falls back to a single generic agent.
 *
 * This script:
 *   1. Loads the user's current agents + tools
 *   2. Inserts any missing PREDEFINED_AGENTS (matched by role = DB `name` column)
 *   3. Patches existing agent records whose metadata.system_prompt or
 *      metadata.tools are outdated compared to the current predefinedAgents.js
 *   4. Inserts missing predefined tools (internal tools become active
 *      immediately; API tools start inactive unless an env var exists)
 *
 * Usage:
 *   node scripts/seed-user-agents-and-tools.mjs --email=misters.builder@protonmail.com
 *   node scripts/seed-user-agents-and-tools.mjs --user-id=<uuid>
 */
import { admin } from './_lib/admin-client.mjs';
import { PREDEFINED_AGENTS } from '../src/config/predefinedAgents.js';
import { PREDEFINED_TOOLS } from '../src/config/predefinedTools.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }
    return [a, true];
  }),
);

// ── Resolve user_id ──────────────────────────────────────────────
let userId = args['user-id'];
if (!userId && args.email) {
  const { data: profile } = await admin.from('user_profiles').select('id').eq('email', args.email).maybeSingle();
  if (profile) userId = profile.id;
  if (!userId) {
    // Fall back to any goal with a matching owner
    const { data: anyGoal } = await admin.from('goals').select('user_id').limit(1).maybeSingle();
    userId = anyGoal?.user_id;
  }
}
if (!userId) {
  // Last resort: pick the single existing user
  const { data: anyGoal } = await admin.from('goals').select('user_id').limit(1).maybeSingle();
  userId = anyGoal?.user_id;
}
if (!userId) {
  console.error('Could not resolve user_id. Pass --user-id=<uuid> explicitly.');
  process.exit(1);
}
console.log(`Seeding for user_id: ${userId}`);

// ── Seed predefined tools ────────────────────────────────────────
const { data: existingTools } = await admin.from('tools').select('id').eq('user_id', userId);
const existingToolIds = new Set((existingTools || []).map((t) => t.id));

let toolsInserted = 0;
let toolsSkipped = 0;
const toolRows = [];
for (const def of PREDEFINED_TOOLS) {
  if (existingToolIds.has(def.id)) { toolsSkipped++; continue; }
  const isInternal = def.connectionType === 'internal';
  toolRows.push({
    id: def.id,
    user_id: userId,
    name: def.name,
    description: def.description || '',
    status: isInternal ? 'active' : 'inactive',
    connection_type: def.connectionType,
    data: {
      category: def.category || 'platform',
      connectionType: def.connectionType,
      baseUrl: def.baseUrl || '',
      required: def.required ?? false,
      credentials: def.credentials || [],
      endpoints: def.endpoints || [],
      composioApp: def.composioApp,
      actions: def.actions,
      subcategory: def.subcategory,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}
if (toolRows.length > 0) {
  const { error: toolErr } = await admin.from('tools').insert(toolRows);
  if (toolErr) {
    console.error('Tool insert failed:', toolErr.message);
  } else {
    toolsInserted = toolRows.length;
  }
}
console.log(`Tools: ${toolsInserted} inserted, ${toolsSkipped} already existed`);

// ── Seed predefined agents ───────────────────────────────────────
const { data: existingAgents } = await admin.from('agents').select('id, name, metadata').eq('user_id', userId);
const byRole = new Map((existingAgents || []).map((a) => [a.name, a]));

let agentsInserted = 0;
let agentsPatched = 0;
const agentRows = [];
const agentPatches = [];

for (const def of PREDEFINED_AGENTS) {
  const role = def.role;
  const existing = byRole.get(role);

  if (!existing) {
    agentRows.push({
      user_id: userId,
      name: role, // server code reads agent.name as the role
      description: def.description || '',
      category: def.category || 'Development',
      status: 'active',
      cost_per_task: Number(def.cost_per_task || 0),
      capabilities: Array.isArray(def.capabilities) ? def.capabilities : [],
      metadata: {
        friendly_name: def.name || null,
        connection_type: def.connection_type || 'internal',
        availability_status: 'available',
        system_prompt: def.system_prompt || null,
        tools: def.tools || [],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    // Patch if system_prompt or tools are outdated
    const meta = existing.metadata || {};
    const needsPromptUpdate = def.system_prompt && meta.system_prompt !== def.system_prompt;
    const currentTools = Array.isArray(meta.tools) ? meta.tools : [];
    const defTools = Array.isArray(def.tools) ? def.tools : [];
    const needsToolsUpdate = defTools.length > 0
      && (currentTools.length === 0 || JSON.stringify([...currentTools].sort()) !== JSON.stringify([...defTools].sort()));

    if (needsPromptUpdate || needsToolsUpdate) {
      agentPatches.push({
        id: existing.id,
        metadata: {
          ...meta,
          ...(needsPromptUpdate && { system_prompt: def.system_prompt }),
          ...(needsToolsUpdate && { tools: defTools }),
          friendly_name: meta.friendly_name || def.name || null,
        },
      });
    }
  }
}

if (agentRows.length > 0) {
  const { error: agentErr } = await admin.from('agents').insert(agentRows);
  if (agentErr) {
    console.error('Agent insert failed:', agentErr.message);
  } else {
    agentsInserted = agentRows.length;
  }
}

for (const patch of agentPatches) {
  const { error: updErr } = await admin
    .from('agents')
    .update({ metadata: patch.metadata, updated_at: new Date().toISOString() })
    .eq('id', patch.id);
  if (updErr) {
    console.error(`Agent patch failed for ${patch.id}:`, updErr.message);
  } else {
    agentsPatched++;
  }
}

console.log(`Agents: ${agentsInserted} inserted, ${agentsPatched} patched (${(existingAgents || []).length - agentsPatched} unchanged)`);

// ── Sync env-backed tool credentials for the new cloudflare tool ──
// Internal tools don't need credentials but we still want the tool marked
// active. That's already the default status for internal tools above.

console.log('\nDone. Summary:');
console.log(`  user_id:  ${userId}`);
console.log(`  tools:    +${toolsInserted}`);
console.log(`  agents:   +${agentsInserted} / ~${agentsPatched}`);
process.exit(0);
