#!/usr/bin/env node
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const goalId = process.argv[2] || 'cae7e09f-431d-4528-bd08-001c538e30ec';
const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();

const { data: tasks } = await admin
  .from('team_tasks')
  .select('id, title, status, data')
  .eq('data->>goal_id', goalId)
  .eq('data->>phase_index', '0');

for (const t of tasks || []) {
  console.log('==== TASK', t.id, '====');
  console.log('title:', t.title);
  console.log('status:', t.status);
  console.log('description (first 3000 chars):');
  console.log(String(t.data?.description || '(none)').slice(0, 3000));
  console.log();
  console.log('deliverable_type:', t.data?.deliverable_type);
  console.log();
}

// Also test shouldUseSplitter against the first task's description
const { shouldUseSplitter, detectMandatedSections } = await import('../lib/agent-handlers/section-splitter.js');
if (tasks?.[0]?.data?.description) {
  const desc = tasks[0].data.description;
  console.log('---- SPLITTER DECISION ----');
  console.log('With LARGE_DELIVERABLE_SPLIT=1:', shouldUseSplitter({ deliverableType: tasks[0].data?.deliverable_type, description: desc, env: { LARGE_DELIVERABLE_SPLIT: '1' } }));
  console.log('Detected sections:', detectMandatedSections(desc));
}
