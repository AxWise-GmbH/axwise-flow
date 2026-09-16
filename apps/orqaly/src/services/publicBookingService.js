import { supabase, hasSupabase } from '../lib/supabase';
import {
  formatDateInZone,
  formatTimeInZone,
  normalizeTimeString,
  WEEKDAY_NAMES,
} from './availabilityService';

const clone = (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_WEEKLY_WINDOWS = [
  { weekday: 1, startTime: '09:00', endTime: '17:00' },
  { weekday: 2, startTime: '09:00', endTime: '17:00' },
  { weekday: 3, startTime: '09:00', endTime: '17:00' },
  { weekday: 4, startTime: '09:00', endTime: '17:00' },
  { weekday: 5, startTime: '09:00', endTime: '17:00' },
];

const normalizeSlugPart = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);

const randomSuffix = () => Math.random().toString(36).slice(2, 7);

const buildDefaultSlug = (user) => {
  const base =
    normalizeSlugPart(user?.user_metadata?.display_name) ||
    normalizeSlugPart(user?.email?.split('@')?.[0]) ||
    'meeting-host';
  return `${base}-${randomSuffix()}`;
};

const defaultTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const normalizeProfile = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    slug: row.slug,
    hostName: row.host_name || '',
    meetingTitle: row.meeting_title || '30 Minute Meeting',
    meetingDescription: row.meeting_description || '',
    durationMinutes: Number(row.duration_minutes || DEFAULT_DURATION_MINUTES),
    timezone: row.timezone || 'UTC',
    isActive: row.is_active !== false,
    partnerId: row.partner_id || null,
    publicToken: row.public_token || null,
    role: row.role || '',
    avatarUrl: row.avatar_url || null,
    bufferBeforeMinutes: Number(row.buffer_before_minutes || 0),
    bufferAfterMinutes: Number(row.buffer_after_minutes || 0),
    maxBookingsPerDay: Number(row.max_bookings_per_day || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
};

const normalizeRule = (row) => ({
  id: row.id,
  profileId: row.profile_id,
  weekday: Number(row.weekday),
  weekdayLabel: WEEKDAY_NAMES[Number(row.weekday)] || 'Day',
  startTime: normalizeTimeString(row.start_time),
  endTime: normalizeTimeString(row.end_time),
});

const normalizeOverride = (row) => ({
  id: row.id,
  profileId: row.profile_id,
  overrideDate: row.override_date,
  isAvailable: row.is_available !== false,
  startTime: normalizeTimeString(row.start_time),
  endTime: normalizeTimeString(row.end_time),
  note: row.note || '',
});

const normalizeBooking = (row, timeZone = 'UTC') => ({
  id: row.id,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  guestName: row.guest_name || '',
  guestEmail: row.guest_email || '',
  guestNotes: row.guest_notes || '',
  status: row.status || 'confirmed',
  createdAt: row.created_at || null,
  dateLabel: formatDateInZone(row.starts_at, timeZone),
  timeLabel: `${formatTimeInZone(row.starts_at, timeZone)} - ${formatTimeInZone(row.ends_at, timeZone)}`,
});

const ensureSupabase = () => {
  if (!hasSupabase() || !supabase) {
    throw new Error(
      'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }
};

const getAuthenticatedUser = async () => {
  ensureSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) {
    throw new Error('Please sign in to manage booking settings.');
  }
  return data.user;
};

const insertDefaultWeeklyRules = async (profileId) => {
  const rows = DEFAULT_WEEKLY_WINDOWS.map((rule) => ({
    profile_id: profileId,
    weekday: rule.weekday,
    start_time: `${rule.startTime}:00`,
    end_time: `${rule.endTime}:00`,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('availability_rules').insert(rows);
  if (error) throw error;
};

const ensureWeeklyRulesExist = async (profileId) => {
  const { count, error } = await supabase
    .from('availability_rules')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId);
  if (error) throw error;
  if ((count || 0) > 0) return;
  await insertDefaultWeeklyRules(profileId);
};

const createBookingProfile = async (user) => {
  const timezone = defaultTimeZone();
  const hostName =
    user?.user_metadata?.display_name || user?.email?.split('@')?.[0] || 'Meeting Host';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = buildDefaultSlug(user);
    const { data, error } = await supabase
      .from('booking_profiles')
      .insert({
        user_id: user.id,
        slug,
        host_name: hostName,
        meeting_title: '30 Minute Meeting',
        meeting_description: 'Book a meeting using this public scheduling page.',
        duration_minutes: DEFAULT_DURATION_MINUTES,
        timezone,
        is_active: true,
      })
      .select('*')
      .single();
    if (!error && data) {
      await insertDefaultWeeklyRules(data.id);
      return normalizeProfile(data);
    }
    if (error?.code !== '23505') throw error;
  }
  throw new Error('Could not generate a unique public booking slug.');
};

const sanitizeWeeklyRules = (rules = []) =>
  rules
    .map((rule) => ({
      weekday: Number(rule.weekday),
      enabled: rule.enabled !== false,
      startTime: normalizeTimeString(rule.startTime),
      endTime: normalizeTimeString(rule.endTime),
    }))
    .filter(
      (rule) =>
        rule.enabled &&
        Number.isInteger(rule.weekday) &&
        rule.weekday >= 0 &&
        rule.weekday <= 6 &&
        rule.startTime &&
        rule.endTime &&
        rule.endTime > rule.startTime
    );

export const publicBookingService = {
  async getOrCreateProfile() {
    const user = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('booking_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      await ensureWeeklyRulesExist(data.id);
      return normalizeProfile(data);
    }
    return createBookingProfile(user);
  },

  // Read-only existence check - unlike getOrCreateProfile it never creates a
  // profile, so it can gate "is the meetings calendar configured yet?".
  async hasBookingProfile() {
    const user = await getAuthenticatedUser();
    const { data, error } = await supabase
      .from('booking_profiles')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  },

  async loadWeeklyAvailability(profileId) {
    const { data, error } = await supabase
      .from('availability_rules')
      .select('*')
      .eq('profile_id', profileId)
      .order('weekday', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return clone((data || []).map(normalizeRule));
  },

  async saveWeeklyAvailability(profileId, rules = []) {
    const sanitized = sanitizeWeeklyRules(rules);
    const { error: deleteError } = await supabase
      .from('availability_rules')
      .delete()
      .eq('profile_id', profileId);
    if (deleteError) throw deleteError;

    if (sanitized.length > 0) {
      const payload = sanitized.map((rule) => ({
        profile_id: profileId,
        weekday: rule.weekday,
        start_time: `${rule.startTime}:00`,
        end_time: `${rule.endTime}:00`,
      }));
      const { error: insertError } = await supabase.from('availability_rules').insert(payload);
      if (insertError) throw insertError;
    }

    return this.loadWeeklyAvailability(profileId);
  },

  async loadDateOverrides(profileId) {
    const { data, error } = await supabase
      .from('availability_overrides')
      .select('*')
      .eq('profile_id', profileId)
      .order('override_date', { ascending: true })
      .limit(120);
    if (error) throw error;
    return clone((data || []).map(normalizeOverride));
  },

  async upsertDateOverride(profileId, overrideInput) {
    const overrideDate = String(overrideInput?.overrideDate || '').slice(0, 10);
    const isAvailable = overrideInput?.isAvailable !== false;
    const startTime = normalizeTimeString(overrideInput?.startTime);
    const endTime = normalizeTimeString(overrideInput?.endTime);
    const payload = {
      profile_id: profileId,
      override_date: overrideDate,
      is_available: isAvailable,
      start_time: isAvailable && startTime ? `${startTime}:00` : null,
      end_time: isAvailable && endTime ? `${endTime}:00` : null,
      note: String(overrideInput?.note || '').slice(0, 500),
    };

    const { error } = await supabase
      .from('availability_overrides')
      .upsert(payload, { onConflict: 'profile_id,override_date' });
    if (error) throw error;
    return this.loadDateOverrides(profileId);
  },

  async deleteDateOverride(profileId, overrideDate) {
    const { error } = await supabase
      .from('availability_overrides')
      .delete()
      .eq('profile_id', profileId)
      .eq('override_date', String(overrideDate || '').slice(0, 10));
    if (error) throw error;
    return this.loadDateOverrides(profileId);
  },

  async updateProfile(profileId, updates = {}) {
    const patch = {};
    if (typeof updates.hostName === 'string') patch.host_name = updates.hostName.slice(0, 120);
    if (typeof updates.meetingTitle === 'string')
      patch.meeting_title = updates.meetingTitle.slice(0, 140);
    if (typeof updates.meetingDescription === 'string')
      patch.meeting_description = updates.meetingDescription.slice(0, 2000);
    if (Number.isFinite(Number(updates.durationMinutes)))
      patch.duration_minutes = Math.max(15, Math.min(240, Number(updates.durationMinutes)));
    if (typeof updates.timezone === 'string' && updates.timezone.trim())
      patch.timezone = updates.timezone.trim();
    if (typeof updates.isActive === 'boolean') patch.is_active = updates.isActive;
    if (typeof updates.partnerId === 'string') patch.partner_id = updates.partnerId || null;
    if (updates.publicToken !== undefined) patch.public_token = updates.publicToken || null;
    if (typeof updates.role === 'string') patch.role = updates.role.slice(0, 80);
    if (typeof updates.avatarUrl === 'string') patch.avatar_url = updates.avatarUrl.trim() || null;
    if (Number.isFinite(Number(updates.bufferBeforeMinutes)))
      patch.buffer_before_minutes = Math.max(0, Math.min(120, Number(updates.bufferBeforeMinutes)));
    if (Number.isFinite(Number(updates.bufferAfterMinutes)))
      patch.buffer_after_minutes = Math.max(0, Math.min(120, Number(updates.bufferAfterMinutes)));
    if (Number.isFinite(Number(updates.maxBookingsPerDay)))
      patch.max_bookings_per_day = Math.max(0, Math.min(50, Number(updates.maxBookingsPerDay)));
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('booking_profiles')
      .update(patch)
      .eq('id', profileId)
      .select('*')
      .single();
    if (error) throw error;
    return normalizeProfile(data);
  },

  async loadUpcomingBookings(profileId, { limit = 50 } = {}) {
    const profile = await this.getOrCreateProfile();
    const timezone = profile?.timezone || 'UTC';
    const { data, error } = await supabase
      .from('meeting_bookings')
      .select('*')
      .eq('profile_id', profileId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
    if (error) throw error;
    return clone((data || []).map((row) => normalizeBooking(row, timezone)));
  },

  async loadSettingsBundle() {
    const profile = await this.getOrCreateProfile();
    const [weeklyRules, overrides, upcomingBookings] = await Promise.all([
      this.loadWeeklyAvailability(profile.id),
      this.loadDateOverrides(profile.id),
      this.loadUpcomingBookings(profile.id, { limit: 80 }),
    ]);
    return {
      profile,
      weeklyRules,
      overrides,
      upcomingBookings,
    };
  },

  getPublicBookingUrl(slug, origin) {
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
    return base && slug ? `${base}/book/${slug}` : '';
  },

  /** Secure scheduling URL when public token is set; prefer over slug link. */
  getScheduleUrl(profile, origin) {
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
    const token = profile?.publicToken || profile?.public_token;
    return base && token ? `${base}/schedule/${encodeURIComponent(token)}` : '';
  },

  /** Generate a secure public token for /schedule/{token}. */
  async generatePublicToken(profileId) {
    ensureSupabase();
    const token =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    return this.updateProfile(profileId, { publicToken: token });
  },

  /** Revoke the public scheduling link (removes token). */
  async revokePublicToken(profileId) {
    ensureSupabase();
    return this.updateProfile(profileId, { publicToken: null });
  },
};

export default publicBookingService;
