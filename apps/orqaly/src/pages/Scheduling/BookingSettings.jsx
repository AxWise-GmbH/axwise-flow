import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PageLayout from '../../components/Common/PageLayout';
import BentoCard from '../../components/Common/BentoCard';
import publicBookingService from '../../services/publicBookingService';
import { hasSupabase } from '../../lib/supabase';
import { WEEKDAY_NAMES, getTodayDateKey } from '../../services/availabilityService';
import { useNavigate } from 'react-router-dom';

import AppIcon from '../../components/icons/AppIcon';

const TIMEZONE_OPTIONS = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Kiev',
  'Europe/Warsaw',
  'Asia/Dubai',
  'Asia/Tbilisi',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
];

const DEFAULT_DURATION_MINUTES = 30;
const DEFAULT_DAY_START = '09:00';
const DEFAULT_DAY_END = '17:00';

const buildWeeklyDraft = (rules = []) => {
  const byDay = new Map();
  rules.forEach((rule) => {
    if (typeof rule?.weekday !== 'number') return;
    if (!byDay.has(rule.weekday)) byDay.set(rule.weekday, rule);
  });
  return Array.from({ length: 7 }, (_, weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      enabled: !!row,
      startTime: row?.startTime || DEFAULT_DAY_START,
      endTime: row?.endTime || DEFAULT_DAY_END,
    };
  });
};

export default function BookingSettings() {
  const navigate = useNavigate();
  const supabaseEnabled = hasSupabase();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [profile, setProfile] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState(buildWeeklyDraft([]));
  const [overrides, setOverrides] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [overrideForm, setOverrideForm] = useState(() => ({
    overrideDate: getTodayDateKey(),
    isAvailable: true,
    startTime: DEFAULT_DAY_START,
    endTime: DEFAULT_DAY_END,
    note: '',
  }));

  const loadBundle = useCallback(async () => {
    if (!supabaseEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const bundle = await publicBookingService.loadSettingsBundle();
      setProfile(bundle.profile);
      setWeeklyDraft(buildWeeklyDraft(bundle.weeklyRules));
      setOverrides(bundle.overrides);
      setBookings(bundle.upcomingBookings);
    } catch (err) {
      setError(err?.message || 'Failed to load booking settings.');
    } finally {
      setLoading(false);
    }
  }, [supabaseEnabled]);

  useEffect(() => {
    loadBundle();
  }, [loadBundle]);

  const publicLink = useMemo(
    () => publicBookingService.getPublicBookingUrl(profile?.slug),
    [profile?.slug]
  );
  const scheduleLink = useMemo(
    () => publicBookingService.getScheduleUrl(profile),
    [profile?.publicToken]
  );
  const displayLink = scheduleLink || publicLink;

  const handleCopyLink = useCallback(async () => {
    const link = displayLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage(scheduleLink ? 'Schedule link copied.' : 'Public booking link copied.');
    } catch {
      setError('Could not copy link. Please copy it manually.');
    }
  }, [displayLink, scheduleLink]);

  const handleOpenPublicLink = useCallback(() => {
    if (!displayLink) return;
    window.open(displayLink, '_blank', 'noopener,noreferrer');
  }, [displayLink]);

  const handleGenerateLink = useCallback(async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await publicBookingService.generatePublicToken(profile.id);
      setProfile(updated);
      setMessage('Secure schedule link generated. Use the link below.');
    } catch (err) {
      setError(err?.message || 'Failed to generate link.');
    } finally {
      setSaving(false);
    }
  }, [profile?.id]);

  const handleRevokeLink = useCallback(async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await publicBookingService.revokePublicToken(profile.id);
      setProfile(updated);
      setMessage('Schedule link revoked. Bookings via /book/{slug} still work.');
    } catch (err) {
      setError(err?.message || 'Failed to revoke link.');
    } finally {
      setSaving(false);
    }
  }, [profile?.id]);

  const handleProfilePatch = (patch) => {
    setProfile((prev) => ({ ...(prev || {}), ...patch }));
  };

  const handleSaveProfile = useCallback(async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const updated = await publicBookingService.updateProfile(profile.id, {
        hostName: profile.hostName || '',
        meetingTitle: profile.meetingTitle || '',
        meetingDescription: profile.meetingDescription || '',
        durationMinutes: profile.durationMinutes,
        timezone: profile.timezone || 'UTC',
        isActive: profile.isActive !== false,
        partnerId: profile.partnerId || '',
        role: profile.role ?? '',
        avatarUrl: profile.avatarUrl ?? '',
        bufferBeforeMinutes: profile.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: profile.bufferAfterMinutes ?? 0,
        maxBookingsPerDay: profile.maxBookingsPerDay ?? 0,
      });
      setProfile(updated);
      setMessage('Booking profile saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save booking profile.');
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const handleSaveWeekly = useCallback(async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const rules = weeklyDraft.map((row) => ({
        weekday: row.weekday,
        enabled: row.enabled,
        startTime: row.startTime,
        endTime: row.endTime,
      }));
      const savedRules = await publicBookingService.saveWeeklyAvailability(profile.id, rules);
      setWeeklyDraft(buildWeeklyDraft(savedRules));
      setMessage('Weekly availability saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save weekly availability.');
    } finally {
      setSaving(false);
    }
  }, [profile?.id, weeklyDraft]);

  const handleUpsertOverride = useCallback(async () => {
    if (!profile?.id) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await publicBookingService.upsertDateOverride(profile.id, overrideForm);
      setOverrides(next);
      setMessage('Date override saved.');
    } catch (err) {
      setError(err?.message || 'Failed to save date override.');
    } finally {
      setSaving(false);
    }
  }, [overrideForm, profile?.id]);

  const handleDeleteOverride = useCallback(
    async (overrideDate) => {
      if (!profile?.id) return;
      setSaving(true);
      setError('');
      setMessage('');
      try {
        const next = await publicBookingService.deleteDateOverride(profile.id, overrideDate);
        setOverrides(next);
        setMessage('Date override removed.');
      } catch (err) {
        setError(err?.message || 'Failed to remove date override.');
      } finally {
        setSaving(false);
      }
    },
    [profile?.id]
  );

  const openDays = weeklyDraft.filter((row) => row.enabled).length;

  return (
    <PageLayout
      title="Booking Settings"
      subtitle="Create and manage your public scheduling link."
      action={
        <Button
          variant="outlined"
          size="small"
          startIcon={<AppIcon name="ArrowBack" fallback={ArrowBackIcon} sx={{ fontSize: 16 }} />}
          onClick={() => navigate('/settings')}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        >
          Back to Settings
        </Button>
      }
    >
      {!supabaseEnabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Supabase is not configured. Add your Supabase environment variables to enable public
          scheduling.
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {message && (
        <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 2,
        }}
      >
        <BentoCard
          title="Public Link"
          subtitle={`Open days: ${openDays} · Duration: ${profile?.durationMinutes || 30} min`}
          icon={EventAvailableOutlinedIcon}
        >
          <Stack spacing={1.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={profile?.isActive !== false}
                  onChange={(e) => handleProfilePatch({ isActive: e.target.checked })}
                />
              }
              label="Public booking link is active"
            />
            <TextField
              label="Host name"
              value={profile?.hostName || ''}
              size="small"
              onChange={(e) => handleProfilePatch({ hostName: e.target.value })}
            />
            <TextField
              label="Meeting title"
              value={profile?.meetingTitle || ''}
              size="small"
              onChange={(e) => handleProfilePatch({ meetingTitle: e.target.value })}
            />
            <TextField
              label="Meeting description"
              value={profile?.meetingDescription || ''}
              size="small"
              multiline
              minRows={2}
              onChange={(e) => handleProfilePatch({ meetingDescription: e.target.value })}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                label="Duration (min)"
                select
                size="small"
                value={profile?.durationMinutes || DEFAULT_DURATION_MINUTES}
                onChange={(e) => handleProfilePatch({ durationMinutes: Number(e.target.value) })}
                sx={{ flex: 1 }}
              >
                {[15, 30, 45, 60, 90].map((minutes) => (
                  <MenuItem key={minutes} value={minutes}>
                    {minutes}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Timezone"
                select
                size="small"
                value={profile?.timezone || 'UTC'}
                onChange={(e) => handleProfilePatch({ timezone: e.target.value })}
                sx={{ flex: 2 }}
              >
                {TIMEZONE_OPTIONS.map((zone) => (
                  <MenuItem key={zone} value={zone}>
                    {zone}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Partner ID for internal meeting sync (optional)"
              size="small"
              value={profile?.partnerId || ''}
              onChange={(e) => handleProfilePatch({ partnerId: e.target.value })}
              placeholder="Example: P-001"
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
              Persona (public page)
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                label="Role"
                size="small"
                value={profile?.role || ''}
                onChange={(e) => handleProfilePatch({ role: e.target.value })}
                placeholder="e.g. Sales, Support"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Avatar URL"
                size="small"
                value={profile?.avatarUrl || ''}
                onChange={(e) => handleProfilePatch({ avatarUrl: e.target.value })}
                placeholder="https://..."
                sx={{ flex: 1 }}
              />
            </Stack>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
              Buffers & limits
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                label="Buffer before (min)"
                size="small"
                type="number"
                inputProps={{ min: 0, max: 120 }}
                value={profile?.bufferBeforeMinutes ?? 0}
                onChange={(e) =>
                  handleProfilePatch({ bufferBeforeMinutes: Number(e.target.value) || 0 })
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="Buffer after (min)"
                size="small"
                type="number"
                inputProps={{ min: 0, max: 120 }}
                value={profile?.bufferAfterMinutes ?? 0}
                onChange={(e) =>
                  handleProfilePatch({ bufferAfterMinutes: Number(e.target.value) || 0 })
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label="Max bookings/day (0 = no limit)"
                size="small"
                type="number"
                inputProps={{ min: 0, max: 50 }}
                value={profile?.maxBookingsPerDay ?? 0}
                onChange={(e) =>
                  handleProfilePatch({ maxBookingsPerDay: Number(e.target.value) || 0 })
                }
                sx={{ flex: 1 }}
              />
            </Stack>

            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              Schedule link
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                size="small"
                onClick={handleGenerateLink}
                disabled={!profile?.id || saving || !supabaseEnabled || !!profile?.publicToken}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Generate secure link
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={handleRevokeLink}
                disabled={!profile?.id || saving || !profile?.publicToken}
                sx={{ textTransform: 'none', fontWeight: 600 }}
              >
                Revoke link
              </Button>
            </Stack>
            <TextField
              label={scheduleLink ? 'Public scheduling URL' : 'Public booking URL'}
              size="small"
              value={displayLink}
              InputProps={{ readOnly: true }}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AppIcon name="ContentCopy" fallback={ContentCopyIcon} sx={{ fontSize: 16 }} />
                }
                onClick={handleCopyLink}
                sx={{ textTransform: 'none', fontWeight: 600 }}
                disabled={!displayLink}
              >
                Copy link
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />
                }
                onClick={handleOpenPublicLink}
                sx={{ textTransform: 'none', fontWeight: 600 }}
                disabled={!displayLink}
              >
                Open public page
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveProfile}
                disabled={!profile || saving || !supabaseEnabled}
                sx={{ textTransform: 'none', fontWeight: 700, ml: 'auto' }}
              >
                Save profile
              </Button>
            </Stack>
          </Stack>
        </BentoCard>

        <BentoCard
          title="Weekly Availability"
          subtitle="Set your visible recurring weekly slots."
          icon={ScheduleOutlinedIcon}
        >
          <Stack spacing={1}>
            {weeklyDraft.map((row) => (
              <Box
                key={row.weekday}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1.2fr 0.6fr 0.6fr' },
                  gap: 1,
                  alignItems: 'center',
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={row.enabled}
                      onChange={(e) =>
                        setWeeklyDraft((prev) =>
                          prev.map((item) =>
                            item.weekday === row.weekday
                              ? { ...item, enabled: e.target.checked }
                              : item
                          )
                        )
                      }
                      size="small"
                    />
                  }
                  label={WEEKDAY_NAMES[row.weekday]}
                />
                <TextField
                  label="Start"
                  type="time"
                  size="small"
                  value={row.startTime}
                  onChange={(e) =>
                    setWeeklyDraft((prev) =>
                      prev.map((item) =>
                        item.weekday === row.weekday ? { ...item, startTime: e.target.value } : item
                      )
                    )
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={!row.enabled}
                />
                <TextField
                  label="End"
                  type="time"
                  size="small"
                  value={row.endTime}
                  onChange={(e) =>
                    setWeeklyDraft((prev) =>
                      prev.map((item) =>
                        item.weekday === row.weekday ? { ...item, endTime: e.target.value } : item
                      )
                    )
                  }
                  InputLabelProps={{ shrink: true }}
                  disabled={!row.enabled}
                />
              </Box>
            ))}
            <Button
              variant="contained"
              size="small"
              onClick={handleSaveWeekly}
              disabled={!profile || saving || !supabaseEnabled}
              sx={{ textTransform: 'none', fontWeight: 700, alignSelf: 'flex-end', mt: 1 }}
            >
              Save weekly slots
            </Button>
          </Stack>
        </BentoCard>

        <BentoCard
          title="Date Overrides"
          subtitle="Create custom day rules or block specific dates."
          icon={CalendarMonthOutlinedIcon}
          sx={{ gridColumn: { xs: 'auto', md: '1 / span 2' } }}
        >
          <Stack spacing={1.5}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 0.8fr 0.8fr 1.2fr auto' },
                gap: 1,
                alignItems: 'center',
              }}
            >
              <TextField
                label="Date"
                type="date"
                size="small"
                value={overrideForm.overrideDate}
                onChange={(e) =>
                  setOverrideForm((prev) => ({ ...prev, overrideDate: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Mode"
                select
                size="small"
                value={overrideForm.isAvailable ? 'open' : 'blocked'}
                onChange={(e) =>
                  setOverrideForm((prev) => ({
                    ...prev,
                    isAvailable: e.target.value === 'open',
                  }))
                }
              >
                <MenuItem value="open">Open (custom window)</MenuItem>
                <MenuItem value="blocked">Blocked day</MenuItem>
              </TextField>
              <TextField
                label="Start"
                type="time"
                size="small"
                value={overrideForm.startTime}
                onChange={(e) =>
                  setOverrideForm((prev) => ({ ...prev, startTime: e.target.value }))
                }
                InputLabelProps={{ shrink: true }}
                disabled={!overrideForm.isAvailable}
              />
              <TextField
                label="End"
                type="time"
                size="small"
                value={overrideForm.endTime}
                onChange={(e) => setOverrideForm((prev) => ({ ...prev, endTime: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                disabled={!overrideForm.isAvailable}
              />
              <Button
                variant="contained"
                onClick={handleUpsertOverride}
                disabled={!profile || saving || !supabaseEnabled || !overrideForm.overrideDate}
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Save
              </Button>
            </Box>
            <TextField
              label="Override note (optional)"
              size="small"
              value={overrideForm.note}
              onChange={(e) => setOverrideForm((prev) => ({ ...prev, note: e.target.value }))}
            />

            <Divider />
            {overrides.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No date overrides yet.
              </Typography>
            ) : (
              <Stack spacing={0.8}>
                {overrides.map((override) => (
                  <Box
                    key={`${override.overrideDate}-${override.id}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      px: 1.25,
                      py: 0.9,
                    }}
                  >
                    <Chip
                      size="small"
                      label={override.overrideDate}
                      color="default"
                      variant="outlined"
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {override.isAvailable
                        ? `${override.startTime || '--'} - ${override.endTime || '--'}`
                        : 'Blocked all day'}
                    </Typography>
                    {override.note ? (
                      <Typography variant="caption" color="text.secondary">
                        {override.note}
                      </Typography>
                    ) : null}
                    <Tooltip title="Delete override">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteOverride(override.overrideDate)}
                        sx={{ ml: 'auto' }}
                      >
                        <AppIcon
                          name="DeleteOutline"
                          fallback={DeleteOutlineIcon}
                          sx={{ fontSize: 18 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </BentoCard>

        <BentoCard
          title="Upcoming Bookings"
          subtitle={`${bookings.length} confirmed`}
          icon={EventAvailableOutlinedIcon}
          sx={{ gridColumn: { xs: 'auto', md: '1 / span 2' } }}
        >
          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Loading bookings...
            </Typography>
          ) : bookings.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No bookings yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Guest</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>{booking.dateLabel}</TableCell>
                    <TableCell>{booking.timeLabel}</TableCell>
                    <TableCell>{booking.guestName || '-'}</TableCell>
                    <TableCell>{booking.guestEmail || '-'}</TableCell>
                    <TableCell>{booking.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </BentoCard>
      </Box>
    </PageLayout>
  );
}
