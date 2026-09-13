/**
 * Client mirror of lib/pulses/schedule.js computeNextDue(). Kept standalone so
 * frontend code never imports server-side lib modules. The pulse-tick engine
 * recomputes next_due_at server-side after each fire; this is only used to set
 * the INITIAL next_due_at when a pulse is created from the UI.
 */

function parseTimeOfDay(timeOfDay) {
  if (typeof timeOfDay === 'string') {
    const m = timeOfDay.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
      return [h, min];
    }
  }
  return [9, 0];
}

export function computeNextDue(scheduleKind, opts = {}, fromDate = new Date()) {
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  switch (scheduleKind) {
    case 'once': {
      const runAt = opts.run_at || opts.runAt;
      return runAt ? new Date(runAt).toISOString() : null;
    }
    case 'daily': {
      const [h, m] = parseTimeOfDay(opts.time_of_day);
      const d = new Date(from);
      d.setHours(h, m, 0, 0);
      if (d <= from) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    case 'weekly': {
      const [h, m] = parseTimeOfDay(opts.time_of_day);
      const targetDow = Number.isInteger(opts.weekday) ? ((opts.weekday % 7) + 7) % 7 : 1;
      const d = new Date(from);
      d.setHours(h, m, 0, 0);
      let diff = (targetDow - d.getDay() + 7) % 7;
      if (diff === 0 && d <= from) diff = 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString();
    }
    case 'monthly': {
      const [h, m] = parseTimeOfDay(opts.time_of_day);
      const dom = Math.min(28, Math.max(1, parseInt(opts.day_of_month, 10) || 1));
      const d = new Date(from.getFullYear(), from.getMonth(), dom, h, m, 0, 0);
      if (d <= from) d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }
    default:
      return null;
  }
}

export const SCHEDULE_KINDS = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/** Local datetime string for `<input type="datetime-local">`. */
export function defaultDateTimeLocal(offsetMs = 10 * 60 * 1000) {
  const d = new Date(Date.now() + offsetMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

/** Human label for a stored schedule (used in list views). */
export function describeSchedule(meta = {}) {
  const t = meta.time_of_day || '09:00';
  switch (meta.schedule_kind) {
    case 'once':
      return meta.run_at ? `Once · ${new Date(meta.run_at).toLocaleString()}` : 'Once';
    case 'daily':
      return `Daily · ${t}`;
    case 'weekly': {
      const wd = WEEKDAY_OPTIONS.find((w) => w.value === meta.weekday);
      return `Weekly · ${wd ? wd.label : 'Mon'} ${t}`;
    }
    case 'monthly':
      return `Monthly · day ${meta.day_of_month || 1} ${t}`;
    default:
      return meta.schedule_kind || '—';
  }
}
