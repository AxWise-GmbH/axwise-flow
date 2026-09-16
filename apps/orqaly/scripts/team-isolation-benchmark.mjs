#!/usr/bin/env node
/**
 * Deterministic local concurrency gate for goal-scoped execution teams.
 *
 * Runs two simultaneous formation attempts for each of 30 varied goal UUIDs.
 * The in-memory adapter models migration 192's partial unique index, including
 * PostgreSQL error 23505, so this stays fast and reusable without credentials.
 * It also attempts 30 cross-goal roster mutations and requires every one to
 * fail before membership data changes.
 *
 * Usage: node scripts/team-isolation-benchmark.mjs
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ensureGoalTeam, replaceGoalTeamMembers } from '../lib/goal-handlers/team-assigner.js';

const DEFAULT_GOAL_COUNT = 30;
const DEFAULT_FORMATIONS_PER_GOAL = 2;
const GOAL_VARIANTS = [
  'autoparts-returns',
  'animal-food-retention',
  'fintech-risk',
  'marketing-attribution',
  'warehouse-routing',
  'support-quality',
];

function stableUuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(
    17,
    20
  )}-${hex.slice(20, 32)}`;
}

class Barrier {
  constructor(target) {
    this.target = target;
    this.arrivals = 0;
    this.promise = new Promise((resolveBarrier) => {
      this.release = resolveBarrier;
    });
  }

  async wait() {
    this.arrivals += 1;
    if (this.arrivals === this.target) this.release();
    await this.promise;
  }
}

class MemoryQuery {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.action = 'select';
    this.payload = null;
    this.filters = [];
    this.cachedExecution = null;
  }

  select() {
    if (this.action !== 'insert') this.action = 'select';
    return this;
  }

  insert(payload) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  upsert(payload) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  then(resolveResult, rejectResult) {
    if (!this.cachedExecution) this.cachedExecution = this.execute();
    return this.cachedExecution.then(resolveResult, rejectResult);
  }

  execute() {
    return this.database.execute(this);
  }
}

class IsolationDatabase {
  constructor({ goalCount, formationsPerGoal }) {
    this.teams = new Map();
    this.memberships = new Map();
    this.teamSequence = 0;
    this.insertConflicts = 0;
    this.initialReadsByGoal = new Map();
    this.initialReadBarrier = new Barrier(goalCount * formationsPerGoal);
    this.formationsPerGoal = formationsPerGoal;
  }

  client() {
    return { from: (table) => new MemoryQuery(this, table) };
  }

  matches(row, filters) {
    return filters.every(([column, value]) => row[column] === value);
  }

  async selectTeams(query) {
    let rows = [...this.teams.values()].filter((row) => this.matches(row, query.filters));
    const goalFilter = query.filters.find(([column]) => column === 'goal_id');
    const activeFilter = query.filters.some(
      ([column, value]) => column === 'is_active' && value === true
    );
    if (goalFilter && activeFilter) {
      const goalId = goalFilter[1];
      const readCount = (this.initialReadsByGoal.get(goalId) || 0) + 1;
      this.initialReadsByGoal.set(goalId, readCount);
      if (readCount <= this.formationsPerGoal) {
        const snapshot = rows.slice(0, query.limitValue || rows.length);
        await this.initialReadBarrier.wait();
        rows = snapshot;
      }
    }
    if (query.limitValue != null) rows = rows.slice(0, query.limitValue);
    return { data: query.singleResult ? rows[0] || null : rows, error: null };
  }

  insertTeam(payload) {
    const row = { ...payload, is_active: payload.is_active ?? true };
    const duplicate = [...this.teams.values()].find(
      (team) => team.goal_id === row.goal_id && team.is_active && row.is_active
    );
    if (duplicate) {
      this.insertConflicts += 1;
      return {
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key violates idx_agent_teams_one_active_per_goal',
        },
      };
    }
    this.teamSequence += 1;
    const stored = { id: `team-${String(this.teamSequence).padStart(2, '0')}`, ...row };
    this.teams.set(stored.id, stored);
    return { data: stored, error: null };
  }

  execute(query) {
    if (query.table === 'agent_teams' && query.action === 'select') {
      return this.selectTeams(query);
    }
    if (query.table === 'agent_teams' && query.action === 'insert') {
      return Promise.resolve(this.insertTeam(query.payload));
    }
    if (query.table === 'agent_teams' && query.action === 'update') {
      const rows = [...this.teams.values()].filter((row) => this.matches(row, query.filters));
      for (const row of rows) Object.assign(row, query.payload);
      return Promise.resolve({ data: rows, error: null });
    }
    if (query.table === 'agent_team_members' && query.action === 'delete') {
      for (const [key, row] of this.memberships) {
        if (this.matches(row, query.filters)) this.memberships.delete(key);
      }
      return Promise.resolve({ data: null, error: null });
    }
    if (query.table === 'agent_team_members' && query.action === 'upsert') {
      for (const row of query.payload) {
        this.memberships.set(`${row.team_id}:${row.member_id}`, { ...row });
      }
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: new Error('Unsupported benchmark query') });
  }
}

function benchmarkFixtures(goalCount) {
  return Array.from({ length: goalCount }, (_, index) => {
    const variant = GOAL_VARIANTS[index % GOAL_VARIANTS.length];
    const goalId = stableUuid(`team-isolation-goal:${variant}:${index}`);
    return {
      goal: { id: goalId, title: `${variant} project ${index + 1}` },
      memberIds: [
        stableUuid(`team-isolation-member:${goalId}:lead`),
        stableUuid(`team-isolation-member:${goalId}:specialist`),
      ],
    };
  });
}

export function assertTeamIsolationResult(result) {
  const failures = [];
  if (result.activeTeamCount !== result.goalCount) {
    failures.push(`expected ${result.goalCount} active teams, got ${result.activeTeamCount}`);
  }
  if (result.uniqueTeamIdentityCount !== result.goalCount) {
    failures.push(
      `expected ${result.goalCount} distinct team identities, got ${result.uniqueTeamIdentityCount}`
    );
  }
  if (result.goalsWithWrongActiveTeamCount !== 0) {
    failures.push(
      `${result.goalsWithWrongActiveTeamCount} goals do not have exactly one active team`
    );
  }
  if (result.crossMembershipCount !== 0) {
    failures.push(`${result.crossMembershipCount} membership rows crossed goal boundaries`);
  }
  if (result.crossMutationRejections !== result.goalCount) {
    failures.push(
      `expected ${result.goalCount} rejected cross-goal mutations, got ${result.crossMutationRejections}`
    );
  }
  if (result.insertConflicts !== result.expectedInsertConflicts) {
    failures.push(
      `expected ${result.expectedInsertConflicts} insert conflicts, got ${result.insertConflicts}`
    );
  }
  if (result.conflictRecoveries !== result.expectedInsertConflicts) {
    failures.push(
      `expected ${result.expectedInsertConflicts} conflict recoveries, got ${result.conflictRecoveries}`
    );
  }
  if (failures.length) throw new Error(`Team-isolation benchmark failed: ${failures.join('; ')}`);
  return result;
}

export async function runTeamIsolationBenchmark({
  goalCount = DEFAULT_GOAL_COUNT,
  formationsPerGoal = DEFAULT_FORMATIONS_PER_GOAL,
} = {}) {
  if (goalCount !== DEFAULT_GOAL_COUNT) {
    throw new Error(`Production gate requires exactly ${DEFAULT_GOAL_COUNT} varied goals`);
  }
  if (formationsPerGoal < 2) {
    throw new Error('Concurrency gate requires at least two formation attempts per goal');
  }

  const startedAt = performance.now();
  const fixtures = benchmarkFixtures(goalCount);
  const database = new IsolationDatabase({ goalCount, formationsPerGoal });
  const admin = database.client();
  const userId = stableUuid('team-isolation-owner');

  const formationResults = await Promise.all(
    fixtures.flatMap(({ goal, memberIds }) =>
      Array.from({ length: formationsPerGoal }, async () => {
        const ensured = await ensureGoalTeam(admin, goal, userId, memberIds[0]);
        await replaceGoalTeamMembers(admin, {
          teamId: ensured.teamId,
          goalId: goal.id,
          userId,
          memberIds,
        });
        return { goalId: goal.id, ...ensured };
      })
    )
  );

  const teamByGoal = new Map(
    [...database.teams.values()]
      .filter((team) => team.is_active)
      .map((team) => [team.goal_id, team])
  );
  let crossMutationRejections = 0;
  await Promise.all(
    fixtures.map(async ({ goal, memberIds }, index) => {
      const otherGoal = fixtures[(index + 1) % fixtures.length].goal;
      const otherTeam = teamByGoal.get(otherGoal.id);
      try {
        await replaceGoalTeamMembers(admin, {
          teamId: otherTeam.id,
          goalId: goal.id,
          userId,
          memberIds,
        });
      } catch {
        crossMutationRejections += 1;
      }
    })
  );

  const activeTeams = [...database.teams.values()].filter((team) => team.is_active);
  const activeCounts = new Map();
  for (const team of activeTeams) {
    activeCounts.set(team.goal_id, (activeCounts.get(team.goal_id) || 0) + 1);
  }
  const memberOwnerGoal = new Map(
    fixtures.flatMap(({ goal, memberIds }) => memberIds.map((memberId) => [memberId, goal.id]))
  );
  const teamGoal = new Map(activeTeams.map((team) => [team.id, team.goal_id]));
  const crossMembershipCount = [...database.memberships.values()].filter(
    (membership) => memberOwnerGoal.get(membership.member_id) !== teamGoal.get(membership.team_id)
  ).length;
  const expectedInsertConflicts = goalCount * (formationsPerGoal - 1);

  return assertTeamIsolationResult({
    passed: true,
    goalCount,
    formationAttempts: goalCount * formationsPerGoal,
    activeTeamCount: activeTeams.length,
    uniqueTeamIdentityCount: new Set(activeTeams.map((team) => team.id)).size,
    goalsWithWrongActiveTeamCount: fixtures.filter(({ goal }) => activeCounts.get(goal.id) !== 1)
      .length,
    membershipCount: database.memberships.size,
    crossMembershipCount,
    crossMutationRejections,
    insertConflicts: database.insertConflicts,
    conflictRecoveries: formationResults.filter((result) => result.recoveredFromConflict).length,
    expectedInsertConflicts,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  try {
    const result = await runTeamIsolationBenchmark();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
