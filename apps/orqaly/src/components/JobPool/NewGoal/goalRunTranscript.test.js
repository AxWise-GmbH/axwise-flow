import { describe, it, expect } from 'vitest';
import {
  buildRunTranscript,
  describeEvent,
  humanizeEventType,
  tasksForPhase,
  RUN_EVENT_COPY,
  blockedMessage,
  readableDetail,
  LEAD_CHAT_CHANNEL,
  resultMessage,
} from './goalRunTranscript';
import { GOAL_STATUSES } from './runStageCopy';
import { THREAD_GLYPH } from './threadIcons';
import { goalActionAvailable } from '../../Goals/goalActions';

const log = (event_type, details = {}, created_at = '2026-01-01T12:00:00Z', extra = {}) => ({
  id: `${event_type}-${created_at}`,
  event_type,
  details,
  created_at,
  ...extra,
});

describe('describeEvent', () => {
  it('speaks plainly rather than in pipeline terms', () => {
    const m = describeEvent(
      log('feasibility_done', { complexity_score: 0.31, success_probability: 0.92 })
    );
    expect(m.title).toBe('Looks doable');
    expect(m.detail).toBe('Complexity 31% · success probability 92%');
    expect(m.tone).toBe('ok');
  });

  it('carries the recommendation as a badge', () => {
    expect(describeEvent(log('feasibility_done', { recommendation: 'proceed' })).badge).toBe(
      'proceed'
    );
  });

  it('numbers phases from one, not zero', () => {
    expect(describeEvent(log('phase_evaluated', { phaseIndex: 0 })).title).toBe('Phase 1 complete');
    expect(describeEvent(log('phase_evaluated', { phaseIndex: 2 })).title).toBe('Phase 3 complete');
  });

  it('marks gates as needing the user', () => {
    expect(describeEvent(log('awaiting_approval')).tone).toBe('warn');
    expect(describeEvent(log('awaiting_context_approval')).tone).toBe('warn');
    expect(describeEvent(log('awaiting_tools')).tone).toBe('warn');
  });

  it('puts explicit approve controls on both human checkpoints', () => {
    const context = describeEvent(log('awaiting_context_approval'));
    const execution = describeEvent(log('awaiting_approval'));

    expect(context.actions.map((action) => action.type)).toEqual([
      'approve_context',
      'revise_context',
    ]);
    expect(execution.actions.map((action) => action.type)).toEqual([
      'approve_goal',
      'request_changes',
    ]);
  });

  it('marks a stopped run as an error', () => {
    expect(describeEvent(log('goal_failed', { reason: 'boom' })).tone).toBe('error');
    expect(describeEvent(log('budget_exhausted')).tone).toBe('error');
  });

  it('says an auto-approval happened rather than hiding it', () => {
    const m = describeEvent(log('context_auto_approved'));
    expect(m.title).toBe('Brief confirmed automatically');
    expect(m.detail).toMatch(/Approval checkpoints are off/);
  });

  it('surfaces a published deployment as a link', () => {
    expect(describeEvent(log('deployment_published', { url: 'https://x.test' })).link).toBe(
      'https://x.test'
    );
  });

  it('omits detail rather than printing an empty fragment', () => {
    expect(describeEvent(log('feasibility_done', {})).detail).toBeNull();
    expect(describeEvent(log('plan_created', {})).detail).toBeNull();
  });

  it('drops events that say nothing a person needs', () => {
    expect(describeEvent(log('smart_request_draft_created'))).toBeNull();
    expect(describeEvent(log('axwise_customer_intelligence_started'))).toBeNull();
  });

  it('ignores a malformed row instead of throwing', () => {
    expect(describeEvent(null)).toBeNull();
    expect(describeEvent({})).toBeNull();
    expect(() => describeEvent(log('plan_created', undefined))).not.toThrow();
  });

  // 90-odd event types exist and more get added. An unmapped one must still
  // read as something, and must not be silently cheerful if it is a failure.
  it('falls back readably for an unmapped event', () => {
    const m = describeEvent(log('some_new_stage_done'));
    expect(m.title).toBe('Some new stage done');
    expect(m.tone).toBe('info');
  });

  it('infers tone from an unmapped failure or gate', () => {
    expect(describeEvent(log('execution_blocked_task_changed')).tone).toBe('error');
    expect(describeEvent(log('awaiting_something_new')).tone).toBe('warn');
  });

  it('shows feedback or a reason on an unmapped event when there is one', () => {
    expect(describeEvent(log('mystery_event', { reason: 'because' })).detail).toBe('because');
  });

  it('humanizes an event type', () => {
    expect(humanizeEventType('goal_completed')).toBe('Goal completed');
    expect(humanizeEventType('')).toBe('');
  });
});

describe('RUN_EVENT_COPY coverage', () => {
  // Every terminal and blocked status a goal can reach has a matching event,
  // and those are the ones a user must never see rendered as raw snake_case.
  it('covers the events behind every blocking or terminal status', () => {
    const mustHave = [
      'awaiting_context_approval',
      'awaiting_approval',
      'awaiting_tools',
      'goal_completed',
      'goal_failed',
      'goal_cancelled',
      'goal_paused',
      'goal_needs_human',
    ];
    mustHave.forEach((t) => expect(RUN_EVENT_COPY[t]).toBeDefined());
  });

  it('keeps the status list it mirrors in view', () => {
    expect(GOAL_STATUSES).toContain('awaiting_approval');
    expect(GOAL_STATUSES).toContain('needs_human');
  });

  it('gives every mapped event a tone and a title', () => {
    Object.entries(RUN_EVENT_COPY).forEach(([type, copy]) => {
      expect(copy.tone, type).toBeTruthy();
      expect(copy.title, type).toBeTruthy();
    });
  });
});

describe('tasksForPhase', () => {
  const tasks = [
    { id: 'b', sequence_order: 2, data: { phase_index: 0 } },
    { id: 'a', sequence_order: 1, data: { phase_index: 0 } },
    { id: 'c', sequence_order: 1, data: { phase_index: 1 } },
  ];

  it('takes only the phase asked for, in plan order', () => {
    expect(tasksForPhase(tasks, 0).map((t) => t.id)).toEqual(['a', 'b']);
    expect(tasksForPhase(tasks, 1).map((t) => t.id)).toEqual(['c']);
  });

  it('is empty rather than undefined for a phase with no work', () => {
    expect(tasksForPhase(tasks, 9)).toEqual([]);
    expect(tasksForPhase(undefined, 0)).toEqual([]);
  });
});

describe('buildRunTranscript', () => {
  it('is empty before anything has happened', () => {
    expect(buildRunTranscript()).toEqual([]);
    expect(buildRunTranscript({ logs: [], messages: [] })).toEqual([]);
  });

  // op=get returns logs newest-first and capped at 50, while realtime appends
  // new rows to the end. The array genuinely arrives out of order.
  it('orders by time even when the source arrives newest-first', () => {
    const t = buildRunTranscript({
      logs: [
        log('plan_created', {}, '2026-01-01T12:05:00Z'),
        log('goal_created', {}, '2026-01-01T12:00:00Z'),
      ],
    });
    expect(t.map((m) => m.title)).toEqual(['Goal created', 'Plan ready']);
  });

  it('weaves agent messages into the stage lines by time', () => {
    const t = buildRunTranscript({
      logs: [log('plan_created', {}, '2026-01-01T12:00:00Z')],
      messages: [
        {
          id: 'm1',
          sender_name: 'Iris Vance',
          message: 'Starting on direction.',
          channel: 'team-room',
          created_at: '2026-01-01T12:01:00Z',
        },
      ],
    });
    expect(t.map((m) => m.kind)).toEqual(['event', 'chat']);
    expect(t[1]).toMatchObject({ who: 'Iris Vance', text: 'Starting on direction.' });
  });

  it('keeps system chatter out of the conversation', () => {
    const t = buildRunTranscript({
      messages: [
        {
          id: 'm1',
          sender_name: 'system',
          message: 'noise',
          channel: 'system',
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    expect(t).toEqual([]);
  });

  // The thread renders these from its own `chat` prop, where the lead's reply
  // keeps its action chips. Letting them through here would say it all twice.
  it('leaves the lead conversation to the chat half of the thread', () => {
    const t = buildRunTranscript({
      logs: [log('plan_created', {}, '2026-01-01T12:00:00Z')],
      messages: [
        {
          id: 'm1',
          sender_name: 'You',
          message: 'add a budget line',
          channel: LEAD_CHAT_CHANNEL,
          created_at: '2026-01-01T12:01:00Z',
        },
        {
          id: 'm2',
          sender_name: 'Iris Vance',
          message: 'On it.',
          channel: LEAD_CHAT_CHANNEL,
          created_at: '2026-01-01T12:02:00Z',
        },
      ],
    });
    expect(t.map((m) => m.kind)).toEqual(['event']);
  });

  it('still weaves the team room in alongside a lead exchange', () => {
    const t = buildRunTranscript({
      messages: [
        {
          id: 'm1',
          sender_name: 'You',
          message: 'hello',
          channel: LEAD_CHAT_CHANNEL,
          created_at: '2026-01-01T12:00:00Z',
        },
        {
          id: 'm2',
          sender_name: 'Iris Vance',
          message: 'Starting on direction.',
          channel: 'team-room',
          created_at: '2026-01-01T12:01:00Z',
        },
      ],
    });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: 'chat', text: 'Starting on direction.' });
  });

  it('ignores an empty agent message', () => {
    const t = buildRunTranscript({
      messages: [
        { id: 'm1', message: '', channel: 'team-room', created_at: '2026-01-01T12:00:00Z' },
      ],
    });
    expect(t).toEqual([]);
  });

  it('opens a phase section and hangs its work under it', () => {
    const t = buildRunTranscript({
      logs: [log('phase_started', { phaseIndex: 0, phaseName: 'Direction' })],
      tasks: [
        { id: 't1', title: 'Pick a palette', sequence_order: 1, data: { phase_index: 0 } },
        { id: 't2', title: 'Later work', sequence_order: 1, data: { phase_index: 1 } },
      ],
      goal: { plan: { phases: [{}, {}, {}] } },
    });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ kind: 'phase', label: 'Direction', phaseIndex: 0, total: 3 });
    expect(t[0].tasks.map((x) => x.id)).toEqual(['t1']);
  });

  it('names a phase by number when the plan did not name it', () => {
    const t = buildRunTranscript({ logs: [log('phase_started', { phaseIndex: 2 })] });
    expect(t[0].label).toBe('Phase 3');
  });

  it('carries the cost a stage incurred', () => {
    const t = buildRunTranscript({
      logs: [
        log('phase_evaluated', { phaseIndex: 0 }, '2026-01-01T12:00:00Z', { cost_usd: '0.42' }),
      ],
    });
    expect(t[0].cost).toBeCloseTo(0.42);
  });

  it('gives every message a unique id so the thread can key on it', () => {
    const ids = buildRunTranscript({
      logs: [
        log('goal_created', {}, '2026-01-01T12:00:00Z'),
        log('plan_created', {}, '2026-01-01T12:01:00Z'),
        log('phase_started', { phaseIndex: 0 }, '2026-01-01T12:02:00Z'),
      ],
      messages: [
        {
          id: 'm1',
          sender_name: 'A',
          message: 'hi',
          channel: 'team-room',
          created_at: '2026-01-01T12:03:00Z',
        },
      ],
    }).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('survives rows with no timestamp rather than throwing', () => {
    expect(() =>
      buildRunTranscript({ logs: [{ id: 'x', event_type: 'goal_created', created_at: null }] })
    ).not.toThrow();
  });

  it('reads a whole run in order', () => {
    const t = buildRunTranscript({
      logs: [
        log('goal_created', { budget_usd: 6 }, '2026-01-01T12:00:00Z'),
        log('feasibility_done', { recommendation: 'proceed' }, '2026-01-01T12:00:10Z'),
        log('plan_created', { phaseCount: 3, jobCount: 5 }, '2026-01-01T12:00:20Z'),
        log('team_approved', { leader: 'Iris Vance' }, '2026-01-01T12:00:30Z'),
        log('phase_started', { phaseIndex: 0, phaseName: 'Direction' }, '2026-01-01T12:00:40Z'),
        log('phase_evaluated', { phaseIndex: 0, quality_score: 91 }, '2026-01-01T12:01:00Z'),
        log('goal_completed', { totalCost: 3.17 }, '2026-01-01T12:02:00Z'),
      ],
      goal: { plan: { phases: [{}] } },
    });
    expect(t.map((m) => m.title || m.label)).toEqual([
      'Goal created',
      'Looks doable',
      'Plan ready',
      'Team picked',
      'Direction',
      'Phase 1 complete',
      'Done',
    ]);
  });
});

/**
 * Every case here failed silently before: the copy read a key the server does
 * not write, so the message rendered with an empty detail and the reader was
 * left with a headline and nothing else.
 */
describe('describeEvent reads the keys the server actually writes', () => {
  it('names the missing role instead of saying the team is short one', () => {
    const m = describeEvent(
      log('team_coverage_incomplete', {
        missing_roles: ['Poet'],
        required_roles: ['Team Lead', 'Poet'],
      })
    );
    expect(m.title).toBe('No agent can do Poet');
    expect(m.detail).toMatch(/Nobody in your workspace covers Poet/);
    // needs_human, so a plain retry would be refused - re-running the stage
    // is what actually rebuilds the team.
    expect(m.actions.map((a) => a.type)).toEqual(['resolve_retry_stage', 'resolve_retry_stage']);
    expect(m.actions[0].params.stage).toBe('team-formation');
  });

  it('counts the questions from question_count', () => {
    expect(describeEvent(log('po_questions_generated', { question_count: 3 })).detail).toMatch(
      /^3 to answer/
    );
  });

  it('explains an iteration with the feedback that caused it', () => {
    const m = describeEvent(
      log('iteration_started', { iteration: 2, feedback: 'The draft was empty.' })
    );
    expect(m.detail).toBe('The draft was empty.');
    expect(m.badge).toBe('Attempt 2');
  });

  it('falls back to the new strategy when there is no feedback', () => {
    expect(describeEvent(log('iteration_started', { newStrategy: 'Single writer.' })).detail).toBe(
      'New plan: Single writer.'
    );
  });

  it('says which agent is struggling and on what', () => {
    const m = describeEvent(
      log('agent_warning', { agent_name: 'Ada', task_title: 'Draft the poem', failure_count: 2 })
    );
    expect(m.title).toBe('Ada is struggling');
    expect(m.detail).toBe('On “Draft the poem” · 2 failed attempts');
  });

  it('describes an underperforming agent by its score, not an absent name', () => {
    expect(
      describeEvent(log('agent_flagged_underperforming', { avg_quality: 41.6, tuning_count: 1 }))
        .detail
    ).toBe('Averaging 42/100 · 1 prompt adjustments applied');
  });

  it('reads the escalation text a healing strategy writes as last_failure', () => {
    const m = describeEvent(log('goal_needs_human', { last_failure: 'No agent could write it.' }));
    expect(m.detail).toBe('No agent could write it.');
    expect(m.actions.map((a) => a.type)).toEqual([
      'heal_goal',
      'resolve_retry_stage',
      'cancel_goal',
    ]);
  });

  it('reads the estimate from estimated_cost and estimated_time', () => {
    expect(
      describeEvent(log('proposal_ready', { estimated_cost: 1.5, estimated_time: 20 })).detail
    ).toBe('About $1.50 · 20 minutes');
  });

  it('reads the budget warning reason the server writes', () => {
    const m = describeEvent(log('budget_warning', { reason: '80% of budget used.' }));
    expect(m.detail).toBe('80% of budget used.');
  });

  it('reads the OSJA grade from overallGrade', () => {
    expect(describeEvent(log('osja_review_completed', { overallGrade: 'A' })).detail).toBe(
      'Grade A.'
    );
  });

  it('explains the strict PRD gate and focused repair without generic filler', () => {
    expect(
      describeEvent(
        log('prd_quality_attested', {
          score: 97,
          threshold: 95,
          artifact_hash: 'artifact-1',
          scope_hash: 'scope-1',
        })
      )
    ).toMatchObject({
      tone: 'ok',
      title: 'PRD quality verified',
      detail: '97/95; exact scope and artifact hashes verified.',
    });

    expect(
      describeEvent(
        log('prd_quality_validation_failed', {
          score: 91,
          threshold: 95,
          repair: { status: 'queued' },
        })
      )
    ).toMatchObject({
      tone: 'warn',
      title: 'The PRD needs a focused repair',
      detail: '91/95. Repairing only the failed sections now.',
    });
  });

  it('uses deliverable-neutral quality copy for non-PRD AxWise work', () => {
    expect(
      describeEvent(
        log('prd_quality_attested', {
          deliverable_profile: 'axwise_workflow',
          score: 97,
          threshold: 95,
        })
      )
    ).toMatchObject({
      title: 'Final deliverable quality verified',
      detail: '97/95; exact scope and artifact hashes verified.',
    });

    expect(
      describeEvent(
        log('prd_quality_repair_started', {
          deliverable_profile: 'axwise_workflow',
          sections: ['Audience', 'Measurement'],
        })
      )
    ).toMatchObject({
      running: 'Repairing the final deliverable',
      title: 'Repairing failed deliverable parts',
      detail: '2 sections targeted; passing content stays unchanged.',
    });

    expect(
      describeEvent(
        log('prd_quality_completion_refused', {
          deliverable_profile: 'axwise_workflow',
        })
      ).title
    ).toBe('The final deliverable changed during validation');
  });

  it('reads the audience from customer_persona', () => {
    expect(
      describeEvent(
        log('axwise_customer_intelligence_completed', {
          customer_persona: 'Indie founders',
          evidence_count: 4,
        })
      ).detail
    ).toBe('Audience: Indie founders · 4 pieces of evidence');
  });
});

describe('describeEvent never shows a raw reason code', () => {
  it('explains plan_replaced_by_iteration in words', () => {
    const m = describeEvent(
      log('execution_approval_invalidated', { reason: 'plan_replaced_by_iteration' })
    );
    expect(m.detail).not.toMatch(/_/);
    expect(m.detail).toMatch(/plan changed/i);
    // It re-approves itself, so offering a button would be busywork.
    expect(m.actions).toBeNull();
  });

  it('offers approval when the invalidation genuinely needs one', () => {
    const m = describeEvent(
      log('execution_approval_invalidated', { reason: 'proposal_changed_before_approval' })
    );
    expect(m.actions.map((a) => a.type)).toEqual(['approve_goal']);
  });

  it('explains a blocked task from its reason codes', () => {
    const m = describeEvent(
      log('execution_blocked_task_authorization', {
        task_id: 't1',
        reasons: ['execution_approval_stale'],
      })
    );
    expect(m.detail).toMatch(/no longer matches the work about to run/i);
    expect(m.detail).toMatch(/Reopen the proposal/);
  });

  it.each([
    ['research_execution_boundary_blocked', 'Research context needs refreshing'],
    ['execution_authorization_incomplete', 'The team is not ready to start'],
    ['execution_blocked_missing_proposal_approval', 'The plan needs your approval again'],
    ['goal_resolved_by_human', 'Change accepted'],
    ['goal_healed', 'Recovered and resumed'],
  ])('maps %s to product copy', (eventType, title) => {
    const message = describeEvent(log(eventType));
    expect(message.title).toBe(title);
    expect(message.title).not.toContain('_');
  });

  it('turns a missing-tool proposal block into the tool recovery controls', () => {
    const message = describeEvent(
      log('execution_blocked_missing_proposal_approval', {
        authorization_issues: [{ code: 'task_tool_missing' }],
      })
    );

    expect(message.title).toBe('Connect a tool before work starts');
    expect(message.actions.map((action) => action.type)).toEqual([
      'unblock_credentials',
      'resolve_retry_no_tools',
    ]);
  });

  it('turns missing API-key diagnostics into one safe, direct recovery link', () => {
    const message = describeEvent(
      log('goal_needs_human', {
        classification: 'llm_api_key_required',
        action: 'feasibility-analysis',
        reason: 'BYOK_REQUIRED: internal provider diagnostic',
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
      })
    );

    expect(message).toMatchObject({
      title: 'Connect an AI key',
      detail: 'Add your Gemini API key, then return here and retry this stage.',
      link: '/settings/keys',
      linkLabel: 'Open API Keys',
      actions: [
        {
          type: 'resolve_retry_stage',
          label: 'Retry with this key',
          params: { stage: 'feasibility-analysis' },
        },
      ],
    });
    expect(JSON.stringify(message)).not.toContain('BYOK_REQUIRED');
  });

  it('keeps a nonzero execute-phase index in the missing-key retry action', () => {
    const message = describeEvent(
      log('goal_needs_human', {
        classification: 'llm_api_key_required',
        action: 'execute-phase',
        phase_index: 2,
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
      })
    );

    expect(message.actions).toEqual([
      {
        type: 'resolve_retry_stage',
        label: 'Retry with this key',
        params: { stage: 'execute-phase', phaseIndex: 2 },
      },
    ]);
  });
});

describe('the thread ends with what to do now', () => {
  const goalWith = (status, data = {}) => ({ id: 'g1', status, data });

  it('shows the one native material question with only an answer action', () => {
    const scopeHash = 'a'.repeat(64);
    const materialQuestion = 'Which approved customer segment should receive the pilot?';
    const out = buildRunTranscript({
      logs: [
        log('awaiting_context_approval', {}, '2026-01-01T11:00:00Z'),
        log('awaiting_context_approval', {}, '2026-01-01T12:00:00Z'),
      ],
      goal: goalWith('awaiting_context_approval', {
        axwise_customer_intelligence: {
          scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: scopeHash },
          scope_validation: {
            version: 'axwise_scope_validation_v1',
            scope_hash: scopeHash,
            valid: true,
            ready_for_synthesis: false,
          },
          axwise_scope_confirmation: {
            status: 'needs_material_input',
            primary_action: 'answer',
            material_question: materialQuestion,
            scope_hash: scopeHash,
          },
        },
      }),
    });

    const questionMessages = out.filter((message) => message.detail === materialQuestion);
    expect(questionMessages).toHaveLength(1);
    expect(questionMessages[0]).toMatchObject({
      title: 'AxWise needs one answer',
      actions: [{ type: 'revise_context', label: 'Answer AxWise' }],
    });
    expect(out.flatMap((message) => message.actions || []).map((action) => action.type)).toEqual([
      'revise_context',
    ]);
  });

  it('surfaces goal.data.failure_reason on a needs_human goal', () => {
    const out = buildRunTranscript({
      logs: [log('plan_created', { phaseCount: 1, jobCount: 1 })],
      goal: goalWith('needs_human', { failure_reason: 'No agent could write the poem.' }),
    });
    const last = out[out.length - 1];
    expect(last.blocked).toBe(true);
    expect(last.detail).toBe('No agent could write the poem.');
    expect(last.actions.map((a) => a.type)).toContain('heal_goal');
  });

  it('keeps a missing API key as a single actionable blocked message', () => {
    const out = buildRunTranscript({
      logs: [
        log('goal_needs_human', {
          classification: 'llm_api_key_required',
          action: 'feasibility-analysis',
          recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
        }),
      ],
      goal: goalWith('needs_human', {
        failure_code: 'llm_api_key_required',
        failure_stage: 'feasibility-analysis',
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
      }),
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      blocked: true,
      title: 'Connect an AI key',
      link: '/settings/keys',
      linkLabel: 'Open API Keys',
    });
    expect(out[0].actions).toEqual([
      {
        type: 'resolve_retry_stage',
        label: 'Retry with this key',
        params: { stage: 'feasibility-analysis' },
      },
    ]);
  });

  it("keeps the blocked goal's nonzero execute-phase index in its retry action", () => {
    const out = buildRunTranscript({
      logs: [],
      goal: goalWith('needs_human', {
        failure_code: 'llm_api_key_required',
        failure_stage: 'execute-phase',
        failure_phase_index: 2,
        recovery_action: { label: 'Open API Keys', target_url: '/settings/keys' },
      }),
    });

    expect(out[0].actions).toEqual([
      {
        type: 'resolve_retry_stage',
        label: 'Retry with this key',
        params: { stage: 'execute-phase', phaseIndex: 2 },
      },
    ]);
  });

  it('does not resurrect a missing-key prompt after retry cleanup cleared its metadata', () => {
    const out = buildRunTranscript({
      logs: [],
      goal: goalWith('needs_human', {
        failure_code: null,
        failure_reason: null,
        failure_stage: null,
        recovery_action: null,
        failure_at: null,
        failure_stack: null,
        failed_at: null,
      }),
    });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      blocked: true,
      title: 'Needs you',
      link: null,
      linkLabel: null,
    });
    expect(JSON.stringify(out[0])).not.toContain('Gemini API key');
    expect(JSON.stringify(out[0])).not.toContain('Open API Keys');
    expect(out[0].actions.map((action) => action.type)).toContain('heal_goal');
  });

  it('does not repeat itself when the last stage line is already actionable', () => {
    const out = buildRunTranscript({
      logs: [log('goal_needs_human', { reason: 'Nobody could do it.' })],
      goal: goalWith('needs_human', { failure_reason: 'Nobody could do it.' }),
    });
    expect(out.filter((m) => m.blocked)).toHaveLength(1);
    expect(out[out.length - 1].detail).toBe('Nobody could do it.');
  });

  it('offers the tool controls on an awaiting_tools goal', () => {
    const out = buildRunTranscript({ logs: [], goal: goalWith('awaiting_tools') });
    expect(out[0].actions.map((a) => a.type)).toEqual([
      'unblock_credentials',
      'resolve_retry_no_tools',
    ]);
  });

  it('offers resume on a paused goal and nothing on a running one', () => {
    expect(blockedMessage({ status: 'paused', data: {} }).actions[0].type).toBe('resume_goal');
    expect(blockedMessage({ status: 'active', data: {} })).toBeNull();
    // The approval gates render their own cards; a second prompt would read
    // as two separate problems.
    expect(blockedMessage({ status: 'awaiting_approval', data: {} })).toBeNull();
    expect(blockedMessage({ status: 'awaiting_context_approval', data: {} })).toBeNull();
  });
});

describe('no raw code ever reaches the reader', () => {
  it('translates a detail that is itself a code', () => {
    expect(readableDetail('context_approval_stale')).toMatch(/brief no longer matches/i);
    expect(readableDetail('some_unknown_code')).toBe('Some unknown code.');
  });

  it('leaves a real sentence alone', () => {
    expect(readableDetail('No agent could write the poem.')).toBe('No agent could write the poem.');
    expect(readableDetail('')).toBeNull();
  });

  it('does not print a code on an unmapped event that carries one', () => {
    const m = describeEvent(log('some_future_event', { reason: 'goal_not_active' }));
    expect(m.detail).not.toMatch(/^[a-z_]+$/);
    expect(m.detail).toMatch(/not running/i);
  });

  it('does not print a code as the closing blocked message', () => {
    const out = buildRunTranscript({
      logs: [],
      goal: { id: 'g1', status: 'failed', data: { failure_reason: 'execution_approval_stale' } },
    });
    expect(out[0].detail).toMatch(/no longer matches the work about to run/i);
  });
});

/**
 * Every button must be one the server would accept.
 *
 * A control that returns 400 is worse than no control: the message looks
 * actionable, the click changes nothing, and the reader is back at the dead end
 * this whole pass exists to remove. The status beside each event is the one the
 * pipeline leaves the goal in when it writes that event - see the emitter cited
 * in the comment.
 */
describe('every attached action is valid for the state that shows it', () => {
  const CASES = [
    // team-formation.js sets needs_human before logging coverage_incomplete
    ['team_coverage_incomplete', 'needs_human'],
    // tool-provisioning.js parks on awaiting_tools
    ['awaiting_tools', 'awaiting_tools'],
    // execute-phase.js pauses the goal, then logs budget_exhausted
    ['budget_exhausted', 'paused'],
    // evaluate-phase.js fails the goal, then logs budget_exhausted
    ['budget_exhausted', 'failed'],
    // execute-phase.js logs budget_warning without touching status
    ['budget_warning', 'active'],
    ['goal_failed', 'failed'],
    ['goal_needs_human', 'needs_human'],
    ['goal_paused', 'paused'],
    // execute-task.js parks on awaiting_approval before logging the block
    ['execution_blocked_task_authorization', 'awaiting_approval'],
    // client-approval.js logs this while the goal waits on the gate
    ['execution_approval_invalidated', 'awaiting_approval'],
    // pm-planning.js / iterate.js set needs_human on an alignment failure
    ['plan_role_alignment_incomplete', 'needs_human'],
  ];

  it.each(CASES)('%s on a %s goal offers only actions the server accepts', (type, status) => {
    const details =
      type === 'execution_approval_invalidated'
        ? { reason: 'proposal_changed_before_approval' }
        : {};
    const actions = describeEvent(log(type, details))?.actions || [];
    for (const action of actions) {
      expect(
        goalActionAvailable(action.type, { status }),
        `${type} offers ${action.type}, which the server refuses on a ${status} goal`
      ).toBe(true);
    }
  });

  it.each([['needs_human'], ['failed'], ['awaiting_tools'], ['paused']])(
    'the closing message on a %s goal offers only accepted actions',
    (status) => {
      const message = blockedMessage({ id: 'g1', status, data: {} });
      expect(message.actions.length).toBeGreaterThan(0);
      for (const action of message.actions) {
        expect(
          goalActionAvailable(action.type, { status }),
          `${status} offers ${action.type}, which the server refuses`
        ).toBe(true);
      }
    }
  );

  it('offers nothing on a budget warning, because the goal is still running', () => {
    // An active goal is not resolvable. Better a plain warning than a button
    // that always fails.
    expect(describeEvent(log('budget_warning', { reason: '80% used.' })).actions).toBeNull();
  });

  describe('every line carries a shape', () => {
    // The marker is the first thing read on a stage line. Built without one it
    // falls back to a tick for everything, which is what made the run illegible.
    it('attaches the glyph the event means, not the one its tone implies', () => {
      const [line] = buildRunTranscript({
        logs: [
          {
            id: 'l1',
            event_type: 'plan_created',
            details: { phases: 2 },
            created_at: '2026-01-01T12:00:00Z',
          },
        ],
      });
      expect(line.glyph).toBe(THREAD_GLYPH.plan);
      // Not the generic tick every ok-toned event used to get.
      expect(line.glyph).not.toBe(THREAD_GLYPH.done);
    });

    it('gives the blocked message a shape for the way it stopped', () => {
      const message = blockedMessage({ id: 'g1', status: 'paused', data: {} }, 0);
      expect(message.glyph).toBe(THREAD_GLYPH.paused);
    });
  });
});

/**
 * A finished run that never says what it produced is where this whole feature
 * started: the thread ended on "Done" and a figure, and the person who typed
 * the sentence had to go and find their own work somewhere else.
 */
describe('the message that closes a finished run', () => {
  const completed = (data = {}) => ({ id: 'g1', status: 'completed', data });
  const doneTask = { id: 't1', status: 'done', data: { output: '# Brief' } };

  it('says what came out, once the run is over', () => {
    const m = resultMessage(completed({ deliverables: [{ id: 'd1', title: 'Risk matrix' }] }));
    expect(m.kind).toBe('result');
    expect(m.title).toBe('Your result');
    expect(m.tone).toBe('ok');
    expect(m.deliverables).toHaveLength(1);
  });

  it('stays quiet while the run is still going', () => {
    for (const status of ['active', 'planning', 'awaiting_approval', 'paused']) {
      expect(
        resultMessage({ id: 'g1', status, data: { deliverables: [{ id: 'd1' }] } })
      ).toBeNull();
    }
  });

  it('stays quiet for a run that stopped rather than finished', () => {
    for (const status of ['failed', 'cancelled', 'needs_human']) {
      expect(
        resultMessage({ id: 'g1', status, data: { deliverables: [{ id: 'd1' }] } })
      ).toBeNull();
    }
  });

  it('does not open an empty card under a goal that produced nothing', () => {
    expect(resultMessage(completed())).toBeNull();
    expect(resultMessage(completed({ deliverables: [] }), { tasks: [] })).toBeNull();
  });

  it('counts a done task with output as something produced', () => {
    expect(resultMessage(completed(), { tasks: [doneTask] })).not.toBeNull();
    expect(
      resultMessage(completed(), { tasks: [{ id: 't2', status: 'todo', data: {} }] })
    ).toBeNull();
  });

  it('counts a published site as something produced, and carries the link', () => {
    const m = resultMessage(completed({ deployment_url: 'https://example.com' }));
    expect(m).not.toBeNull();
    expect(m.liveUrl).toBe('https://example.com');
  });

  it('carries the pitch, the summary and the team lead sign-off', () => {
    const m = resultMessage(
      completed({
        deliverables: [{ id: 'd1' }],
        project_overview: {
          one_liner: 'A zero-capital plan you can start on Monday.',
          summary: 'Four sentences of stakeholder brief.',
          team_lead_note: '  Team shipped all three phases.  ',
        },
      })
    );
    expect(m.headline).toBe('A zero-capital plan you can start on Monday.');
    expect(m.summary).toBe('Four sentences of stakeholder brief.');
    expect(m.leadNote).toBe('Team shipped all three phases.');
  });

  it('uses the passed PRD attestation as a compact, evidence-bound sign-off', () => {
    const m = resultMessage(
      completed({
        deliverables: [{ id: 'd1', output: '# PRD: ScopeConfirm\n\nComplete.' }],
        project_overview: {
          one_liner: 'A generated pitch that would duplicate the artifact.',
          summary: 'A generated summary that would duplicate the artifact.',
          team_lead_note: 'A third generated restatement.',
        },
        prd_quality_attestation: {
          status: 'passed',
          score: 96,
          section_count: 16,
          requirement_count: 43,
          linked_test_count: 18,
          open_decision_count: 3,
        },
      })
    );

    expect(m.title).toBe('Done - PRD: ScopeConfirm');
    expect(m.quality).toEqual({
      score: 96,
      sectionCount: 16,
      requirementCount: 43,
      linkedTestCount: 18,
      openDecisionCount: 3,
    });
    expect(m.headline).toBeNull();
    expect(m.summary).toBeNull();
    expect(m.leadNote).toBeNull();
  });

  it('never prints the server own failure sentence as the summary', () => {
    const m = resultMessage(
      completed({
        deliverables: [{ id: 'd1' }],
        project_overview: {
          summary: 'Project Overview generation failed - see Work Log tab for raw deliverables.',
        },
      })
    );
    expect(m.summary).toBeNull();
  });

  it('holds the tasks by reference, so the results block memoises', () => {
    const tasks = [doneTask];
    expect(resultMessage(completed(), { tasks }).tasks).toBe(tasks);
  });

  it('closes the thread, after the run has reported itself done', () => {
    const out = buildRunTranscript({
      logs: [log('goal_completed', { totalCost: 0.08 })],
      goal: completed({ deliverables: [{ id: 'd1', title: 'Risk matrix' }] }),
    });
    expect(out.at(-1).kind).toBe('result');
    expect(out.at(-2).title).toBe('Done');
  });

  it('adds nothing to a run that is still going', () => {
    const out = buildRunTranscript({
      logs: [log('plan_created', { phaseCount: 3 })],
      goal: { id: 'g1', status: 'active', data: { deliverables: [{ id: 'd1' }] } },
    });
    expect(out.some((m) => m.kind === 'result')).toBe(false);
  });

  it('times itself to when the goal actually completed', () => {
    const completedAt = '2026-01-01T13:30:00Z';
    const out = buildRunTranscript({
      logs: [log('goal_completed', {})],
      goal: completed({ deliverables: [{ id: 'd1' }], completed_at: completedAt }),
    });
    expect(out.at(-1).at).toBe(new Date(completedAt).getTime());
  });
});

/**
 * Which row is moving.
 *
 * The marker is the only thing on a long thread that says "this is now". It
 * used to land on the wrong row - a finished stage line, while the phase doing
 * the actual work sat still underneath it - and it never landed on a gate at
 * all, so the one row asking for a person was the deadest thing on the screen.
 */
describe('what the thread marks as still happening', () => {
  const running = (over = {}) => ({ id: 'g1', status: 'active', ...over });
  const liveIds = (out) => out.filter((m) => m.live).map((m) => m.id);

  it('turns the newest stage while it is still running', () => {
    const out = buildRunTranscript({
      logs: [log('plan_created', { phaseCount: 3 }), log('team_approved', { member_count: 4 })],
      goal: running(),
    });
    expect(liveIds(out)).toEqual([out.at(-1).id]);
    expect(out.at(-1).running).toBe('Picking the team');
  });

  // The reason "Waiting on you" never moved: the scan required an ok tone.
  it('keeps the row that is waiting on a person alive', () => {
    const out = buildRunTranscript({
      logs: [log('plan_created', {}), log('awaiting_approval', {})],
      goal: running({ status: 'awaiting_approval' }),
    });
    expect(out.at(-1).title).toBe('Waiting on you');
    expect(out.at(-1).live).toBe(true);
  });

  // The scan used to walk straight past a phase to the stage line above it, so
  // the marker turned on work that had already finished.
  it('marks the phase doing the work, not the stage line above it', () => {
    const out = buildRunTranscript({
      logs: [
        log('proposal_ready', { estimated_cost: 1 }, '2026-01-01T12:00:00Z'),
        log('phase_started', { phaseIndex: 0, phaseName: 'Research' }, '2026-01-01T12:01:00Z'),
      ],
      tasks: [
        {
          id: 't1',
          title: 'Dig',
          status: 'inProgress',
          sequence_order: 0,
          data: { phase_index: 0 },
        },
      ],
      goal: running(),
    });
    const phase = out.find((m) => m.kind === 'phase');
    const stage = out.find((m) => m.title === 'Estimate ready' || m.running === 'Costing it out');
    expect(phase.live).toBe(true);
    expect(stage.live).toBeFalsy();
  });

  it('settles a phase once its work is done', () => {
    const out = buildRunTranscript({
      logs: [log('phase_started', { phaseIndex: 0 })],
      tasks: [
        { id: 't1', title: 'Dig', status: 'done', sequence_order: 0, data: { phase_index: 0 } },
      ],
      goal: running(),
    });
    expect(out.find((m) => m.kind === 'phase').live).toBe(false);
  });

  // Paused says "Nothing is running right now" in its own detail line. A
  // pulsing marker over that sentence would contradict it.
  it('stops everything moving once the run has stopped, paused included', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'paused']) {
      const out = buildRunTranscript({
        logs: [log('phase_started', { phaseIndex: 0 }), log('proposal_ready', {})],
        tasks: [
          {
            id: 't1',
            title: 'Dig',
            status: 'inProgress',
            sequence_order: 0,
            data: { phase_index: 0 },
          },
        ],
        goal: { id: 'g1', status, data: {} },
      });
      expect(liveIds(out)).toEqual([]);
    }
  });

  it('keeps pulsing while a stopped run is waiting on a person, but not while it is simply stopped', () => {
    const waiting = blockedMessage({ id: 'g1', status: 'needs_human', data: {} });
    const tools = blockedMessage({ id: 'g1', status: 'awaiting_tools', data: {} });
    const paused = blockedMessage({ id: 'g1', status: 'paused', data: {} });
    const failed = blockedMessage({ id: 'g1', status: 'failed', data: {} });
    expect([waiting.live, tools.live]).toEqual([true, true]);
    expect([paused.live, failed.live]).toEqual([false, false]);
  });
});
