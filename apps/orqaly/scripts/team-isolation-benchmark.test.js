import { describe, expect, it } from 'vitest';
import { runTeamIsolationBenchmark } from './team-isolation-benchmark.mjs';

describe('30-project team-isolation concurrency gate', () => {
  it('keeps one distinct active team per goal with no cross-membership', async () => {
    const result = await runTeamIsolationBenchmark();

    expect(result).toMatchObject({
      passed: true,
      goalCount: 30,
      formationAttempts: 60,
      activeTeamCount: 30,
      uniqueTeamIdentityCount: 30,
      goalsWithWrongActiveTeamCount: 0,
      membershipCount: 60,
      crossMembershipCount: 0,
      crossMutationRejections: 30,
      insertConflicts: 30,
      conflictRecoveries: 30,
    });
  });
});
