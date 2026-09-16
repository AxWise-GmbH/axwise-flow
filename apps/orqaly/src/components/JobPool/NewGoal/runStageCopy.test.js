import { describe, expect, it } from 'vitest';
import {
  GOAL_STATUSES,
  RUN_DOT_COUNT,
  isTerminalStatus,
  needsUserAction,
  runDotIndex,
  runStageCopy,
} from './runStageCopy';

describe('runStageCopy coverage', () => {
  it.each(GOAL_STATUSES)('has plain-language copy for %s', (status) => {
    const copy = runStageCopy(status);
    expect(copy.headline).toBeTruthy();
    expect(copy.subline).toBeTruthy();
    // Simple mode must never surface a raw status string to the user.
    expect(copy.headline.toLowerCase()).not.toContain('_');
    expect(copy.headline).not.toBe(status);
  });

  it('covers the goals.status CHECK constraint exactly', () => {
    // Mirrors migration 195. If a later migration adds a status, add copy for
    // it here in the same change rather than letting it fall back.
    expect(GOAL_STATUSES).toHaveLength(20);
    expect(GOAL_STATUSES).toContain('authorizing_execution');
    expect(GOAL_STATUSES).toContain('researching_customer');
    expect(GOAL_STATUSES).toContain('pending_validation');
    expect(new Set(GOAL_STATUSES).size).toBe(GOAL_STATUSES.length);
  });

  it('falls back rather than throwing on an unknown status', () => {
    const copy = runStageCopy('some_future_status');
    expect(copy.headline).toBe('Working on it');
    expect(copy.dot).toBeNull();
  });

  it('presents clarification as scope confirmation, not a questionnaire', () => {
    expect(runStageCopy('awaiting_po_input')).toEqual({
      dot: 1,
      headline: 'Confirming the scope',
      subline: 'Review the proposed scope or add a correction before planning.',
    });
  });
});

describe('approval gate wording', () => {
  it.each([['awaiting_context_approval'], ['awaiting_approval']])(
    'tells an unattended goal it is approving for you at %s',
    (status) => {
      expect(runStageCopy(status, { unattended: true }).subline).toContain('you');
      expect(runStageCopy(status, { unattended: true }).subline).not.toContain('Waiting for you');
    }
  );

  it.each([['awaiting_context_approval'], ['awaiting_approval']])(
    'tells a checkpoints goal that it is waiting at %s',
    (status) => {
      expect(runStageCopy(status, { unattended: false }).subline).toContain('Waiting for you');
    }
  );

  it('defaults to the waiting wording when the mode is not supplied', () => {
    // Safer direction: telling someone to check in when nothing needs them is
    // a smaller failure than leaving a stalled goal looking self-driving.
    expect(runStageCopy('awaiting_approval').subline).toContain('Waiting for you');
  });

  it('uses the same wording in both modes where no gate is involved', () => {
    for (const status of ['planning', 'active', 'completed']) {
      expect(runStageCopy(status, { unattended: true })).toEqual(
        runStageCopy(status, { unattended: false })
      );
    }
  });
});

describe('run progress dots', () => {
  it('advances monotonically through the happy path', () => {
    const path = [
      'draft',
      'feasibility',
      'analyzing',
      'planning',
      'forming_team',
      'estimating',
      'active',
      'pending_validation',
      'completed',
    ];
    const dots = path.map(runDotIndex);
    for (let i = 1; i < dots.length; i += 1) {
      expect(dots[i]).toBeGreaterThanOrEqual(dots[i - 1]);
    }
    expect(dots.at(-1)).toBe(RUN_DOT_COUNT);
  });

  it('keeps every dot index inside the rendered range', () => {
    for (const status of GOAL_STATUSES) {
      const index = runDotIndex(status);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(RUN_DOT_COUNT);
    }
  });

  it('reports zero dots for a status with no position in the run', () => {
    expect(runDotIndex('failed')).toBe(0);
    expect(runDotIndex('unknown')).toBe(0);
  });
});

describe('status predicates', () => {
  it('treats only finished goals as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('active')).toBe(false);
    expect(isTerminalStatus('awaiting_approval')).toBe(false);
  });

  it('flags the statuses a person must clear even on an unattended goal', () => {
    // Human Approve off clears the two approval gates. It cannot connect a
    // missing tool or answer a question, so these still stop the run.
    expect(needsUserAction('awaiting_tools')).toBe(true);
    expect(needsUserAction('awaiting_po_input')).toBe(true);
    expect(needsUserAction('needs_human')).toBe(true);
    expect(needsUserAction('paused')).toBe(true);
    expect(needsUserAction('active')).toBe(false);
    expect(needsUserAction('awaiting_approval')).toBe(false);
  });
});
