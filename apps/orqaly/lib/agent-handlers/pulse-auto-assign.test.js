import { describe, expect, it } from 'vitest';
import {
  autoAssignGoalsToAgents,
  pulseAssignmentCandidates,
  resolvePulseGoalAuthority,
} from './pulse-auto-assign.js';
import {
  acceptedNativeGoalFixture,
  initialNativeScopeAdmissionGoalFixture,
} from '../_shared/native-goal-authority.test-fixture.js';

function noAgentAdmin() {
  const selected = [];
  const query = {
    select(columns) {
      selected.push(columns);
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
  };
  return {
    selected,
    from(table) {
      expect(table).toBe('concilium_agents');
      return query;
    },
  };
}

describe('pulse auto-assignment schema compatibility', () => {
  it('loads capability/category data from metadata instead of nonexistent columns', async () => {
    const admin = noAgentAdmin();
    await expect(autoAssignGoalsToAgents(admin)).resolves.toEqual({ assigned: 0 });
    expect(admin.selected).toEqual([
      'id, user_id, name, agent_type, description, metadata, check_in_interval_ms',
    ]);
    expect(admin.selected[0]).not.toMatch(/(?:^|, )capabilities(?:,|$)/);
    expect(admin.selected[0]).not.toMatch(/(?:^|, )category(?:,|$)/);
  });

  it('pairs a Pulse agent only with goals owned by the same tenant', () => {
    const candidates = pulseAssignmentCandidates({ id: 'agent-1', user_id: 'user-1' }, [
      { id: 'foreign', user_id: 'user-2', title: 'FOREIGN TENANT POISON' },
      { id: 'owned', user_id: 'user-1', title: 'Owned goal', description: 'Safe brief' },
    ]);

    expect(candidates.map(({ goal }) => goal.id)).toEqual(['owned']);
    expect(candidates[0].authority.text).not.toContain('FOREIGN TENANT POISON');
  });

  it('projects accepted native goals from the canonical packet and excludes poisoned raw prose', () => {
    const goal = acceptedNativeGoalFixture({
      user_id: 'user-1',
      title: 'RAW_NATIVE_TITLE_POISON',
      description: 'RAW_NATIVE_DESCRIPTION_POISON',
    });

    const context = resolvePulseGoalAuthority(goal);

    expect(context).toMatchObject({ eligible: true, native: true });
    expect(context.text).toContain(
      goal.data.axwise_customer_intelligence.scope_packet.intent.objective
    );
    expect(context.text).not.toContain('RAW_NATIVE_TITLE_POISON');
    expect(context.text).not.toContain('RAW_NATIVE_DESCRIPTION_POISON');
  });

  it('does not downgrade an incomplete native admission to legacy Pulse matching', () => {
    const goal = initialNativeScopeAdmissionGoalFixture({
      user_id: 'user-1',
      title: 'RAW_INCOMPLETE_NATIVE_POISON',
      status: 'planning',
    });

    expect(resolvePulseGoalAuthority(goal)).toMatchObject({
      eligible: false,
      native: true,
      text: '',
    });
    expect(pulseAssignmentCandidates({ user_id: 'user-1' }, [goal])).toEqual([]);
  });
});
