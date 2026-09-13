#!/usr/bin/env node
/**
 * json-to-migration.mjs — convert library-universe-seed-proposal.json
 * into a SQL migration. Pure file I/O. No DB connection.
 *
 * Usage:
 *   node scripts/json-to-migration.mjs
 *
 * Output:
 *   supabase/migrations/100_seed_library_universe.sql
 *
 * The generated migration:
 *   - Adds an RLS policy allowing all authenticated users to read curated
 *     library_example rows (the ones we're about to insert).
 *   - Inserts every entry from the JSON proposal as a knowledge_documents row
 *     with category='library_example' and user_id=NULL (system-owned).
 *   - Wraps inserts with WHERE NOT EXISTS so re-running the helper after
 *     editing the JSON adds new entries without duplicating old ones.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PROPOSAL_PATH = resolve(PROJECT_ROOT, 'scripts/library-universe-seed-proposal.json');
const MIGRATION_PATH = resolve(PROJECT_ROOT, 'supabase/migrations/100_seed_library_universe.sql');

// Escape single quotes for SQL string literals
const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Format a JS object as a Postgres JSONB literal
const sqlJsonb = (obj) => `${sqlString(JSON.stringify(obj))}::jsonb`;

const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, 'utf-8'));

if (!Array.isArray(proposal.entries) || proposal.entries.length === 0) {
  console.error('No entries found in', PROPOSAL_PATH);
  process.exit(1);
}

const lines = [];
lines.push('-- Library Universe seed — generated from scripts/library-universe-seed-proposal.json');
lines.push('-- Re-run scripts/json-to-migration.mjs to regenerate after editing the JSON.');
lines.push('-- Entries are system-owned (user_id IS NULL) and visible to all authenticated users.');
lines.push('');
lines.push('-- ── RLS: let any authenticated user read curated library_example rows ──');
lines.push("DROP POLICY IF EXISTS \"Read curated library_example\" ON public.knowledge_documents;");
lines.push("CREATE POLICY \"Read curated library_example\"");
lines.push('  ON public.knowledge_documents');
lines.push('  FOR SELECT');
lines.push('  TO authenticated');
lines.push("  USING (category = 'library_example' AND user_id IS NULL);");
lines.push('');
lines.push('-- ── Seed entries ──');
lines.push('');

for (const entry of proposal.entries) {
  const {
    title,
    deliverable_type,
    brand,
    asset_url,
    preview_url,
    quality_score,
    what_makes_it_great,
    recreate_prompt,
    recommended_tool,
    tags = [],
  } = entry;

  if (!title || !deliverable_type || !asset_url) {
    console.warn('Skipping entry missing required fields:', title || '(no title)');
    continue;
  }

  const metadata = {
    deliverable_type,
    brand: brand || null,
    asset_url,
    preview_url: preview_url || asset_url,
    quality_score: Number(quality_score) || 0,
    source: 'curated',
    source_goal_id: null,
    what_makes_it_great: what_makes_it_great || '',
    recreate_prompt: recreate_prompt || '',
    recreate_tools: recommended_tool ? [recommended_tool] : [],
    promoted_by: null,
    promoted_at: null,
  };

  // Idempotency: skip if a row with the same asset_url already exists
  lines.push('INSERT INTO public.knowledge_documents');
  lines.push('  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)');
  lines.push('SELECT');
  lines.push('  NULL,');
  lines.push(`  ${sqlString(title)},`);
  lines.push(`  ${sqlString(what_makes_it_great || title)},`);
  lines.push(`  ${sqlString(asset_url)},`);
  lines.push("  'library_example',");
  lines.push(`  ${sqlJsonb(metadata)},`);
  lines.push("  'user',");
  lines.push('  NULL,');
  lines.push("  'note',");
  lines.push(`  ARRAY[${tags.map(sqlString).join(',') || ''}]::text[]`);
  lines.push('WHERE NOT EXISTS (');
  lines.push('  SELECT 1 FROM public.knowledge_documents');
  lines.push("  WHERE category = 'library_example'");
  lines.push(`    AND metadata->>'asset_url' = ${sqlString(asset_url)}`);
  lines.push(');');
  lines.push('');
}

writeFileSync(MIGRATION_PATH, lines.join('\n'), 'utf-8');
console.log(`Wrote ${proposal.entries.length} entries → ${MIGRATION_PATH}`);
