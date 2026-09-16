import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
  alpha,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PublicIcon from '@mui/icons-material/Public';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

import AppIcon from '../../components/icons/AppIcon';

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push({ kind: 'empty', key: `empty-${i}` });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      kind: 'day',
      key: `${year}-${month + 1}-${day}`,
      day,
      dateKey: toDateKey(date),
    });
  }
  while (cells.length % 7 !== 0) cells.push({ kind: 'empty', key: `tail-${cells.length}` });
  return cells;
};

const todayKey = () => toDateKey(new Date());

/** If the slug looks like a mangled full URL (e.g. httpsorchestratorivercelappbookmister-nq), extract the part after "book". */
function normalizeBookingSlug(raw = '') {
  const s = String(raw).trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.includes('book')) {
    const after = s.split(/book/i).pop() || '';
    const cleaned = after.replace(/^[-_]+/, '').trim();
    if (cleaned.length > 0 && cleaned.length <= 80) return cleaned;
  }
  return s;
}

export default function PublicBookingPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isDark = theme.palette.mode === 'dark';
  const params = useParams();
  const rawSlug = params.slug || '';
  const slug = normalizeBookingSlug(rawSlug);
  const token = params.token || '';
  const identifier = slug || token;
  const isToken = !!token;

  // If slug was mangled (full URL pasted), replace URL with clean /book/{slug}
  useEffect(() => {
    if (slug && rawSlug && slug !== rawSlug && !params.token) {
      navigate(`/book/${slug}`, { replace: true });
    }
  }, [slug, rawSlug, navigate, params.token]);

  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [slots, setSlots] = useState([]);
  const [booked, setBooked] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [successAnimationVariant, setSuccessAnimationVariant] = useState(1);

  const monthCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

  const loadAvailability = useCallback(async () => {
    if (!identifier) return;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ date: selectedDate });
      if (isToken) query.set('token', token);
      else query.set('slug', slug);
      const response = await fetch(`/api/public-availability?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not load scheduling availability.');
      }
      setProfile(payload.profile || null);
      setSlots(Array.isArray(payload.slots) ? payload.slots : []);
      setBooked(Array.isArray(payload.booked) ? payload.booked : []);
      setSelectedSlot((prev) =>
        prev && payload.slots?.some((slot) => slot.startAt === prev.startAt) ? prev : null
      );
    } catch (err) {
      setError(err?.message || 'Could not load scheduling availability.');
      setSlots([]);
      setBooked([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, identifier, isToken, slug, token]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const handleBook = useCallback(async () => {
    if (!selectedSlot) {
      setError('Please select an available time slot first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        startAt: selectedSlot.startAt,
        guestName,
        guestEmail,
        guestNotes,
      };
      if (isToken) body.token = token;
      else body.slug = slug;
      const response = await fetch('/api/public-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Booking failed. Please try another time.');
      }
      setConfirmedBooking(payload.booking || null);
      setGuestName('');
      setGuestEmail('');
      setGuestNotes('');
      setSelectedSlot(null);
      await loadAvailability();
    } catch (err) {
      setError(err?.message || 'Booking failed.');
    } finally {
      setSubmitting(false);
    }
  }, [guestEmail, guestName, guestNotes, loadAvailability, selectedSlot, slug, token, isToken]);

  if (!identifier) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 400 }}>
          Invalid scheduling link.
        </Alert>
      </Box>
    );
  }

  const cardSx = {
    borderRadius: 3,
    p: { xs: 2, sm: 2.5 },
    boxShadow: isDark
      ? '0 4px 24px rgba(0,0,0,0.25), 0 0 1px rgba(255,255,255,0.08)'
      : '0 4px 24px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.06)',
    border: '1px solid',
    borderColor: isDark ? alpha(theme.palette.common.white, 0.08) : 'divider',
    bgcolor: isDark ? alpha(theme.palette.background.paper, 0.6) : 'background.paper',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: isDark
          ? alpha(theme.palette.primary.dark, 0.12)
          : alpha(theme.palette.primary.main, 0.04),
        py: { xs: 2, md: 4 },
        px: { xs: 1.5, sm: 2 },
      }}
    >
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        {confirmedBooking && (
          <Box
            className="booking-success-overlay"
            onClick={() => setConfirmedBooking(null)}
            sx={{
              position: 'fixed',
              inset: 0,
              zIndex: 1300,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              px: 2,
              py: 3,
              overflow: 'auto',
              // Background by variant
              ...(successAnimationVariant === 1 && {
                bgcolor: alpha(theme.palette.common.black, 0.72),
                '@keyframes successPulse': {
                  '0%, 100%': { opacity: 0.4 },
                  '50%': { opacity: 0.7 },
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 50% 50%, ${alpha(theme.palette.success.main, 0.35)} 0%, transparent 60%)`,
                  animation: 'successPulse 2.5s ease-in-out infinite',
                  pointerEvents: 'none',
                },
              }),
              ...(successAnimationVariant === 2 && {
                bgcolor: alpha(theme.palette.primary.dark, 0.5),
                '@keyframes float': {
                  '0%, 100%': { transform: 'translateY(0) rotate(0deg)', opacity: 0.6 },
                  '50%': { transform: 'translateY(-12px) rotate(5deg)', opacity: 1 },
                },
                '& .success-dot': {
                  position: 'absolute',
                  borderRadius: '50%',
                  bgcolor: alpha(theme.palette.success.main, 0.6),
                  animation: 'float 3s ease-in-out infinite',
                  pointerEvents: 'none',
                },
              }),
              ...(successAnimationVariant === 3 && {
                bgcolor: alpha(theme.palette.common.black, 0.4),
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }),
            }}
          >
            {/* Option 2: floating dots */}
            {successAnimationVariant === 2 && (
              <>
                {[...Array(12)].map((_, i) => (
                  <Box
                    key={i}
                    className="success-dot"
                    sx={{
                      width: 6 + (i % 3) * 4,
                      height: 6 + (i % 3) * 4,
                      left: `${10 + ((i * 7) % 80)}%`,
                      top: `${5 + ((i * 11) % 90)}%`,
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </>
            )}

            <Paper
              elevation={successAnimationVariant === 3 ? 0 : 8}
              onClick={(e) => e.stopPropagation()}
              sx={{
                position: 'relative',
                borderRadius: 3,
                p: { xs: 2.5, sm: 3 },
                maxWidth: 400,
                width: '100%',
                textAlign: 'center',
                border: '1px solid',
                borderColor: alpha(theme.palette.success.main, 0.4),
                bgcolor: theme.palette.background.paper,
                boxShadow: isDark ? '0 24px 48px rgba(0,0,0,0.4)' : '0 24px 48px rgba(0,0,0,0.12)',
                // Popup animation by variant
                ...(successAnimationVariant === 1 && {
                  animation: 'successScaleIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  '@keyframes successScaleIn': {
                    '0%': { opacity: 0, transform: 'scale(0.85)' },
                    '100%': { opacity: 1, transform: 'scale(1)' },
                  },
                }),
                ...(successAnimationVariant === 2 && {
                  animation: 'successSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  '@keyframes successSlideUp': {
                    '0%': { opacity: 0, transform: 'translateY(24px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }),
                ...(successAnimationVariant === 3 && {
                  animation: 'successSlideUp 0.4s ease-out',
                  '@keyframes successSlideUp': {
                    '0%': { opacity: 0, transform: 'translateY(20px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }),
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                  color: 'success.contrastText',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5,
                  ...(successAnimationVariant === 1 && {
                    animation: 'checkPop 0.6s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                    '@keyframes checkPop': {
                      '0%': { transform: 'scale(0)', opacity: 0 },
                      '70%': { transform: 'scale(1.15)' },
                      '100%': { transform: 'scale(1)', opacity: 1 },
                    },
                  }),
                  ...(successAnimationVariant === 2 && {
                    animation: 'checkBounce 0.7s 0.25s ease both',
                    '@keyframes checkBounce': {
                      '0%': { transform: 'scale(0)', opacity: 0 },
                      '50%': { transform: 'scale(1.2)' },
                      '70%': { transform: 'scale(0.95)' },
                      '100%': { transform: 'scale(1)', opacity: 1 },
                    },
                  }),
                  ...(successAnimationVariant === 3 && {
                    animation: 'checkFade 0.5s 0.15s ease both',
                    '@keyframes checkFade': {
                      '0%': { opacity: 0, transform: 'scale(0.9)' },
                      '100%': { opacity: 1, transform: 'scale(1)' },
                    },
                  }),
                }}
              >
                <AppIcon
                  name="CheckCircleRounded"
                  fallback={CheckCircleRoundedIcon}
                  sx={{ fontSize: 36 }}
                />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.dark', mb: 0.5 }}>
                You're all set
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                Confirmed for{' '}
                {new Date(confirmedBooking.startsAt).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Typography>
              <Button
                variant="contained"
                size="medium"
                onClick={() => setConfirmedBooking(null)}
                sx={{
                  mt: 2,
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  px: 3,
                }}
              >
                Done
              </Button>
            </Paper>

            {/* Style selector */}
            <Typography
              variant="caption"
              sx={{ mt: 2, mb: 1, color: 'text.secondary', fontWeight: 600 }}
            >
              Choose confirmation style
            </Typography>
            <ToggleButtonGroup
              value={successAnimationVariant}
              exclusive
              onChange={(_, v) => v != null && setSuccessAnimationVariant(v)}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.background.paper, 0.9),
                borderRadius: 2,
                '& .MuiToggleButton-root': {
                  px: 2,
                  py: 1,
                  textTransform: 'none',
                  fontWeight: 600,
                  border: '1px solid',
                  borderColor: 'divider',
                  '&.Mui-selected': {
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                  },
                },
              }}
            >
              <ToggleButton value={1} aria-label="Option 1">
                Option 1
              </ToggleButton>
              <ToggleButton value={2} aria-label="Option 2">
                Option 2
              </ToggleButton>
              <ToggleButton value={3} aria-label="Option 3">
                Option 3
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '340px 1fr 340px' },
            gap: { xs: 2, md: 3 },
            alignItems: 'start',
          }}
        >
          {/* Left: Host & meeting info */}
          <Paper elevation={0} sx={cardSx}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                {profile?.avatarUrl ? (
                  <Box
                    component="img"
                    src={profile.avatarUrl}
                    alt=""
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid',
                      borderColor: 'divider',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.5rem',
                    }}
                  >
                    {(profile?.hostName || 'M').charAt(0).toUpperCase()}
                  </Box>
                )}
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                    {profile?.hostName || 'Meeting Host'}
                  </Typography>
                  {profile?.role && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                      {profile.role}
                    </Typography>
                  )}
                </Box>
              </Stack>
              <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {profile?.meetingTitle || 'Meeting'}
              </Typography>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AppIcon
                    name="AccessTime"
                    fallback={AccessTimeIcon}
                    sx={{ fontSize: 20, color: 'text.secondary' }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {profile?.durationMinutes || 30} min
                  </Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <AppIcon
                    name="Public"
                    fallback={PublicIcon}
                    sx={{ fontSize: 20, color: 'text.secondary' }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {profile?.timezone || 'UTC'}
                  </Typography>
                </Stack>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {profile?.meetingDescription || 'Pick a date and time that works for you.'}
              </Typography>
            </Stack>
          </Paper>

          {/* Center: Calendar & time slots */}
          <Paper elevation={0} sx={cardSx}>
            <Stack spacing={2.5}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <AppIcon
                  name="CalendarMonth"
                  fallback={CalendarMonthIcon}
                  sx={{ fontSize: 22, color: 'primary.main' }}
                />
                Select date & time
              </Typography>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <IconButton
                  size="small"
                  onClick={() =>
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                  }}
                >
                  <AppIcon name="ChevronLeft" fallback={ChevronLeftIcon} />
                </IconButton>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() =>
                    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                  sx={{
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
                  }}
                >
                  <AppIcon name="ChevronRight" fallback={ChevronRightIcon} />
                </IconButton>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                  <Typography
                    key={label}
                    variant="caption"
                    sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 600, py: 0.5 }}
                  >
                    {label}
                  </Typography>
                ))}
                {monthCells.map((cell) =>
                  cell.kind === 'empty' ? (
                    <Box key={cell.key} sx={{ height: 40 }} />
                  ) : (
                    <Button
                      key={cell.key}
                      size="small"
                      variant={selectedDate === cell.dateKey ? 'contained' : 'text'}
                      onClick={() => {
                        setSelectedDate(cell.dateKey);
                        setConfirmedBooking(null);
                      }}
                      disabled={cell.dateKey < todayKey()}
                      sx={{
                        minWidth: 0,
                        minHeight: 40,
                        borderRadius: 2,
                        fontWeight: 600,
                        fontSize: '0.875rem',
                      }}
                    >
                      {cell.day}
                    </Button>
                  )
                )}
              </Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, pt: 0.5 }}>
                Available times
              </Typography>
              {loading ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        width: 72,
                        height: 40,
                        borderRadius: 2,
                        bgcolor: alpha(theme.palette.action.disabled, 0.12),
                        animation: 'pulse 1.5s ease-in-out infinite',
                        '@keyframes pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.5 },
                        },
                      }}
                    />
                  ))}
                </Box>
              ) : slots.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No slots available for this date.
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {slots.map((slot) => (
                    <Button
                      key={slot.startAt}
                      variant={selectedSlot?.startAt === slot.startAt ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setConfirmedBooking(null);
                      }}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 2,
                        minWidth: 72,
                      }}
                    >
                      {slot.label}
                    </Button>
                  ))}
                </Box>
              )}
            </Stack>
          </Paper>

          {/* Right: Guest form */}
          <Paper elevation={0} sx={cardSx}>
            <Stack spacing={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Your details
              </Typography>
              {selectedSlot ? (
                <Typography variant="body2" color="text.secondary">
                  {new Date(selectedSlot.startAt).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Select a date and time first.
                </Typography>
              )}
              <TextField
                label="Name"
                size="small"
                fullWidth
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                InputProps={{ sx: { borderRadius: 2 } }}
              />
              <TextField
                label="Email"
                size="small"
                type="email"
                fullWidth
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                InputProps={{ sx: { borderRadius: 2 } }}
              />
              <TextField
                label="Notes (optional)"
                size="small"
                multiline
                minRows={2}
                fullWidth
                value={guestNotes}
                onChange={(e) => setGuestNotes(e.target.value)}
                InputProps={{ sx: { borderRadius: 2 } }}
              />
              <Button
                variant="contained"
                size="large"
                onClick={handleBook}
                disabled={submitting || !selectedSlot || !guestName.trim() || !guestEmail.trim()}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  py: 1.25,
                  borderRadius: 2,
                  boxShadow: 0,
                  '&:hover': { boxShadow: 1 },
                }}
              >
                {submitting ? 'Confirming…' : 'Confirm booking'}
              </Button>
              {booked.length > 0 && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Already booked this day
                  </Typography>
                  <Stack spacing={0.5}>
                    {booked.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          py: 1,
                          px: 1.5,
                          borderRadius: 2,
                          bgcolor: alpha(theme.palette.action.disabled, 0.06),
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.startLabel} – {item.endLabel}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          </Paper>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mt: 3, borderRadius: 2 }}>
            {error === 'Scheduling link not found.' ? (
              <>
                <Typography component="span" variant="body2">
                  This booking link isn&apos;t set up or the slug doesn&apos;t match. If you&apos;re
                  the host, sign in and go to{' '}
                  <Box
                    component="a"
                    href="/"
                    sx={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    the app
                  </Box>
                  , then Settings → Booking Settings to create your profile and use that slug in
                  your link (e.g. /book/your-slug).
                </Typography>
              </>
            ) : (
              error
            )}
          </Alert>
        )}
      </Box>
    </Box>
  );
}
