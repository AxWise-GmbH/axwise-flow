#!/usr/bin/env node
/**
 * Read-only production preflight for release-critical schema and migrations
 * 191, 192, and the typed research-evidence boundary in 203.
 *
 * Migration 191 cannot create its unique index while more than one queued or
 * running AxWise outcome job exists for a goal. Migration 192 intentionally
 * deactivates duplicate active goal teams before creating its unique index.
 * This script reports both conditions before the release window and never
 * mutates the database.
 */
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;
const ACTIVE_OUTCOME_STATUSES = new Set(['queued', 'running']);

function duplicateGroups(rows, keyForRow) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    if (key == null) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(String(row.id));
  }

  return [...grouped.entries()]
    .filter(([, rowIds]) => rowIds.length > 1)
    .map(([goalId, rowIds]) => ({
      goalId,
      count: rowIds.length,
      rowIds: rowIds.sort(),
    }))
    .sort((left, right) => left.goalId.localeCompare(right.goalId));
}

export function analyzeReleaseMigrationState({ outcomeJobs = [], activeTeams = [] } = {}) {
  const duplicateOutcomeJobs = duplicateGroups(
    outcomeJobs.filter(
      (row) =>
        ACTIVE_OUTCOME_STATUSES.has(row?.status) &&
        row?.payload?.type === 'axwise-outcome' &&
        Object.hasOwn(row.payload, 'goalId') &&
        row.payload.goalId != null
    ),
    (row) => String(row.payload.goalId)
  );
  const duplicateActiveTeams = duplicateGroups(
    activeTeams.filter((row) => row?.is_active === true && row.goal_id != null),
    (row) => String(row.goal_id)
  );

  return {
    ok: duplicateOutcomeJobs.length === 0 && duplicateActiveTeams.length === 0,
    duplicateOutcomeJobs,
    duplicateActiveTeams,
  };
}

export async function verifyRequiredReleaseSchema(client) {
  const checks = [
    {
      migration: '176',
      description: 'advanced goal-loop columns',
      query: client.from('goals').select('id,loop_advanced,loop_settings').limit(1),
    },
    {
      migration: '194',
      description: 'encrypted integration credential pointers',
      query: client
        .from('integration_credentials')
        .select('id,vault_secret_id,credential_kek_id,credential_algorithm,credential_version')
        .limit(1),
    },
    {
      migration: '203',
      description: 'typed research run manifest columns',
      query: client
        .from('goal_research_runs')
        .select(
          'id,evidence_profile_version,evidence_profile_hash,fact_manifest_hash,calculation_manifest_hash,fact_count,calculation_count'
        )
        .limit(1),
    },
    {
      migration: '203',
      description: 'typed research fact persistence',
      query: client
        .from('goal_research_facts')
        .select('id,research_run_id,external_fact_id,fact_kind,fact_hash,payload')
        .limit(1),
    },
    {
      migration: '203',
      description: 'typed research calculation persistence',
      query: client
        .from('goal_research_calculations')
        .select(
          'id,research_run_id,external_calculation_id,calculation_kind,calculation_hash,payload'
        )
        .limit(1),
    },
  ];

  for (const check of checks) {
    const { error } = await check.query;
    if (error) {
      throw new Error(
        `Migration ${check.migration} schema check failed (${check.description}): ${error.message}`
      );
    }
  }
}

async function fetchEveryPage(label, fetchPage) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label} preflight query failed: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function loadReleaseMigrationState(client) {
  await verifyRequiredReleaseSchema(client);
  const [outcomeJobs, activeTeams] = await Promise.all([
    fetchEveryPage('Migration 191', (from, to) =>
      client
        .from('agent_jobs')
        .select('id,status,payload')
        .in('status', [...ACTIVE_OUTCOME_STATUSES])
        .eq('payload->>type', 'axwise-outcome')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchEveryPage('Migration 192', (from, to) =>
      client
        .from('agent_teams')
        .select('id,goal_id,is_active')
        .eq('is_active', true)
        .not('goal_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);
  return { outcomeJobs, activeTeams };
}

function reportGroups(log, migration, description, groups) {
  if (groups.length === 0) return;
  log.error(`- Migration ${migration}: ${groups.length} goal(s) ${description}`);
  for (const group of groups.slice(0, 20)) {
    log.error(`  goal ${group.goalId}: ${group.count} rows (${group.rowIds.join(', ')})`);
  }
  if (groups.length > 20) log.error(`  ...and ${groups.length - 20} more goal(s)`);
}

export async function runReleaseMigrationPreflight({ env = process.env, log = console } = {}) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    log.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let state;
  try {
    state = await loadReleaseMigrationState(client);
  } catch (error) {
    log.error(error.message);
    return 2;
  }

  const result = analyzeReleaseMigrationState(state);
  if (result.ok) {
    log.log(
      'Release migration preflight passed: required schema is present and no duplicate active outcome jobs or goal teams were found.'
    );
    return 0;
  }

  log.error('Release migration preflight requires operator review:');
  reportGroups(
    log,
    '191',
    'have duplicate queued/running AxWise outcome jobs; the unique index would fail',
    result.duplicateOutcomeJobs
  );
  reportGroups(
    log,
    '192',
    'have duplicate active teams; the migration will deactivate all but one',
    result.duplicateActiveTeams
  );
  log.error(
    'Resolve migration 191 duplicates and review migration 192 deactivations before proceeding.'
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  config({ path: ['.env.local', '.env'], quiet: true });
  process.exit(await runReleaseMigrationPreflight());
}
