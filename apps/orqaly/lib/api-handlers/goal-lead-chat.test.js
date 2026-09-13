/**
 * Tests for POST /api/app?path=goal-lead-chat.
 * Mocks auth, rate-limit, security guard, Supabase admin, and the LLM executor.
 * Covers: auth gate, validation, ownership (404), cheap-mode reply,
 * and chosen-model passthrough to executeLlmV2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn(() => false) }));

const mockUser = { id: 'user-1', email: 'tester@example.com' };
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => mockUser),
}));

vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'rl-id'),
  applyRateLimitHeaders: vi.fn(),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../security/content-guard.js', () => ({
  guardUserContent: vi.fn((text) => ({ action: 'allow', cleaned: text })),
  blockedResponse: vi.fn((res) => res.status(400).json({ error: 'blocked' })),
}));

vi.mock('../security/audit-security-event.js', () => ({
  auditSecurityEvent: vi.fn(async () => {}),
}));

const executeLlmV2 = vi.fn(async () => ({
  content: 'On track — phase 1 is wrapping up.',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  usage: { total_tokens: 42 },
  durationMs: 123,
}));
vi.mock('../concilium-handlers/llm-executor-v2.js', () => ({
  executeLlmV2: (...args) => executeLlmV2(...args),
  parseLlmJson: vi.fn((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }),
}));

// The handler now calls executeLlmV2Tracked (a drop-in wrapper). Strip the
// usage-recording context and delegate to the same executeLlmV2 mock so the
// provider/model assertions below continue to observe the real call options.
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmV2Tracked: ({ usage: _usage, ...opts } = {}) => executeLlmV2(opts),
  executeLlmTracked: ({ usage: _usage, ...opts } = {}) => executeLlmV2(opts),
}));

const { withAxwiseTracked } = vi.hoisted(() => ({
  withAxwiseTracked: vi.fn(async () => ({ processedOutputs: {}, degraded: false, skipped: false })),
}));
vi.mock('../integrations/axwise/index.js', () => ({
  withAxwiseTracked,
  buildCopilotContext: (o) => ({ integrationPoint: 'copilot.chat', ...o }),
}));

// Configurable per-table results for the admin client mock.
let goalRow = {
  id: 'goal-1',
  title: 'Ship feature',
  description: 'd',
  status: 'active',
  budget_usd: 10,
  spent_usd: 1,
  plan: { phases: [] },
};
let goalError = null;
let jobRows = [];
let taskRows = [];
let goalLogRows = [];
let boardRows = [];
let memberRows = [];
let goalLogSelects = 0;
let teamTaskSelects = [];
// Rows the handler writes back, so the persisted conversation can be asserted.
let insertedMessages = [];
let insertError = null;

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({
    from: (table) => {
      const builder = {
        select: (columns) => {
          if (table === 'goal_log') goalLogSelects += 1;
          if (table === 'team_tasks') teamTaskSelects.push(columns);
          return builder;
        },
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        insert: async (rows) => {
          if (insertError) throw insertError;
          if (table === 'goal_messages') insertedMessages.push(...rows);
          return { error: null };
        },
        single: async () =>
          table === 'goals' ? { data: goalRow, error: goalError } : { data: null, error: null },
        then: (resolve) => {
          const data =
            table === 'jobs'
              ? jobRows
              : table === 'team_tasks'
                ? taskRows
                : table === 'goal_log'
                  ? goalLogRows
                  : table === 'concilium_boards_v2'
                    ? boardRows
                    : table === 'concilium_members_v2'
                      ? memberRows
                      : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  })),
}));

import handler from './goal-lead-chat.js';
import { getBearerToken } from '../../api/_lib/auth.js';
import { cors } from '../../api/_lib/cors.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';

function makeRes() {
  return {
    _status: 200,
    _body: null,
    _headers: {},
    status(c) {
      this._status = c;
      return this;
    },
    json(b) {
      this._body = b;
      return this;
    },
    end() {
      return this;
    },
    setHeader(k, v) {
      this._headers[k] = v;
    },
  };
}

function makeReq(body) {
  return { method: 'POST', headers: {}, query: {}, url: '/api/goal-lead-chat', body };
}

function acceptedNativeGoalWithCurrentAttempt(overrides = {}) {
  const goal = acceptedNativeGoalFixture({ status: 'active', ...overrides });
  const scopeHash = goal.data.axwise_customer_intelligence.scope_packet.scope_hash;
  const formation = {
    version: 'orqaly_team_formation_attempt_v1',
    attempt_id: 'formation-current',
    status: 'completed',
    scope_hash: scopeHash,
    planning_attempt_id: 'planning-current',
    plan_hash: 'b'.repeat(64),
  };
  goal.data.native_planning_attempt = {
    version: 'orqaly_native_planning_attempt_v1',
    attempt_id: 'planning-current',
    status: 'completed',
    scope_hash: scopeHash,
    plan_hash: formation.plan_hash,
    plan_snapshot: structuredClone(goal.plan),
  };
  goal.data.team_formation_attempt = formation;
  goal.data.native_team_formation_attempt = { ...formation };
  goal.data.team_work_materialization = {
    version: 'orqaly_team_work_materialization_v1',
    formation_attempt: formation.attempt_id,
    native_scope_hash: scopeHash,
    research_attempt_key: null,
  };
  return goal;
}

beforeEach(() => {
  vi.clearAllMocks();
  goalRow = {
    id: 'goal-1',
    title: 'Ship feature',
    description: 'd',
    status: 'active',
    budget_usd: 10,
    spent_usd: 1,
    plan: { phases: [] },
    data: {},
  };
  goalError = null;
  jobRows = [];
  taskRows = [];
  goalLogRows = [];
  boardRows = [];
  memberRows = [];
  goalLogSelects = 0;
  teamTaskSelects = [];
});

describe('goal-lead-chat handler', () => {
  it('rejects unauthenticated requests', async () => {
    getBearerToken.mockReturnValueOnce(null);
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'hi' }), res);
    expect(res._status).toBe(401);
  });

  it('requires goalId', async () => {
    const res = makeRes();
    await handler(makeReq({ message: 'hi' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/goalId/i);
  });

  it('requires a non-empty message', async () => {
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: '   ' }), res);
    expect(res._status).toBe(400);
    expect(res._body.error).toMatch(/message/i);
  });

  it('returns 404 when the goal is not owned by the user', async () => {
    goalRow = null;
    goalError = { message: 'no rows' };
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-x', message: 'status?' }), res);
    expect(res._status).toBe(404);
  });

  it('rejects a misrouted scope correction before AxWise advisory or lead-model work', async () => {
    goalRow.status = 'awaiting_po_input';
    goalRow.data = {
      axwise_customer_intelligence: {
        status: 'human_clarification',
        clarification_scope: { scope_hash: 'a'.repeat(64) },
      },
    };
    const res = makeRes();

    await handler(makeReq({ goalId: 'goal-1', message: 'Change this to a retail campaign.' }), res);

    expect(res._status).toBe(409);
    expect(withAxwiseTracked).not.toHaveBeenCalled();
    expect(executeLlmV2).not.toHaveBeenCalled();
  });

  it('answers a genuine scope-gate question locally without letting generic chat reinterpret it', async () => {
    goalRow.status = 'awaiting_context_approval';
    goalRow.data = {
      scope_admission: { state_key: 'axwise_customer_intelligence' },
      axwise_customer_intelligence: {
        scope_packet: { version: 'axwise_scope_packet_v1', scope_hash: 'b'.repeat(64) },
      },
    };
    const res = makeRes();

    await handler(makeReq({ goalId: 'goal-1', message: 'Why does this target Estonia?' }), res);

    expect(res._status).toBe(200);
    expect(res._body.mode).toBe('scope-review');
    expect(res._body.reply).toMatch(/does not change or approve/i);
    expect(withAxwiseTracked).not.toHaveBeenCalled();
    expect(executeLlmV2).not.toHaveBeenCalled();
  });

  it('rejects proceed while a canonical AxWise revision is still building', async () => {
    goalRow.status = 'analyzing';
    goalRow.data = {
      scope_admission: { state_key: 'axwise_customer_intelligence' },
      scope_revision: {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-1',
      },
    };
    const res = makeRes();

    await handler(makeReq({ goalId: 'goal-1', message: 'Proceed' }), res);

    expect(res._status).toBe(409);
    expect(withAxwiseTracked).not.toHaveBeenCalled();
    expect(executeLlmV2).not.toHaveBeenCalled();
  });

  it('does not treat an unrelated legacy analyzing goal as an AxWise scope build', async () => {
    goalRow.status = 'analyzing';
    goalRow.data = {};
    const res = makeRes();

    await handler(makeReq({ goalId: 'goal-1', message: 'Proceed' }), res);

    expect(res._status).toBe(200);
    expect(executeLlmV2).toHaveBeenCalledTimes(1);
  });

  it('records an AxWise copilot.chat call for a substantive message (shadow: reply still returns)', async () => {
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'how is the team doing this week?' }), res);
    expect(withAxwiseTracked).toHaveBeenCalledTimes(1);
    expect(withAxwiseTracked.mock.calls[0][0].integrationPoint).toBe('copilot.chat');
    expect(res._status).toBe(200);
    expect(res._body.blocked).toBeUndefined();
    expect(res._body.reply).toBeTruthy();
  });

  it('blocks the reply when AxWise denies under authoritative enforcement', async () => {
    const prev = process.env.AXWISE_ENFORCE;
    process.env.AXWISE_ENFORCE = 'authoritative';
    withAxwiseTracked.mockResolvedValueOnce({
      degraded: false,
      skipped: false,
      processedOutputs: {
        security: { scopeDecision: 'denied', blockReason: 'Not permitted here.' },
      },
    });
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'do something restricted' }), res);
    expect(res._status).toBe(200);
    expect(res._body.blocked).toBe(true);
    expect(res._body.reply).toBe('Not permitted here.');
    process.env.AXWISE_ENFORCE = prev;
  });

  it('cheap mode returns a reply via the exact platform default', async () => {
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'how are we doing?' }), res);
    expect(res._status).toBe(200);
    expect(res._body.reply).toBe('On track — phase 1 is wrapping up.');
    expect(res._body.mode).toBe('cheap');
    const call = executeLlmV2.mock.calls[0][0];
    expect(call.provider).toBe('gemini');
    expect(call.model).toBe('gemini-3.8-flash');
  });

  it('omits superseded-attempt agents and tasks from the lead context', async () => {
    goalRow.data = { axwise_orchestration: { decision_id: 'decision-current' } };
    jobRows = [{ id: 'job-old' }, { id: 'job-current' }];
    taskRows = [
      {
        id: 'task-old',
        title: 'Old task',
        status: 'done',
        assigned_to: 'Old Agent',
        data: { axwise_decision_id: 'decision-old' },
      },
      {
        id: 'task-current',
        title: 'Current task',
        status: 'todo',
        assigned_to: 'Current Agent',
        data: { axwise_decision_id: 'decision-current' },
      },
    ];

    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'who is working on this?' }), res);

    const systemPrompt = executeLlmV2.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('Current Agent');
    expect(systemPrompt).toContain('Current task');
    expect(systemPrompt).not.toContain('Old Agent');
    expect(systemPrompt).not.toContain('Old task');
  });

  it('uses only accepted native authority and current-attempt tasks, never raw or historical context', async () => {
    goalRow = acceptedNativeGoalWithCurrentAttempt({
      org_id: 'org-1',
      title: 'RAW_NATIVE_TITLE_POISON',
      description: 'RAW_NATIVE_DESCRIPTION_POISON',
      plan: { phases: [{ name: 'LEGACY_PLAN_POISON', status: 'active' }] },
    });
    jobRows = [{ id: 'job-old' }, { id: 'job-current' }];
    taskRows = [
      {
        id: 'task-old',
        title: 'SUPERSEDED_TASK_POISON',
        status: 'todo',
        assigned_to: 'Old Agent',
        materialization_attempt: 'formation-old',
        data: { materialization_attempt: 'formation-old' },
      },
      {
        id: 'task-current',
        title: 'CURRENT_ATTEMPT_TASK',
        status: 'todo',
        assigned_to: 'Current Agent',
        materialization_attempt: 'formation-current',
        data: { materialization_attempt: 'formation-current' },
      },
    ];
    goalLogRows = [{ event_type: 'legacy_event', details: { message: 'UNBOUND_LOG_POISON' } }];
    const res = makeRes();

    await handler(
      makeReq({
        goalId: goalRow.id,
        message: 'CURRENT_USER_MESSAGE',
        history: [
          { sender: 'user', text: 'CALLER_HISTORY_POISON' },
          { sender: 'lead', text: 'CALLER_LEAD_HISTORY_POISON' },
        ],
      }),
      res
    );

    expect(res._status).toBe(200);
    expect(executeLlmV2).toHaveBeenCalledTimes(1);
    const providerPayload = JSON.stringify(executeLlmV2.mock.calls[0][0]);
    const objective = goalRow.data.axwise_customer_intelligence.scope_packet.intent.objective;
    expect(providerPayload).toContain(objective);
    expect(providerPayload).toContain('CURRENT_ATTEMPT_TASK');
    expect(providerPayload).toContain('CURRENT_USER_MESSAGE');
    expect(providerPayload).not.toContain('RAW_NATIVE_TITLE_POISON');
    expect(providerPayload).not.toContain('RAW_NATIVE_DESCRIPTION_POISON');
    expect(providerPayload).not.toContain('LEGACY_PLAN_POISON');
    expect(providerPayload).not.toContain('UNBOUND_LOG_POISON');
    expect(providerPayload).not.toContain('CALLER_HISTORY_POISON');
    expect(providerPayload).not.toContain('CALLER_LEAD_HISTORY_POISON');
    expect(providerPayload).not.toContain('SUPERSEDED_TASK_POISON');
    expect(goalLogSelects).toBe(0);
    expect(teamTaskSelects).toEqual([expect.stringContaining('materialization_attempt')]);
    expect(withAxwiseTracked.mock.calls[0][0]).toMatchObject({
      history: [],
      pageContext: {
        native_scope_authority: {
          scope_hash: goalRow.data.axwise_customer_intelligence.scope_packet.scope_hash,
        },
      },
    });
  });

  it('fails closed before AxWise or provider calls when native authority is incomplete', async () => {
    goalRow = initialNativeScopeAdmissionGoalFixture({
      status: 'active',
      title: 'RAW_INCOMPLETE_NATIVE_POISON',
      description: 'RAW_INCOMPLETE_NATIVE_DESCRIPTION_POISON',
    });
    goalLogRows = [{ event_type: 'legacy_event', details: { message: 'UNBOUND_LOG_POISON' } }];
    const res = makeRes();

    await handler(makeReq({ goalId: goalRow.id, message: 'Can you report progress?' }), res);

    expect(res._status).toBe(409);
    expect(res._body.error).toMatch(/incomplete or stale/i);
    expect(withAxwiseTracked).not.toHaveBeenCalled();
    expect(executeLlmV2).not.toHaveBeenCalled();
    expect(goalLogSelects).toBe(0);
  });

  it('keeps caller history and raw native prose out of every Consilium prompt', async () => {
    goalRow = acceptedNativeGoalWithCurrentAttempt({
      title: 'RAW_CONSILIUM_TITLE_POISON',
      description: 'RAW_CONSILIUM_DESCRIPTION_POISON',
      plan: { phases: [{ name: 'CONSILIUM_PLAN_POISON' }] },
    });
    boardRows = [{ id: 'board-1', user_id: 'user-1', name: 'Review board' }];
    memberRows = [
      {
        id: 'member-1',
        name: 'Reviewer',
        role: 'Risk reviewer',
        resume: 'Reviews delivery risks.',
        skills: ['risk'],
        provider: null,
        model: null,
      },
    ];
    goalLogRows = [{ event_type: 'legacy_event', details: { message: 'CONSILIUM_LOG_POISON' } }];
    const res = makeRes();

    await handler(
      makeReq({
        goalId: goalRow.id,
        message: 'CURRENT_CONSILIUM_QUESTION',
        mode: 'consilium',
        history: [
          { sender: 'user', text: 'CONSILIUM_CALLER_HISTORY_POISON' },
          { sender: 'lead', text: 'CONSILIUM_LEAD_HISTORY_POISON' },
        ],
      }),
      res
    );

    expect(res._status).toBe(200);
    expect(executeLlmV2).toHaveBeenCalledTimes(2);
    const allProviderPayloads = JSON.stringify(executeLlmV2.mock.calls);
    expect(allProviderPayloads).toContain(
      goalRow.data.axwise_customer_intelligence.scope_packet.intent.objective
    );
    expect(allProviderPayloads).toContain('CURRENT_CONSILIUM_QUESTION');
    expect(allProviderPayloads).not.toContain('RAW_CONSILIUM_TITLE_POISON');
    expect(allProviderPayloads).not.toContain('RAW_CONSILIUM_DESCRIPTION_POISON');
    expect(allProviderPayloads).not.toContain('CONSILIUM_PLAN_POISON');
    expect(allProviderPayloads).not.toContain('CONSILIUM_LOG_POISON');
    expect(allProviderPayloads).not.toContain('CONSILIUM_CALLER_HISTORY_POISON');
    expect(allProviderPayloads).not.toContain('CONSILIUM_LEAD_HISTORY_POISON');
    expect(goalLogSelects).toBe(0);
    expect(withAxwiseTracked.mock.calls[0][0].history).toEqual([]);
  });

  it('model mode passes the chosen provider/model to the executor', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        goalId: 'goal-1',
        message: 'give me a deep analysis',
        mode: 'model',
        provider: 'openai',
        model: 'gpt-4o',
      }),
      res
    );
    expect(res._status).toBe(200);
    const call = executeLlmV2.mock.calls[0][0];
    expect(call.provider).toBe('openai');
    expect(call.model).toBe('gpt-4o');
  });

  it('calls cors with (res, req) — regression for the origin crash', async () => {
    const res = makeRes();
    const req = makeReq({ goalId: 'goal-1', message: 'hi' });
    await handler(req, res);
    // The response object (has setHeader) must be the FIRST arg.
    expect(cors).toHaveBeenCalledWith(res, req);
    expect(typeof cors.mock.calls[0][0].setHeader).toBe('function');
  });

  it('parses structured actions from the lead JSON reply and drops unknown types', async () => {
    executeLlmV2.mockResolvedValueOnce({
      content: JSON.stringify({
        reply: 'I can retry that without tools.',
        actions: [
          {
            type: 'resolve_retry_no_tools',
            label: 'Retry without tools',
            summary: 'Re-run tool-free',
            params: { phaseIndex: 0 },
          },
          { type: 'not_a_real_action', label: 'x', summary: 'y', params: {} },
        ],
      }),
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      usage: {},
      durationMs: 1,
    });
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'retry this without tools' }), res);
    expect(res._status).toBe(200);
    expect(res._body.reply).toBe('I can retry that without tools.');
    expect(res._body.actions).toHaveLength(1);
    expect(res._body.actions[0].type).toBe('resolve_retry_no_tools');
    expect(res._body.actions[0].params.phaseIndex).toBe(0);
  });

  it('drops direct task reassignment proposed for a native materialized goal', async () => {
    goalRow = acceptedNativeGoalWithCurrentAttempt({ status: 'active' });
    executeLlmV2.mockResolvedValueOnce({
      content: JSON.stringify({
        reply: 'I will keep this within the approved team revision flow.',
        actions: [
          {
            type: 'reassign_task',
            label: 'Reassign directly',
            summary: 'Unsafe in-place roster mutation',
            params: { taskId: 'task-current', assigned_to: 'Another agent' },
          },
          {
            type: 'pause_goal',
            label: 'Pause',
            summary: 'Pause safely',
            params: {},
          },
        ],
      }),
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      usage: {},
      durationMs: 1,
    });
    const res = makeRes();

    await handler(makeReq({ goalId: goalRow.id, message: 'Change the executor' }), res);

    expect(res._status).toBe(200);
    expect(res._body.actions.map((action) => action.type)).toEqual(['pause_goal']);
    expect(executeLlmV2.mock.calls[0][0].messages[0].content).toContain(
      'Never propose reassign_task'
    );
  });

  it('falls back to plain text with no actions when the reply is not JSON', async () => {
    executeLlmV2.mockResolvedValueOnce({
      content: 'Just a plain sentence.',
      provider: 'groq',
      model: 'x',
      usage: {},
      durationMs: 1,
    });
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'status?' }), res);
    expect(res._status).toBe(200);
    expect(res._body.reply).toBe('Just a plain sentence.');
    expect(res._body.actions).toEqual([]);
  });

  it('normalizes prior {sender,text} history into role-tagged LLM turns', async () => {
    const res = makeRes();
    await handler(
      makeReq({
        goalId: 'goal-1',
        message: 'what next?',
        history: [
          { sender: 'user', text: 'hey' },
          { sender: 'lead', text: 'Launch is wrapped up.' },
        ],
      }),
      res
    );
    expect(res._status).toBe(200);
    const call = executeLlmV2.mock.calls[0][0];
    // system prompt, then the two prior turns (user -> user, lead -> assistant),
    // then the new user message.
    expect(call.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(call.messages[1].content).toBe('hey');
    expect(call.messages[2].content).toBe('Launch is wrapped up.');
    expect(call.messages[3].content).toBe('what next?');
  });

  it('returns a graceful 200 reply (not 500) when the LLM call throws', async () => {
    executeLlmV2.mockRejectedValueOnce(new Error('groq 503'));
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message: 'what can we do?' }), res);
    expect(res._status).toBe(200);
    expect(res._body.error).toBe(true);
    expect(res._body.reply).toMatch(/try again/i);
    expect(res._body.actions).toEqual([]);
  });
});

// The endpoint is otherwise read-only. This one write is what lets a goal be
// reopened later with the conversation it already had still on it.
describe('goal-lead-chat persistence', () => {
  beforeEach(() => {
    insertedMessages = [];
    insertError = null;
    goalRow = {
      id: 'goal-1',
      title: 'Ship feature',
      description: 'd',
      status: 'active',
      budget_usd: 10,
      spent_usd: 1,
      plan: { phases: [] },
    };
    goalError = null;
  });

  async function ask(message = 'how is it going?') {
    const res = makeRes();
    await handler(makeReq({ goalId: 'goal-1', message }), res);
    return res;
  }

  it('records both turns of the exchange', async () => {
    executeLlmV2.mockResolvedValueOnce({
      content: 'Phase 1 is wrapping up.',
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    await ask('how is it going?');

    expect(insertedMessages).toHaveLength(2);
    expect(insertedMessages[0]).toMatchObject({
      goal_id: 'goal-1',
      channel: 'agent-lead',
      message: 'how is it going?',
      metadata: { role: 'user' },
    });
    expect(insertedMessages[1]).toMatchObject({
      goal_id: 'goal-1',
      channel: 'agent-lead',
      metadata: { role: 'lead' },
    });
  });

  it('keeps the pair in order so the reply cannot sort above the question', async () => {
    await ask();
    const [user, lead] = insertedMessages;
    expect(new Date(lead.created_at).getTime()).toBeGreaterThan(
      new Date(user.created_at).getTime()
    );
  });

  it('carries the proposed actions so the chips survive a reload', async () => {
    executeLlmV2.mockResolvedValueOnce({
      content: JSON.stringify({
        reply: 'I can pause it.',
        actions: [
          {
            type: 'resolve_retry_no_tools',
            label: 'Retry without tools',
            summary: 'Runs the phase again',
            params: { phaseIndex: 0 },
          },
        ],
      }),
      provider: 'groq',
      model: 'm',
      usage: {},
    });
    await ask();
    expect(insertedMessages[1].metadata.actions).toEqual([
      expect.objectContaining({ type: 'resolve_retry_no_tools', label: 'Retry without tools' }),
    ]);
  });

  it('still answers when the write fails', async () => {
    insertError = new Error('db down');
    const res = await ask();
    expect(res._status).toBe(200);
    expect(res._body.reply).toBeTruthy();
    expect(res._body.error).toBeUndefined();
  });

  it('records nothing when the model could not be reached', async () => {
    executeLlmV2.mockRejectedValueOnce(new Error('timeout'));
    const res = await ask();
    // A placeholder is not something the lead said, so it is not kept.
    expect(res._body.error).toBe(true);
    expect(insertedMessages).toHaveLength(0);
  });
});
