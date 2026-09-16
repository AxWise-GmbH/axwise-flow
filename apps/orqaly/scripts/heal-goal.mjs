#!/usr/bin/env node
/**
 * One-shot healer runner — runs healGoal on a specific goal id against
 * the live Supabase DB. Used for Phase 5 verification and as an ops tool.
 *
 * Usage:
 *   node scripts/heal-goal.mjs <goal-id>
 *   node scripts/heal-goal.mjs --all   # scan and heal all stuck goals
 */
import { admin } from './_lib/admin-client.mjs';
import { healGoal, healAllStuckGoals } from '../lib/goal-handlers/self-healer.js';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/heal-goal.mjs <goal-id|--all>');
  process.exit(1);
}

async function main() {
  if (arg === '--all') {
    const summary = await healAllStuckGoals(admin, { maxGoals: 20 });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const { data: goal, error } = await admin
    .from('goals')
    .select('*')
    .eq('id', arg)
    .single();

  if (error || !goal) {
    console.error('Goal not found:', arg, error?.message);
    process.exit(1);
  }

  console.log('Before:');
  console.log('  status:        ', goal.status);
  console.log('  failure_reason:', goal.data?.failure_reason || '(none)');
  console.log('  heal_attempts: ', goal.data?.heal_attempts || 0);
  console.log('');

  const result = await healGoal(admin, goal);
  console.log('Healer result:');
  console.log(JSON.stringify(result, null, 2));
  console.log('');

  // Re-read to confirm
  const { data: after } = await admin
    .from('goals')
    .select('id, status, data')
    .eq('id', arg)
    .single();
  console.log('After:');
  console.log('  status:        ', after?.status);
  console.log('  failure_reason:', after?.data?.failure_reason || '(none)');
  console.log('  heal_attempts: ', after?.data?.heal_attempts || 0);
  console.log('  last_strategy: ', after?.data?.last_heal_strategy || '(none)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
