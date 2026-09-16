#!/usr/bin/env node
/**
 * One-shot: remove platform secrets that the (now-deleted) seed-tool-credentials
 * endpoint copied out of the server's .env and into per-user `tools.data.apiKey`
 * rows as plaintext.
 *
 * Why this exists: Agent Hub auto-called that endpoint on first load per device.
 * It read process.env.<TOOL_KEY> server-side and wrote the value into the
 * requesting user's tools rows. The result is the platform's own credentials
 * (GITHUB_TOKEN, RESEND_API_KEY, TAVILY_API_KEY, ...) sitting unencrypted in a
 * user-owned DB column, readable by anything that selects that row, with no
 * gate and no audit trail.
 *
 * A row is only purged when its apiKey is BYTE-IDENTICAL to a value in the local
 * .env file - that is what proves it was laundered rather than typed in by the
 * user as their own BYOK credential. Anything we cannot prove is platform-owned
 * is left alone.
 *
 * This does NOT un-expose the secrets. Rotate every key it reports.
 *
 * Usage:
 *   node scripts/purge-laundered-tool-keys.mjs [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { admin } from './_lib/admin-client.mjs';
import { stripPersistedCredentials } from '../lib/security/persisted-credential-sanitizer.js';

export function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || '').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (value) out[m[1]] = value;
  }
  return out;
}

/**
 * Match a row's credential against the platform env by VALUE. Returns the env var
 * name it came from, or null when the key is not provably platform-owned.
 */
export function launderedFrom(row, env) {
  const key = row?.data?.apiKey || row?.data?.api_key;
  if (!key) return null;
  const hit = Object.entries(env).find(([, v]) => v === key);
  return hit ? hit[0] : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const envPath = ['.env.local', '.env'].map((f) => resolve(process.cwd(), f)).find(existsSync);
  if (!envPath) {
    console.error('No .env.local or .env found; cannot prove which keys are platform-owned.');
    process.exit(1);
  }
  const env = parseEnvFile(readFileSync(envPath, 'utf8'));
  console.log(`Comparing against ${envPath} (${Object.keys(env).length} vars)\n`);

  const { data: rows, error } = await admin.from('tools').select('id, user_id, name, data');
  if (error) {
    console.error(`Could not read tools: ${error.message}`);
    process.exit(1);
  }

  const hits = [];
  for (const row of rows || []) {
    const envVar = launderedFrom(row, env);
    if (envVar) hits.push({ row, envVar });
  }

  if (!hits.length) {
    console.log('No laundered platform keys found. Nothing to do.');
    return;
  }

  console.log(`Found ${hits.length} tool row(s) holding a platform secret:\n`);
  for (const { row, envVar } of hits) {
    console.log(`  ${row.id.padEnd(24)} owner ${String(row.user_id).slice(0, 8)}  <- ${envVar}`);
  }
  console.log('');

  if (dryRun) {
    console.log('Dry run - nothing written.');
    return;
  }

  let purged = 0;
  for (const { row } of hits) {
    // Strip only the credential; keep the rest of `data` and the row itself, which
    // is the user's own tool configuration.
    const rest = stripPersistedCredentials(row.data || {});
    const { error: updErr } = await admin
      .from('tools')
      .update({ data: rest, status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updErr) {
      console.error(`  FAILED ${row.id}: ${updErr.message}`);
      continue;
    }
    purged += 1;
  }

  console.log(`Purged ${purged}/${hits.length} row(s).\n`);
  console.log('ROTATE THESE NOW - purging the DB does not un-expose them:');
  for (const envVar of [...new Set(hits.map((h) => h.envVar))]) console.log(`  - ${envVar}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
