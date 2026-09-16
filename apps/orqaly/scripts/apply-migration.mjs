#!/usr/bin/env node
/**
 * Apply a migration file to the Supabase database via the Management API.
 *
 * supabase/README.md says migrations are pasted into the Dashboard SQL Editor by
 * hand. That is still the norm — but `SUPABASE_ACCESS_TOKEN` (an `sbp_` personal
 * access token) can POST SQL to the Management API, which is the same thing
 * without the copy-paste.
 *
 * This is a real schema change against a real database. It prints the SQL, runs
 * it, and reports what came back. Migrations in this repo are written to be
 * idempotent (`create or replace`, `if not exists`), so a re-run is safe.
 *
 * Usage:
 *   node scripts/apply-migration.mjs supabase/migrations/185_vault_rpc_wrappers.sql [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

/** zwzopaedmhwnndymitbs from https://zwzopaedmhwnndymitbs.supabase.co */
export function projectRefFromUrl(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.(co|com)/i.exec(String(url || ''));
  return m ? m[1] : null;
}

export async function runSql({ ref, token, query, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!file || file.startsWith('--')) {
    console.error('Usage: node scripts/apply-migration.mjs <path-to.sql> [--dry-run]');
    process.exit(1);
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = projectRefFromUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  if (!token) {
    console.error('Missing SUPABASE_ACCESS_TOKEN in .env.local — cannot reach the Management API.');
    process.exit(1);
  }
  if (!ref) {
    console.error('Could not derive the project ref from SUPABASE_URL / VITE_SUPABASE_URL.');
    process.exit(1);
  }

  const sql = readFileSync(file, 'utf8');
  console.log(`file    : ${file}  (${sql.split('\n').length} lines)`);
  console.log(`project : ${ref}`);
  console.log('');

  if (dryRun) {
    console.log(sql);
    console.log('\nDry run - nothing executed.');
    return;
  }

  const out = await runSql({ ref, token, query: sql });
  console.log('applied. response:', JSON.stringify(out).slice(0, 300));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
