#!/usr/bin/env node
/**
 * Polls a goal's status + latest goal_log events every 30s.
 * Emits one stdout line per new event. Exits when status is terminal.
 * Usage: node scripts/watch-goal.js <goalId>
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const goalId = process.argv[2];
if (!goalId) { console.error('usage: watch-goal.js <goalId>'); process.exit(1); }

const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'needs_human']);
const seen = new Set();
let lastStatus = '';

while (true) {
  try {
    const { data: g } = await admin.from('goals').select('status, iteration, spent_usd').eq('id', goalId).maybeSingle();
    if (!g) { console.log(`[${ts()}] goal-not-found`); process.exit(1); }
    if (g.status !== lastStatus) {
      console.log(`[${ts()}] status=${g.status} iter=${g.iteration} spent=$${Number(g.spent_usd || 0).toFixed(4)}`);
      lastStatus = g.status;
    }
    const { data: logs } = await admin
      .from('goal_log')
      .select('event_type, details, created_at')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: true });
    for (const l of logs || []) {
      const key = `${l.created_at}|${l.event_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const detailStr = typeof l.details === 'string' ? l.details : JSON.stringify(l.details || {});
      console.log(`[${l.created_at.slice(11, 19)}] ${l.event_type} ${detailStr.slice(0, 160)}`);
    }
    if (TERMINAL.has(g.status)) {
      console.log(`[${ts()}] TERMINAL: ${g.status} (exiting watch)`);
      process.exit(0);
    }
  } catch (e) {
    console.log(`[${ts()}] poll-error: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 30000));
}

function ts() { return new Date().toISOString().slice(11, 19); }
