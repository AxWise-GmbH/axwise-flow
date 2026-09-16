#!/usr/bin/env node
/**
 * Bulk-run the tool scout over a user's agents.
 *
 * Why a script: /api/concilium?path=agent-tool-scout is the product surface, but it
 * needs a browser session and caps each request at 25 agents (serverless timeout).
 * For a one-off pass over hundreds of imported agents, drive it from the CLI.
 *
 * Reuses the handler's own prompt/validation helpers so the two cannot drift —
 * only auth and batching differ.
 *
 * Usage:
 *   node scripts/scout-agent-tools.mjs --email=someone@example.com [--dry-run]
 *     [--limit=N] [--provider=deepseek] [--model=deepseek-chat] [--only-imported]
 */
import { pathToFileURL } from 'node:url';
import { admin } from './_lib/admin-client.mjs';
import { buildScoutPrompt, validatePicks } from '../lib/concilium-handlers/agent-tool-scout.js';
import { executeLlmV2 } from '../lib/concilium-handlers/llm-executor-v2.js';
import { parseLlmJson } from '../lib/agent-handlers/llm-executor.js';
import { defaultProvider, defaultModel } from '../lib/_shared/llm-defaults.js';

const SYSTEM_PROMPT =
  'You match AI agents to the tools they need. You answer with JSON only, choosing exclusively from the supplied tool ids.';

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      if (!a.startsWith('--')) return [a, true];
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
  );
}

export async function scoutOne(agent, { provider, model }) {
  const result = await executeLlmV2({
    prompt: buildScoutPrompt(agent),
    systemPrompt: SYSTEM_PROMPT,
    provider,
    model,
    temperature: 0.2,
    maxTokens: 400,
    jsonMode: true,
    // The caller named a provider; honour it. Without this a failure silently
    // cascades down the fallback chain and the run reports picks from a model
    // you did not choose (or burns four dead providers per agent).
    pinnedProvider: true,
  });
  const json = parseLlmJson(result?.content) || {};
  return {
    picked: validatePicks(json.tool_ids),
    reason: typeof json.reason === 'string' ? json.reason : '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args['dry-run']);
  // The catalog default is glm-5.1, but override freely: if the platform's GLM key
  // is dead, every call burns the whole fallback chain before it lands.
  const provider = args.provider || defaultProvider();
  const model = args.model || (args.provider ? undefined : defaultModel());

  if (!args.email) {
    console.error(
      'Usage: node scripts/scout-agent-tools.mjs --email=<email> [--dry-run] [--limit=N] [--provider=x] [--model=y]'
    );
    process.exit(1);
  }

  const { data: userList, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) {
    console.error(`Could not list users: ${userErr.message}`);
    process.exit(1);
  }
  const user = userList.users.find(
    (u) => u.email?.toLowerCase() === String(args.email).toLowerCase()
  );
  if (!user) {
    console.error(`No user with email ${args.email}`);
    process.exit(1);
  }

  let query = admin
    .from('agents')
    .select('id, name, description, category, metadata')
    .eq('user_id', user.id)
    .eq('status', 'active');
  if (args['only-imported']) query = query.eq('metadata->added_by->>email', 'github-import');

  const { data: agents, error } = await query;
  if (error) {
    console.error(`Could not load agents: ${error.message}`);
    process.exit(1);
  }

  const untooled = (agents || []).filter((a) => !(a.metadata?.tools || []).length);
  const todo = args.limit ? untooled.slice(0, Number(args.limit)) : untooled;

  console.log(`Target: ${user.email}`);
  console.log(`Agents without tools: ${untooled.length} (of ${agents.length} active)`);
  // Never let a capped run read as full coverage.
  if (todo.length < untooled.length) {
    console.log(
      `Scouting ${todo.length} of them (--limit=${args.limit}); ${untooled.length - todo.length} left untouched`
    );
  }
  console.log(`Model: ${provider}/${model}${dryRun ? '  [DRY RUN]' : ''}\n`);

  let updated = 0;
  let failed = 0;
  const noCredYet = new Map();

  for (const [i, agent] of todo.entries()) {
    let picked = [];
    try {
      ({ picked } = await scoutOne(agent, { provider, model }));
    } catch (err) {
      failed += 1;
      console.log(
        `  ${String(i + 1).padStart(3)}. ${agent.name.padEnd(34)} LLM FAILED: ${err.message.slice(0, 60)}`
      );
      continue;
    }

    if (!picked.length) {
      failed += 1;
      console.log(`  ${String(i + 1).padStart(3)}. ${agent.name.padEnd(34)} (no valid picks)`);
      continue;
    }
    for (const id of picked) noCredYet.set(id, (noCredYet.get(id) || 0) + 1);

    if (!dryRun) {
      const { error: updErr } = await admin
        .from('agents')
        .update({
          metadata: { ...(agent.metadata || {}), tools: picked },
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id)
        .eq('user_id', user.id);
      if (updErr) {
        failed += 1;
        console.log(
          `  ${String(i + 1).padStart(3)}. ${agent.name.padEnd(34)} DB FAILED: ${updErr.message.slice(0, 50)}`
        );
        continue;
      }
    }
    updated += 1;
    console.log(`  ${String(i + 1).padStart(3)}. ${agent.name.padEnd(34)} ${picked.join(', ')}`);
  }

  console.log(`\n${dryRun ? 'Would update' : 'Updated'}: ${updated}   failed: ${failed}`);
  console.log('\nMost-wanted tools across these agents (connect these first):');
  for (const [id, n] of [...noCredYet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(4)}x  ${id}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
