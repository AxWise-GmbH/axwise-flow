import { Box, Typography, alpha, useTheme } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import GlassIcon from '../../icons/GlassIcon';
import GoalRunActions from './GoalRunActions';
import GoalRunResult from './GoalRunResult';
import ThreadMessage, { ThreadBubble } from './ThreadMessage';
import { THREAD_GLYPH } from './threadIcons';
import { THREAD_RADIUS, THREAD_TYPE, threadClock } from './threadTokens';

/** A stage transition: a marker, a headline, and what it means. */
export function RunEvent({ message, goal = null, onReviewContext = null }) {
  const theme = useTheme();
  // Two different questions. The marker moves whenever this message is what is
  // happening now; the title only switches to the present tense where the copy
  // has a present tense to switch to. Tying both to `running` left every gate
  // - the rows that most need to look alive - perfectly still.
  const live = Boolean(message.live);
  return (
    <ThreadMessage
      tone={message.tone}
      live={live}
      title={live && message.running ? message.running : message.title}
      badge={message.badge}
      at={message.at}
      detail={message.detail}
      // A blocked state is the same message with its controls in the action
      // slot, rather than a different kind of card.
      card={Boolean(message.blocked)}
      glyph={message.glyph || null}
      actions={
        message.actions?.length > 0 ? (
          <GoalRunActions actions={message.actions} goal={goal} onReviewContext={onReviewContext} />
        ) : null
      }
    >
      {message.link && (
        <Box
          component="a"
          href={message.link}
          target={String(message.link).startsWith('/') ? '_self' : '_blank'}
          rel={String(message.link).startsWith('/') ? undefined : 'noopener noreferrer'}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 0.75,
            px: 1,
            py: 0.35,
            borderRadius: THREAD_RADIUS.pill,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.28),
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            color: 'primary.main',
            fontSize: '0.68rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <GlassIcon name="OpenInNew" fallback={OpenInNewIcon} size={12} />
          {message.linkLabel || String(message.link).replace(/^https?:\/\//, '')}
        </Box>
      )}
    </ThreadMessage>
  );
}

/** What an agent or the team lead said, as a bubble rather than a log line. */
export function RunChat({ message }) {
  return (
    <ThreadBubble who={`${message.who} · ${threadClock(message.at)}`}>
      <Box
        component="span"
        sx={
          message.messageType === 'instruction'
            ? { fontFamily: 'ui-monospace, monospace', fontSize: '0.74rem' }
            : { fontSize: THREAD_TYPE.detail }
        }
      >
        {message.text}
      </Box>
    </ThreadBubble>
  );
}

/**
 * A phase, with its work nested underneath on a hairline rail.
 *
 * Execution phases can carry a dozen tasks. Indenting them keeps a busy phase
 * from flooding the thread and makes the run readable at a glance.
 */
export function RunPhase({ message }) {
  const theme = useTheme();
  const tasks = message.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <ThreadMessage
      tone="accent"
      // The phase is the work. While any of its tasks is still running this is
      // the row the user is watching, and it used to be the one row that never
      // moved - the marker sat on whichever stage line happened to come before.
      live={Boolean(message.live)}
      title={message.label}
      at={message.at}
      glyph={THREAD_GLYPH.work}
      titleAdornment={
        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem' }}>
          {message.total
            ? `Phase ${message.phaseIndex + 1} of ${message.total}`
            : `Phase ${message.phaseIndex + 1}`}
          {tasks.length ? ` · ${done} of ${tasks.length} done` : ''}
        </Typography>
      }
    >
      {tasks.length > 0 && (
        <Box
          sx={{
            mt: 1,
            pl: 1.5,
            borderLeft: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
          }}
        >
          {tasks.map((task) => {
            const isDone = task.status === 'done';
            const isFailed = task.status === 'failed';
            const running = task.status === 'inProgress';
            return (
              <Box key={task.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: isDone
                      ? 'primary.main'
                      : isFailed
                        ? 'error.main'
                        : running
                          ? 'warning.main'
                          : alpha(theme.palette.text.primary, 0.18),
                    ...(running
                      ? {
                          animation: 'runTask 1.4s ease-in-out infinite',
                          '@keyframes runTask': {
                            '0%, 100%': { opacity: 0.35 },
                            '50%': { opacity: 1 },
                          },
                          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                        }
                      : {}),
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '0.73rem',
                    color: isDone || running ? 'text.primary' : 'text.disabled',
                  }}
                  noWrap
                >
                  {task.title}
                </Typography>
                {task.assigned_to && (
                  <Typography
                    variant="caption"
                    sx={{ flexShrink: 0, fontSize: '0.62rem', color: 'text.disabled' }}
                  >
                    {task.assigned_to}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </ThreadMessage>
  );
}

/** Dispatch one run message to its shape. */
export default function GoalRunMessage({
  message,
  goal = null,
  onOpenDetails = null,
  onReviewContext = null,
}) {
  if (message.kind === 'chat') return <RunChat message={message} />;
  if (message.kind === 'phase') return <RunPhase message={message} />;
  if (message.kind === 'result')
    return <GoalRunResult message={message} goal={goal} onOpenDetails={onOpenDetails} />;
  return <RunEvent message={message} goal={goal} onReviewContext={onReviewContext} />;
}
