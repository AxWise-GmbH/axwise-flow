/**
 * Human-readable descriptions of execution-authorization manifest issues.
 *
 * The manifest speaks in codes because it is hashed and compared. The user
 * should never see them: "task_agent_role_mismatch, task_agent_role_mismatch,
 * task_agent_role_mismatch" tells someone nothing about what to do next.
 *
 * Shared between the server (failure_reason text) and the proposal dialog.
 * Pure: no imports, no I/O, safe on both sides of the module boundary.
 *
 * Nothing here ever changes the manifest. buildExecutionApprovalSnapshot hashes
 * the whole manifest, so adding a field to it would re-hash every valid
 * manifest and fail in-flight approved goals. Enrichment belongs in
 * goal.data.execution_authorization.issue_report, alongside it.
 */

export const AUTHORIZATION_ISSUE_KINDS = {
  STRUCTURAL: 'structural',
  TOOLS: 'tools',
  CONTRACT: 'contract',
  UNKNOWN: 'unknown',
};

/** The team or the task rows themselves are wrong. Re-entering the gate cannot help. */
const STRUCTURAL_CODES = new Set([
  'task_agent_role_mismatch',
  'task_assigned_to_coordinator',
  'task_agent_not_on_team',
  'task_agent_not_owned',
  'missing_task_agent',
  'missing_task_id',
  'missing_team',
  'empty_team',
  'empty_task_set',
]);

/** The user can fix these in Agent Hub without touching the plan. */
const TOOL_CODES = new Set(['task_tool_unavailable', 'task_tool_not_granted']);

/**
 * Issues can arrive as objects or, in older payloads and some tests, as bare
 * strings. Tolerate both rather than throwing inside a catch-all.
 */
export function issueCode(issue) {
  if (typeof issue === 'string') return issue;
  return String(issue?.code || '');
}

export function authorizationIssueKind(code) {
  if (STRUCTURAL_CODES.has(code)) return AUTHORIZATION_ISSUE_KINDS.STRUCTURAL;
  if (TOOL_CODES.has(code)) return AUTHORIZATION_ISSUE_KINDS.TOOLS;
  if (
    code === 'native_scope_authority_invalid' ||
    code === 'approved_research_contract_stale' ||
    // task_executor_persona_missing is part of the same research-contract
    // family despite not sharing the task_research_ prefix.
    code === 'task_executor_persona_missing' ||
    code.startsWith('task_research_')
  ) {
    return AUTHORIZATION_ISSUE_KINDS.CONTRACT;
  }
  return AUTHORIZATION_ISSUE_KINDS.UNKNOWN;
}

/**
 * Bucket a manifest's issues. `kind` is the dominant one, structural first:
 * a goal with both a role mismatch and a missing tool needs the team rebuilt
 * before the tool grant matters.
 */
export function classifyAuthorizationIssues(issues = []) {
  const buckets = { structural: [], tools: [], contract: [], unknown: [] };
  for (const issue of Array.isArray(issues) ? issues : []) {
    buckets[authorizationIssueKind(issueCode(issue))].push(issue);
  }
  let kind = null;
  if (buckets.structural.length) kind = AUTHORIZATION_ISSUE_KINDS.STRUCTURAL;
  else if (buckets.contract.length) kind = AUTHORIZATION_ISSUE_KINDS.CONTRACT;
  else if (buckets.tools.length) kind = AUTHORIZATION_ISSUE_KINDS.TOOLS;
  else if (buckets.unknown.length) kind = AUTHORIZATION_ISSUE_KINDS.UNKNOWN;
  return { ...buckets, kind };
}

const REBUILD_REMEDY =
  'Rebuild the team so an agent for that role is available, or request changes so the plan uses a role your workspace has.';

function quoted(value) {
  const text = String(value || '').trim();
  return text ? `“${text.slice(0, 80)}”` : 'A task';
}

/**
 * `context` carries what the manifest deliberately does not: task titles and
 * assigned agent names. On the client it is `goal.proposal.assignments`; on the
 * server it is the task rows already loaded to build the manifest. Both are
 * keyed by task_id.
 */
function lookup(context, taskId) {
  const rows = context?.assignments || [];
  return rows.find((row) => String(row.task_id) === String(taskId)) || {};
}

export function describeAuthorizationIssue(issue, context = {}) {
  const code = issueCode(issue);
  const kind = authorizationIssueKind(code);
  const detail = typeof issue === 'string' ? {} : issue || {};
  const row = lookup(context, detail.task_id);
  const task = quoted(row.task || row.title);
  const agent = row.agent_name ? String(row.agent_name) : null;
  const role = detail.required_role ? String(detail.required_role) : null;

  switch (code) {
    case 'task_agent_role_mismatch':
      return {
        code,
        kind,
        headline: agent
          ? `${task} needs a ${role}, but it is assigned to ${agent}.`
          : `${task} needs a ${role}, which no agent on this team can do.`,
        remedy: REBUILD_REMEDY,
      };
    case 'missing_task_agent':
      return { code, kind, headline: `${task} has no agent assigned.`, remedy: REBUILD_REMEDY };
    case 'task_assigned_to_coordinator':
      return {
        code,
        kind,
        headline: `${task} is assigned to ${agent || 'a coordinator'}, which never executes tasks.`,
        remedy: REBUILD_REMEDY,
      };
    case 'task_agent_not_on_team':
      return {
        code,
        kind,
        headline: `${task} is assigned to an agent that is not on this goal's approved team.`,
        remedy: REBUILD_REMEDY,
      };
    case 'task_agent_not_owned':
      return {
        code,
        kind,
        headline: `${task} is assigned to an agent this workspace does not own.`,
        remedy: REBUILD_REMEDY,
      };
    case 'task_tool_not_granted':
      return {
        code,
        kind,
        headline: `${task} needs ${detail.tool_id || 'a tool'}, which its agent is not granted.`,
        remedy: 'Grant it in Agent Hub, then reopen this proposal.',
      };
    case 'task_tool_unavailable':
      return {
        code,
        kind,
        headline: `${detail.tool_id || 'A required tool'} is not configured.`,
        remedy: 'Add the credential in Agent Hub, then reopen this proposal.',
      };
    case 'empty_team':
    case 'missing_team':
      return {
        code,
        kind,
        headline: 'No execution team was formed for this goal.',
        remedy: 'Rebuild the team.',
      };
    case 'empty_task_set':
      return {
        code,
        kind,
        headline: 'This goal has no tasks to execute.',
        remedy: 'Request changes so the plan produces work.',
      };
    case 'approved_research_contract_stale':
      return {
        code,
        kind,
        headline: 'The approved research context has changed since this plan was built.',
        remedy: 'Confirm the customer context again.',
      };
    case 'native_scope_authority_invalid':
      return {
        code,
        kind,
        headline: 'The accepted native scope or its work-shape route is missing or stale.',
        remedy: 'Review and confirm the current AxWise scope again.',
      };
    default:
      if (kind === AUTHORIZATION_ISSUE_KINDS.CONTRACT) {
        return {
          code,
          kind,
          headline: `${task} no longer matches the approved research context.`,
          remedy: 'Confirm the customer context again.',
        };
      }
      return {
        code,
        kind,
        headline: `${task} could not be authorized (${code || 'unknown issue'}).`,
        remedy: REBUILD_REMEDY,
      };
  }
}

/**
 * Deduped, capped descriptions. Three tasks blocked on the same missing role is
 * one problem, not three lines.
 */
export function summarizeAuthorizationIssues(issues = [], context = {}, { limit = 5 } = {}) {
  const described = [];
  const seen = new Set();
  for (const issue of Array.isArray(issues) ? issues : []) {
    const detail = typeof issue === 'string' ? {} : issue || {};
    const key = `${issueCode(issue)}::${detail.required_role || detail.tool_id || detail.task_id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    described.push(describeAuthorizationIssue(issue, context));
  }
  return { items: described.slice(0, limit), hidden: Math.max(0, described.length - limit) };
}

/** One sentence for goal.data.failure_reason and notifications. */
export function authorizationFailureReason(issues = [], context = {}) {
  const { items, hidden } = summarizeAuthorizationIssues(issues, context, { limit: 3 });
  if (!items.length) return 'Execution could not be authorized.';
  const sentences = items.map((item) => item.headline).join(' ');
  const more = hidden > 0 ? ` And ${hidden} more.` : '';
  return `${sentences}${more} ${items[0].remedy}`;
}
