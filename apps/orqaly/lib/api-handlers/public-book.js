/**
 * Public booking handler (consolidated under api/app for Vercel free plan).
 * POST /api/public-book
 */
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
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
  getDateKeyInZone,
  zonedDateTimeToUtc,
} from '../../src/services/availabilityService.js';

const publicBookSchema = z
  .object({
    slug: z.string().trim().max(80).optional(),
    token: z.string().trim().max(128).optional(),
    startAt: z.string().min(10, 'Missing selected slot start time.'),
    guestName: z
      .string()
      .trim()
      .min(2, 'Guest name is required.')
      .max(120, 'Guest name is too long.'),
    guestEmail: z
      .string()
      .trim()
      .email('Please provide a valid email.')
      .max(254, 'Email is too long.'),
    guestNotes: z.string().max(2000, 'Notes are too long.').optional().default(''),
  })
  .refine((data) => (data.slug && data.slug.length >= 3) || (data.token && data.token.length > 0), {
    message: 'Provide either a valid slug or a scheduling token.',
    path: ['slug'],
  });

function buildSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeSlug(value = '') {
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
    if (after.length > 0 && after.length <= 80) return normalizeSlug(after);
  }
  return normalizeSlug(value);
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const rl = checkRateLimit({
    key: `public-book:${getRateLimitIdentifier(req, '')}`,
    limit: Number(process.env.PUBLIC_BOOKING_RATE_LIMIT_PER_MIN || 10),
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    console.warn('[rate-limit] public-book blocked', {
      id: getRateLimitIdentifier(req, ''),
      limit: rl.limit,
      resetAt: new Date(rl.resetAt).toISOString(),
    });
    return jsonError(res, 429, 'Too many booking attempts. Please retry in a minute.');
  }

  const supabase = buildSupabaseAdminClient();
  if (!supabase)
    return jsonError(
      res,
      503,
      'Public booking API is not configured.',
      'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.'
    );

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return jsonError(res, 400, 'Invalid JSON body.');
  }

  const parsed = publicBookSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues?.[0]?.message || 'Invalid booking request.';
    return jsonError(res, 400, message);
  }

  const payload = parsed.data;
  const slug = payload.slug ? normalizeSlugFromQuery(payload.slug) : '';
  const token = String(payload.token || '').trim();
  const requestedStart = toDate(payload.startAt);
  if ((!slug && !token) || !requestedStart) return jsonError(res, 400, 'Selected slot is invalid.');

  try {
    let profileQuery = supabase
      .from('booking_profiles')
      .select(
        'id, user_id, partner_id, slug, host_name, meeting_title, meeting_description, duration_minutes, timezone, is_active, buffer_before_minutes, buffer_after_minutes, max_bookings_per_day'
      )
      .eq('is_active', true);
    if (token) profileQuery = profileQuery.eq('public_token', token);
    else profileQuery = profileQuery.eq('slug', slug);
    const { data: profile, error: profileError } = await profileQuery.maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return jsonError(res, 404, 'Scheduling link not found.');

    const timeZone = profile.timezone || 'UTC';
    const dateKey = getDateKeyInZone(requestedStart, timeZone);
    if (!dateKey) return jsonError(res, 400, 'Could not resolve the booking date.');

    const dayStart = zonedDateTimeToUtc(dateKey, '00:00', timeZone);
    const dayEnd = zonedDateTimeToUtc(addDaysToDateKey(dateKey, 1), '00:00', timeZone);
    if (!dayStart || !dayEnd) return jsonError(res, 400, 'Invalid scheduling date.');

    const maxPerDay = Number(profile.max_bookings_per_day || 0);
    if (maxPerDay > 0) {
      const { count, error: countErr } = await supabase
        .from('meeting_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id)
        .neq('status', 'cancelled')
        .gte('starts_at', dayStart.toISOString())
        .lt('starts_at', dayEnd.toISOString());
      if (countErr) throw countErr;
      if ((count || 0) >= maxPerDay)
        return jsonError(
          res,
          429,
          'Maximum bookings per day reached for this host. Please choose another day.'
        );
    }

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

    const selectedSlot = slots.find(
      (slot) => new Date(slot.startAt).getTime() === requestedStart.getTime()
    );
    if (!selectedSlot)
      return jsonError(res, 409, 'This slot is no longer available. Please choose another time.');

    const insertPayload = {
      profile_id: profile.id,
      user_id: profile.user_id,
      starts_at: selectedSlot.startAt,
      ends_at: selectedSlot.endAt,
      guest_name: payload.guestName,
      guest_email: payload.guestEmail,
      guest_notes: payload.guestNotes || '',
      status: 'confirmed',
      source: 'public_link',
      updated_at: new Date().toISOString(),
    };

    const { data: booking, error: bookingError } = await supabase
      .from('meeting_bookings')
      .insert(insertPayload)
      .select('id, starts_at, ends_at, status')
      .single();
    if (bookingError) {
      if (bookingError.code === '23505')
        return jsonError(res, 409, 'This slot was just booked. Please choose another time.');
      throw bookingError;
    }

    const meetingId = `MTG-PB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const meetingData = {
      title: profile.meeting_title || `Meeting with ${payload.guestName}`,
      organizer: profile.host_name || 'Meeting Host',
      participants: [payload.guestName, payload.guestEmail].filter(Boolean),
      datetime: selectedSlot.startAt,
      durationSeconds: Number(profile.duration_minutes || 30) * 60,
      channel: 'Public Booking Link',
      status: 'planned',
      planningNotes: payload.guestNotes || '',
      guestInfo: { name: payload.guestName, email: payload.guestEmail },
      source: 'public_booking',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    try {
      await supabase.from('meetings').insert({
        id: meetingId,
        partner_id: profile.partner_id || null,
        user_id: profile.user_id,
        data: meetingData,
      });
    } catch {
      /* Booking remains confirmed */
    }

    return res.status(200).json({
      success: true,
      booking: {
        id: booking.id,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        status: booking.status,
        hostName: profile.host_name || 'Meeting Host',
        meetingTitle: profile.meeting_title || 'Meeting',
        timezone: timeZone,
      },
    });
  } catch (err) {
    return handleApiError(res, err, 'public-book');
  }
}
