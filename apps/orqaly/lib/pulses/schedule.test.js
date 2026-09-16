import { describe, it, expect } from 'vitest';
import { computeNextDue, parseScheduleSpec } from './schedule.js';

describe('computeNextDue', () => {
  // Reference: Wed 2026-05-27 10:00 local
  const from = new Date(2026, 4, 27, 10, 0, 0);

  it('once returns the provided run_at as ISO', () => {
    const runAt = '2026-06-01T09:00:00.000Z';
    expect(computeNextDue('once', { run_at: runAt }, from)).toBe(new Date(runAt).toISOString());
  });

  it('once with no run_at returns null', () => {
    expect(computeNextDue('once', {}, from)).toBeNull();
  });

  it('daily picks today if time still ahead', () => {
    const next = new Date(computeNextDue('daily', { time_of_day: '18:00' }, from));
    expect(next.getDate()).toBe(27);
    expect(next.getHours()).toBe(18);
  });

  it('daily rolls to tomorrow if time already passed', () => {
    const next = new Date(computeNextDue('daily', { time_of_day: '08:00' }, from));
    expect(next.getDate()).toBe(28);
    expect(next.getHours()).toBe(8);
  });

  it('weekly finds the next matching weekday', () => {
    // from is Wednesday (3); ask for Friday (5) -> +2 days
    const next = new Date(computeNextDue('weekly', { weekday: 5, time_of_day: '09:00' }, from));
    expect(next.getDay()).toBe(5);
    expect(next.getDate()).toBe(29);
  });

  it('weekly rolls a full week when same day already passed', () => {
    // Wednesday (3) at 09:00, but from is 10:00 -> next Wednesday
    const next = new Date(computeNextDue('weekly', { weekday: 3, time_of_day: '09:00' }, from));
    expect(next.getDay()).toBe(3);
    expect(next.getDate()).toBe(3); // June 3
  });

  it('monthly picks this month if day ahead', () => {
    const next = new Date(computeNextDue('monthly', { day_of_month: 30, time_of_day: '09:00' }, from));
    expect(next.getMonth()).toBe(4); // May
    expect(next.getDate()).toBe(28); // clamped to 28
  });

  it('monthly rolls to next month if day passed', () => {
    const next = new Date(computeNextDue('monthly', { day_of_month: 1, time_of_day: '09:00' }, from));
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(1);
  });

  it('unknown kind returns null', () => {
    expect(computeNextDue('hourly', {}, from)).toBeNull();
  });
});

describe('parseScheduleSpec', () => {
  it('parses once', () => {
    expect(parseScheduleSpec('once 2026-06-01T09:00')).toEqual({ schedule_kind: 'once', run_at: '2026-06-01T09:00' });
  });
  it('parses daily', () => {
    expect(parseScheduleSpec('daily 09:00')).toEqual({ schedule_kind: 'daily', time_of_day: '09:00' });
  });
  it('parses weekly with weekday name', () => {
    expect(parseScheduleSpec('weekly mon 09:00')).toEqual({ schedule_kind: 'weekly', weekday: 1, time_of_day: '09:00' });
  });
  it('parses monthly', () => {
    expect(parseScheduleSpec('monthly 1 09:00')).toEqual({ schedule_kind: 'monthly', day_of_month: 1, time_of_day: '09:00' });
  });
  it('returns null for empty/unknown', () => {
    expect(parseScheduleSpec('')).toBeNull();
    expect(parseScheduleSpec('yearly')).toBeNull();
  });
});
