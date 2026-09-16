/**
 * Tests for loop-continuation.js — the closed-loop core that auto-spawns
 * the next goal in a chain and builds the refinement prompt.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// We don't want the real self-healer or notification dispatch running.
vi.mock('./self-healer.js', () => ({
  healGoal: vi.fn().mockResolvedValue({ strategy: null, action: 'skipped', details: {} }),
}));
vi.mock('../notifications/dispatch.js', () => ({
  notifyUser: vi.fn().mockResolvedValue({ inapp: true, email: false, push: false }),
}));

import {
  buildContinuationPayload,
  buildRefinementPromptFromContinuation,
  maybeSpawnContinuation,
  MAX_LOOP_DEPTH,
} from './loop-continuation.js';
import { healGoal } from './self-healer.js';
import { notifyUser } from './../notifications/dispatch.js';

// ── buildContinuationPayload ──────────────────────────────────────

describe('buildContinuationPayload', () => {
  const parent = {
    id: 'parent-1',
    title: 'Launch newsletter signup',
    description: 'Original brief.',
    budget_usd: 10,
    target_unit: 'usd',
    loop_depth: 0,
    loop_chain_root_id: null,
    theory_mode: true,
    org_id: 'org-1',
    executor_type: 'organization',
  };

  const projectOverview = {
    summary: 'Shipped the signup form and got 12 signups.',
    next_steps: ['Add Meta Pixel', 'Build retention email #1', 'A/B test hero copy'],
    risks_or_gaps: ['No referral loop yet', 'CAC unknown'],
    roadmap: [
      {
        title: 'Implement referral loop',
        description: 'Double-sided invite credit',
        impact: 'high',
        effort: 'small',
        timeframe: '2 weeks',
      },
      {
        title: 'Set up analytics',
        description: 'PostHog + Meta Pixel',
        impact: 'medium',
        effort: 'small',
        timeframe: '1 week',
      },
    ],
  };

  it('inherits loop_enabled and bumps loop_depth', () => {
    const p = buildContinuationPayload(parent, projectOverview);
    expect(p.loop_enabled).toBe(true);
    expect(p.parent_goal_id).toBe('parent-1');
    expect(p.loop_depth).toBe(1);
  });

  it('roots the chain on parent when parent has no root', () => {
    const p = buildContinuationPayload(parent, projectOverview);
    expect(p.loop_chain_root_id).toBe('parent-1');
  });

  it('preserves existing chain root across multiple links', () => {
    const grandchild = buildContinuationPayload(
      { ...parent, id: 'g2', loop_depth: 2, loop_chain_root_id: 'root-0' },
      projectOverview
    );
    expect(grandchild.loop_chain_root_id).toBe('root-0');
    expect(grandchild.loop_depth).toBe(3);
  });

  it('seeds the title from the top roadmap item', () => {
    const p = buildContinuationPayload(parent, projectOverview);
    expect(p.title).toMatch(/Continuation/);
    expect(p.title).toMatch(/Implement referral loop/);
  });

  it('embeds the roadmap, next steps, and risks in the description', () => {
    const p = buildContinuationPayload(parent, projectOverview);
    expect(p.description).toMatch(/Add Meta Pixel/);
    expect(p.description).toMatch(/No referral loop yet/);
    expect(p.description).toMatch(/Implement referral loop/);
  });

  it('carries continuation context into the data blob', () => {
    const p = buildContinuationPayload(parent, projectOverview);
    expect(p._continuation_from).toBeDefined();
    expect(p._continuation_from.parent_goal_id).toBe('parent-1');
    expect(p._continuation_from.roadmap).toHaveLength(2);
  });

  it('does not crash when project_overview is missing or empty', () => {
    expect(() => buildContinuationPayload(parent, null)).not.toThrow();
    expect(() => buildContinuationPayload(parent, {})).not.toThrow();
  });
});

// ── buildRefinementPromptFromContinuation ──────────────────────────

describe('buildRefinementPromptFromContinuation', () => {
  it('mentions deliverable title and embeds strategy bullets', () => {
    const prompt = buildRefinementPromptFromContinuation(
      {
        next_steps: ['Add Meta Pixel'],
        roadmap: [{ title: 'Referral loop', impact: 'high', timeframe: '2 weeks' }],
        risks_or_gaps: ['CAC unknown'],
      },
      'Hero landing page'
    );
    expect(prompt).toMatch(/Hero landing page/);
    expect(prompt).toMatch(/Add Meta Pixel/);
    expect(prompt).toMatch(/Referral loop/);
    expect(prompt).toMatch(/CAC unknown/);
  });

  it('produces a usable prompt even when fields are empty', () => {
    const prompt = buildRefinementPromptFromContinuation({}, 'Some doc');
    expect(prompt).toMatch(/Some doc/);
  });
});

// ── maybeSpawnContinuation ─────────────────────────────────────────

function makeAdmin({
  beforeGoalUpdate = null,
  loseParentLinkResponse = false,
  failParentLinkBeforeCommit = false,
  parentRereadTimestamp = null,
} = {}) {
  const goalsRows = new Map();
  const jobsInserted = [];
  const logsInserted = [];
  let parentLinkInspectionUnavailable = false;

  const goalsTable = {
    insert(row) {
      const id = row.id || 'new-goal-' + (goalsRows.size + 1);
      const stored = { ...row, id };
      goalsRows.set(id, stored);
      return {
        select() {
          return {
            single: async () => ({ data: stored, error: null }),
          };
        },
      };
    },
    update(patch) {
      const filters = [];
      const nullFilters = [];
      const query = {
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        is(column, value) {
          nullFilters.push([column, value]);
          return query;
        },
        select() {
          return query;
        },
        async maybeSingle() {
          const id = filters.find(([column]) => column === 'id')?.[1];
          let current = goalsRows.get(id);
          if (!current && id) {
            current = Object.fromEntries(filters);
            for (const [column, value] of nullFilters) current[column] = value;
            current.id = id;
            current.continuation_goal_id ??= null;
            goalsRows.set(id, current);
          }
          if (current && beforeGoalUpdate && patch.continuation_goal_id) {
            beforeGoalUpdate(current, patch);
            beforeGoalUpdate = null;
            goalsRows.set(id, current);
          }
          if (current && patch.continuation_goal_id && failParentLinkBeforeCommit) {
            failParentLinkBeforeCommit = false;
            if (parentRereadTimestamp) current.updated_at = parentRereadTimestamp;
            goalsRows.set(id, current);
            return { data: null, error: new Error('parent link failed before commit') };
          }
          const matches =
            current &&
            filters.every(([column, value]) => current[column] === value) &&
            nullFilters.every(([column, value]) => (current[column] ?? null) === value);
          if (!matches) return { data: null, error: null };
          const updated = { ...current, ...patch };
          goalsRows.set(id, updated);
          if (patch.continuation_goal_id && loseParentLinkResponse) {
            loseParentLinkResponse = false;
            parentLinkInspectionUnavailable = true;
            throw new Error('parent link response lost');
          }
          return { data: updated, error: null };
        },
        then(resolve, reject) {
          return query.maybeSingle().then(resolve, reject);
        },
      };
      return query;
    },
    select() {
      const filters = [];
      const query = {
        eq(column, value) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          const id = filters.find(([column]) => column === 'id')?.[1];
          const current = goalsRows.get(id) || null;
          if (parentLinkInspectionUnavailable && current?.continuation_goal_id) {
            parentLinkInspectionUnavailable = false;
            return { data: null, error: new Error('parent link inspection unavailable') };
          }
          const matches = current && filters.every(([column, value]) => current[column] === value);
          return { data: matches ? current : null, error: null };
        },
      };
      return query;
    },
  };

  const admin = {
    from(table) {
      if (table === 'goals') return goalsTable;
      if (table === 'agent_jobs')
        return {
          insert(row) {
            jobsInserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      if (table === 'goal_log')
        return {
          insert(row) {
            logsInserted.push(row);
            return Promise.resolve({ error: null });
          },
        };
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: function () {
              return this;
            },
            ilike: function () {
              return this;
            },
            order: function () {
              return this;
            },
            limit: function () {
              return this;
            },
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        };
      }
      throw new Error(`unmocked table ${table}`);
    },
    __debug: { goalsRows, jobsInserted, logsInserted },
  };
  return admin;
}

describe('maybeSpawnContinuation', () => {
  const projectOverview = {
    next_steps: ['Do A'],
    roadmap: [{ title: 'Item one', description: 'desc' }],
    risks_or_gaps: [],
  };

  it('skips when loop is off', async () => {
    const admin = makeAdmin();
    const out = await maybeSpawnContinuation(
      admin,
      {
        id: 'g',
        user_id: 'u',
        loop_enabled: false,
        loop_depth: 0,
      },
      projectOverview
    );
    expect(out).toBeNull();
    expect(admin.__debug.jobsInserted).toHaveLength(0);
  });

  it('skips when paused', async () => {
    const admin = makeAdmin();
    const out = await maybeSpawnContinuation(
      admin,
      {
        id: 'g',
        user_id: 'u',
        loop_enabled: true,
        loop_paused: true,
        loop_depth: 0,
      },
      projectOverview
    );
    expect(out).toBeNull();
  });

  it('skips when a continuation already exists', async () => {
    const admin = makeAdmin();
    const out = await maybeSpawnContinuation(
      admin,
      {
        id: 'g',
        user_id: 'u',
        loop_enabled: true,
        loop_depth: 0,
        continuation_goal_id: 'existing',
      },
      projectOverview
    );
    expect(out).toBeNull();
  });

  it('pauses a native chain instead of spawning a legacy feasibility child', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'native-parent',
      user_id: 'user-1',
      title: 'Accepted native scope',
      status: 'completed',
      updated_at: '2026-08-24T10:00:00.000Z',
      loop_enabled: true,
      loop_paused: false,
      continuation_goal_id: null,
      loop_depth: 0,
      data: {
        scope_admission: {
          native_scope: true,
          status: 'accepted',
        },
      },
    };
    admin.__debug.goalsRows.set(parent.id, { ...parent });

    await expect(maybeSpawnContinuation(admin, parent, projectOverview)).resolves.toBeNull();

    expect(admin.__debug.goalsRows.get(parent.id)).toMatchObject({
      loop_paused: true,
      loop_paused_reason: 'native_continuation_requires_new_scope_confirmation',
      continuation_goal_id: null,
    });
    expect(admin.__debug.jobsInserted).toHaveLength(0);
    expect(admin.__debug.logsInserted).toHaveLength(0);
    expect(notifyUser).toHaveBeenCalledWith(
      admin,
      parent.user_id,
      expect.objectContaining({
        event_type: 'loop_chain_paused',
        payload: expect.objectContaining({ reason: 'native_scope_confirmation_required' }),
      })
    );
  });

  it('quarantines an existing legacy child linked by an older native continuation worker', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'native-parent-existing',
      user_id: 'user-1',
      title: 'Accepted native scope',
      status: 'completed',
      updated_at: '2026-08-24T10:00:00.000Z',
      loop_enabled: true,
      loop_paused: false,
      continuation_goal_id: 'legacy-child-existing',
      loop_depth: 0,
      data: { scope_admission: { native_scope: true, status: 'accepted' } },
    };
    const child = {
      id: parent.continuation_goal_id,
      user_id: parent.user_id,
      parent_goal_id: parent.id,
      title: '[Continuation] stale raw scope',
      status: 'feasibility',
      updated_at: '2026-08-24T10:00:30.000Z',
      loop_enabled: true,
      loop_paused: false,
      data: { continuation_from: { parent_goal_id: parent.id } },
    };
    admin.__debug.goalsRows.set(parent.id, { ...parent });
    admin.__debug.goalsRows.set(child.id, { ...child });

    await expect(maybeSpawnContinuation(admin, parent, projectOverview)).resolves.toBeNull();

    expect(admin.__debug.goalsRows.get(parent.id)).toMatchObject({
      loop_paused: true,
      continuation_goal_id: child.id,
    });
    expect(admin.__debug.goalsRows.get(child.id)).toMatchObject({
      status: 'needs_human',
      loop_enabled: false,
      loop_paused: true,
      data: {
        scope_admission: expect.objectContaining({ native_scope: true, status: 'quarantined' }),
        native_continuation_quarantine: expect.objectContaining({ parent_goal_id: parent.id }),
      },
    });
    expect(admin.__debug.jobsInserted).toHaveLength(0);
  });

  it('does not pause or spawn when the native parent snapshot changed', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'native-parent-stale',
      user_id: 'user-1',
      title: 'Accepted native scope',
      status: 'completed',
      updated_at: '2026-08-24T10:00:00.000Z',
      loop_enabled: true,
      loop_paused: false,
      continuation_goal_id: null,
      loop_depth: 0,
      data: { scope_admission: { native_scope: true, status: 'accepted' } },
    };
    admin.__debug.goalsRows.set(parent.id, {
      ...parent,
      updated_at: '2026-08-24T10:01:00.000Z',
    });
    const notificationsBefore = notifyUser.mock.calls.length;

    await expect(maybeSpawnContinuation(admin, parent, projectOverview)).resolves.toBeNull();

    expect(admin.__debug.goalsRows.get(parent.id)).toMatchObject({
      loop_paused: false,
      continuation_goal_id: null,
    });
    expect(admin.__debug.jobsInserted).toHaveLength(0);
    expect(notifyUser.mock.calls).toHaveLength(notificationsBefore);
  });

  it('spawns when enabled, fires the refinement job, and links parent → child', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'parent-1',
      user_id: 'user-1',
      title: 'Parent',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_chain_root_id: null,
      budget_usd: 5,
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).not.toBeNull();
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
    // Parent was updated with the new continuation id
    const updatedParent = admin.__debug.goalsRows.get('parent-1') || null;
    // (parent isn't in our goals map because we never insert it; the
    // update() helper writes through anyway. Look for the side effects.)
    const refineJobs = admin.__debug.jobsInserted.filter(
      (j) => j.payload?.type === 'loop-refine-parent-deliverables'
    );
    expect(refineJobs).toHaveLength(1);
    expect(refineJobs[0].payload.parentGoalId).toBe('parent-1');
    expect(refineJobs[0].payload.continuationGoalId).toBe(out.id);
    // First pipeline action is feasibility-analysis on the new goal
    const orchestrateJobs = admin.__debug.jobsInserted.filter(
      (j) => j.payload?.action === 'feasibility-analysis'
    );
    expect(orchestrateJobs).toHaveLength(1);
    // goal_log got a 'loop_continuation_spawned' event
    const spawnLogs = admin.__debug.logsInserted.filter(
      (l) => l.event_type === 'loop_continuation_spawned'
    );
    expect(spawnLogs).toHaveLength(1);
    // User was notified
    expect(notifyUser).toHaveBeenCalled();
  });

  it('links and parks the exact child before reporting a failed Preview wake', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'parent-preview',
      user_id: 'user-1',
      title: 'Parent Preview',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_chain_root_id: 'parent-preview',
      budget_usd: 5,
    };
    const env = {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_loop_preview',
    };

    const out = await maybeSpawnContinuation(admin, parent, projectOverview, {
      env,
      triggerProcessNextImpl: vi.fn(async () => false),
    });

    expect(out).toBeNull();
    const storedParent = admin.__debug.goalsRows.get(parent.id);
    const child = admin.__debug.goalsRows.get(storedParent.continuation_goal_id);
    expect(storedParent.continuation_goal_id).toBe(child.id);
    expect(child).toMatchObject({
      status: 'needs_human',
      data: {
        continuation_setup: {
          status: 'wake_failed',
        },
      },
    });

    await maybeSpawnContinuation(
      admin,
      { ...parent, continuation_goal_id: child.id },
      projectOverview,
      { env, triggerProcessNextImpl: vi.fn(async () => true) }
    );
    expect(
      [...admin.__debug.goalsRows.values()].filter((row) => row.parent_goal_id === parent.id)
    ).toHaveLength(1);
  });

  it('cancels the deterministic unwoken child when the user pauses the parent first', async () => {
    const admin = makeAdmin({
      beforeGoalUpdate: (current) => {
        current.loop_paused = true;
        current.updated_at = '2026-08-22T12:00:01.000Z';
      },
    });
    const parent = {
      id: 'parent-paused-race',
      user_id: 'user-1',
      title: 'Parent Pause Race',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_chain_root_id: 'parent-paused-race',
      budget_usd: 5,
    };

    const out = await maybeSpawnContinuation(admin, parent, projectOverview);

    expect(out).toBeNull();
    expect(admin.__debug.jobsInserted).toHaveLength(0);
    const storedParent = admin.__debug.goalsRows.get(parent.id);
    expect(storedParent).toMatchObject({
      continuation_goal_id: null,
      loop_paused: true,
      updated_at: '2026-08-22T12:00:01.000Z',
    });
    const children = [...admin.__debug.goalsRows.values()].filter(
      (row) => row.id !== parent.id && row.parent_goal_id === parent.id
    );
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      status: 'cancelled',
      loop_enabled: false,
      data: { continuation_setup: { status: 'parent_link_rejected' } },
    });
  });

  it('parks the deterministic child when a committed parent link cannot be inspected', async () => {
    const admin = makeAdmin({ loseParentLinkResponse: true });
    const parent = {
      id: 'parent-link-unknown',
      user_id: 'user-1',
      title: 'Parent Link Unknown',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_chain_root_id: 'parent-link-unknown',
      budget_usd: 5,
    };

    const out = await maybeSpawnContinuation(admin, parent, projectOverview);

    expect(out).toBeNull();
    expect(admin.__debug.jobsInserted).toHaveLength(0);
    const storedParent = admin.__debug.goalsRows.get(parent.id);
    const child = admin.__debug.goalsRows.get(storedParent.continuation_goal_id);
    expect(child).toMatchObject({
      status: 'needs_human',
      data: {
        continuation_setup: { status: 'parent_link_reconciliation_required' },
      },
    });
  });

  it('does not cancel the deterministic child for equivalent parent timestamp serialization', async () => {
    const admin = makeAdmin({
      failParentLinkBeforeCommit: true,
      parentRereadTimestamp: '2026-08-22 12:00:00+00',
    });
    const parent = {
      id: 'parent-link-equivalent-time',
      user_id: 'user-1',
      title: 'Parent Equivalent Time',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_chain_root_id: 'parent-link-equivalent-time',
      budget_usd: 5,
    };

    const out = await maybeSpawnContinuation(admin, parent, projectOverview);

    expect(out).toBeNull();
    expect(admin.__debug.jobsInserted).toHaveLength(0);
    const child = [...admin.__debug.goalsRows.values()].find(
      (row) => row.parent_goal_id === parent.id
    );
    expect(child).toMatchObject({
      status: 'needs_human',
      data: {
        continuation_setup: { status: 'parent_link_reconciliation_required' },
      },
    });
  });

  it('pauses the chain and notifies the user when max depth is reached', async () => {
    notifyUser.mockClear();
    const admin = makeAdmin();
    const parent = {
      id: 'p2',
      user_id: 'u',
      title: 'P2',
      loop_enabled: true,
      loop_depth: MAX_LOOP_DEPTH,
      loop_chain_root_id: 'root',
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).toBeNull();
    expect(notifyUser).toHaveBeenCalled();
    const calls = notifyUser.mock.calls.map((c) => c[2].event_type);
    expect(calls).toContain('loop_chain_paused');
  });
});

// ── Advanced controls (loop_advanced gated) ─────────────────────────

/**
 * Query-capable admin mock supporting the select/maybeSingle chains that the
 * advanced guards use (parent confidence lookup + chain_spend_v rollup).
 * Insert throws — the pause branches must never spawn.
 */
function makeQueryAdmin({ chainSpend = 0, parentScore = 0 } = {}) {
  const updates = [];
  const selectBuilder = (resolver) => {
    const b = {
      eq: () => b,
      is: () => b,
      filter: () => b,
      maybeSingle: async () => ({ data: resolver(), error: null }),
      single: async () => ({ data: resolver(), error: null }),
    };
    return b;
  };
  return {
    from(table) {
      if (table === 'goals') {
        return {
          select: () =>
            selectBuilder(() => ({
              id: 'parent',
              user_id: 'u',
              confidence_score: parentScore,
              loop_chain_root_id: 'root',
              loop_depth: 1,
            })),
          update(patch) {
            let recorded = false;
            const query = {
              eq(column, value) {
                if (!recorded && column === 'id') {
                  updates.push({ id: value, patch });
                  recorded = true;
                }
                return this;
              },
              then(resolve) {
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return query;
          },
          insert: () => {
            throw new Error('must not insert on a paused chain');
          },
        };
      }
      if (table === 'chain_spend_v') {
        return {
          select: () =>
            selectBuilder(() => ({
              chain_root_id: 'root',
              spent_usd: chainSpend,
              goal_count: 2,
              max_depth: 1,
            })),
        };
      }
      if (table === 'goal_log') return { insert: () => Promise.resolve({ error: null }) };
      throw new Error(`unmocked table ${table}`);
    },
    __debug: { updates },
  };
}

describe('maybeSpawnContinuation — advanced controls', () => {
  const projectOverview = {
    next_steps: ['Do A'],
    roadmap: [{ title: 'Item', description: 'd' }],
    risks_or_gaps: [],
  };

  it('does not evaluate guards or pause when loop_advanced is off', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'p',
      user_id: 'u',
      title: 'P',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_advanced: false,
      loop_settings: { chain_budget_cap_usd: 1, hitl_every: 1 },
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).not.toBeNull(); // guards ignored — spawns normally
  });

  it('spawns when advanced is on but all guards are disabled', async () => {
    const admin = makeAdmin();
    const parent = {
      id: 'p',
      user_id: 'u',
      title: 'P',
      org_id: 'org-1',
      loop_enabled: true,
      loop_paused: false,
      status: 'completed',
      updated_at: '2026-08-22T12:00:00.000Z',
      loop_depth: 0,
      loop_advanced: true,
      // no parent_goal_id => convergence skipped; cap null + hitl 0 => both off
      loop_settings: { chain_budget_cap_usd: null, hitl_every: 0 },
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).not.toBeNull();
    const refineJobs = admin.__debug.jobsInserted.filter(
      (j) => j.payload?.type === 'loop-refine-parent-deliverables'
    );
    expect(refineJobs[0].payload.refineMaxVersions).toBe(2);
  });

  it('pauses with chain_budget_cap when chain spend hits the cap', async () => {
    notifyUser.mockClear();
    const admin = makeQueryAdmin({ chainSpend: 12 });
    const parent = {
      id: 'p',
      user_id: 'u',
      title: 'P',
      loop_enabled: true,
      loop_depth: 0,
      loop_advanced: true,
      loop_chain_root_id: 'root',
      loop_settings: { chain_budget_cap_usd: 5 },
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).toBeNull();
    expect(
      admin.__debug.updates.some((u) => u.patch.loop_paused_reason === 'chain_budget_cap')
    ).toBe(true);
    expect(notifyUser.mock.calls.some((c) => c[2].payload?.reason === 'chain_budget_cap')).toBe(
      true
    );
  });

  it('pauses with converged when quality gain over the parent is below threshold', async () => {
    notifyUser.mockClear();
    const admin = makeQueryAdmin({ parentScore: 45 });
    const parent = {
      id: 'child',
      user_id: 'u',
      title: 'Child',
      parent_goal_id: 'parent',
      confidence_score: 48, // gain of 3 < min 10
      loop_enabled: true,
      loop_depth: 1,
      loop_advanced: true,
      loop_settings: { chain_budget_cap_usd: null, convergence_min_gain: 10 },
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).toBeNull();
    expect(admin.__debug.updates.some((u) => u.patch.loop_paused_reason === 'converged')).toBe(
      true
    );
  });

  it('pauses with hitl_checkpoint at the Nth iteration', async () => {
    notifyUser.mockClear();
    const admin = makeQueryAdmin();
    const parent = {
      id: 'p',
      user_id: 'u',
      title: 'P',
      loop_enabled: true,
      loop_depth: 0,
      loop_advanced: true,
      loop_settings: { chain_budget_cap_usd: null, hitl_every: 1 },
    };
    const out = await maybeSpawnContinuation(admin, parent, projectOverview);
    expect(out).toBeNull();
    expect(
      admin.__debug.updates.some((u) => u.patch.loop_paused_reason === 'hitl_checkpoint')
    ).toBe(true);
  });
});
