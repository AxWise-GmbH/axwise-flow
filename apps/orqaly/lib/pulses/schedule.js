/**
 * Pulse schedule math — shared by the pulse-tick engine and the pulse.create
 * channel tool. Pure functions, no I/O, so they are trivially unit-testable.
 *
 * Schedule kinds:
 *   once    — fires a single time at `run_at`, then disables itself.
 *   daily   — every day at `time_of_day` (HH:MM).
 *   weekly  — every week on `weekday` (0=Sun..6=Sat) at `time_of_day`.
 *   monthly — every month on `day_of_month` (1..28) at `time_of_day`.
 *
 * Note: time-of-day is interpreted in the runtime's local timezone. Callers
 * that need strict user-timezone alignment should pass dates already shifted.
 */

const WEEKDAYS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function parseTimeOfDay(timeOfDay) {
  if (typeof timeOfDay === 'string') {
    const m = timeOfDay.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
      return [h, min];
    }
  }
  return [9, 0]; // default 09:00
}

function nextDaily(from, opts) {
  const [h, m] = parseTimeOfDay(opts.time_of_day);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

function nextWeekly(from, opts) {
  const [h, m] = parseTimeOfDay(opts.time_of_day);
  const targetDow = Number.isInteger(opts.weekday) ? ((opts.weekday % 7) + 7) % 7 : 1;
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  let diff = (targetDow - d.getDay() + 7) % 7;
  if (diff === 0 && d <= from) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function nextMonthly(from, opts) {
  const [h, m] = parseTimeOfDay(opts.time_of_day);
  // Clamp to 28 so we never skip a short month (Feb) or overflow.
  const dom = Math.min(28, Math.max(1, parseInt(opts.day_of_month, 10) || 1));
  const d = new Date(from.getFullYear(), from.getMonth(), dom, h, m, 0, 0);
  if (d <= from) d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * Compute the next due timestamp for a schedule.
 * @returns {string|null} ISO string, or null for one-time pulses with no run_at.
 */
export function computeNextDue(scheduleKind, opts = {}, fromDate = new Date()) {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  switch (scheduleKind) {
    case 'once': {
      const runAt = opts.run_at || opts.runAt;
      return runAt ? new Date(runAt).toISOString() : null;
    }
    case 'daily':
      return nextDaily(from, opts).toISOString();
    case 'weekly':
      return nextWeekly(from, opts).toISOString();
    case 'monthly':
      return nextMonthly(from, opts).toISOString();
    default:
      return null;
  }
}

/**
 * Parse a human-ish schedule spec (used by the chat pulse.create tool) into a
 * normalized options object usable by computeNextDue().
 *
 * Examples:
 *   "once 2026-06-01T09:00"  -> { schedule_kind:'once', run_at:'2026-06-01T09:00' }
 *   "daily 09:00"            -> { schedule_kind:'daily', time_of_day:'09:00' }
 *   "weekly mon 09:00"       -> { schedule_kind:'weekly', weekday:1, time_of_day:'09:00' }
 *   "monthly 1 09:00"        -> { schedule_kind:'monthly', day_of_month:1, time_of_day:'09:00' }
 */
export function parseScheduleSpec(spec) {
  const s = String(spec || '').trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  const kind = (parts[0] || '').toLowerCase();

  if (kind === 'once') {
    return { schedule_kind: 'once', run_at: parts.slice(1).join(' ') || null };
  }
  if (kind === 'daily') {
    return { schedule_kind: 'daily', time_of_day: parts[1] || '09:00' };
  }
  if (kind === 'weekly') {
    const wd = (parts[1] || '').toLowerCase();
    return {
      schedule_kind: 'weekly',
      weekday: wd in WEEKDAYS ? WEEKDAYS[wd] : 1,
      time_of_day: parts[2] || '09:00',
    };
  }
  if (kind === 'monthly') {
    return {
      schedule_kind: 'monthly',
      day_of_month: parseInt(parts[1], 10) || 1,
      time_of_day: parts[2] || '09:00',
    };
  }
  return null;
}

export const WEEKDAY_MAP = WEEKDAYS;
