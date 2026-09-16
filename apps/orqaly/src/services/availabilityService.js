const DEFAULT_TIME_ZONE = 'UTC';

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const dtfCache = new Map();

const pad2 = (value) => String(value).padStart(2, '0');

const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const parseDateKey = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
};

const normalizeDateKey = (value) => {
  const parsed = parseDateKey(value);
  if (!parsed) return '';
  return `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}`;
};

const getFormatter = (timeZone, options) => {
  const key = `${timeZone}::${JSON.stringify(options)}`;
  if (!dtfCache.has(key)) {
    dtfCache.set(key, new Intl.DateTimeFormat('en-CA', { timeZone, ...options }));
  }
  return dtfCache.get(key);
};

const getPartsInZone = (dateInput, timeZone) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = getFormatter(timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = {};
  parts.forEach((part) => {
    lookup[part.type] = part.value;
  });
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  return { year, month, day, hour, minute, second };
};

const getTimeZoneOffsetMs = (dateInput, timeZone) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = getPartsInZone(date, timeZone);
  if (!parts) return 0;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
};

export const normalizeTimeString = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${pad2(hours)}:${pad2(minutes)}`;
};

export const parseTimeToMinutes = (value) => {
  const normalized = normalizeTimeString(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map((part) => Number(part));
  return h * 60 + m;
};

export const minutesToTimeString = (value) => {
  const minutes = toFiniteNumber(value);
  if (minutes === null) return '';
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${pad2(hours)}:${pad2(mins)}`;
};

export const getWeekdayFromDateKey = (dateKey) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)).getUTCDay();
};

export const addDaysToDateKey = (dateKey, days = 1) => {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

export const zonedDateTimeToUtc = (dateKey, timeValue, timeZone = DEFAULT_TIME_ZONE) => {
  const parsed = parseDateKey(dateKey);
  const minutes = parseTimeToMinutes(timeValue);
  if (!parsed || minutes === null) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const naiveUtcMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, hour, minute, 0, 0);

  const firstGuess = new Date(naiveUtcMs);
  const firstOffset = getTimeZoneOffsetMs(firstGuess, timeZone);
  let utcDate = new Date(naiveUtcMs - firstOffset);

  const secondOffset = getTimeZoneOffsetMs(utcDate, timeZone);
  if (secondOffset !== firstOffset) {
    utcDate = new Date(naiveUtcMs - secondOffset);
  }
  return utcDate;
};

export const getDateKeyInZone = (dateInput, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = getPartsInZone(dateInput, timeZone);
  if (!parts) return '';
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const getTodayDateKey = (timeZone = DEFAULT_TIME_ZONE) =>
  getDateKeyInZone(new Date(), timeZone);

export const formatTimeInZone = (
  dateInput,
  timeZone = DEFAULT_TIME_ZONE,
  { hour12 = true } = {}
) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = getFormatter(timeZone, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  });
  return formatter.format(date);
};

export const formatDateInZone = (dateInput, timeZone = DEFAULT_TIME_ZONE) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = getFormatter(timeZone, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  return formatter.format(date);
};

const normalizeWeeklyRule = (rule) => {
  const weekday = Number(rule?.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  const startMinutes = parseTimeToMinutes(rule?.startTime ?? rule?.start_time);
  const endMinutes = parseTimeToMinutes(rule?.endTime ?? rule?.end_time);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null;
  return { weekday, startMinutes, endMinutes };
};

const normalizeOverride = (override) => {
  const dateKey = normalizeDateKey(
    override?.dateKey ?? override?.overrideDate ?? override?.override_date
  );
  if (!dateKey) return null;
  const isAvailable = override?.isAvailable ?? override?.is_available;
  const startMinutes = parseTimeToMinutes(override?.startTime ?? override?.start_time);
  const endMinutes = parseTimeToMinutes(override?.endTime ?? override?.end_time);
  return {
    dateKey,
    isAvailable: isAvailable !== false,
    startMinutes,
    endMinutes,
  };
};

const normalizeBooking = (booking) => {
  const startAtRaw = booking?.startsAt ?? booking?.starts_at;
  const endAtRaw = booking?.endsAt ?? booking?.ends_at;
  const start = new Date(startAtRaw);
  const end = endAtRaw ? new Date(endAtRaw) : null;
  if (Number.isNaN(start.getTime())) return null;
  const endDate =
    end && !Number.isNaN(end.getTime()) ? end : new Date(start.getTime() + 30 * 60 * 1000);
  return {
    id: booking?.id ?? null,
    title: booking?.title || '',
    status: booking?.status || 'confirmed',
    start,
    end: endDate,
  };
};

const rangesOverlap = (aStartMs, aEndMs, bStartMs, bEndMs) =>
  aStartMs < bEndMs && bStartMs < aEndMs;

const hasConflict = (startDate, endDate, bookings) => {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  return bookings.some((booking) => {
    const status = String(booking.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'canceled') return false;
    return rangesOverlap(startMs, endMs, booking.start.getTime(), booking.end.getTime());
  });
};

/** Expand bookings by buffer for conflict check: no slot may start within buffer before/after an existing booking. */
const expandBookingsByBuffer = (bookings, bufferBeforeMinutes = 0, bufferAfterMinutes = 0) => {
  const beforeMs = Math.max(0, Number(bufferBeforeMinutes) || 0) * 60 * 1000;
  const afterMs = Math.max(0, Number(bufferAfterMinutes) || 0) * 60 * 1000;
  if (beforeMs === 0 && afterMs === 0) return bookings;
  return bookings.map((b) => ({
    ...b,
    start: new Date(b.start.getTime() - beforeMs),
    end: new Date(b.end.getTime() + afterMs),
  }));
};

export const resolveDailyWindows = ({ dateKey, weeklyRules = [], overrides = [] }) => {
  const normalizedDate = normalizeDateKey(dateKey);
  if (!normalizedDate) return [];

  const override = overrides
    .map(normalizeOverride)
    .filter(Boolean)
    .find((item) => item.dateKey === normalizedDate);

  if (override) {
    if (!override.isAvailable) return [];
    if (
      Number.isFinite(override.startMinutes) &&
      Number.isFinite(override.endMinutes) &&
      override.endMinutes > override.startMinutes
    ) {
      return [{ startMinutes: override.startMinutes, endMinutes: override.endMinutes }];
    }
  }

  const weekday = getWeekdayFromDateKey(normalizedDate);
  if (weekday === null) return [];

  return weeklyRules
    .map(normalizeWeeklyRule)
    .filter(Boolean)
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => ({ startMinutes: rule.startMinutes, endMinutes: rule.endMinutes }));
};

export const computeAvailableSlots = ({
  dateKey,
  timeZone = DEFAULT_TIME_ZONE,
  durationMinutes = 30,
  weeklyRules = [],
  overrides = [],
  bookings = [],
  stepMinutes,
  minNoticeMinutes = 0,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
  now = new Date(),
}) => {
  const normalizedDate = normalizeDateKey(dateKey);
  if (!normalizedDate) return [];

  const duration = Math.max(15, Math.floor(Number(durationMinutes) || 30));
  const step = Math.max(5, Math.floor(Number(stepMinutes) || Math.min(duration, 30)));
  const minNotice = Math.max(0, Math.floor(Number(minNoticeMinutes) || 0));

  const dailyWindows = resolveDailyWindows({
    dateKey: normalizedDate,
    weeklyRules,
    overrides,
  });
  if (dailyWindows.length === 0) return [];

  const rawBookingList = bookings.map(normalizeBooking).filter(Boolean);
  const bookingList = expandBookingsByBuffer(
    rawBookingList,
    bufferBeforeMinutes,
    bufferAfterMinutes
  );

  const minStartMs = (now instanceof Date ? now : new Date(now)).getTime() + minNotice * 60 * 1000;
  const slotMap = new Map();

  dailyWindows.forEach((window) => {
    for (
      let startMinutes = window.startMinutes;
      startMinutes + duration <= window.endMinutes;
      startMinutes += step
    ) {
      const startTime = minutesToTimeString(startMinutes);
      const startUtc = zonedDateTimeToUtc(normalizedDate, startTime, timeZone);
      if (!startUtc) continue;
      const endUtc = new Date(startUtc.getTime() + duration * 60 * 1000);
      if (startUtc.getTime() < minStartMs) continue;
      if (hasConflict(startUtc, endUtc, bookingList)) continue;

      const startIso = startUtc.toISOString();
      slotMap.set(startIso, {
        startAt: startIso,
        endAt: endUtc.toISOString(),
        startLabel: formatTimeInZone(startUtc, timeZone),
        endLabel: formatTimeInZone(endUtc, timeZone),
        label: formatTimeInZone(startUtc, timeZone),
      });
    }
  });

  return Array.from(slotMap.values()).sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
  );
};

export const mapBookingsForDate = ({ dateKey, bookings = [], timeZone = DEFAULT_TIME_ZONE }) => {
  const normalizedDate = normalizeDateKey(dateKey);
  if (!normalizedDate) return [];

  return bookings
    .map(normalizeBooking)
    .filter(Boolean)
    .filter((booking) => getDateKeyInZone(booking.start, timeZone) === normalizedDate)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((booking) => ({
      id: booking.id || `${booking.start.toISOString()}-${booking.end.toISOString()}`,
      startAt: booking.start.toISOString(),
      endAt: booking.end.toISOString(),
      startLabel: formatTimeInZone(booking.start, timeZone),
      endLabel: formatTimeInZone(booking.end, timeZone),
      title: booking.title || 'Booked',
    }));
};
