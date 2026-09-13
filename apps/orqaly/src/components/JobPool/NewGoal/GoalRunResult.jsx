/**
 * [module: frontend]
 * What the run produced, at the end of the thread it was asked for in.
 *
 * The stage log ended on "Done" and a figure. That is the run reporting on
 * itself; it never said what came out, so a goal reopened from History read as
 * a list of things that happened to someone else. This is the message the
 * person who typed the sentence came back for: what it is, the files, what the
 * team lead thought, and one way through to everything else.
 *
 * The files are FinalResultsSection - the same component the detail popup uses
 * - rather than a thread-native list. Two result surfaces drift; one does not.
 */
import { Box, Button, Typography, alpha, useTheme } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import GlassIcon from '../../icons/GlassIcon';
import ThreadMessage from './ThreadMessage';
import { THREAD_RADIUS, THREAD_TYPE } from './threadTokens';
import FinalResultsSection from '../../Goals/FinalResultsSection';
import { useDeliverableViewer } from '../../Goals/deliverables/deliverableViewerContext';
import { VIEW_FORMAT } from '../../Goals/deliverables/deliverableFormats';

/** Past this many rows the card stops being a card and becomes a list. */
const MAX_FALLBACK_ROWS = 6;

/** A pill that leaves the app, shaped like the one a stage line already draws. */
function ThreadLink({ href, children }) {
  const theme = useTheme();
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
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
      {children}
    </Box>
  );
}

/**
 * The files, when the extractors could not find any.
 *
 * Not a nicety. useGoalRealtime and the detail popup look for a goal's tasks
 * differently, so the thread can legitimately hold zero tasks where the popup
 * holds several - and then FinalResultsSection has nothing to work from.
 * goal.data.deliverables always rides the goal row, so this always can.
 */
export function ThreadDeliverableFiles({ deliverables = [], liveUrl = null }) {
  const theme = useTheme();
  // Null wherever no viewer is mounted, and then no View button is offered - a
  // button that opens nothing is worse than no button.
  const viewer = useDeliverableViewer();
  const shown = deliverables.slice(0, MAX_FALLBACK_ROWS);
  const rest = deliverables.length - shown.length;

  if (!liveUrl && shown.length === 0) return null;

  return (
    <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography
        variant="caption"
        sx={{
          fontSize: THREAD_TYPE.label,
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'text.disabled',
        }}
      >
        Files
      </Typography>

      {liveUrl && (
        <Box>
          <ThreadLink href={liveUrl}>Open the live site</ThreadLink>
        </Box>
      )}

      {shown.map((d, i) => (
        <Box
          key={d.id || `${d.title}-${i}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.85,
            minWidth: 0,
            borderRadius: THREAD_RADIUS.inner,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.18),
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <GlassIcon name="Description" fallback={DescriptionOutlinedIcon} size={16} tone="brand" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{ fontSize: THREAD_TYPE.title, fontWeight: 600, lineHeight: 1.35 }}
              noWrap
            >
              {d.title}
            </Typography>
            {(d.categoryLabel || d.agent_name) && (
              <Typography
                sx={{ fontSize: THREAD_TYPE.label, color: 'text.disabled', lineHeight: 1.5 }}
                noWrap
              >
                {[d.categoryLabel, d.agent_name].filter(Boolean).join(' · ')}
              </Typography>
            )}
          </Box>
          {viewer && d.output && (
            <Button
              size="small"
              startIcon={<GlassIcon name="Visibility" fallback={VisibilityIcon} size={14} />}
              onClick={() =>
                viewer.view({ title: d.title, format: VIEW_FORMAT.markdown, text: d.output })
              }
              sx={{
                flexShrink: 0,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.7rem',
                borderRadius: 2,
                minWidth: 0,
              }}
            >
              View
            </Button>
          )}
          {d.primary_url && (
            <Button
              size="small"
              href={d.primary_url}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<GlassIcon name="OpenInNew" fallback={OpenInNewIcon} size={14} />}
              sx={{
                flexShrink: 0,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.7rem',
                borderRadius: 2,
                minWidth: 0,
              }}
            >
              Open
            </Button>
          )}
        </Box>
      ))}

      {rest > 0 && (
        <Typography sx={{ fontSize: THREAD_TYPE.label, color: 'text.disabled' }}>
          {`and ${rest} more, in the details.`}
        </Typography>
      )}
    </Box>
  );
}

/** Rex signing off. The one part of the result written by a person's voice. */
function LeadNote({ note }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        mt: 1.5,
        pl: 1.5,
        py: 1,
        borderLeft: '3px solid',
        borderColor: 'primary.main',
        borderTopRightRadius: THREAD_RADIUS.inner,
        borderBottomRightRadius: THREAD_RADIUS.inner,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          fontSize: THREAD_TYPE.label,
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'text.disabled',
        }}
      >
        Team lead note - Rex
      </Typography>
      <Typography
        sx={{
          mt: 0.35,
          fontSize: THREAD_TYPE.detail,
          fontStyle: 'italic',
          lineHeight: 1.6,
          color: 'text.secondary',
          whiteSpace: 'pre-wrap',
        }}
      >
        {note}
      </Typography>
    </Box>
  );
}

export default function GoalRunResult({ message, goal = null, onOpenDetails = null }) {
  const qualityParts = message.quality
    ? [
        Number.isFinite(message.quality.sectionCount)
          ? `${message.quality.sectionCount} sections`
          : null,
        Number.isFinite(message.quality.requirementCount)
          ? `${message.quality.requirementCount} requirements`
          : null,
        Number.isFinite(message.quality.linkedTestCount)
          ? `${message.quality.linkedTestCount} linked tests`
          : null,
        Number.isFinite(message.quality.openDecisionCount)
          ? `${message.quality.openDecisionCount} open decisions`
          : null,
        Number.isFinite(message.quality.score) ? `Quality ${message.quality.score}/100` : null,
      ].filter(Boolean)
    : [];

  return (
    <ThreadMessage
      card
      tone={message.tone || 'ok'}
      glyph={message.glyph || null}
      title={message.title}
      at={message.at}
      titleAdornment={
        onOpenDetails ? (
          <Button
            size="small"
            onClick={() => onOpenDetails(message.goalId)}
            sx={{
              flexShrink: 0,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.72rem',
              borderRadius: 2,
              minHeight: 0,
            }}
          >
            View more details
          </Button>
        ) : null
      }
    >
      {/* The pitch, then the paragraph. Not in ThreadMessage's `detail` slot:
          that renders above everything else and would put the long form over
          the short one. */}
      {message.headline && (
        <Typography
          sx={{
            mt: 0.5,
            fontSize: THREAD_TYPE.body,
            fontWeight: 650,
            lineHeight: 1.45,
            color: 'text.primary',
          }}
        >
          {message.headline}
        </Typography>
      )}
      {message.summary && (
        <Typography
          sx={{
            mt: message.headline ? 0.75 : 0.5,
            fontSize: THREAD_TYPE.detail,
            lineHeight: 1.6,
            color: 'text.secondary',
          }}
        >
          {message.summary}
        </Typography>
      )}

      {qualityParts.length > 0 && (
        <Typography
          aria-label="Quality attestation summary"
          sx={{
            mt: 0.65,
            fontSize: THREAD_TYPE.detail,
            lineHeight: 1.55,
            color: 'text.secondary',
          }}
        >
          {qualityParts.join(' · ')}
        </Typography>
      )}

      {/* `:empty` because both the section and its fallback can render
          nothing, and a card with only a summary should not carry 12px
          of dead space where the files would have been. */}
      <Box sx={{ mt: 1.5, '&:empty': { display: 'none' } }}>
        <FinalResultsSection
          tasks={message.tasks}
          goalId={message.goalId}
          goal={goal}
          dense
          fallback={
            <ThreadDeliverableFiles deliverables={message.deliverables} liveUrl={message.liveUrl} />
          }
        />
      </Box>

      {message.leadNote && <LeadNote note={message.leadNote} />}
    </ThreadMessage>
  );
}
