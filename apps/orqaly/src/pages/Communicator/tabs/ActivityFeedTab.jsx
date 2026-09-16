/**
 * [module: connection-hub]
 * ActivityFeedTab - unified timeline of platform events across
 * goal_log, notification_log, pulse_cycles, and communication_logs.
 *
 * Per-row layout (Phase 5g):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [Type chip]  Entity name              · 14:32        [Open] │
 *   │ Action - short content describing what happened              │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * "Open" routes to the related page (goal / task / project / etc).
 * Refresh fades the list out and back in with a stagger.
 * Pagination uses the shared <Pagination> + usePagination from KB.
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Paper,
  Skeleton,
  Alert,
  Fade,
  useTheme,
  alpha,
  keyframes,
} from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import EmptyState from '../../../components/Common/EmptyState';
import Pagination from '../../../components/Common/Pagination';
import usePagination from '../../../hooks/usePagination';
import PaneStatusStrip from '../components/PaneStatusStrip';

import AppIcon from '../../../components/icons/AppIcon';

const SOURCES = [
  { id: 'all', label: 'All' },
  { id: 'goal_log', label: 'Goals' },
  { id: 'notification_log', label: 'Alerts' },
  { id: 'pulse_cycle', label: 'Pulse' },
  { id: 'communication_log', label: 'Chat' },
];

const SEVERITIES = [
  { id: 'all', label: 'All' },
  { id: 'needs_action', label: 'Needs Action' },
  { id: 'success', label: 'Success' },
  { id: 'warn', label: 'Warnings' },
  { id: 'error', label: 'Errors' },
];

const SEVERITY_COLOR = {
  info: 'info.main',
  success: 'success.main',
  warn: 'warning.main',
  error: 'error.main',
  needs_action: 'warning.dark',
};

const SOURCE_LABEL = {
  goal_log: 'Goal',
  notification_log: 'Alert',
  pulse_cycle: 'Pulse',
  communication_log: 'Chat',
};

// ── Time formatter ──
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Per-source display formatter ──
// Returns { type, name, action, content, openHref } so the row layout stays
// uniform regardless of which table the event came from.
function displayForEvent(event) {
  const type = SOURCE_LABEL[event.source] || event.source || 'Event';
  let name = '';
  let action = '';
  let content = '';
  let openHref = null;

  switch (event.source) {
    case 'goal_log': {
      // normalize() gave: title = event_type, body = goal title, goalId = uuid
      name = event.body || 'Untitled goal';
      action = humanizeEventType(event.title);
      content = describeGoalDetails(event.details);
      if (event.goalId) openHref = `/goals/${event.goalId}`;
      break;
    }
    case 'notification_log': {
      // title = subject (e.g. "Goal completed: Research X"), body = message body
      const { entity, verb } = splitNotificationSubject(event.title);
      name = entity || event.title || 'Alert';
      action = verb || humanizeEventType(event.title);
      content = event.body || '';
      if (event.goalId) openHref = `/goals/${event.goalId}`;
      else if (event.action?.target_url) openHref = event.action.target_url;
      break;
    }
    case 'pulse_cycle': {
      // title = "Pulse cycle · <status>", body = summary, actor = agent name
      name = event.actor || 'Pulse agent';
      action = (event.title || '').replace(/^Pulse cycle\s*[·•]?\s*/i, '').trim() || 'cycle';
      content =
        event.body ||
        `Cost ${typeof event.details?.cost_usd === 'number' ? `$${event.details.cost_usd.toFixed(4)}` : '-'}`;
      openHref = '/agent-hub?tab=pulse';
      break;
    }
    case 'communication_log': {
      // title = "<sender_type> message", body = message content
      name = humanizeSenderType(event.title) || 'Conversation';
      action = 'said';
      content = event.body || '';
      if (event.goalId) openHref = `/goals/${event.goalId}`;
      else openHref = '/communicator?view=workspace&section=rooms';
      break;
    }
    default: {
      name = event.title || 'Event';
      action = '';
      content = event.body || '';
    }
  }

  return { type, name: cleanLabel(name), action: cleanLabel(action), content, openHref };
}

function humanizeEventType(s) {
  if (!s) return '';
  return String(s)
    .replaceAll('_', ' ')
    .replace(/^goal\s+/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitNotificationSubject(subject) {
  // "Goal completed: Research X" → { verb: 'Goal completed', entity: 'Research X' }
  if (!subject) return { verb: '', entity: '' };
  const idx = subject.indexOf(':');
  if (idx === -1) return { verb: '', entity: subject };
  return { verb: subject.slice(0, idx).trim(), entity: subject.slice(idx + 1).trim() };
}

function humanizeSenderType(title) {
  if (!title) return '';
  const senderMatch = title.match(/^(\w+)\s+message$/i);
  if (senderMatch) return senderMatch[1].charAt(0).toUpperCase() + senderMatch[1].slice(1);
  return title;
}

function cleanLabel(s) {
  return String(s || '').slice(0, 90);
}

function describeGoalDetails(details) {
  if (!details || typeof details !== 'object') return '';
  if (details.reason) return String(details.reason).slice(0, 200);
  if (details.feedback) return String(details.feedback).slice(0, 200);
  if (details.strategy) return `Strategy: ${details.strategy}`;
  return '';
}

// ── Event card ──────────────────────────────────────────────────────────────

const rowFadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
`;

function EventCard({ event, theme, animationDelayMs = 0 }) {
  const { type, name, action, content, openHref } = displayForEvent(event);
  const color = SEVERITY_COLOR[event.severity] || 'text.secondary';
  const colorVal = color.includes('.')
    ? color.split('.').reduce((acc, k) => acc?.[k], theme.palette)
    : color;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1,
        borderRadius: 2,
        overflow: 'hidden',
        borderLeft: `3px solid ${colorVal || theme.palette.text.secondary}`,
        animation: `${rowFadeIn} 0.45s cubic-bezier(0.4, 0, 0.2, 1) both`,
        animationDelay: `${animationDelayMs}ms`,
      }}
    >
      <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {/* Top row: (Type) Name · time · Open */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip
            label={type}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.62rem',
              fontWeight: 700,
              bgcolor: alpha(colorVal || theme.palette.text.secondary, 0.14),
              color: colorVal || 'text.secondary',
              border: 'none',
              '& .MuiChip-label': { px: 0.85 },
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontSize: '0.86rem',
              color: 'text.primary',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={name}
          >
            {name}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', fontSize: '0.66rem', flexShrink: 0 }}
          >
            {fmtTime(event.timestamp)}
          </Typography>
          {openHref && (
            <Button
              size="small"
              variant="outlined"
              href={openHref}
              endIcon={
                <AppIcon
                  name="OpenInNewOutlined"
                  fallback={OpenInNewOutlinedIcon}
                  sx={{ fontSize: 12 }}
                />
              }
              sx={{
                minHeight: 24,
                fontSize: '0.68rem',
                textTransform: 'none',
                borderRadius: 1.5,
                px: 1.1,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Open
            </Button>
          )}
        </Box>

        {/* Bottom row: Action - content */}
        {(action || content) && (
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {action && (
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
                {action}
              </Box>
            )}
            {action && content && (
              <Box component="span" sx={{ mx: 0.5, color: 'text.disabled' }}>
                -
              </Box>
            )}
            {content}
          </Typography>
        )}

        {/* Action button (e.g. "Resolve" for needs_action) - only when distinct from Open */}
        {event.action?.target_url && event.action.target_url !== openHref && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              color={event.severity === 'needs_action' ? 'warning' : 'primary'}
              href={event.action.target_url}
              sx={{ minHeight: 22, fontSize: '0.68rem', textTransform: 'none' }}
            >
              {event.action.label || 'Resolve'}
            </Button>
            {event.occurrences > 1 && (
              <Chip
                label={`${event.occurrences} similar`}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem' }}
              />
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ActivityFeedTab({
  events = [],
  loading,
  error,
  filters,
  applyFilters,
  resetFilters,
  fetchEvents,
}) {
  const theme = useTheme();

  // Refresh-animation key: bump on every refresh so all cards re-animate.
  const [refreshKey, setRefreshKey] = useState(0);
  const prevEventsLen = useRef(events.length);

  // Auto-bump key when the events array reference changes (poll or manual refresh)
  useEffect(() => {
    setRefreshKey((k) => k + 1);
    prevEventsLen.current = events.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const counts = useMemo(() => {
    const byAction = events.filter((e) => e.severity === 'needs_action').length;
    return { total: events.length, needsAction: byAction };
  }, [events]);

  // Pagination - shared pattern (KB / Partners / etc.)
  const pager = usePagination(events, {
    surfaceId: 'communicator_activity_feed',
    defaultRowsPerPage: 10,
    rowsPerPageOptions: [10, 25, 50],
    resetOn: [filters.source, filters.severity, filters.goalId],
  });
  const pagedEvents = pager.paginatedData;

  // Status strip stats
  const recentHour = events.filter(
    (e) => Date.now() - new Date(e.timestamp).getTime() < 3600_000
  ).length;
  const errors = events.filter(
    (e) => e.severity === 'error' || /error|failed/i.test(e.action || '')
  ).length;

  function handleRefresh() {
    fetchEvents();
    setRefreshKey((k) => k + 1);
  }

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          { value: recentHour, label: 'Last hour', color: 'primary', icon: BoltOutlinedIcon },
          {
            value: counts.needsAction,
            label: 'Needs action',
            color: counts.needsAction > 0 ? 'warning' : 'neutral',
            icon: WarningAmberOutlinedIcon,
          },
          {
            value: errors,
            label: 'Errors',
            color: errors > 0 ? 'danger' : 'neutral',
            icon: ErrorOutlineIcon,
          },
        ]}
      />
      {/* Filter bar */}
      <Box sx={{ mb: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.5 }}>
            Source:
          </Typography>
          {SOURCES.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              size="small"
              clickable
              onClick={() => applyFilters({ source: s.id })}
              color={filters.source === s.id ? 'primary' : 'default'}
              variant={filters.source === s.id ? 'filled' : 'outlined'}
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          ))}
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {counts.total} events · {counts.needsAction} need action
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleRefresh}
              startIcon={<AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 16 }} />}
              sx={{ minHeight: 24, fontSize: '0.7rem', textTransform: 'none' }}
            >
              Refresh
            </Button>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mr: 0.5 }}>
            Severity:
          </Typography>
          {SEVERITIES.map((s) => (
            <Chip
              key={s.id}
              label={s.label}
              size="small"
              clickable
              onClick={() => applyFilters({ severity: s.id })}
              color={filters.severity === s.id ? 'primary' : 'default'}
              variant={filters.severity === s.id ? 'filled' : 'outlined'}
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          ))}
          {(filters.source !== 'all' || filters.severity !== 'all' || filters.goalId) && (
            <Button
              size="small"
              variant="text"
              onClick={resetFilters}
              sx={{ minHeight: 24, fontSize: '0.7rem', textTransform: 'none', ml: 'auto' }}
            >
              Clear filters
            </Button>
          )}
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {loading && events.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : events.length === 0 ? (
        <EmptyState
          icon={BoltOutlinedIcon}
          title="No activity yet"
          description="Create a goal or wait for the next pulse cycle - events will appear here within 15 seconds."
        />
      ) : (
        <>
          <Fade in key={refreshKey} timeout={300}>
            <Box>
              {pagedEvents.map((event, idx) => (
                <EventCard
                  key={`${refreshKey}-${event.id}`}
                  event={event}
                  theme={theme}
                  animationDelayMs={Math.min(idx * 40, 320)}
                />
              ))}
            </Box>
          </Fade>

          {/* Pagination */}
          {events.length > pager.rowsPerPage && (
            <Box sx={{ mt: 1.5 }}>
              <Pagination
                count={pager.totalCount}
                page={pager.page}
                rowsPerPage={pager.rowsPerPage}
                rowsPerPageOptions={pager.rowsPerPageOptions}
                onPageChange={pager.setPage}
                onRowsPerPageChange={pager.setRowsPerPage}
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
