import { describe, expect, it } from 'vitest';
import {
  AUTHORIZATION_ISSUE_KINDS,
  authorizationFailureReason,
  authorizationIssueKind,
  classifyAuthorizationIssues,
  describeAuthorizationIssue,
  issueCode,
  summarizeAuthorizationIssues,
} from './authorization-issues.js';

/** The real shape from production goal 1934706d. */
const ROLE_ISSUES = [
  {
    code: 'task_agent_role_mismatch',
    task_id: 'task-ae4',
    agent_id: 'c9fcd478',
    required_role: 'Brand & UX Designer',
  },
  {
    code: 'task_agent_role_mismatch',
    task_id: 'task-fb8',
    agent_id: 'c31761e2',
    required_role: 'Business & Operations Developer',
  },
  {
    code: 'task_agent_role_mismatch',
    task_id: 'task-ab8',
    agent_id: 'c9fcd478',
    required_role: 'QA Analyst & Business Auditor',
  },
];

const CONTEXT = {
  assignments: [
    {
      task_id: 'task-ae4',
      task: 'Latvian Noodle Market Positioning',
      agent_name: 'Market Research Analyst',
    },
    {
      task_id: 'task-fb8',
      task: '1-Year Business Plan',
      agent_name: 'Supply Chain & Distribution Specialist',
    },
  ],
};

describe('issueCode', () => {
  it('reads both object and bare-string issues', () => {
    // Older payloads and some fixtures pass plain strings; throwing inside a
    // catch-all would hide the real problem.
    expect(issueCode({ code: 'missing_team' })).toBe('missing_team');
    expect(issueCode('missing_team')).toBe('missing_team');
    expect(issueCode(null)).toBe('');
    expect(issueCode(undefined)).toBe('');
  });
});

describe('authorizationIssueKind', () => {
  it.each([
    ['task_agent_role_mismatch', 'structural'],
    ['task_assigned_to_coordinator', 'structural'],
    ['task_agent_not_on_team', 'structural'],
    ['task_agent_not_owned', 'structural'],
    ['missing_task_agent', 'structural'],
    ['missing_task_id', 'structural'],
    ['missing_team', 'structural'],
    ['empty_team', 'structural'],
    ['empty_task_set', 'structural'],
    ['task_tool_unavailable', 'tools'],
    ['task_tool_not_granted', 'tools'],
    ['native_scope_authority_invalid', 'contract'],
    ['approved_research_contract_stale', 'contract'],
    ['task_research_run_mismatch', 'contract'],
    ['task_research_persona_context_mismatch', 'contract'],
    ['task_executor_persona_missing', 'contract'],
    ['something_new', 'unknown'],
  ])('classifies %s as %s', (code, kind) => {
    expect(authorizationIssueKind(code)).toBe(kind);
  });
});

describe('classifyAuthorizationIssues', () => {
  it('buckets the production issue set as structural', () => {
    const result = classifyAuthorizationIssues(ROLE_ISSUES);
    expect(result.structural).toHaveLength(3);
    expect(result.kind).toBe(AUTHORIZATION_ISSUE_KINDS.STRUCTURAL);
  });

  it('prefers structural over tools when both are present', () => {
    // A team that cannot do the work must be rebuilt before a tool grant matters.
    const result = classifyAuthorizationIssues([
      { code: 'task_tool_not_granted', tool_id: 'github' },
      { code: 'task_agent_role_mismatch', required_role: 'Designer' },
    ]);
    expect(result.kind).toBe(AUTHORIZATION_ISSUE_KINDS.STRUCTURAL);
    expect(result.tools).toHaveLength(1);
  });

  it('reports no kind for a valid manifest', () => {
    expect(classifyAuthorizationIssues([]).kind).toBeNull();
    expect(classifyAuthorizationIssues(undefined).kind).toBeNull();
  });
});

describe('describeAuthorizationIssue', () => {
  it('names the task, the required role and the agent that cannot do it', () => {
    const described = describeAuthorizationIssue(ROLE_ISSUES[0], CONTEXT);
    expect(described.headline).toContain('Latvian Noodle Market Positioning');
    expect(described.headline).toContain('Brand & UX Designer');
    expect(described.headline).toContain('Market Research Analyst');
    expect(described.remedy).toMatch(/Rebuild the team/);
    // The raw code must never reach the user as the message.
    expect(described.headline).not.toContain('task_agent_role_mismatch');
  });

  it('still reads sensibly with no context to enrich from', () => {
    const described = describeAuthorizationIssue(ROLE_ISSUES[2], {});
    expect(described.headline).toContain('QA Analyst & Business Auditor');
    expect(described.headline).toContain('no agent on this team');
  });

  it('points tool problems at Agent Hub rather than the team', () => {
    const described = describeAuthorizationIssue(
      { code: 'task_tool_not_granted', task_id: 'task-ae4', tool_id: 'github' },
      CONTEXT
    );
    expect(described.kind).toBe(AUTHORIZATION_ISSUE_KINDS.TOOLS);
    expect(described.headline).toContain('github');
    expect(described.remedy).toMatch(/Agent Hub/);
  });

  it('points context problems at the confirmation step', () => {
    const described = describeAuthorizationIssue({ code: 'approved_research_contract_stale' });
    expect(described.remedy).toMatch(/Confirm the customer context/);
  });

  it('points stale native authority at the exact AxWise scope review', () => {
    const described = describeAuthorizationIssue({ code: 'native_scope_authority_invalid' });
    expect(described.kind).toBe(AUTHORIZATION_ISSUE_KINDS.CONTRACT);
    expect(described.remedy).toMatch(/AxWise scope/);
  });

  it('degrades gracefully on a code it has never seen', () => {
    const described = describeAuthorizationIssue(
      { code: 'future_code', task_id: 'task-ae4' },
      CONTEXT
    );
    expect(described.headline).toContain('future_code');
    expect(described.remedy).toBeTruthy();
  });
});

describe('summarizeAuthorizationIssues', () => {
  it('keeps all three role problems because each names a different role', () => {
    const { items, hidden } = summarizeAuthorizationIssues(ROLE_ISSUES, CONTEXT);
    expect(items).toHaveLength(3);
    expect(hidden).toBe(0);
  });

  it('collapses the same role blocking several tasks into one line', () => {
    const repeated = [
      { code: 'task_agent_role_mismatch', task_id: 'a', required_role: 'Designer' },
      { code: 'task_agent_role_mismatch', task_id: 'b', required_role: 'Designer' },
      { code: 'task_agent_role_mismatch', task_id: 'c', required_role: 'Designer' },
    ];
    expect(summarizeAuthorizationIssues(repeated).items).toHaveLength(1);
  });

  it('caps the list and reports the remainder', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      code: 'task_agent_role_mismatch',
      task_id: `t${i}`,
      required_role: `Role ${i}`,
    }));
    const { items, hidden } = summarizeAuthorizationIssues(many, {}, { limit: 5 });
    expect(items).toHaveLength(5);
    expect(hidden).toBe(4);
  });
});

describe('authorizationFailureReason', () => {
  it('produces one readable sentence ending in the remedy', () => {
    const reason = authorizationFailureReason(ROLE_ISSUES, CONTEXT);
    expect(reason).toContain('Brand & UX Designer');
    expect(reason).toMatch(/Rebuild the team/);
    expect(reason).not.toContain('task_agent_role_mismatch');
  });

  it('does not claim a problem when there is none', () => {
    expect(authorizationFailureReason([])).toBe('Execution could not be authorized.');
  });
});
