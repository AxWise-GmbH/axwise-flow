#!/usr/bin/env node
/**
 * Read-only, whole-database audit of native AxWise goal authority.
 *
 * Usage:
 *   node scripts/audit-native-goal-state.mjs
 *
 * The report deliberately retains and prints only goal IDs, lifecycle
 * statuses, and fixed reason codes. Goal data is loaded only so the shared
 * native authority boundary can validate it; goal content is never reported.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

import { resolveAcceptedNativeGoalAuthority } from '../lib/_shared/native-goal-authority.js';
import { hasNativeAxwiseScopeMarkers } from '../lib/_shared/native-scope-approval.js';
import { pendingScopeRevisionToken } from '../lib/_shared/scope-revision-continuation.js';

export const GOAL_AUDIT_COLUMNS = 'id,status,updated_at,data';
export const DEFAULT_PAGE_SIZE = 1000;

export const NATIVE_GOAL_AUDIT_CLASSIFICATION = Object.freeze({
  LEGACY: 'legacy',
  VALID_NATIVE: 'valid_native',
  EXPECTED_INVALID: 'expected_transitional_or_quarantined_invalid',
  UNSAFE_INVALID: 'unsafe_active_invalid',
});

// Native authority is not accepted yet in these lifecycle states. Missing
// admission, approval, or a packet still being synthesized is expected here.
const TRANSITIONAL_STATUSES = new Set([
  'draft',
  'analyzing',
  'researching_customer',
  'awaiting_context_approval',
  'awaiting_po_input',
]);

// Accepted native authority belongs only at Gate 1's downstream lifecycle or
// in an intentionally inactive/quarantined row. Earlier states indicate that
// a retry/reconciler moved the row backwards and must not audit as healthy.
const READY_NATIVE_STATUSES = new Set([
  'planning',
  'forming_team',
  'provisioning_tools',
  'awaiting_tools',
  'estimating',
  'awaiting_approval',
  'authorizing_execution',
  'active',
  'executing',
  'pending_validation',
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
  'needs_human',
]);

// Invalid native state here cannot execute unless an operator explicitly
// reactivates/retries it, so it is reported for review but does not fail the
// audit. Unknown and resumable downstream states fail closed instead.
const QUARANTINED_STATUSES = new Set([
  'paused',
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
  'needs_human',
]);

const REBUILD_STATUSES = new Set(['analyzing', 'researching_customer']);
const SAFE_REASON_CODE = /^[a-z0-9][a-z0-9_:-]{0,119}$/;

function safeReasonCodes(reasons) {
  const result = [];
  for (const value of Array.isArray(reasons) ? reasons : []) {
    const reason = String(value || '').trim();
    const safeReason = SAFE_REASON_CODE.test(reason)
      ? reason
      : 'native_authority_issue_unclassified';
    if (!result.includes(safeReason)) result.push(safeReason);
  }
  return result;
}

function auditIdentity(goal) {
  return {
    id: goal?.id == null ? null : String(goal.id),
    status: goal?.status == null ? null : String(goal.status),
  };
}

function classification(identity, kind, reasons = []) {
  return {
    ...identity,
    classification: kind,
    reasons: safeReasonCodes(reasons),
  };
}

/**
 * Classify one synthetic or persisted goal without mutating it.
 *
 * Strong durable markers are checked before authority resolution so a missing
 * or corrupt packet can never make a native row fall back to the legacy path.
 */
export function classifyNativeGoalState(goal) {
  const identity = auditIdentity(goal);
  if (!hasNativeAxwiseScopeMarkers(goal)) {
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.LEGACY);
  }

  let authority;
  try {
    authority = resolveAcceptedNativeGoalAuthority(goal);
  } catch {
    authority = {
      ready: false,
      reasons: ['native_authority_resolution_failed'],
    };
  }

  // Pending-rebuild rows receive a more precise lifecycle classification
  // below. Avoid repeating the authority layer's generic pending reason in
  // the operator-facing audit output.
  const authorityReasons = safeReasonCodes(authority.reasons).filter(
    (reason) => reason !== 'native_scope_revision_pending'
  );
  const scopeRevisionToken = pendingScopeRevisionToken(goal);
  if (scopeRevisionToken === null) {
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID, [
      'native_scope_rebuild_token_missing',
      ...authorityReasons,
    ]);
  }

  if (scopeRevisionToken !== undefined) {
    if (REBUILD_STATUSES.has(identity.status)) {
      return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID, [
        'native_scope_rebuild_in_progress',
        ...authorityReasons,
      ]);
    }
    if (QUARANTINED_STATUSES.has(identity.status)) {
      return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID, [
        'native_scope_rebuild_inactive_or_quarantined',
        ...authorityReasons,
      ]);
    }
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID, [
      'native_scope_rebuild_stale_downstream',
      ...authorityReasons,
    ]);
  }

  if (authority.ready) {
    if (READY_NATIVE_STATUSES.has(identity.status)) {
      return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE);
    }
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID, [
      'native_ready_authority_lifecycle_mismatch',
    ]);
  }

  if (TRANSITIONAL_STATUSES.has(identity.status)) {
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID, [
      'native_scope_transition_in_progress',
      ...authorityReasons,
    ]);
  }

  if (QUARANTINED_STATUSES.has(identity.status)) {
    return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID, [
      'native_goal_inactive_or_quarantined',
      ...authorityReasons,
    ]);
  }

  return classification(identity, NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID, [
    'native_active_authority_invalid',
    ...authorityReasons,
  ]);
}

function emptyAuditResult() {
  return {
    counts: {
      total: 0,
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.LEGACY]: 0,
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE]: 0,
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID]: 0,
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID]: 0,
    },
    findings: {
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE]: [],
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID]: [],
      [NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID]: [],
    },
  };
}

function retainSafeFinding(result, finding) {
  result.counts.total += 1;
  result.counts[finding.classification] += 1;
  if (finding.classification === NATIVE_GOAL_AUDIT_CLASSIFICATION.LEGACY) return;
  result.findings[finding.classification].push({
    id: finding.id,
    status: finding.status,
    reasons: finding.reasons,
  });
}

/** Load and classify every goals row using deterministic, bounded pages. */
export async function auditNativeGoalDatabase(client, { pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DEFAULT_PAGE_SIZE) {
    throw new Error('native_goal_audit_page_size_invalid');
  }

  const result = emptyAuditResult();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('goals')
      .select(GOAL_AUDIT_COLUMNS)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('native_goal_audit_query_failed');

    const page = Array.isArray(data) ? data : [];
    for (const goal of page) retainSafeFinding(result, classifyNativeGoalState(goal));
    if (page.length < pageSize) return result;
  }
}

function reportFindings(log, label, findings) {
  if (findings.length === 0) return;
  log.log(`${label}:`);
  for (const finding of findings) {
    log.log(
      JSON.stringify({
        id: finding.id,
        status: finding.status,
        reasons: finding.reasons,
      })
    );
  }
}

export function reportNativeGoalAudit(result, log = console) {
  log.log('Native goal state audit (read-only)');
  log.log(`counts=${JSON.stringify(result.counts)}`);
  reportFindings(
    log,
    NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE,
    result.findings[NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE]
  );
  reportFindings(
    log,
    NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID,
    result.findings[NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID]
  );
  reportFindings(
    log,
    NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID,
    result.findings[NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID]
  );
}

export async function runNativeGoalStateAudit({
  env = process.env,
  log = console,
  client = null,
} = {}) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!client && (!url || !serviceRoleKey)) {
    log.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return 2;
  }

  let auditClient = client;
  if (!auditClient) {
    try {
      auditClient = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } catch {
      log.error('Native goal state audit could not initialize its read-only database client.');
      return 2;
    }
  }

  let result;
  try {
    result = await auditNativeGoalDatabase(auditClient);
  } catch {
    log.error('Native goal state audit could not read every goals page.');
    return 2;
  }

  reportNativeGoalAudit(result, log);
  return result.counts[NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID] > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  config({ path: ['.env.local', '.env'], quiet: true });
  process.exitCode = await runNativeGoalStateAudit();
}
