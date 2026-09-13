import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  useTheme,
  alpha,
  Chip,
  Link,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import PanelCard, { HOME_BLOCK_BODY_HEIGHT } from './PanelCard';
import ActivityTable from './ActivityTable';
import ChartReveal from './ChartReveal';
import AgentDetailDialog from '../../../components/AgentHub/AgentDetailDialog';

import AppIcon from '../../../components/icons/AppIcon';

/** Category → MUI chip color, keeping the 4 source labels visually distinct. */
const CATEGORY_COLOR = {
  Organization: 'secondary',
  Consilium: 'info',
  Goal: 'success',
  'Team Lead': 'warning',
};

/** Chat messages are clipped to this many characters until expanded. */
const CHAT_MAX_CHARS = 50;

/** Small filled trend used as the Activity panel header graphic. */
function MiniArea({ points = [], color }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const data = points.map((value, index) => ({ index, value: Number(value) || 0 }));
  return (
    <ChartReveal minHeight={40} sx={{ width: '100%', mb: 1 }}>
      <Box sx={{ width: '100%', height: 40 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="home-activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill="url(#home-activity-fill)"
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
    </ChartReveal>
  );
}

function ChatFeed({ messages = [], onAgentClick, onOpenCommunicator }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [expanded, setExpanded] = useState(() => new Set());

  // Keep the newest message in view WITHIN the feed only. Using the container's
  // own scrollTop (instead of scrollIntoView) avoids scrolling the whole page
  // when messages change on org-select, page load, or a live poll.
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!messages.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No live conversations yet.
      </Typography>
    );
  }

  // A long message expands in place on the first click; a second click (or a
  // single click on an already-short message) opens it on the Communicator.
  const handleClick = (m, id, isLong) => {
    if (isLong && !expanded.has(id)) {
      setExpanded((prev) => new Set(prev).add(id));
    } else {
      onOpenCommunicator(m);
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        pr: 0.5,
      }}
    >
      {messages.map((m, i) => {
        const id = m.id || i;
        const full = String(m.content || '');
        const isLong = full.length > CHAT_MAX_CHARS;
        const isExpanded = expanded.has(id);
        const display = isLong && !isExpanded ? `${full.slice(0, CHAT_MAX_CHARS)}...` : full;
        return (
          <Box
            key={id}
            onClick={() => handleClick(m, id, isLong)}
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              border: '1px solid',
              borderColor: alpha(theme.palette.primary.main, 0.12),
              cursor: 'pointer',
              transition: 'background-color 0.15s',
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1,
              }}
            >
              {m.agentId ? (
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAgentClick(m);
                  }}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    color: 'text.primary',
                    textAlign: 'left',
                  }}
                >
                  {m.sender}
                </Link>
              ) : (
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {m.sender}
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                {m.category && (
                  <Chip
                    label={m.category}
                    size="small"
                    color={CATEGORY_COLOR[m.category] || 'default'}
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }}
                  />
                )}
                <Typography variant="caption" color="text.secondary">
                  {m.time}
                </Typography>
              </Box>
            </Box>
            <Typography
              variant="body2"
              sx={{ fontSize: '0.8rem', mt: 0.25, whiteSpace: isExpanded ? 'pre-wrap' : 'normal' }}
            >
              {display}
            </Typography>
            {m.datetime && (
              <Typography
                variant="caption"
                sx={{ display: 'block', color: 'text.secondary', mt: 0.25, fontSize: '0.66rem' }}
              >
                {m.datetime}
              </Typography>
            )}
            {isExpanded && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 0.5,
                  color: 'primary.main',
                }}
              >
                <AppIcon
                  name="OpenInNewOutlined"
                  fallback={OpenInNewOutlinedIcon}
                  sx={{ fontSize: 13 }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.64rem' }}>
                  Open in Communicator
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Two-up: "Activity" (mini-area header + table) and "Communicator" (auto-scrolling
 * chat feed). Collapses to one column under md. Each chat message is clipped to
 * CHAT_MAX_CHARS; click to expand in place, click again to open on the Communicator.
 */
export default function ActivityCommsTables({
  activity = { rows: [], spark: [] },
  chat = { messages: [] },
  loading = false,
  delay = 0,
  onPersonaClick,
  onReviewMessage,
  // Which of the two panels to render. Each can be hosted as its own dashboard
  // block, so a single panel renders full width.
  panels = ['activity', 'communicator'],
}) {
  const theme = useTheme();
  const [detailAgent, setDetailAgent] = useState(null);
  // Toggle the Activity feed by who performed the operation: agents (persona is the
  // agent Name / Role) vs the human account owner (persona is the email).
  const [actorView, setActorView] = useState('agent');
  const activityRows = (activity.rows || []).filter(
    (r) => (r.personaKind === 'Agent' ? 'agent' : 'human') === actorView
  );

  const showActivity = panels.includes('activity');
  const showComms = panels.includes('communicator');
  const cols = showActivity && showComms ? '1fr 1fr' : '1fr';

  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: cols } }}>
      {showActivity && (
        <PanelCard
          title="Activity"
          subtitle="Recent operations across instruments"
          delay={delay}
          bodyHeight={HOME_BLOCK_BODY_HEIGHT}
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={actorView}
              onChange={(_e, v) => v && setActorView(v)}
              aria-label="Activity actor filter"
              sx={{
                '& .MuiToggleButton-root': {
                  px: 1.25,
                  py: 0.3,
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  lineHeight: 1.2,
                },
              }}
            >
              <ToggleButton value="agent">Agents</ToggleButton>
              <ToggleButton value="human">Human</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <MiniArea points={activity.spark} color={theme.palette.success.main} />
          <ActivityTable rows={activityRows} loading={loading} onPersonaClick={onPersonaClick} />
        </PanelCard>
      )}
      {showComms && (
        <PanelCard
          title="Communicator"
          subtitle="Live and interactive chat metrics"
          delay={delay}
          bodyHeight={HOME_BLOCK_BODY_HEIGHT}
        >
          <ChatFeed
            messages={chat.messages}
            onAgentClick={(m) => setDetailAgent({ id: m.agentId, name: m.sender })}
            onOpenCommunicator={(m) => {
              if (m.reviewHref) onReviewMessage?.(m.reviewHref);
            }}
          />
        </PanelCard>
      )}

      {detailAgent && (
        <AgentDetailDialog open agent={detailAgent} onClose={() => setDetailAgent(null)} />
      )}
    </Box>
  );
}
