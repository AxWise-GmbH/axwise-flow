import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import AxwiseCallDetail from './AxwiseCallDetail';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { dockSurfaceBg } from './SimpleDock';
import { usePulseBarPref } from '../../hooks/usePulseBarPref';
import { usePulseFeed } from '../../hooks/usePulseFeed';

const SEVERITY_KEY = { ok: 'success', warn: 'warning', error: 'error' };

function severityColor(theme, severity) {
  const key = SEVERITY_KEY[severity] || 'success';
  return theme.palette[key].main;
}

function relTime(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function StatusDot({ severity, size = 10 }) {
  const theme = useTheme();
  const color = severityColor(theme, severity);
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        boxShadow: `0 0 8px ${alpha(color, 0.7)}`,
        flexShrink: 0,
      }}
    />
  );
}

// The AxWise observability bar. Renders on every page (mounted in MainLayout),
// hidden entirely when the Settings > Pages toggle is off. Three views:
// minimized (corner pill) / collapsed (one-line summary) / expanded (event list).
export default function PulseBar() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { hidden, view, setView } = usePulseBarPref();
  const { events, summary, loading, refresh, scope } = usePulseFeed({ enabled: !hidden });
  const [expandedId, setExpandedId] = useState(null);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // On mobile the minimized pill lives in the header (AxwiseHeaderPill, next to
  // the avatar), and the bar auto-starts minimized. Persisting is intentional
  // for the mobile "auto-minimize" request; desktop keeps its own view.
  useEffect(() => {
    if (isMobile) setView('minimized');
  }, [isMobile, setView]);

  if (hidden) return null;

  const surface = dockSurfaceBg(theme);
  const border = `1px solid ${alpha(theme.palette.primary.main, 0.25)}`;

  // Minimized: a tiny top-right pill, just the worst-status dot + count.
  // On mobile the header pill (AxwiseHeaderPill) shows this instead, so the
  // floating corner pill is suppressed to avoid a double pill.
  if (view === 'minimized') {
    if (isMobile) return null;
    return (
      <Tooltip title="Show AxWise activity" placement="left">
        <Box
          role="button"
          aria-label="Expand AxWise status bar"
          onClick={() => setView('collapsed')}
          sx={{
            position: 'fixed',
            top: { xs: 10, sm: 14 },
            right: { xs: 10, sm: 16 },
            zIndex: theme.zIndex.appBar + 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.25,
            py: 0.5,
            borderRadius: '999px',
            background: surface,
            border,
            backdropFilter: 'saturate(180%) blur(22px)',
            cursor: 'pointer',
          }}
        >
          <StatusDot severity={summary.worst} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {summary.axwise}
          </Typography>
        </Box>
      </Tooltip>
    );
  }

  const expanded = view === 'expanded';
  // On a goal page, prefer that goal's own AxWise state over generic pipeline
  // or global Copilot activity. Outside goals, the newest AxWise event wins.
  const latest =
    events.find((event) => event.kind === 'axwise' && event.where?.startsWith('goal.')) ||
    events.find((event) => event.kind === 'axwise') ||
    events[0];

  return (
    <Box
      role="status"
      aria-label="AxWise activity"
      sx={{
        position: 'fixed',
        top: { xs: 8, sm: 12 },
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: theme.zIndex.appBar + 1,
        width: { xs: 'calc(100% - 16px)', sm: 'min(920px, calc(100% - 32px))' },
        borderRadius: expanded ? '18px' : '999px',
        background: surface,
        border,
        backdropFilter: 'saturate(180%) blur(22px)',
        // A 35% black drop is right over a near-black page and far too heavy
        // over a white one; the dock uses 0.10 in light and this sits beside it.
        boxShadow: `0 8px 30px ${alpha('#000', isDark ? 0.35 : 0.1)}`,
        overflow: 'hidden',
      }}
    >
      {/* Header row (collapsed summary) */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.5, py: 0.75, cursor: 'pointer' }}
        onClick={() => setView(expanded ? 'collapsed' : 'expanded')}
      >
        <StatusDot severity={summary.worst} />
        <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          AxWise
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {latest
            ? `· ${scope === 'goal' ? 'current goal · ' : ''}${latest.where} · ${latest.severity}${
                latest.durationMs != null ? ` · ${latest.durationMs}ms` : ''
              } · ${relTime(latest.when)}${
                summary.degraded > 0 ? ` · ${summary.degraded} degraded` : ''
              }${summary.blocked > 0 ? ` · ${summary.blocked} research blocked` : ''}${
                summary.diverged > 0 ? ` · ${summary.diverged} diverged` : ''
              }`
            : '· no activity yet · start a chat, goal, or board'}
        </Typography>

        <Stack direction="row" spacing={0.25} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Refresh">
            <IconButton
              size="small"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh AxWise feed"
            >
              <RefreshRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <IconButton
              size="small"
              onClick={() => setView(expanded ? 'collapsed' : 'expanded')}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? (
                <ExpandLessRoundedIcon fontSize="small" />
              ) : (
                <ExpandMoreRoundedIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Minimize">
            <IconButton
              size="small"
              onClick={() => setView('minimized')}
              aria-label="Minimize AxWise status bar"
            >
              <RemoveRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Expanded event list */}
      {expanded && (
        <Box
          sx={{
            maxHeight: 440,
            overflowY: 'auto',
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          }}
        >
          {events.length === 0 ? (
            <Typography
              variant="caption"
              sx={{ display: 'block', px: 1.5, py: 1.5, color: 'text.secondary' }}
            >
              No AxWise activity yet. Create a board, generate an agent, or chat with the assistant.
            </Typography>
          ) : (
            events.map((e) => {
              const isAxwise = e.kind === 'axwise';
              const isOpen = expandedId === e.id;
              return (
                <Box key={e.id}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    onClick={() =>
                      isAxwise ? setExpandedId(isOpen ? null : e.id) : e.href && navigate(e.href)
                    }
                    sx={{
                      px: 1.5,
                      py: 0.85,
                      cursor: 'pointer',
                      background: isOpen ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                      '&:hover': { background: alpha(theme.palette.primary.main, 0.06) },
                      borderTop: `1px solid ${alpha(theme.palette.divider, 0.35)}`,
                    }}
                  >
                    <StatusDot severity={e.severity} size={8} />
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        minWidth: 52,
                        color: 'text.secondary',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {e.kind}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {e.who}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.what}
                      {e.diverged ? ` (local: ${e.localDecision})` : ''}
                      {' · '}
                      {e.where}
                    </Typography>
                    {e.durationMs != null && (
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.disabled', whiteSpace: 'nowrap' }}
                      >
                        {e.durationMs}ms
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.disabled',
                        whiteSpace: 'nowrap',
                        minWidth: 26,
                        textAlign: 'right',
                      }}
                    >
                      {relTime(e.when)}
                    </Typography>
                  </Stack>
                  {isOpen && isAxwise && <AxwiseCallDetail event={e} />}
                </Box>
              );
            })
          )}
        </Box>
      )}
    </Box>
  );
}
