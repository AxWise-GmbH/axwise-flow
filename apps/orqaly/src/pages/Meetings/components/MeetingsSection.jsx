import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Alert,
  Typography,
  Paper,
  Chip,
  Stack,
  IconButton,
  TextField,
  InputAdornment,
  MenuItem,
  Button,
  Tooltip,
  alpha,
  Divider,
  Collapse,
  LinearProgress,
  useTheme,
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MicIcon from '@mui/icons-material/Mic';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import VideocamIcon from '@mui/icons-material/Videocam';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TopicIcon from '@mui/icons-material/Topic';
import AssignmentIcon from '@mui/icons-material/Assignment';
import GavelIcon from '@mui/icons-material/Gavel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import FilterListIcon from '@mui/icons-material/FilterList';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TableRowsIcon from '@mui/icons-material/TableRows';
import {
  MEETING_CHANNELS,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_COLORS,
} from '../../../services/meetingService';
import { partnerService } from '../../../services/partnerService';
import { meetingService } from '../../../services/meetingService';
import { addEntry } from '../../../services/partnerHistoryService';
import { deriveSuggestedPartnerUpdates } from '../../../utils/meetingToPartnerUpdates';
import MeetingRecorder from './MeetingRecorder';
import MeetingDetailDialog from './MeetingDetailDialog';
import MeetingUploadDialog from './MeetingUploadDialog';
import PostMeetingSummaryDialog from './PostMeetingSummaryDialog';

import AppIcon from '../../../components/icons/AppIcon';

const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

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
  const startWeekday = first.getDay(); // 0-6
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

/**
 * MeetingsSection
 * ─────────────────────────────────
 * Displays meeting list with search, filter, recording,
 * and upload capabilities inside the Partner Detail page.
 */
export default function MeetingsSection({
  meetings,
  loading,
  partnerId,
  partnerName,
  onCreateMeeting,
  onUpdateMeeting,
  onFinishRecording,
  onUploadRecording,
  onDeleteMeeting,
  onRefetch,
  initialOpenMeetingId = null,
  initialMeetingActionRequest = null,
  onClearOpenMeetingId,
  onConsumeInitialMeetingActionRequest,
  onViewTasks,
}) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [showRecorder, setShowRecorder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [postMeetingDialog, setPostMeetingDialog] = useState({ open: false, meeting: null });
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [plannedView, setPlannedView] = useState('calendar');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      if (typeof window === 'undefined') return true;
      return window.localStorage.getItem('orch_meeting_guide_collapsed') !== '1';
    } catch {
      return true;
    }
  });
  const [planForm, setPlanForm] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '10:00',
    channel: 'Google Meet',
    durationMinutes: 30,
    participants: '',
    notes: '',
  });
  const copyTimerRef = useRef(null);

  const toggleGuide = useCallback(() => {
    setGuideOpen((prev) => {
      const next = !prev;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('orch_meeting_guide_collapsed', next ? '0' : '1');
        }
      } catch {
        // Ignore local persistence failures (quota/private mode).
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!initialOpenMeetingId || !(meetings || []).length) return;
    const meeting = (meetings || []).find((m) => m.id === initialOpenMeetingId);
    const timer = window.setTimeout(() => {
      if (meeting) setSelectedMeeting(meeting);
      onClearOpenMeetingId?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialOpenMeetingId, meetings, onClearOpenMeetingId]);

  useEffect(() => {
    if (!initialMeetingActionRequest?.action) return;
    const timer = window.setTimeout(() => {
      const action = initialMeetingActionRequest.action;
      if (action === 'record') {
        setActiveTab(0);
        setShowUpload(false);
        setShowRecorder(true);
      } else if (action === 'upload') {
        setActiveTab(0);
        setShowRecorder(false);
        setShowUpload(true);
      } else if (action === 'plan') {
        setActiveTab(1);
        setShowPlanDialog(true);
        setPlanForm((prev) => ({
          ...prev,
          title:
            initialMeetingActionRequest.title ||
            prev.title ||
            `Planned meeting with ${partnerName || 'Partner'}`,
        }));
      }
      onConsumeInitialMeetingActionRequest?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialMeetingActionRequest, onConsumeInitialMeetingActionRequest, partnerName]);

  // ─── Copy Meeting Overview ────────────────────────────────────────────────
  const buildOverviewText = useCallback((mtg) => {
    const s = mtg.transcriptStructured || {};
    const lines = [];

    lines.push(`Meeting: ${mtg.title || 'Untitled Meeting'}`);
    lines.push(`Date: ${formatDate(mtg.datetime)} ${formatTime(mtg.datetime)}`);
    lines.push(`Duration: ${formatDuration(mtg.durationSeconds)}`);
    if (mtg.channel) lines.push(`Channel: ${mtg.channel}`);
    if (mtg.organizer || s.organizer) lines.push(`Organizer: ${mtg.organizer || s.organizer}`);
    const participants = mtg.participants?.length ? mtg.participants : s.participants;
    if (participants?.length) lines.push(`Participants: ${participants.join(', ')}`);

    if (s.summary) {
      lines.push('');
      lines.push('Summary');
      lines.push(s.summary);
    }

    if (s.topics?.length) {
      lines.push('');
      lines.push('Key Topics');
      s.topics.forEach((t) => lines.push(`  - ${t}`));
    }

    if (s.decisions?.length) {
      lines.push('');
      lines.push('Decisions');
      s.decisions.forEach((d) => lines.push(`  - ${d}`));
    }

    if (s.action_items?.length) {
      lines.push('');
      lines.push('Action Items');
      s.action_items.forEach((a) => {
        let line = `  - ${a.task}`;
        if (a.assignee) line += ` [${a.assignee}]`;
        if (a.deadline) line += ` - due ${a.deadline}`;
        lines.push(line);
      });
    }

    if (s.agreements?.length) {
      lines.push('');
      lines.push('Agreements');
      s.agreements.forEach((a) => lines.push(`  - ${a}`));
    }

    if (s.tags?.length) {
      lines.push('');
      lines.push(`Tags: ${s.tags.join(', ')}`);
    }

    return lines.join('\n');
  }, []);

  const handleCopyOverview = useCallback(
    (mtg) => {
      const text = buildOverviewText(mtg);
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(mtg.id);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
      });
    },
    [buildOverviewText]
  );

  // ─── Filtering ────────────────────────────────────────────────────────────
  const recordings = useMemo(
    () => (meetings || []).filter((m) => m.status !== 'planned'),
    [meetings]
  );

  const plannedMeetings = useMemo(
    () => (meetings || []).filter((m) => m.status === 'planned'),
    [meetings]
  );

  const filteredRecordings = useMemo(() => {
    let result = recordings;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(q) ||
          (m.organizer || '').toLowerCase().includes(q) ||
          (m.participants || []).some((p) => p.toLowerCase().includes(q)) ||
          (m.transcriptStructured?.summary || '').toLowerCase().includes(q) ||
          (m.transcriptStructured?.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (channelFilter !== 'All') {
      result = result.filter((m) => m.channel === channelFilter);
    }
    return result;
  }, [recordings, search, channelFilter]);

  const filteredPlanned = useMemo(() => {
    let result = plannedMeetings;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.title || '').toLowerCase().includes(q) ||
          (m.organizer || '').toLowerCase().includes(q) ||
          (m.participants || []).some((p) => p.toLowerCase().includes(q)) ||
          (m.planningNotes || '').toLowerCase().includes(q)
      );
    }
    if (channelFilter !== 'All') {
      result = result.filter((m) => m.channel === channelFilter);
    }
    return result.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  }, [plannedMeetings, search, channelFilter]);

  const plannedByDay = useMemo(() => {
    const map = new Map();
    filteredPlanned.forEach((m) => {
      const key = toDateKey(m.datetime);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    });
    return map;
  }, [filteredPlanned]);

  const calendarCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth]);

  const selectedDayMeetings = useMemo(
    () => plannedByDay.get(selectedDateKey) || [],
    [plannedByDay, selectedDateKey]
  );

  const channelOptions = useMemo(() => {
    const set = new Set((meetings || []).map((m) => m.channel).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [meetings]);

  const handleOpenDay = useCallback(
    (dateKey) => {
      const dayMeetings = plannedByDay.get(dateKey) || [];
      if (dayMeetings.length === 0) {
        setPlanForm((prev) => ({
          ...prev,
          date: dateKey,
          time: prev.time || '10:00',
        }));
        setShowPlanDialog(true);
        return;
      }
      setSelectedDateKey(dateKey);
      setDayDrawerOpen(true);
    },
    [plannedByDay]
  );

  const handleCreatePlannedMeeting = useCallback(async () => {
    const participantsList = planForm.participants
      ? planForm.participants
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const plannedIso = new Date(`${planForm.date}T${planForm.time || '10:00'}:00`).toISOString();

    const created = await onCreateMeeting?.({
      title: planForm.title || `Planned meeting with ${partnerName || 'Partner'}`,
      channel: planForm.channel || 'Google Meet',
      participants: participantsList,
    });
    if (!created?.id) return;
    await onUpdateMeeting?.(created.id, {
      status: 'planned',
      datetime: plannedIso,
      durationSeconds: Number(planForm.durationMinutes || 30) * 60,
      participants: participantsList,
      planningNotes: planForm.notes || '',
    });

    setShowPlanDialog(false);
    setPlanForm((prev) => ({
      ...prev,
      title: '',
      participants: '',
      notes: '',
    }));
    onRefetch?.();
  }, [onCreateMeeting, onUpdateMeeting, onRefetch, partnerName, planForm]);

  // ─── Meeting Card ─────────────────────────────────────────────────────────
  const MeetingCard = ({ meeting: mtg }) => {
    const isExpanded = expandedId === mtg.id;
    const structured = mtg.transcriptStructured || {};
    const topicsPreview = (structured.topics || []).slice(0, 3);
    const actionsCount = (structured.action_items || []).length;
    const decisionsCount = (structured.decisions || []).length;

    return (
      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: isExpanded ? alpha(theme.palette.primary.main, 0.3) : 'divider',
          borderRadius: 2.5,
          overflow: 'hidden',
          transition: 'border-color 0.2s',
          '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.2) },
        }}
      >
        {/* Card Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5,
            py: 1.5,
            cursor: 'pointer',
          }}
          onClick={() => setExpandedId(isExpanded ? null : mtg.id)}
        >
          {/* Status indicator */}
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: MEETING_STATUS_COLORS[mtg.status] || '#94A3B8',
              flexShrink: 0,
            }}
          />

          {/* Title + meta */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: '0.9rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {mtg.title || 'Untitled Meeting'}
            </Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                {formatDate(mtg.datetime)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                ·
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                {formatTime(mtg.datetime)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                ·
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                {formatDuration(mtg.durationSeconds)}
              </Typography>
            </Stack>
          </Box>

          {/* Quick stats */}
          <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            {mtg.channel && (
              <Chip
                label={mtg.channel}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.68rem', height: 22 }}
              />
            )}
            {actionsCount > 0 && (
              <Chip
                icon={<AppIcon name="Assignment" fallback={AssignmentIcon} sx={{ fontSize: 12 }} />}
                label={`${actionsCount} actions`}
                size="small"
                sx={{
                  fontSize: '0.68rem',
                  height: 22,
                  bgcolor: alpha('#EF4444', 0.08),
                  color: '#EF4444',
                  '& .MuiChip-icon': { color: '#EF4444' },
                }}
              />
            )}
            {decisionsCount > 0 && (
              <Chip
                icon={<AppIcon name="Gavel" fallback={GavelIcon} sx={{ fontSize: 12 }} />}
                label={`${decisionsCount} decisions`}
                size="small"
                sx={{
                  fontSize: '0.68rem',
                  height: 22,
                  bgcolor: alpha('#F59E0B', 0.08),
                  color: '#F59E0B',
                  '& .MuiChip-icon': { color: '#F59E0B' },
                }}
              />
            )}
          </Stack>

          {/* Actions */}
          <Tooltip title={copiedId === mtg.id ? 'Copied!' : 'Copy Meeting Overview'}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyOverview(mtg);
              }}
              sx={{
                color: copiedId === mtg.id ? '#10B981' : 'text.disabled',
                '&:hover': { color: copiedId === mtg.id ? '#10B981' : 'text.secondary' },
              }}
            >
              {copiedId === mtg.id ? (
                <AppIcon name="Check" fallback={CheckIcon} fontSize="small" />
              ) : (
                <AppIcon name="ContentCopy" fallback={ContentCopyIcon} fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="View full details">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedMeeting(mtg);
              }}
            >
              <AppIcon name="PlayArrow" fallback={PlayArrowIcon} fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete meeting">
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteMeeting?.(mtg.id);
              }}
              sx={{ color: 'text.disabled', '&:hover': { color: '#EF4444' } }}
            >
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} fontSize="small" />
            </IconButton>
          </Tooltip>

          {isExpanded ? (
            <AppIcon
              name="ExpandLess"
              fallback={ExpandLessIcon}
              sx={{ color: 'text.secondary', fontSize: 20 }}
            />
          ) : (
            <AppIcon
              name="ExpandMore"
              fallback={ExpandMoreIcon}
              sx={{ color: 'text.secondary', fontSize: 20 }}
            />
          )}
        </Box>
        {/* Expanded Preview */}
        <Collapse in={isExpanded}>
          <Divider />
          <Box sx={{ px: 2.5, py: 2 }}>
            {/* No transcript (e.g. real recording without backend) */}
            {!structured.summary &&
              !(structured.topics || []).length &&
              !(structured.action_items || []).length && (
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontStyle: 'italic',
                    mb: 2,
                  }}
                >
                  Recording saved. To see a transcript and summary here, connect a transcription
                  service in your environment.
                </Typography>
              )}
            {/* Summary */}
            {structured.summary && (
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.85rem',
                  lineHeight: 1.7,
                  color: 'text.secondary',
                  mb: 2,
                  fontStyle: 'italic',
                  pl: 2,
                  borderLeft: '3px solid',
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                }}
              >
                {structured.summary}
              </Typography>
            )}

            {/* Key Topics */}
            {topicsPreview.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.5, display: 'block' }}
                >
                  Key Topics
                </Typography>
                {topicsPreview.map((topic, i) => (
                  <Box
                    key={i}
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.25 }}
                  >
                    <AppIcon
                      name="Topic"
                      fallback={TopicIcon}
                      sx={{ fontSize: 14, color: '#8B5CF6', mt: 0.15 }}
                    />
                    <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                      {topic}
                    </Typography>
                  </Box>
                ))}
                {(structured.topics || []).length > 3 && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', pl: 2.5 }}>
                    +{(structured.topics || []).length - 3} more…
                  </Typography>
                )}
              </Box>
            )}

            {/* Action Items Preview */}
            {(structured.action_items || []).length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', mb: 0.5, display: 'block' }}
                >
                  Action Items
                </Typography>
                {(structured.action_items || []).slice(0, 2).map((item, i) => (
                  <Box
                    key={i}
                    sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.25 }}
                  >
                    <AppIcon
                      name="CheckCircle"
                      fallback={CheckCircleIcon}
                      sx={{ fontSize: 14, color: '#EF4444', mt: 0.15 }}
                    />
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                      {item.task}
                      {item.assignee && (
                        <Typography
                          component="span"
                          sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                        >
                          {' '}
                          - {item.assignee}
                        </Typography>
                      )}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            {/* Tags */}
            {(structured.tags || []).length > 0 && (
              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
                {structured.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.68rem', height: 20 }}
                  />
                ))}
              </Stack>
            )}

            {/* Actions */}
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button
                size="small"
                onClick={() => setSelectedMeeting(mtg)}
                sx={{ fontSize: '0.78rem' }}
              >
                View Full Details & Transcript →
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={
                  copiedId === mtg.id ? (
                    <AppIcon name="Check" fallback={CheckIcon} sx={{ fontSize: 14 }} />
                  ) : (
                    <AppIcon name="ContentCopy" fallback={ContentCopyIcon} sx={{ fontSize: 14 }} />
                  )
                }
                onClick={() => handleCopyOverview(mtg)}
                sx={{
                  fontSize: '0.78rem',
                  textTransform: 'none',
                  color: copiedId === mtg.id ? '#10B981' : 'text.secondary',
                  borderColor: copiedId === mtg.id ? '#10B981' : 'divider',
                  '&:hover': {
                    borderColor: copiedId === mtg.id ? '#10B981' : 'text.secondary',
                    bgcolor: copiedId === mtg.id ? alpha('#10B981', 0.04) : alpha('#000', 0.02),
                  },
                }}
              >
                {copiedId === mtg.id ? 'Copied!' : 'Copy Meeting Overview'}
              </Button>
            </Stack>
          </Box>
        </Collapse>
      </Paper>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          Meetings
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.3 }}>
          {(recordings || []).length} recordings · {(plannedMeetings || []).length} planned
        </Typography>
      </Box>
      <ToggleButtonGroup
        value={activeTab}
        exclusive
        onChange={(_, v) => {
          if (v !== null) setActiveTab(v);
        }}
        size="small"
        sx={{
          mb: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          p: 0.5,
          borderRadius: 2.5,
          '& .MuiToggleButton-root': {
            border: 0,
            textTransform: 'none',
            fontWeight: 700,
            px: 2,
            py: 0.8,
            borderRadius: 2,
            color: 'text.secondary',
          },
          '& .MuiToggleButton-root.Mui-selected': {
            bgcolor: 'background.paper',
            color: 'primary.main',
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
          },
          '& .MuiToggleButton-root.Mui-selected:hover': {
            bgcolor: 'background.paper',
          },
        }}
      >
        <ToggleButton value={0}>{`Recordings (${recordings.length})`}</ToggleButton>
        <ToggleButton value={1}>{`Planned Meetings (${plannedMeetings.length})`}</ToggleButton>
      </ToggleButtonGroup>
      {activeTab === 0 && (
        <>
          <Box
            sx={{
              mb: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AppIcon name="UploadFile" fallback={UploadFileIcon} />}
                onClick={() => setShowUpload(true)}
                sx={{ textTransform: 'none', fontSize: '0.8rem' }}
              >
                Upload
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<AppIcon name="Mic" fallback={MicIcon} />}
                onClick={() => setShowRecorder(!showRecorder)}
                disableElevation
                sx={{
                  textTransform: 'none',
                  fontSize: '0.8rem',
                  bgcolor: '#EF4444',
                  '&:hover': { bgcolor: '#DC2626' },
                }}
              >
                Record
              </Button>
            </Stack>
            <Button
              size="small"
              variant="text"
              onClick={toggleGuide}
              startIcon={
                guideOpen ? (
                  <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
                ) : (
                  <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
                )
              }
              sx={{ textTransform: 'none', fontWeight: 700, mt: 0.25 }}
            >
              {guideOpen ? 'Hide guide' : 'Show guide'}
            </Button>
          </Box>

          <Collapse in={guideOpen}>
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Meetings guide (Partner page)
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                Record or upload a meeting, then review the AI summary and approve suggested
                actions. Use "Approve all actions" to create tasks, create workflows/projects, and
                apply partner updates in one click.
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 0.75, color: 'text.secondary' }}
              >
                Note: Audio is not retained. Only transcripts and structured notes are stored.
              </Typography>
            </Alert>
          </Collapse>

          {/* Recorder */}
          <Collapse in={showRecorder}>
            <Paper
              elevation={0}
              sx={{
                p: 2.5,
                mb: 2,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: alpha('#EF4444', 0.2),
                bgcolor: alpha('#EF4444', 0.02),
              }}
            >
              <MeetingRecorder
                partnerId={partnerId}
                partnerName={partnerName}
                onCreateMeeting={onCreateMeeting}
                onUpdateMeeting={onUpdateMeeting}
                onFinishRecording={onFinishRecording}
                onDeleteMeeting={onDeleteMeeting}
                onRecordingComplete={async (meeting) => {
                  if (meeting?.transcriptStructured && partnerId) {
                    let suggested = [];
                    try {
                      const partner = await partnerService.getById(partnerId);
                      suggested = deriveSuggestedPartnerUpdates(meeting, partner);
                      if (suggested.length > 0) {
                        await meetingService.update(meeting.id, {
                          suggestedPartnerUpdates: suggested,
                        });
                      }
                    } catch {
                      // ignore
                    }
                    const structured = meeting.transcriptStructured || {};
                    const topic = structured.meeting_topic || meeting.title || 'Meeting';
                    const participants = (structured.participants || []).join(', ') || '-';
                    const tasksSuggested = (structured.action_items || []).length;
                    const extractedRequests = (structured.extracted_requests || []).length;
                    const recommendedActions = (structured.recommended_actions || []).length;
                    try {
                      await addEntry(partnerId, {
                        type: 'interaction',
                        title: 'Meeting Recorded',
                        detail: `Topic: ${topic}. Participants: ${participants}.${tasksSuggested > 0 ? ` ${tasksSuggested} task${tasksSuggested !== 1 ? 's' : ''} suggested.` : ''}`,
                        meta: {
                          meetingId: meeting.id,
                          meetingTitle: meeting.title,
                          meetingTopic: topic,
                          tasksSuggested,
                          extractedRequests,
                          recommendedActions,
                        },
                      });
                    } catch {
                      // ignore
                    }
                    setPostMeetingDialog({
                      open: true,
                      meeting: {
                        ...meeting,
                        suggestedPartnerUpdates: meeting.suggestedPartnerUpdates || suggested,
                      },
                    });
                  }
                  setShowRecorder(false);
                  onRefetch?.();
                }}
                onClose={() => setShowRecorder(false)}
              />
            </Paper>
          </Collapse>

          {/* Search + Filter Bar */}
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search recordings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              size="small"
              select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              sx={{ minWidth: 140 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="FilterList" fallback={FilterListIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
            >
              {channelOptions.map((ch) => (
                <MenuItem key={ch} value={ch}>
                  {ch}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Loading */}
          {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

          {/* Meeting List */}
          {filteredRecordings.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <AppIcon
                name="Videocam"
                fallback={VideocamIcon}
                sx={{ fontSize: 48, color: 'text.disabled', mb: 1, opacity: 0.3 }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {search || channelFilter !== 'All'
                  ? 'No recordings match your search criteria.'
                  : 'No recordings yet. Click "Record" to start your first meeting.'}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {filteredRecordings.map((mtg) => (
                <MeetingCard key={mtg.id} meeting={mtg} />
              ))}
            </Stack>
          )}
        </>
      )}
      {activeTab === 1 && (
        <>
          <Box
            sx={{
              mb: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                onClick={() => setShowPlanDialog(true)}
                disableElevation
                sx={{ textTransform: 'none', fontWeight: 700 }}
              >
                Plan Meeting
              </Button>
            </Stack>
            <ToggleButtonGroup
              size="small"
              value={plannedView}
              exclusive
              onChange={(_, v) => v && setPlannedView(v)}
            >
              <ToggleButton value="table" sx={{ textTransform: 'none' }}>
                <AppIcon name="TableRows" fallback={TableRowsIcon} sx={{ fontSize: 16, mr: 0.5 }} />
                Table
              </ToggleButton>
              <ToggleButton value="calendar" sx={{ textTransform: 'none' }}>
                <AppIcon
                  name="CalendarMonth"
                  fallback={CalendarMonthIcon}
                  sx={{ fontSize: 16, mr: 0.5 }}
                />
                Calendar
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search planned meetings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: 1, minWidth: 180 }}
            />
            <TextField
              size="small"
              select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              sx={{ minWidth: 140 }}
            >
              {channelOptions.map((ch) => (
                <MenuItem key={ch} value={ch}>
                  {ch}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {plannedView === 'table' ? (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Title</TableCell>
                    <TableCell>Channel</TableCell>
                    <TableCell>Participants</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPlanned.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                          No planned meetings found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPlanned.map((m) => (
                      <TableRow
                        key={m.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedDateKey(toDateKey(m.datetime));
                          setDayDrawerOpen(true);
                        }}
                      >
                        <TableCell>{formatDate(m.datetime)}</TableCell>
                        <TableCell>{formatTime(m.datetime)}</TableCell>
                        <TableCell>{m.title || 'Untitled'}</TableCell>
                        <TableCell>{m.channel || '-'}</TableCell>
                        <TableCell>
                          {(m.participants || []).slice(0, 2).join(', ') || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 1.2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <IconButton
                  size="small"
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
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
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
                          minHeight: 104,
                          borderRight: '1px solid',
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    );
                  }
                  const dayMeetings = plannedByDay.get(cell.dateKey) || [];
                  return (
                    <Box
                      key={cell.key}
                      onClick={() => handleOpenDay(cell.dateKey)}
                      sx={{
                        minHeight: 104,
                        p: 0.8,
                        borderRight: '1px solid',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {cell.day}
                      </Typography>
                      <Stack spacing={0.4} sx={{ mt: 0.5 }}>
                        {dayMeetings.slice(0, 2).map((m) => (
                          <Chip
                            key={m.id}
                            size="small"
                            label={`${formatTime(m.datetime)} · ${m.title || 'Meeting'}`}
                            sx={{ height: 20, justifyContent: 'flex-start' }}
                          />
                        ))}
                        {dayMeetings.length > 2 && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            +{dayMeetings.length - 2} more
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          )}
        </>
      )}
      <Drawer
        anchor="right"
        open={dayDrawerOpen}
        onClose={() => setDayDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 430 }, p: 2 } }}
      >
        <Box
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
            Planned meetings
          </Typography>
          <Chip size="small" label={selectedDateKey || 'Day'} sx={{ fontSize: '0.72rem' }} />
        </Box>
        {selectedDayMeetings.length === 0 ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No meetings planned for this day.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {selectedDayMeetings.map((m) => (
              <Paper key={m.id} variant="outlined" sx={{ p: 1.3, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {m.title || 'Planned meeting'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', display: 'block', mt: 0.3 }}
                >
                  {formatDate(m.datetime)} · {formatTime(m.datetime)} · {m.channel || '-'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.7, color: 'text.secondary' }}>
                  Participants: {(m.participants || []).join(', ') || '-'}
                </Typography>
                {m.planningNotes && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {m.planningNotes}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSelectedMeeting(m);
                      setDayDrawerOpen(false);
                    }}
                    sx={{ textTransform: 'none' }}
                  >
                    Open details
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDeleteMeeting?.(m.id)}
                    sx={{ textTransform: 'none' }}
                  >
                    Delete
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Drawer>
      <Dialog
        open={showPlanDialog}
        onClose={() => setShowPlanDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
          },
        }}
      >
        <DialogTitle
          sx={{
            px: 3,
            py: 2.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.16),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <AppIcon name="CalendarMonth" fallback={CalendarMonthIcon} sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.06rem', letterSpacing: '-0.01em' }}>
              Plan Meeting
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Schedule, assign participants, and keep preparation notes in one place
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
          <Stack spacing={2}>
            <TextField
              label="Meeting title"
              size="small"
              value={planForm.title}
              onChange={(e) => setPlanForm((p) => ({ ...p, title: e.target.value }))}
              placeholder={`Meeting with ${partnerName || 'Partner'}`}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="Topic"
                      fallback={TopicIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Date"
                type="date"
                size="small"
                value={planForm.date}
                onChange={(e) => setPlanForm((p) => ({ ...p, date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="CalendarToday"
                        fallback={CalendarTodayIcon}
                        sx={{ fontSize: 18, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
              <TextField
                label="Time"
                type="time"
                size="small"
                value={planForm.time}
                onChange={(e) => setPlanForm((p) => ({ ...p, time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="AccessTime"
                        fallback={AccessTimeIcon}
                        sx={{ fontSize: 18, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Channel"
                size="small"
                select
                value={planForm.channel}
                onChange={(e) => setPlanForm((p) => ({ ...p, channel: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="Videocam"
                        fallback={VideocamIcon}
                        sx={{ fontSize: 18, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              >
                {MEETING_CHANNELS.map((ch) => (
                  <MenuItem key={ch} value={ch}>
                    {ch}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Duration (min)"
                size="small"
                type="number"
                value={planForm.durationMinutes}
                onChange={(e) =>
                  setPlanForm((p) => ({
                    ...p,
                    durationMinutes: Math.max(15, Number(e.target.value || 30)),
                  }))
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AppIcon
                        name="AccessTime"
                        fallback={AccessTimeIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: { xs: '100%', sm: 180 },
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
              />
            </Stack>

            <TextField
              label="Participants"
              size="small"
              value={planForm.participants}
              onChange={(e) => setPlanForm((p) => ({ ...p, participants: e.target.value }))}
              placeholder="e.g. Alex, Mike, Sarah"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <AppIcon
                      name="PersonOutline"
                      fallback={PersonOutlineIcon}
                      sx={{ fontSize: 18, color: 'text.secondary' }}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              label="Preparation notes"
              size="small"
              multiline
              minRows={4}
              value={planForm.notes}
              onChange={(e) => setPlanForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Agenda, objectives, links, required assets, decisions to make..."
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.background.default, 0.6),
          }}
        >
          <Button
            onClick={() => setShowPlanDialog(false)}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleCreatePlannedMeeting}
            sx={{ textTransform: 'none', fontWeight: 800, px: 3, borderRadius: 2 }}
          >
            Create planned meeting
          </Button>
        </DialogActions>
      </Dialog>
      {/* Meeting Detail Dialog */}
      <MeetingDetailDialog
        open={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        meeting={selectedMeeting}
      />
      <PostMeetingSummaryDialog
        open={postMeetingDialog.open}
        onClose={() => setPostMeetingDialog({ open: false, meeting: null })}
        meeting={postMeetingDialog.meeting}
        partnerId={partnerId}
        partnerName={partnerName}
        onRefetch={onRefetch}
        onViewTranscript={(meetingId) => {
          const mtg = (meetings || []).find((m) => m.id === meetingId);
          if (mtg) setSelectedMeeting(mtg);
        }}
        onViewTasks={onViewTasks}
      />
      {/* Upload Dialog */}
      <MeetingUploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        partnerId={partnerId}
        onUpload={async (file, metadata, onStatusChange) => {
          const result = await onUploadRecording?.(file, metadata, onStatusChange);
          if (result?.transcriptStructured && partnerId) {
            let suggested = [];
            try {
              const partner = await partnerService.getById(partnerId);
              suggested = deriveSuggestedPartnerUpdates(result, partner);
              if (suggested.length > 0) {
                await meetingService.update(result.id, { suggestedPartnerUpdates: suggested });
              }
            } catch {
              // ignore
            }
            const structured = result.transcriptStructured || {};
            const topic = structured.meeting_topic || result.title || 'Meeting';
            const participants = (structured.participants || []).join(', ') || '-';
            const tasksSuggested = (structured.action_items || []).length;
            const extractedRequests = (structured.extracted_requests || []).length;
            const recommendedActions = (structured.recommended_actions || []).length;
            try {
              await addEntry(partnerId, {
                type: 'interaction',
                title: 'Meeting Recorded',
                detail: `Topic: ${topic}. Participants: ${participants}.${tasksSuggested > 0 ? ` ${tasksSuggested} task${tasksSuggested !== 1 ? 's' : ''} suggested.` : ''}`,
                meta: {
                  meetingId: result.id,
                  meetingTitle: result.title,
                  meetingTopic: topic,
                  tasksSuggested,
                  extractedRequests,
                  recommendedActions,
                },
              });
            } catch {
              // ignore
            }
            setPostMeetingDialog({
              open: true,
              meeting: {
                ...result,
                suggestedPartnerUpdates: result.suggestedPartnerUpdates || suggested,
              },
            });
          }
          setShowUpload(false);
          onRefetch?.();
          return result;
        }}
      />
    </Box>
  );
}
