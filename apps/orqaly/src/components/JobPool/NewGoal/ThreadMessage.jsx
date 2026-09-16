import { Box, Chip, Typography, alpha, useTheme } from '@mui/material';
import MessageMeta from '../../Common/MessageMeta';
import { threadGlyphSpins, threadToneGlyph } from './threadIcons';
import {
  THREAD_BUBBLE_RADIUS_PX,
  THREAD_BUBBLE_TAIL_PX,
  THREAD_RADIUS,
  THREAD_TYPE,
  threadMarkerMotion,
  threadToneColor,
  threadClock,
} from './threadTokens';

/**
 * One shape for everything the thread says.
 *
 * Seven renderers had grown twelve independent style declarations - three
 * radius scales, four ways of writing a caption, two different greys for the
 * same secondary text. Read top to bottom that drift is what made a finished
 * feature feel unfinished.
 *
 * The slots are fixed, and a message uses the ones it has:
 *
 *   [marker]  title                    badge     time
 *             detail
 *             [meta]
 *             [children]
 *             [actions]
 *
 * A stage line is marker + title + detail. The brief is title + a fact grid in
 * meta. A blocked state is the same object with buttons in actions. Nothing
 * below this line sets its own radius, tone or spacing.
 */

/** A labelled fact. Four of these are the brief's grid; two are a phase's. */
export function ThreadFacts({ facts, columns = 4 }) {
  if (!facts?.length) return null;
  return (
    <Box
      sx={{
        mt: 1.25,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0,1fr))',
          sm: `repeat(${columns}, minmax(0,1fr))`,
        },
        gap: 1,
      }}
    >
      {facts.map((fact) => (
        <Box
          key={fact.label}
          sx={{
            borderRadius: THREAD_RADIUS.inner,
            border: '1px solid',
            borderColor: 'divider',
            px: 1.25,
            py: 1,
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
            {fact.label}
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: THREAD_TYPE.title, fontWeight: 600 }}>
            {fact.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * A conversational turn. The only message shape that is not a line or a card,
 * because a quoted sentence is not a stage report.
 */
export function ThreadBubble({
  children,
  mine = false,
  who = null,
  enter = false,
  // What the copy button puts on the clipboard, and when it was said. Passed
  // rather than read off `children` because a turn can carry action chips and
  // markup around the sentence someone actually typed.
  copyText = '',
  at = null,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        // The sent message rises into the thread as the composer empties, so
        // the send reads as one movement rather than text vanishing.
        ...(enter
          ? {
              animation: 'threadSend .34s cubic-bezier(0.22, 1, 0.36, 1) both',
              '@keyframes threadSend': {
                from: { opacity: 0, transform: 'translateY(14px) scale(0.985)' },
                to: { opacity: 1, transform: 'none' },
              },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }
          : {}),
      }}
    >
      <Box sx={{ maxWidth: { xs: '88%', sm: '62ch' }, minWidth: 0 }}>
        {who && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.35,
              fontSize: THREAD_TYPE.label,
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'text.disabled',
            }}
          >
            {who}
          </Typography>
        )}
        <Box
          data-testid="thread-bubble"
          sx={{
            width: 'fit-content',
            px: 1.75,
            py: 1.25,
            // px throughout, deliberately: MUI theme-scales the `borderRadius`
            // shorthand and not the per-corner properties, so mixing the two
            // units is what flattened the bottom of every bubble.
            borderRadius: `${THREAD_BUBBLE_RADIUS_PX}px`,
            // The tail points at the sender: bottom-right for the user,
            // bottom-left for the assistant and the team lead.
            borderBottomRightRadius: mine
              ? `${THREAD_BUBBLE_TAIL_PX}px`
              : `${THREAD_BUBBLE_RADIUS_PX}px`,
            borderBottomLeftRadius: mine
              ? `${THREAD_BUBBLE_RADIUS_PX}px`
              : `${THREAD_BUBBLE_TAIL_PX}px`,
            fontSize: THREAD_TYPE.body,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            // The user's own words are the brand voice; everything said back is
            // a neutral surface. In dark mode that is a tint and a hairline
            // rather than a solid fill - a saturated block of green behind two
            // words reads as a status badge, not as something someone said.
            bgcolor: mine
              ? isDark
                ? alpha(theme.palette.primary.main, 0.1)
                : theme.palette.primary.main
              : isDark
                ? alpha('#fff', 0.045)
                : alpha(theme.palette.text.primary, 0.03),
            color: mine && !isDark ? theme.palette.primary.contrastText : 'text.primary',
            border: '1px solid',
            borderColor: mine
              ? isDark
                ? alpha(theme.palette.primary.main, 0.28)
                : 'transparent'
              : 'divider',
          }}
        >
          {children}
        </Box>
        <MessageMeta text={copyText} at={at} align={mine ? 'right' : 'left'} />
      </Box>
    </Box>
  );
}

export default function ThreadMessage({
  tone = 'info',
  title,
  badge = null,
  at = null,
  detail = null,
  meta = null,
  actions = null,
  children = null,
  // A card is a message that owns its own surface: the brief, a launch, a
  // blocked state. A line is a stage transition in the run.
  card = false,
  // This message is what is happening right now: a stage still running, a
  // phase still executing its work, or a gate holding the run open until the
  // user does something. Its marker moves; everything settled stays still.
  live = false,
  // The glyph for this message, as a component. Says what happened; `tone`
  // says how it went. A message that supplies neither falls back to its tone,
  // so a marker is never missing.
  glyph = null,
  markerSize = 19,
  titleAdornment = null,
}) {
  const theme = useTheme();
  const color = threadToneColor(theme, tone);
  // Lowercase, and rendered through Box's `component`: a capitalised local
  // holding a component reads to the compiler lint as a component defined
  // during render, which is a genuine remount hazard - just not this one.
  // The message keeps its own shape while it works. Swapping in a generic
  // spinner meant the one row you were actually watching was the one row that
  // had stopped saying what it was.
  const markerGlyph = glyph || threadToneGlyph(tone);
  const motion = threadMarkerMotion({ live, tone, spin: threadGlyphSpins(markerGlyph) });

  const body = (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      {markerGlyph && (
        <Box
          sx={{
            width: markerSize,
            height: markerSize,
            flexShrink: 0,
            mt: 0.15,
            display: 'grid',
            placeItems: 'center',
            color,
          }}
        >
          {/* The glyph alone, at the weight the outlined set draws it. The disc
              behind it was doing the opposite of its job: at 22px across, a
              tinted circle is the loudest thing on the line and the 13px mark
              inside it the quietest, so every stage looked the same and none of
              them looked like anything. */}
          <Box
            component={markerGlyph}
            aria-hidden="true"
            sx={{
              fontSize: markerSize,
              // A round shape turns; everything else breathes. Both say the
              // same thing - this one is not finished - without pretending a
              // document can rotate.
              ...motion,
            }}
          />
        </Box>
      )}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 650,
              fontSize: card ? THREAD_TYPE.title : '0.79rem',
              color: tone === 'info' || card ? 'text.primary' : color,
            }}
          >
            {title}
          </Typography>
          {badge && (
            <Chip
              label={badge}
              size="small"
              sx={{ height: 17, fontSize: '0.55rem', fontWeight: 700 }}
            />
          )}
          {titleAdornment}
          <Box sx={{ flex: 1 }} />
          {at ? (
            <Typography
              variant="caption"
              sx={{ flexShrink: 0, fontSize: '0.6rem', color: 'text.disabled' }}
            >
              {threadClock(at)}
            </Typography>
          ) : null}
        </Box>
        {detail && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.25,
              fontSize: THREAD_TYPE.detail,
              lineHeight: 1.5,
              color: 'text.secondary',
            }}
          >
            {detail}
          </Typography>
        )}
        {meta}
        {children}
        {actions}
      </Box>
    </Box>
  );

  if (!card) return body;
  return (
    <Box
      sx={{
        borderRadius: THREAD_RADIUS.card,
        border: '1px solid',
        borderColor: alpha(color, 0.26),
        bgcolor: alpha(color, 0.05),
        p: 1.75,
      }}
    >
      {body}
    </Box>
  );
}
