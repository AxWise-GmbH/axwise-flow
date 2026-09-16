#!/usr/bin/env node
/**
 * Report duplicate agents per organization.
 *
 * Goals mint a new agent whenever they supply a role string the system has not
 * seen before, so one job accumulates near-identical agents. Each duplicate
 * costs an extra org-conditioning generation and lets the copies drift apart
 * in style.
 *
 * READ ONLY. This never writes. Merging rewrites execution history, so the
 * decision stays with you, group by group.
 *
 * Usage:
 *   node scripts/report-duplicate-agents.mjs             # every organization
 *   node scripts/report-duplicate-agents.mjs <org-id>    # one organization
 */
import { config } from 'dotenv';
import { buildSupabaseAdminClient } from '../api/_lib/supabase-server.js';
import {
  findDuplicateAgentGroups,
  formatReconciliationReport,
} from '../lib/goal-handlers/agent-reconciliation.js';

config({ path: '.env.local' });
config();

const AGENT_FIELDS = 'id, name, category, status, created_at, updated_at';

async function organizationsToScan(admin, orgId) {
  let query = admin.from('organizations').select('id, name').eq('is_active', true);
  if (orgId) query = query.eq('id', orgId);
  const { data, error } = await query;
  if (error) throw new Error(`organizations: ${error.message}`);
  return data || [];
}

async function agentsForOrg(admin, orgId) {
  const { data: links, error: linkErr } = await admin
    .from('org_agents')
    .select('agent_id')
    .eq('org_id', orgId);
  if (linkErr) throw new Error(`org_agents: ${linkErr.message}`);

  const ids = (links || []).map((l) => String(l.agent_id)).filter(Boolean);
  if (!ids.length) return [];

  const { data, error } = await admin
    .from('agents')
    .select(AGENT_FIELDS)
    .in('id', ids)
    .eq('status', 'active');
  if (error) throw new Error(`agents: ${error.message}`);
  return data || [];
}

export async function main(argv = process.argv.slice(2)) {
  const orgId = argv.find((a) => !a.startsWith('-')) || null;
  const admin = buildSupabaseAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  const orgs = await organizationsToScan(admin, orgId);
  if (!orgs.length) {
    console.log('No active organizations found.');
    return;
  }

  let totalDrop = 0;
  let totalReview = 0;

  for (const org of orgs) {
    const agents = await agentsForOrg(admin, org.id);
    if (agents.length < 2) continue;

    const groups = findDuplicateAgentGroups(agents);
    if (!groups.exact.length && !groups.related.length) continue;

    console.log(formatReconciliationReport(groups, org.name));
    console.log('');

    totalDrop += groups.exact.reduce((n, g) => n + g.drop.length, 0);
    totalReview += groups.related.length;
  }

  if (!totalDrop && !totalReview) {
    console.log('No duplicate agents found in any organization.');
    return;
  }
  console.log(
    `TOTAL: ${totalDrop} safe merge(s), ${totalReview} pair(s) needing your decision. Nothing was changed.`
  );
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('report-duplicate-agents.mjs');
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
