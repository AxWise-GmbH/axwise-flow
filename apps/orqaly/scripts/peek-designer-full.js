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
  .select('*')
  .eq('data->>goal_id', goalId)
  .eq('data->>phase_index', '0');

for (const t of tasks || []) {
  console.log('=== TASK', t.id, '===');
  console.log('all top-level columns:', Object.keys(t).join(', '));
  console.log('description col:', String(t.description || '(null)').slice(0, 1500));
  console.log('---');
  console.log('data keys:', Object.keys(t.data || {}).join(', '));
  console.log('data.description:', String(t.data?.description || '(null)').slice(0, 1500));
  console.log('---');
}

// Also check goal.plan.phases[0].jobs[0]
const { data: goal } = await admin.from('goals').select('plan').eq('id', goalId).single();
console.log('\nGOAL plan.phases[0]:');
console.log(JSON.stringify(goal?.plan?.phases?.[0], null, 2).slice(0, 3000));
