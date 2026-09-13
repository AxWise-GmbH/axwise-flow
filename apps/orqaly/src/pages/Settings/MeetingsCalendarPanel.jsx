import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  alpha,
  useTheme,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
  Button,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EventNoteIcon from '@mui/icons-material/EventNote';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import FormDialog from '../../components/Common/FormDialog';
import { meetingService, MEETING_CHANNELS } from '../../services/meetingService';
import { usePartners } from '../../hooks/usePartners';

import AppIcon from '../../components/icons/AppIcon';

const toDateKey = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildMonthGrid = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ kind: 'empty', key: `e-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({
      kind: 'day',
      key: toDateKey(date.toISOString()),
      day,
      date,
      dateKey: toDateKey(date.toISOString()),
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ kind: 'empty', key: `e-tail-${cells.length}` });
  }
  return cells;
};

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/** Table view: dd/mm/yy - hh:mm (24h) */
function formatDateTimeTable(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} - ${h}:${min}`;
}

/**
 * The Meetings calendar (Calendar/Table views, Book form, footer counters,
 * Clear-all). Rendered inline on the Settings page and inside BlockMeetingDialog.
 * `embedded` trims the outer horizontal padding and shows a small subtitle so it
 * sits cleanly inside a card; the dialog passes embedded={false}.
 */
export default function MeetingsCalendarPanel({ embedded = false }) {
  const theme = useTheme();
  const { partners } = usePartners();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewTab, setViewTab] = useState(0); // 0 Calendar, 1 Table
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [dayDetailOpen, setDayDetailOpen] = useState(false);
  const [bookFormOpen, setBookFormOpen] = useState(false);
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearSubmitting, setClearSubmitting] = useState(false);
  const [bookForm, setBookForm] = useState({
    date: '',
    time: '09:00',
    title: '',
    type: 'outside',
    partnerId: '',
    channel: 'Other',
  });

  const refreshMeetings = () => {
    setLoading(true);
    meetingService
      .getAll()
      .then((list) => setMeetings(list || []))
      .catch(() => setMeetings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshMeetings();
  }, []);

  const openBookForm = () => {
    const d = new Date();
    const date = d.toISOString().slice(0, 10);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setBookForm({ date, time, title: '', type: 'outside', partnerId: '', channel: 'Other' });
    setBookFormOpen(true);
  };

  const handleBookSubmit = async () => {
    const { date, time, title, type, partnerId, channel } = bookForm;
    if (!date || !time) return;
    const [h, m] = time.split(':').map(Number);
    const datetime = new Date(date);
    datetime.setHours(h, m, 0, 0);
    setBookSubmitting(true);
    try {
      await meetingService.createPlanned({
        datetime: datetime.toISOString(),
        partnerId: type === 'partner' ? partnerId || null : null,
        title: title || undefined,
        channel: channel || 'Other',
      });
      refreshMeetings();
      setBookFormOpen(false);
    } catch {
      // booking submit failed - UI already shows no confirmation
    } finally {
      setBookSubmitting(false);
    }
  };

  const handleClearAll = async () => {
    setClearSubmitting(true);
    try {
      await meetingService.clearAll();
      refreshMeetings();
      setClearConfirmOpen(false);
    } catch {
      // clear-all failed - UI already shows no confirmation
    } finally {
      setClearSubmitting(false);
    }
  };

  const partnerMap = useMemo(() => {
    const m = new Map();
    (partners || []).forEach((p) => m.set(p.id, p.name || p.id));
    return m;
  }, [partners]);

  const isPublicMeeting = (m) =>
    m?.channel === 'Public Booking Link' || m?.source === 'public_booking';

  const { partnerMeetings, publicMeetings, otherMeetings, allSorted } = useMemo(() => {
    const list = Array.isArray(meetings) ? meetings : [];
    const withPartner = list.filter((m) => m.partnerId);
    const publicOnly = list.filter((m) => isPublicMeeting(m));
    const other = list.filter((m) => !m.partnerId && !isPublicMeeting(m));
    const sorted = [...list].sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    return {
      partnerMeetings: withPartner,
      publicMeetings: publicOnly,
      otherMeetings: other,
      allSorted: sorted,
    };
  }, [meetings]);

  const meetingsByDay = useMemo(() => {
    const map = new Map();
    allSorted.forEach((m) => {
      const key = toDateKey(m.datetime);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return map;
  }, [allSorted]);

  const calendarCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);
  const selectedDayMeetings = useMemo(
    () => meetingsByDay.get(selectedDateKey) || [],
    [meetingsByDay, selectedDateKey]
  );

  const handleDayClick = (dateKey) => {
    setSelectedDateKey(dateKey);
    setDayDetailOpen(true);
  };

  const gutter = embedded ? 0 : 2;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
          px: gutter,
          pb: 1,
        }}
      >
        {embedded ? (
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            For partners and clients
          </Typography>
        ) : (
          <Box />
        )}
        <Button
          variant="contained"
          size="small"
          startIcon={
            <AppIcon name="EventAvailable" fallback={EventAvailableIcon} sx={{ fontSize: 18 }} />
          }
          onClick={openBookForm}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            boxShadow: 'none',
            ml: 'auto',
          }}
        >
          Book
        </Button>
      </Box>

      <Tabs
        value={viewTab}
        onChange={(_, v) => setViewTab(v)}
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          px: gutter,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab
          icon={<AppIcon name="CalendarMonth" fallback={CalendarMonthIcon} sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label="Calendar"
        />
        <Tab
          icon={<AppIcon name="TableRows" fallback={TableRowsIcon} sx={{ fontSize: 18 }} />}
          iconPosition="start"
          label="Table"
        />
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto', px: gutter, py: 2 }}>
        {loading ? (
          <Typography color="text.secondary">Loading meetings…</Typography>
        ) : viewTab === 0 ? (
          <>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1.5,
              }}
            >
              <IconButton
                size="small"
                aria-label="Previous month"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }
              >
                <AppIcon name="ChevronLeft" fallback={ChevronLeftIcon} fontSize="small" />
              </IconButton>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Typography>
              <IconButton
                size="small"
                aria-label="Next month"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }
              >
                <AppIcon name="ChevronRight" fallback={ChevronRightIcon} fontSize="small" />
              </IconButton>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Box
                  key={d}
                  sx={{
                    p: 1,
                    textAlign: 'center',
                    bgcolor: alpha(theme.palette.primary.main, 0.04),
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {d}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {calendarCells.map((cell) => {
                if (cell.kind === 'empty') {
                  return (
                    <Box
                      key={cell.key}
                      sx={{
                        minHeight: 88,
                        borderRight: '1px solid',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                  );
                }
                const dayMeetings = meetingsByDay.get(cell.dateKey) || [];
                return (
                  <Box
                    key={cell.key}
                    onClick={() => handleDayClick(cell.dateKey)}
                    sx={{
                      minHeight: 88,
                      p: 0.75,
                      borderRight: '1px solid',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {cell.day}
                    </Typography>
                    <Stack spacing={0.35} sx={{ mt: 0.5 }}>
                      {dayMeetings.slice(0, 2).map((m) => {
                        const label = m.partnerId
                          ? 'Partners'
                          : isPublicMeeting(m)
                            ? 'Public'
                            : 'Other';
                        return (
                          <Chip
                            key={m.id}
                            size="small"
                            label={label}
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              justifyContent: 'flex-start',
                              bgcolor: m.partnerId
                                ? alpha(theme.palette.primary.main, 0.12)
                                : isPublicMeeting(m)
                                  ? alpha(theme.palette.secondary.main, 0.12)
                                  : alpha(theme.palette.grey[500], 0.15),
                            }}
                          />
                        );
                      })}
                      {dayMeetings.length > 2 && (
                        <Typography variant="caption" color="text.secondary">
                          +{dayMeetings.length - 2}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Box>

            {dayDetailOpen && (
              <Paper variant="outlined" sx={{ mt: 2, p: 1.5, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                  {selectedDateKey} - {selectedDayMeetings.length} meeting(s)
                </Typography>
                <Stack spacing={0.75}>
                  {selectedDayMeetings.map((m) => {
                    const typeLabel = m.partnerId
                      ? 'Partners'
                      : isPublicMeeting(m)
                        ? 'Public meetings'
                        : 'Other';
                    return (
                      <Box
                        key={m.id}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
                      >
                        <Chip
                          size="small"
                          label={typeLabel}
                          color={
                            m.partnerId ? 'primary' : isPublicMeeting(m) ? 'secondary' : 'default'
                          }
                          variant="outlined"
                        />
                        <Typography variant="body2">{m.title || 'Untitled'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(m.datetime)} ·{' '}
                          {m.partnerId ? partnerMap.get(m.partnerId) || m.partnerId : '-'} ·{' '}
                          {m.channel || '-'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
                <Typography
                  component="button"
                  variant="caption"
                  onClick={() => setDayDetailOpen(false)}
                  sx={{
                    mt: 1,
                    border: 0,
                    background: 'none',
                    cursor: 'pointer',
                    color: 'primary.main',
                    textDecoration: 'underline',
                  }}
                >
                  Close
                </Typography>
              </Paper>
            )}
          </>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Partner</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Channel</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allSorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', py: 3 }}>
                      No meetings found. Partners: scheduled from a partner; Public meetings: from
                      your public booking link. Both sync here.
                    </TableCell>
                  </TableRow>
                ) : (
                  allSorted.map((m) => {
                    const typeLabel = m.partnerId
                      ? 'Partners'
                      : isPublicMeeting(m)
                        ? 'Public meetings'
                        : 'Other';
                    return (
                      <TableRow key={m.id} hover>
                        <TableCell>{formatDateTimeTable(m.datetime)}</TableCell>
                        <TableCell>{m.title || 'Untitled'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={typeLabel}
                            color={
                              m.partnerId ? 'primary' : isPublicMeeting(m) ? 'secondary' : 'default'
                            }
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {m.partnerId ? partnerMap.get(m.partnerId) || m.partnerId : '-'}
                        </TableCell>
                        <TableCell>{m.channel || '-'}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      <Box
        sx={{
          px: gutter === 0 ? 0 : 2,
          py: 1.5,
          mt: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.grey[500], 0.06),
          borderRadius: embedded ? 2 : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', px: embedded ? 1.5 : 0 }}>
          <Chip
            size="small"
            label={`Partners: ${partnerMeetings.length}`}
            color="primary"
            variant="outlined"
          />
          <Chip
            size="small"
            label={`Public meetings: ${publicMeetings.length}`}
            color="secondary"
            variant="outlined"
          />
          <Chip size="small" label={`Other: ${otherMeetings.length}`} variant="outlined" />
        </Box>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<AppIcon name="DeleteSweepOutlined" fallback={DeleteSweepOutlinedIcon} />}
          onClick={() => setClearConfirmOpen(true)}
          disabled={meetings.length === 0}
          sx={{ textTransform: 'none', fontWeight: 600, mr: embedded ? 1.5 : 0 }}
        >
          Clear all meetings
        </Button>
      </Box>

      <FormDialog
        open={clearConfirmOpen}
        onClose={() => !clearSubmitting && setClearConfirmOpen(false)}
        title="Clear all meetings?"
        icon={DeleteSweepOutlinedIcon}
        iconVariant="warning"
        maxWidth="xs"
        actions={
          <>
            <Button
              onClick={() => !clearSubmitting && setClearConfirmOpen(false)}
              disabled={clearSubmitting}
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'text.secondary',
                textTransform: 'none',
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleClearAll}
              disabled={clearSubmitting}
              sx={{
                fontSize: '0.875rem',
                fontWeight: 600,
                px: 3,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
              }}
            >
              {clearSubmitting ? 'Clearing…' : 'Clear all'}
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary">
          This will remove all {meetings.length} meeting(s) so you can add your own data. This
          cannot be undone.
        </Typography>
      </FormDialog>
      <FormDialog
        open={bookFormOpen}
        onClose={() => !bookSubmitting && setBookFormOpen(false)}
        title="Book new meeting"
        subtitle="Schedule a meeting and link it to a partner or keep it external"
        icon={EventAvailableIcon}
        maxWidth="sm"
        primaryLabel={bookSubmitting ? 'Booking…' : 'Book meeting'}
        onPrimary={handleBookSubmit}
        primaryDisabled={bookSubmitting || !bookForm.date || !bookForm.time}
        primaryLoading={bookSubmitting}
        cancelLabel="Cancel"
        onCancel={() => !bookSubmitting && setBookFormOpen(false)}
      >
        <Stack spacing={2.5}>
          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, mb: 1.5, color: 'text.secondary' }}
            >
              When
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Date"
                type="date"
                value={bookForm.date}
                onChange={(e) => setBookForm((f) => ({ ...f, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon
                        name="CalendarToday"
                        fallback={CalendarTodayIcon}
                        sx={{ fontSize: 18 }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.default' },
                }}
              />
              <TextField
                label="Time"
                type="time"
                value={bookForm.time}
                onChange={(e) => setBookForm((f) => ({ ...f, time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon name="AccessTime" fallback={AccessTimeIcon} sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.default' },
                }}
              />
            </Box>
          </Box>

          <Box>
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, mb: 1.5, color: 'text.secondary' }}
            >
              Details
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Title"
                placeholder="e.g. Q4 review, onboarding call"
                value={bookForm.title}
                onChange={(e) => setBookForm((f) => ({ ...f, title: e.target.value }))}
                size="small"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                      <AppIcon name="EventNote" fallback={EventNoteIcon} sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.default' },
                }}
              />
              <FormControl
                size="small"
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.default' },
                }}
              >
                <InputLabel>Type</InputLabel>
                <Select
                  value={bookForm.type}
                  label="Type"
                  onChange={(e) =>
                    setBookForm((f) => ({ ...f, type: e.target.value, partnerId: '' }))
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                          <AppIcon
                            name="LabelOutlined"
                            fallback={LabelOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </InputAdornment>
                      ),
                    },
                  }}
                >
                  <MenuItem value="outside">Outside platform</MenuItem>
                  <MenuItem value="partner">With partner</MenuItem>
                </Select>
              </FormControl>
              {bookForm.type === 'partner' && (
                <FormControl
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      bgcolor: 'background.default',
                    },
                  }}
                >
                  <InputLabel>Partner</InputLabel>
                  <Select
                    value={bookForm.partnerId}
                    label="Partner"
                    onChange={(e) => setBookForm((f) => ({ ...f, partnerId: e.target.value }))}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                            <AppIcon
                              name="PersonOutline"
                              fallback={PersonOutlineIcon}
                              sx={{ fontSize: 18 }}
                            />
                          </InputAdornment>
                        ),
                      },
                    }}
                  >
                    <MenuItem value="">Select a partner</MenuItem>
                    {(partners || []).map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name || p.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl
                size="small"
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.default' },
                }}
              >
                <InputLabel>Channel</InputLabel>
                <Select
                  value={bookForm.channel}
                  label="Channel"
                  onChange={(e) => setBookForm((f) => ({ ...f, channel: e.target.value }))}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start" sx={{ color: 'text.secondary', mr: 0 }}>
                          <AppIcon
                            name="VideocamOutlined"
                            fallback={VideocamOutlinedIcon}
                            sx={{ fontSize: 18 }}
                          />
                        </InputAdornment>
                      ),
                    },
                  }}
                >
                  {MEETING_CHANNELS.map((ch) => (
                    <MenuItem key={ch} value={ch}>
                      {ch}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Box>
        </Stack>
      </FormDialog>
    </Box>
  );
}
