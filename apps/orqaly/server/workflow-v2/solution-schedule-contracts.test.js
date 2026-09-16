import { describe, expect, it } from 'vitest';
import {
  CreateSolutionScheduleSchema,
  nextScheduleTime,
} from '../../shared/workflow-v2/solution-schedule-contracts.js';
import { solutionSchedulesEnabledFromEnvironment } from './native-workflow-config.js';

describe('durable schedule contract', () => {
  it('skips missed interval slots rather than replaying a backlog', () => {
    expect(
      nextScheduleTime(
        { kind: 'interval', minutes: 5 },
        '2026-09-06T10:17:33Z',
        '2026-09-06T09:00:00Z'
      )
    ).toBe('2026-09-06T10:22:33.000Z');
  });
  it('resolves daily time in the customer timezone', () => {
    expect(
      nextScheduleTime(
        { kind: 'daily', hour: 9, minute: 0, timezone: 'Europe/Berlin' },
        '2026-09-06T06:59:00Z'
      )
    ).toBe('2026-09-06T07:00:00.000Z');
  });
  it('skips nonexistent spring wall time', () => {
    expect(
      nextScheduleTime(
        { kind: 'daily', hour: 2, minute: 30, timezone: 'Europe/Berlin' },
        '2026-03-28T23:00:00Z'
      )
    ).toBe('2026-03-30T00:30:00.000Z');
  });
  it('does not run the repeated autumn wall time twice', () => {
    expect(
      nextScheduleTime(
        { kind: 'daily', hour: 2, minute: 30, timezone: 'Europe/Berlin' },
        '2026-10-25T00:30:01Z',
        '2026-10-25T00:30:00Z'
      )
    ).toBe('2026-10-26T01:30:00.000Z');
  });
  it('rejects unbounded frequency and invalid timezones', () => {
    const base = { label: 'Daily report', workflowHash: 'a'.repeat(64), input: {} };
    expect(
      CreateSolutionScheduleSchema.safeParse({ ...base, timing: { kind: 'interval', minutes: 1 } })
        .success
    ).toBe(false);
    expect(
      CreateSolutionScheduleSchema.safeParse({
        ...base,
        timing: { kind: 'daily', hour: 9, minute: 0, timezone: 'Unknown/Mars' },
      }).success
    ).toBe(false);
  });
  it('rejects missing or nonobject input', () => {
    expect(
      CreateSolutionScheduleSchema.safeParse({
        label: 'Test',
        workflowHash: 'a'.repeat(64),
        timing: { kind: 'interval', minutes: 5 },
        input: [],
      }).success
    ).toBe(false);
  });
  it('requires explicit deployment enablement and rejects typos', () => {
    expect(solutionSchedulesEnabledFromEnvironment({})).toBe(false);
    expect(
      solutionSchedulesEnabledFromEnvironment({ ORQALY_SOLUTION_SCHEDULES_ENABLED: 'true' })
    ).toBe(true);
    expect(() =>
      solutionSchedulesEnabledFromEnvironment({ ORQALY_SOLUTION_SCHEDULES_ENABLED: 'yes' })
    ).toThrow();
  });
  it('bounds scheduled input by UTF-8 bytes at the invocation limit', () => {
    const base = {
      label: 'Test',
      workflowHash: 'a'.repeat(64),
      timing: { kind: 'interval', minutes: 5 },
    };
    expect(
      CreateSolutionScheduleSchema.safeParse({ ...base, input: { text: 'a'.repeat(15989) } })
        .success
    ).toBe(true);
    expect(
      CreateSolutionScheduleSchema.safeParse({ ...base, input: { text: 'a'.repeat(15990) } })
        .success
    ).toBe(false);
    expect(
      CreateSolutionScheduleSchema.safeParse({ ...base, input: { text: '€'.repeat(5400) } }).success
    ).toBe(false);
  });
});
