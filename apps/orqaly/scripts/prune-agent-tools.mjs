#!/usr/bin/env node
/**
 * Remove tool ids from agents' `metadata.tools`, filtered by provenance.
 *
 * Why: the tool scout assigned tools before it knew to withhold write-capable
 * ones from third-party agents. This fixes the rows already written; the scout
 * itself now refuses to hand them out again (agent-tool-scout.js WRITE_TOOLS),
 * so a re-run cannot undo this.
 *
 * What it does NOT touch: agents the user wrote themselves. Provenance comes
 * from `metadata.imported_from`, set by scripts/import-github-agents.mjs.
 *
 * Usage:
 *   node scripts/prune-agent-tools.mjs --email=someone@example.com \
 *     --remove=tool-github,tool-email,tool-vercel [--only-imported] [--dry-run]
 */
import { pathToFileURL } from 'node:url';
import { admin } from './_lib/admin-client.mjs';

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      if (!a.startsWith('--')) return [a, true];
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }),
  );
}

/**
 * @returns {{ next: string[], removed: string[] } | null} null when nothing changes,
 * so callers can skip the write entirely.
 */
export function pruneTools(agent, remove) {
  const current = Array.isArray(agent?.metadata?.tools) ? agent.metadata.tools : [];
  const next = current.filter((id) => !remove.has(id));
  if (next.length === current.length) return null;
  return { next, removed: current.filter((id) => remove.has(id)) };
}

export function isImported(agent) {
  return Boolean(agent?.metadata?.imported_from);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = Boolean(args['dry-run']);
  const onlyImported = Boolean(args['only-imported']);
  const remove = new Set(
    String(args.remove || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  if (!args.email || !remove.size) {
    console.error('Usage: node scripts/prune-agent-tools.mjs --email=<email> --remove=id1,id2 [--only-imported] [--dry-run]');
    process.exit(1);
  }

  const { data: userList, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (userErr) {
    console.error(`Could not list users: ${userErr.message}`);
    process.exit(1);
  }
  const user = userList.users.find((u) => u.email?.toLowerCase() === String(args.email).toLowerCase());
  if (!user) {
    console.error(`No user with email ${args.email}`);
    process.exit(1);
  }

  const { data: agents, error } = await admin
    .from('agents')
    .select('id, name, metadata')
    .eq('user_id', user.id);
  if (error) {
    console.error(`Could not load agents: ${error.message}`);
    process.exit(1);
  }

  const scope = onlyImported ? (agents || []).filter(isImported) : agents || [];
  console.log(`Target : ${user.email}`);
  console.log(`Scope  : ${scope.length} agents${onlyImported ? ' (third-party only)' : ''} of ${agents.length} total`);
  console.log(`Remove : ${[...remove].join(', ')}\n`);

  // Before: how many hold each id, so the after-count is checkable.
  for (const id of remove) {
    const n = scope.filter((a) => (a.metadata?.tools || []).includes(id)).length;
    console.log(`  before: ${String(n).padStart(4)} agents hold ${id}`);
  }
  console.log('');

  let changed = 0;
  let failed = 0;
  for (const agent of scope) {
    const result = pruneTools(agent, remove);
    if (!result) continue;

    if (!dryRun) {
      // Spread the existing metadata: only `tools` changes. system_prompt,
      // imported_from, provider and the rest must survive untouched.
      const { error: updErr } = await admin
        .from('agents')
        .update({
          metadata: { ...(agent.metadata || {}), tools: result.next },
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id)
        .eq('user_id', user.id);
      if (updErr) {
        failed += 1;
        console.log(`  FAILED ${agent.name}: ${updErr.message.slice(0, 60)}`);
        continue;
      }
    }
    changed += 1;
    if (changed <= 10) console.log(`  ${agent.name.padEnd(36)} -${result.removed.join(', ')}`);
  }
  if (changed > 10) console.log(`  ... and ${changed - 10} more`);

  console.log(`\n${dryRun ? 'Would change' : 'Changed'}: ${changed}   failed: ${failed}`);
  if (dryRun) console.log('Dry run - nothing written.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
