import { z } from 'zod';
import { isBoundedNativeJson } from './native-workflow-contracts.js';

const Timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose an IANA timezone');
export const ScheduleTimingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), minutes: z.number().int().min(5).max(10080) }).strict(),
  z
    .object({
      kind: z.literal('daily'),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      timezone: Timezone,
    })
    .strict(),
]);
export const CreateSolutionScheduleSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
    timing: ScheduleTimingSchema,
    input: z
      .unknown()
      .refine(
        (value) =>
          isBoundedNativeJson(value) &&
          value !== null &&
          !Array.isArray(value) &&
          typeof value === 'object' &&
          new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16000
      ),
  })
  .strict();

function wallTime(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

// Explicit misfire policy: skip missed slots, never replay a backlog. Daily wall
// times absent at the DST spring change are skipped; repeated autumn times run
// once per local date. A previous tick's local date is part of durable state.
export function nextScheduleTime(timing, after, previousTick = null) {
  const parsed = ScheduleTimingSchema.parse(timing);
  const now = new Date(after).getTime();
  if (!Number.isFinite(now)) throw new Error('schedule_time_invalid');
  if (parsed.kind === 'interval') return new Date(now + parsed.minutes * 60000).toISOString();
  const previousDay = previousTick ? wallTime(new Date(previousTick), parsed.timezone).day : null;
  for (
    let stamp = Math.floor(now / 60000) * 60000 + 60000;
    stamp <= now + 73 * 3600000;
    stamp += 60000
  ) {
    const wall = wallTime(new Date(stamp), parsed.timezone);
    if (wall.day !== previousDay && wall.hour === parsed.hour && wall.minute === parsed.minute)
      return new Date(stamp).toISOString();
  }
  throw new Error('schedule_time_unresolvable');
}
