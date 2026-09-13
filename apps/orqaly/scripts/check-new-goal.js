#!/usr/bin/env node
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const goalId = process.argv[2] || 'cae7e09f-431d-4528-bd08-001c538e30ec';
const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();

const { data: g } = await admin.from('goals').select('id, status, iteration, spent_usd, updated_at, data').eq('id', goalId).maybeSingle();
console.log('GOAL:', g?.status, '| iter', g?.iteration, '| spent', g?.spent_usd, '| updated', g?.updated_at);

const { data: jobs } = await admin
  .from('agent_jobs')
  .select('id, status, payload, error, retry_count, created_at, updated_at')
  .or(`payload->>goalId.eq.${goalId},payload->>goal_id.eq.${goalId}`)
  .order('created_at', { ascending: true });

console.log(`\nJOBS (${jobs?.length || 0}):`);
for (const j of jobs || []) {
  console.log(' ', j.status.padEnd(10), j.payload?.type?.padEnd(18), (j.payload?.action || '').padEnd(24), `r=${j.retry_count || 0}`, j.error ? `err=${j.error.slice(0, 100)}` : '');
}

// Check if there are any "skipped" jobs - look for queued local_only across all goals
const { data: allQueued } = await admin
  .from('agent_jobs')
  .select('id, status, payload, created_at')
  .eq('status', 'queued')
  .order('created_at', { ascending: true });

console.log(`\nALL QUEUED (${allQueued?.length || 0}):`);
for (const j of (allQueued || []).slice(0, 15)) {
  console.log(' ', j.id.slice(0, 8), j.payload?.type?.padEnd(18), (j.payload?.action || '').padEnd(24), 'goalId=' + (j.payload?.goalId || j.payload?.goal_id || '?').slice(0, 8));
}
