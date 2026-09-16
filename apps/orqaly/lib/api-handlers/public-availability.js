/**
 * Public availability handler (consolidated under api/app for Vercel free plan).
 * GET /api/public-availability?slug=...&date=...
 */
import { createClient } from '@supabase/supabase-js';
import { cors } from '../../api/_lib/cors.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import {
  addDaysToDateKey,
  computeAvailableSlots,
  getTodayDateKey,
  mapBookingsForDate,
  zonedDateTimeToUtc,
} from '../../src/services/availabilityService.js';

function buildSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);
}

/** If slug looks like a mangled full URL (e.g. httpsorchestratorivercelappbookmister-nq), use the part after "book". */
function normalizeSlugFromQuery(value = '') {
  const s = String(value).trim().toLowerCase();
  if (!s) return '';
  if (s.includes('book')) {
    const after =
      s
        .split('book')
        .pop()
        ?.replace(/^[-_]+/, '') || '';
    if (after.length > 0 && after.length <= 80) return sanitizeSlug(after);
  }
  return sanitizeSlug(value);
}

function sanitizeDateKey(value = '') {
  const trimmed = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const rl = checkRateLimit({
    key: `public-availability:${getRateLimitIdentifier(req, '')}`,
    limit: Number(process.env.PUBLIC_AVAILABILITY_RATE_LIMIT_PER_MIN || 10),
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    console.warn('[rate-limit] public-availability blocked', {
      id: getRateLimitIdentifier(req, ''),
      limit: rl.limit,
      resetAt: new Date(rl.resetAt).toISOString(),
    });
    return jsonError(res, 429, 'Too many availability requests. Please retry in a minute.');
  }

  const supabase = buildSupabaseAdminClient();
  if (!supabase)
    return jsonError(
      res,
      503,
      'Public scheduling API is not configured.',
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
    );

  const slug = normalizeSlugFromQuery(req.query?.slug);
  const token = String(req.query?.token || '')
    .trim()
    .slice(0, 128);
  if (!slug && !token) return jsonError(res, 400, 'Missing slug or token.');

  try {
    let query = supabase
      .from('booking_profiles')
      .select(
        'id, slug, host_name, meeting_title, meeting_description, duration_minutes, timezone, is_active, role, avatar_url, buffer_before_minutes, buffer_after_minutes'
      )
      .eq('is_active', true);
    if (token) query = query.eq('public_token', token);
    else query = query.eq('slug', slug);
    const { data: profile, error: profileError } = await query.maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return jsonError(res, 404, 'Scheduling link not found.');

    const timeZone = profile.timezone || 'UTC';
    const dateKey = sanitizeDateKey(req.query?.date) || getTodayDateKey(timeZone);
    const dayStart = zonedDateTimeToUtc(dateKey, '00:00', timeZone);
    const dayEnd = zonedDateTimeToUtc(addDaysToDateKey(dateKey, 1), '00:00', timeZone);
    if (!dayStart || !dayEnd) return jsonError(res, 400, 'Invalid date or timezone.');

    const [rulesRes, overridesRes, bookingsRes] = await Promise.all([
      supabase
        .from('availability_rules')
        .select('weekday, start_time, end_time')
        .eq('profile_id', profile.id),
      supabase
        .from('availability_overrides')
        .select('override_date, is_available, start_time, end_time')
        .eq('profile_id', profile.id)
        .eq('override_date', dateKey)
        .limit(1),
      supabase
        .from('meeting_bookings')
        .select('id, starts_at, ends_at, status')
        .eq('profile_id', profile.id)
        .neq('status', 'cancelled')
        .gte('starts_at', dayStart.toISOString())
        .lt('starts_at', dayEnd.toISOString())
        .order('starts_at', { ascending: true }),
    ]);

    if (rulesRes.error) throw rulesRes.error;
    if (overridesRes.error) throw overridesRes.error;
    if (bookingsRes.error) throw bookingsRes.error;

    const weeklyRules = (rulesRes.data || []).map((row) => ({
      weekday: row.weekday,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
    const overrides = (overridesRes.data || []).map((row) => ({
      overrideDate: row.override_date,
      isAvailable: row.is_available !== false,
      startTime: row.start_time,
      endTime: row.end_time,
    }));
    const bookings = (bookingsRes.data || []).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      title: 'Booked',
    }));

    const slots = computeAvailableSlots({
      dateKey,
      timeZone,
      durationMinutes: Number(profile.duration_minutes || 30),
      weeklyRules,
      overrides,
      bookings,
      stepMinutes: 30,
      minNoticeMinutes: Number(process.env.PUBLIC_BOOKING_MIN_NOTICE_MINUTES || 0),
      bufferBeforeMinutes: Number(profile.buffer_before_minutes || 0),
      bufferAfterMinutes: Number(profile.buffer_after_minutes || 0),
      now: new Date(),
    });

    const booked = mapBookingsForDate({ dateKey, bookings, timeZone });

    return res.status(200).json({
      profile: {
        slug: profile.slug,
        hostName: profile.host_name || 'Meeting Host',
        meetingTitle: profile.meeting_title || 'Meeting',
        meetingDescription: profile.meeting_description || '',
        durationMinutes: Number(profile.duration_minutes || 30),
        timezone: timeZone,
        role: profile.role || '',
        avatarUrl: profile.avatar_url || null,
      },
      date: dateKey,
      slots,
      booked,
    });
  } catch (err) {
    return handleApiError(res, err, 'public-availability');
  }
}
