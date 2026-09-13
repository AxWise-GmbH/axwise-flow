#!/usr/bin/env node
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const goalId = process.argv[2];
if (!goalId) { console.error('usage: snapshot-goal.js <id>'); process.exit(1); }

const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();

const { data: goal, error } = await admin.from('goals').select('*').eq('id', goalId).maybeSingle();
if (error || !goal) { console.error('not found'); process.exit(1); }

console.log('===== ALL COLUMNS =====');
console.log(Object.keys(goal).join('\n'));
console.log();
console.log('===== KEY INPUT FIELDS =====');
const keys = ['id', 'title', 'description', 'brief', 'prompt', 'user_id', 'budget_usd', 'max_iterations', 'mode', 'complexity', 'status'];
for (const k of keys) {
  if (k in goal) console.log(`${k.padEnd(20)}:`, JSON.stringify(goal[k])?.slice(0, 300));
}
console.log();
console.log('===== data JSON =====');
console.log(JSON.stringify(goal.data, null, 2).slice(0, 4000));
console.log();
console.log('===== plan (top-level keys only) =====');
console.log(goal.plan ? Object.keys(goal.plan).join(', ') : '(null)');
