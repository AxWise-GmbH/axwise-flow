import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Collapse,
  useTheme,
  alpha,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Paper,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GavelIcon from '@mui/icons-material/Gavel';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { getPhaseOutputs } from '../../services/goalService';
import GlassIcon from '../icons/GlassIcon';

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Rich event descriptions with expandable details
function getEventContent(entry) {
  const d = entry.details || {};
  const type = entry.event_type;

  switch (type) {
    case 'goal_created':
      return {
        title: 'Goal Created',
        detail: `Budget: $${d.budget_usd || 0}`,
        icon: 'info',
        color: 'info',
      };

    case 'feasibility_done':
      return {
        title: 'Feasibility Analysis Complete',
        detail: `Complexity: ${((d.complexity_score || 0) * 100).toFixed(0)}% | Success probability: ${((d.success_probability || 0) * 100).toFixed(0)}%`,
        badge: d.recommendation,
        badgeColor: d.recommendation === 'proceed' ? 'success' : 'warning',
        icon: 'check',
        color: 'success',
      };

    case 'po_validated':
      return {
        title: 'PO Analysis Complete',
        detail: [
          `Depth: ${d.depth || 'summary'}`,
          `Acceptance criteria: ${d.acceptance_tests_count || 0} tests`,
          d.capabilities?.length ? `Required roles: ${d.capabilities.join(', ')}` : null,
          d.tools?.length ? `Required tools: ${d.tools.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        icon: 'check',
        color: 'success',
        expandable: true,
        links: [{ label: 'Knowledge Base', href: '/knowledge-base' }],
      };

    case 'plan_created':
      return {
        title: 'PM Plan Created',
        detail: [
          `Strategy: ${d.strategy || 'N/A'}`,
          `${d.phaseCount || 0} phases, ${d.jobCount || 0} tasks`,
          d.confidenceScore ? `Confidence: ${d.confidenceScore}%` : null,
          d.estimatedHours ? `Estimated: ${d.estimatedHours}h` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        icon: 'check',
        color: 'success',
        expandable: true,
        links: [
          { label: `${d.jobCount || 0} Tasks`, href: '/task-manager' },
          d.workflowId ? { label: 'Workflow', href: '/workflow' } : null,
          d.projectId ? { label: 'Project', href: '/projects' } : null,
        ].filter(Boolean),
      };

    case 'team_approved':
      return {
        title: d.consilium_reviewed
          ? 'Team Approved by Consilium'
          : `Team Formed (${d.member_count || d.members?.length || 0} agents)`,
        detail: d.members?.length
          ? [
              d.leader ? `Team Lead: ${d.leader}` : null,
              d.required_roles?.length ? `Required roles: ${d.required_roles.join(', ')}` : null,
              '',
              ...d.members.map((m) =>
                [
                  `${m.name} (${m.type || 'agent'})`,
                  m.description ? `  ${m.description}` : null,
                  m.tasks_completed > 0
                    ? `  Track record: ${m.tasks_completed} done, ${m.tasks_failed || 0} failed, quality ${m.avg_quality || 0}/100`
                    : '  Track record: new agent',
                ]
                  .filter(Boolean)
                  .join('\n')
              ),
            ]
              .filter(Boolean)
              .join('\n')
          : 'No dedicated agents assigned — using default pool',
        icon: 'check',
        color: 'success',
        expandable: true,
      };

    case 'awaiting_tools':
      return {
        title: 'Waiting for Tool API Keys',
        detail: d.unconfigured?.length
          ? `Missing: ${d.unconfigured.join(', ')}`
          : `${d.required?.length || 0} tools required`,
        icon: 'warning',
        color: 'warning',
        expandable: true,
        links: [{ label: 'Tools', href: '/tools' }],
      };

    case 'tools_provided':
      return {
        title: 'Tools Configured',
        detail: d.stillUnconfigured?.length
          ? `${d.stillUnconfigured.length} still missing (skipped)`
          : 'All tools ready',
        icon: 'check',
        color: 'success',
      };

    case 'phase_started':
      return {
        title: `Phase ${(d.phaseIndex || 0) + 1} Started: ${d.phaseName || ''}`,
        detail: `${d.jobCount || 0} tasks assigned`,
        icon: 'info',
        color: 'info',
        links: [
          { label: `${d.jobCount || 0} Tasks`, href: '/task-manager' },
          { label: 'Workflow', href: '/workflow' },
        ],
      };

    case 'phase_evaluated':
      return {
        title: `Phase ${(d.phaseIndex || 0) + 1} Evaluated`,
        detail: [
          `Quality: ${d.quality_score || 0}/100 — ${d.passed ? 'PASSED' : 'FAILED'}`,
          d.feedback ? `Feedback: ${d.feedback}` : null,
          d.cost ? `Cost: $${Number(d.cost).toFixed(4)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        badge: d.passed ? 'Passed' : 'Failed',
        badgeColor: d.passed ? 'success' : 'error',
        icon: d.passed ? 'check' : 'error',
        color: d.passed ? 'success' : 'error',
        expandable: true,
        actions: [
          {
            kind: 'view-phase-output',
            label: d.passed ? 'Review output' : 'Review failed attempt',
            phaseIndex: typeof d.phaseIndex === 'number' ? d.phaseIndex : 0,
          },
        ],
      };

    case 'iteration_started':
      return {
        title: `Re-planning (Iteration ${d.iteration || '?'})`,
        detail: d.feedback
          ? `Reason: ${d.feedback}`
          : d.newStrategy
            ? `New strategy: ${d.newStrategy}`
            : '',
        icon: 'warning',
        color: 'warning',
      };

    case 'goal_completed':
      return {
        title: 'Goal Completed!',
        detail: `Total cost: $${Number(d.totalCost || 0).toFixed(2)} | ${d.phases || 0} phases | ${d.iterations || 0} iterations`,
        icon: 'check',
        color: 'success',
      };

    case 'goal_failed':
      return { title: 'Goal Failed', detail: d.reason || '', icon: 'error', color: 'error' };

    case 'budget_warning':
      return {
        title: 'Budget Warning',
        detail: d.reason || 'Approaching budget limit',
        icon: 'warning',
        color: 'warning',
      };

    case 'budget_exhausted':
      return { title: 'Budget Exhausted', detail: d.reason || '', icon: 'error', color: 'error' };

    case 'consilium_reviewed':
      return {
        title: 'Consilium Reviewed Phase',
        detail: `Quality: ${d.quality_score || 0}/100 | Risk: ${d.risk_level || 'N/A'} | Members: ${d.member_count || 0}`,
        icon: 'info',
        color: 'info',
      };

    case 'agent_warning':
      return {
        title: `Agent Warning: ${d.agent_name || ''}`,
        detail: `Task: ${d.task_title || ''} | Failures: ${d.failure_count || 0}`,
        icon: 'warning',
        color: 'warning',
      };

    case 'proposal_ready':
      return {
        title: 'Proposal Ready for Review',
        detail: `Est. cost: $${Number(d.estimated_cost || 0).toFixed(2)} | Est. time: ${d.estimated_time || '?'}min`,
        icon: 'info',
        color: 'info',
      };

    case 'budget_request_created':
      return {
        title: `Budget Request: $${Number(d.amount || 0).toFixed(2)}`,
        detail: `${d.purpose || ''}${d.agent_name ? ` — by ${d.agent_name}` : ''}`,
        icon: 'warning',
        color: 'warning',
      };

    case 'budget_request_approved':
      return {
        title: `Budget Approved: $${Number(d.amount || 0).toFixed(2)}`,
        detail: `${d.purpose || ''}${d.notes ? ` — ${d.notes}` : ''}`,
        icon: 'check',
        color: 'success',
      };

    case 'budget_request_rejected':
      return {
        title: `Budget Rejected: $${Number(d.amount || 0).toFixed(2)}`,
        detail: `${d.purpose || ''}${d.notes ? ` — ${d.notes}` : ''}`,
        icon: 'error',
        color: 'error',
      };

    default:
      return {
        title: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        detail: d.feedback || d.reason || '',
        icon: 'info',
        color: 'default',
      };
  }
}

const ICON_NAME_MAP = {
  info: 'Info',
  check: 'CheckCircleOutline',
  warning: 'Info',
  error: 'ErrorOutline',
  agent: 'SmartToy',
  decision: 'AssignmentOutlined',
};

const ICON_TONE_MAP = {
  info: 'info',
  check: 'success',
  warning: 'warning',
  error: 'error',
  agent: 'brand',
  decision: 'brand',
};

const COLOR_MAP = {
  info: 'info.main',
  success: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
  default: 'text.secondary',
};

function EventCard({ content, time, cost, theme, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const iconName = ICON_NAME_MAP[content.icon] || 'Info';
  const iconTone = ICON_TONE_MAP[content.icon] || 'neutral';
  const color = COLOR_MAP[content.color] || 'text.secondary';
  const hasDetail = content.detail && content.detail.length > 0;
  const isExpandable = content.expandable && hasDetail;

  return (
    <Box
      onClick={isExpandable ? () => setExpanded(!expanded) : undefined}
      sx={{
        p: 1.25,
        mb: 0.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(
          theme.palette[content.color === 'default' ? 'action' : content.color]?.main ||
            theme.palette.divider,
          0.15
        ),
        bgcolor: alpha(
          theme.palette[content.color === 'default' ? 'action' : content.color]?.main ||
            theme.palette.action.hover,
          0.04
        ),
        cursor: isExpandable ? 'pointer' : 'default',
        transition: 'background 0.2s',
        '&:hover': isExpandable
          ? {
              bgcolor: alpha(
                theme.palette[content.color]?.main || theme.palette.action.hover,
                0.08
              ),
            }
          : {},
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <GlassIcon name={iconName} size={16} tone={iconTone} />
        <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.72rem', color, flex: 1 }}>
          {content.title}
        </Typography>
        {content.badge && (
          <Chip
            label={content.badge}
            size="small"
            color={content.badgeColor || 'default'}
            sx={{ fontSize: '0.55rem', height: 18 }}
          />
        )}
        {cost > 0 && (
          <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
            ${Number(cost).toFixed(4)}
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ fontSize: '0.55rem', color: 'text.disabled', flexShrink: 0 }}
        >
          {time}
        </Typography>
        {isExpandable &&
          (expanded ? (
            <GlassIcon
              name="ExpandMore"
              size={14}
              tone="neutral"
              sx={{ transform: 'rotate(180deg)' }}
            />
          ) : (
            <GlassIcon name="ExpandMore" size={14} tone="neutral" />
          ))}
      </Box>

      {/* Always show first line of detail */}
      {hasDetail && !isExpandable && (
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            color: 'text.secondary',
            display: 'block',
            mt: 0.5,
            pl: 2.75,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.4,
          }}
        >
          {content.detail}
        </Typography>
      )}

      {/* Expandable detail */}
      {isExpandable && (
        <>
          {!expanded && (
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.65rem',
                color: 'text.secondary',
                display: 'block',
                mt: 0.5,
                pl: 2.75,
              }}
              noWrap
            >
              {content.detail.split('\n')[0]}
            </Typography>
          )}
          <Collapse in={expanded}>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.65rem',
                color: 'text.secondary',
                display: 'block',
                mt: 0.5,
                pl: 2.75,
                whiteSpace: 'pre-wrap',
                lineHeight: 1.5,
              }}
            >
              {content.detail}
            </Typography>
          </Collapse>
        </>
      )}

      {/* Links */}
      {content.links?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75, pl: 2.75 }}>
          {content.links.map((link) => (
            <Chip
              key={link.label}
              label={link.label}
              size="small"
              variant="outlined"
              color="info"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = link.href;
              }}
              sx={{ fontSize: '0.55rem', height: 20, cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {/* Actions — prominent buttons (e.g. "Review failed attempt") */}
      {content.actions?.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1, pl: 2.75 }}>
          {content.actions.map((action) => (
            <Button
              key={action.label}
              size="small"
              variant={content.color === 'error' ? 'contained' : 'outlined'}
              color={content.color === 'error' ? 'error' : 'primary'}
              startIcon={<GlassIcon name="VisibilityOutlined" size={16} tone="neutral" />}
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(action);
              }}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                borderRadius: 2,
                px: 1.25,
                py: 0.25,
                minHeight: 28,
              }}
            >
              {action.label}
            </Button>
          ))}
        </Box>
      )}
    </Box>
  );
}

function MessageBubble({ sender, message, type, time, theme }) {
  const isSystem = type === 'system';
  const color =
    type === 'instruction'
      ? 'info'
      : type === 'report'
        ? 'success'
        : type === 'alert'
          ? 'warning'
          : type === 'feedback'
            ? 'secondary'
            : 'action';
  const iconName =
    type === 'instruction'
      ? 'AssignmentOutlined'
      : type === 'report'
        ? 'SmartToy'
        : type === 'alert'
          ? 'Info'
          : 'SpeechBubble';
  const iconTone =
    type === 'instruction'
      ? 'info'
      : type === 'report'
        ? 'success'
        : type === 'alert'
          ? 'warning'
          : 'neutral';

  if (isSystem) return null; // System events handled as EventCards

  return (
    <Box sx={{ display: 'flex', gap: 0.75, mb: 0.75, alignItems: 'flex-start' }}>
      <GlassIcon name={iconName} size={16} tone={iconTone} sx={{ mt: 0.25, flexShrink: 0 }} />
      <Box
        sx={{
          flex: 1,
          p: 1,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette[color]?.main || theme.palette.action.hover, 0.06),
          border: '1px solid',
          borderColor: alpha(theme.palette[color]?.main || theme.palette.divider, 0.12),
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, fontSize: '0.62rem', color: `${color}.main` }}
          >
            {sender}
          </Typography>
          {time && (
            <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.disabled' }}>
              {time}
            </Typography>
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.68rem',
            color: 'text.secondary',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {message}
        </Typography>
      </Box>
    </Box>
  );
}

const FEED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'errors', label: 'Errors' },
  { id: 'phases', label: 'Phases' },
  { id: 'agents', label: 'Agents' },
  { id: 'budget', label: 'Budget' },
];

function matchesFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'errors') {
    if (item.type === 'event') return item.content?.severity === 'error';
    return false;
  }
  if (filter === 'phases') {
    if (item.type === 'event') {
      const et = item.eventType || '';
      return (
        et.includes('phase') ||
        et.includes('iteration') ||
        et.includes('goal_completed') ||
        et.includes('goal_failed')
      );
    }
    return false;
  }
  if (filter === 'agents') {
    return (
      item.type === 'message' || (item.type === 'event' && (item.eventType || '').includes('agent'))
    );
  }
  if (filter === 'budget') {
    if (item.type === 'event') return (item.eventType || '').includes('budget');
    return false;
  }
  return true;
}

export default function GoalChatFeed({
  logs = [],
  messages = [],
  maxHeight = null,
  compact = false,
  goalId = null,
}) {
  const theme = useTheme();
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [viewPhase, setViewPhase] = useState(null);
  const [phaseDocs, setPhaseDocs] = useState([]);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [phaseError, setPhaseError] = useState('');

  useEffect(() => {
    if (viewPhase === null || !goalId) return;
    let cancelled = false;
    setPhaseLoading(true);
    setPhaseError('');
    setPhaseDocs([]);
    getPhaseOutputs(goalId, viewPhase)
      .then((data) => {
        if (cancelled) return;
        const docs = Array.isArray(data) ? data : data?.documents || data?.outputs || [];
        setPhaseDocs(docs);
      })
      .catch((err) => {
        if (!cancelled) setPhaseError(err.message || 'Failed to load output');
      })
      .finally(() => {
        if (!cancelled) setPhaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewPhase, goalId]);

  const handleAction = (action) => {
    if (action?.kind === 'view-phase-output' && typeof action.phaseIndex === 'number') {
      setViewPhase(action.phaseIndex);
    }
  };

  // Build feed: event cards from logs + message bubbles from messages
  const feed = [];

  for (const log of logs) {
    const content = getEventContent(log);
    feed.push({
      id: log.id || `log-${log.created_at}`,
      time: log.created_at,
      type: 'event',
      eventType: log.event_type,
      content,
      cost: log.cost_usd,
    });
  }

  for (const msg of messages) {
    feed.push({
      id: msg.id,
      time: msg.created_at,
      type: 'message',
      sender: msg.sender_name || 'Agent',
      message: msg.message,
      messageType: msg.message_type || 'text',
    });
  }

  feed.sort((a, b) => new Date(a.time) - new Date(b.time));
  const filtered = feed.filter((item) => matchesFilter(item, filter));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [filtered.length]);

  if (feed.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <GlassIcon name="SpeechBubble" size={28} tone="neutral" sx={{ mb: 0.5, opacity: 0.5 }} />
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', display: 'block', fontSize: '0.68rem' }}
        >
          No activity yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter chips */}
      {!compact && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.5,
            px: 1.5,
            py: 1,
            overflowX: 'auto',
            flexShrink: 0,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {FEED_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              size="small"
              onClick={() => setFilter(f.id)}
              color={filter === f.id ? 'primary' : 'default'}
              variant={filter === f.id ? 'filled' : 'outlined'}
              sx={{ fontSize: '0.6rem', height: 22, fontWeight: 600, flexShrink: 0 }}
            />
          ))}
        </Box>
      )}

      {/* Feed */}
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          maxHeight: maxHeight || 'none',
          overflow: 'auto',
          px: compact ? 0 : 0.5,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 2 },
        }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              No {filter} events
            </Typography>
          </Box>
        ) : (
          filtered.map((item) =>
            item.type === 'event' ? (
              <EventCard
                key={item.id}
                content={item.content}
                time={timeAgo(item.time)}
                cost={item.cost}
                theme={theme}
                onAction={handleAction}
              />
            ) : (
              <MessageBubble
                key={item.id}
                sender={item.sender}
                message={item.message}
                type={item.messageType}
                time={timeAgo(item.time)}
                theme={theme}
              />
            )
          )
        )}
      </Box>

      {/* Phase output viewer */}
      <Dialog
        open={viewPhase !== null}
        onClose={() => setViewPhase(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: '0.95rem' }}>
          Phase {(viewPhase ?? 0) + 1} — Output
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: '70vh' }}>
          {phaseLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!phaseLoading && phaseError && (
            <Typography variant="caption" sx={{ color: 'error.main', fontSize: '0.78rem' }}>
              {phaseError}
            </Typography>
          )}
          {!phaseLoading && !phaseError && phaseDocs.length === 0 && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
              No saved output for this phase yet.
            </Typography>
          )}
          {!phaseLoading &&
            phaseDocs.map((doc) => (
              <Paper key={doc.id} variant="outlined" sx={{ p: 1.5, mb: 1.5, borderRadius: 2 }}>
                {doc.title && (
                  <Typography
                    variant="caption"
                    sx={{ fontWeight: 700, fontSize: '0.75rem', display: 'block', mb: 0.5 }}
                  >
                    {doc.title}
                  </Typography>
                )}
                <Typography
                  component="pre"
                  sx={{
                    fontSize: '0.72rem',
                    color: 'text.secondary',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'inherit',
                    m: 0,
                  }}
                >
                  {doc.content || ''}
                </Typography>
              </Paper>
            ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewPhase(null)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
