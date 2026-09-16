/**
 * Bulk-materialize imported agent personas (e.g. from a GitHub library import)
 * into live Agent Hub agents: addAgent() -> batched seedProfiles() -> optional
 * concurrency-limited generateAvatar(). Chains existing per-agent primitives
 * instead of duplicating their logic.
 */
import { getAgents, addAgent } from './agentHubService';
import { seedProfiles, generateAvatar } from './agentProfileService';
import { registerAgentsInKb } from './knowledgeBaseService';
import { buildAgentProfile } from './agentProfileBuilder';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../config/assistantBrain';

const PHOTO_CONCURRENCY = 3;
// addAgent() upserts to Supabase fire-and-forget; give those writes a moment
// to land before seed-agent-profiles looks up the agents by role/name.
const PROFILE_SEED_DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/**
 * Derive an agent's origin ({ source, url, repo, path }) from an imported item's
 * source markers, or null if it has no source. Shared by the bulk materializer
 * and the single "Add" path so every activation route badges provenance.
 */
export function deriveImportedFrom(item) {
  if (!item?._source) return null;
  return {
    source: item._source, // e.g. 'github'
    url: item._url || null,
    repo:
      item._sourceName ||
      (typeof item._sourceId === 'string' ? item._sourceId.replace(/^github:/, '') : null),
    path: item._path || null,
  };
}

/**
 * @param {Array} items - imported persona items (shape from github-agents-import.js
 *   / marketplace import: { name, role, description, category, capabilities,
 *   cost_per_task, system_prompt, _persona? })
 * @param {object} options
 * @param {string} [options.provider] - explicit provider override
 * @param {string} [options.model] - explicit model override
 * @param {boolean} [options.generatePhotos=false]
 * @param {(event: object) => void} [options.onProgress]
 */
export async function materializeImportedAgents(
  items,
  {
    provider = DEFAULT_LLM_PROVIDER,
    model = DEFAULT_LLM_MODEL,
    generatePhotos = false,
    onProgress,
  } = {}
) {
  const list = Array.isArray(items) ? items : [];
  const existingRoles = new Set(getAgents().map((a) => a.role));
  const created = [];
  const skipped = [];

  for (const item of list) {
    if (!item?.role || existingRoles.has(item.role)) {
      skipped.push(item);
      onProgress?.({ type: 'skipped', item });
      continue;
    }
    // Preserve where this agent came from (e.g. a GitHub repo) so Agent Hub can
    // badge its origin.
    const importedFrom = deriveImportedFrom(item);
    const record = addAgent({
      role: item.role,
      description: item.description || '',
      capabilities: item.capabilities,
      connection_type: provider,
      provider,
      model,
      cost_per_task: item.cost_per_task || 0,
      category: item.category || null,
      system_prompt: item.system_prompt || '',
      availability_status: 'available',
      imported_from: importedFrom,
    });
    existingRoles.add(item.role);
    created.push({ record, item });
    onProgress?.({ type: 'created', item, record });
  }

  let profilesSeeded = 0;
  if (created.length) {
    await sleep(PROFILE_SEED_DELAY_MS);
    // Build a COMPLETE profile per agent (contact, comms style, backstory,
    // templates, behavior rules) so the card matches the predefined agents.
    const profiles = created.map(({ record, item }) =>
      buildAgentProfile({ ...item, role: record.role, name: item.name || record.role })
    );
    try {
      const result = await seedProfiles(profiles);
      profilesSeeded = Number(result?.seeded || 0);
      onProgress?.({ type: 'profiles-seeded', count: profilesSeeded, total: profiles.length });
    } catch (err) {
      onProgress?.({ type: 'profiles-error', error: err });
    }

    // Register each persona in the Knowledge Base (recall-able + shows in the
    // "agents in KB" view). Lookup is by role; the sleep above ensures the
    // agent rows already exist in Supabase.
    try {
      await registerAgentsInKb(
        created.map(({ record, item }) => ({
          role: record.role,
          title: item.name || record.role,
          content: item.system_prompt || record.system_prompt || '',
        }))
      );
      onProgress?.({ type: 'kb-registered', count: created.length });
    } catch (err) {
      onProgress?.({ type: 'kb-error', error: err });
    }
  }

  let photosGenerated = 0;
  let photoFailures = 0;
  if (generatePhotos && created.length) {
    await runWithConcurrency(created, PHOTO_CONCURRENCY, async ({ record, item }) => {
      try {
        await generateAvatar({
          agent_id: record.agent_id,
          display_name: item.name || record.role,
          job_title: record.role,
        });
        photosGenerated += 1;
        onProgress?.({ type: 'photo-done', item, record });
      } catch (err) {
        photoFailures += 1;
        onProgress?.({ type: 'photo-error', item, record, error: err });
      }
    });
  }

  return {
    createdCount: created.length,
    skippedCount: skipped.length,
    profilesSeeded,
    photosGenerated,
    photoFailures,
    created: created.map((c) => c.record),
    skipped,
  };
}
