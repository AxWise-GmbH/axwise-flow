/**
 * Silhouette: a browser window with a prompt typing itself into it.
 *
 * The fourteenth drawing, and the only one that is a WINDOW - every other mock
 * on this page is a bare panel, a phone, or a table. That is what earns it a
 * place in the set (see the rule in mocks/index.js): the chrome says "this is
 * the thing your customers will end up looking at", which no other picture here
 * says.
 *
 * THE ONE LOOPING ANIMATION ON THE PAGE, and the exception is deliberate.
 * `useMockPlay` states the rule it breaks: nothing on this page loops, because a
 * looping card is a thing the eye keeps returning to while trying to read the
 * paragraph beside it. There is no paragraph beside this one. It is the section,
 * with a heading above it and nothing competing for attention - the same
 * reasoning `StandartScrollOrb` uses for being the page's other exception. A
 * demo that showed one scenario and stopped would also be making a much smaller
 * claim than the product does.
 *
 * WHAT CHANGES FROM THE GREEN VERSION on `/`:
 *  - The traffic lights lose their colour. Three red/amber/green discs would be
 *    the only colour on a monochrome page, and the eye goes straight to them
 *    instead of to the prompt.
 *  - The badges lose their glass icons for the page's own empty glyph square,
 *    the mark `SuiteRow` already uses.
 *  - The "ships to" money card names no payment rail. See the note in
 *    data/agentDemoCases.js: `standartCopy.safety.test.js` bans naming one.
 *  - Every radius is a px string. `HeroAnimatedDemo` uses bare `2` and `3`,
 *    which this theme would multiply by 10.
 */
import { Box } from '@mui/material';
import useTypedDemo from '../../../hooks/useTypedDemo';
import { INK, RADII, TYPE } from '../standartTokens';
import { REDUCED_MOTION, SETTLE, STANDARD_EASE } from '../standartMotion';
import { prefersReducedMotion } from '../useAnchorNav';
import { MockText } from './mockChrome';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const DESTINATION_SLOTS = [
  { id: 'goal', title: 'Durable Goal' },
  { id: 'artifacts', title: 'Saved artifacts' },
  { id: 'result', title: 'Final output' },
];

const CASES = [
  {
    prompt: 'Compare three launch markets and recommend one',
    tint: null,
    steps: [
      { label: 'Compiling scope…', done: 'Scope ready to review' },
      { label: 'Waiting for scope approval…', done: 'Scope approved' },
      { label: 'Compiling plan…', done: 'Plan ready to review' },
      { label: 'Running approved plan…', done: 'Result ready' },
    ],
    badges: [{ label: 'Scope' }, { label: 'Plan' }, { label: 'Evidence' }],
    destinationsPlain: ['Market comparison', 'Scope · Plan · Evidence', 'Markdown brief'],
  },
  {
    prompt: 'Turn these notes into an operational plan',
    tint: null,
    steps: [
      { label: 'Compiling scope…', done: 'Boundaries recorded' },
      { label: 'Waiting for scope approval…', done: 'Scope approved' },
      { label: 'Compiling tasks…', done: 'Task plan ready' },
      { label: 'Waiting for plan approval…', done: 'Plan approved' },
      { label: 'Producing artifact…', done: 'Markdown ready' },
    ],
    badges: [{ label: 'Boundaries' }, { label: 'Tasks' }, { label: 'Artifact' }],
    destinationsPlain: ['Operational plan', 'Scope · Attempts · Approvals', 'Markdown plan'],
  },
  {
    prompt: 'Research this question and show evidence gaps',
    tint: null,
    steps: [
      { label: 'Compiling scope…', done: 'Evidence needs recorded' },
      { label: 'Waiting for approval…', done: 'Scope approved' },
      { label: 'Running research…', done: 'Research complete' },
      { label: 'Checking evidence…', done: 'Gaps made explicit' },
    ],
    badges: [{ label: 'Sources' }, { label: 'Readiness' }, { label: 'Gaps' }],
    destinationsPlain: ['Research brief', 'Sources · Evidence state', 'Markdown brief'],
  },
];

/**
 * The page's glyph: an empty rounded SQUARE, SuiteRow's exact mark.
 *
 * 6px on 26px, not RADII.chip. RADII.chip is 10px, which on a mark this small is
 * so close to a circle that the badges read as a row of unselected radio buttons
 * sitting under a list of ticked checkboxes - the one reading this drawing must
 * not invite.
 */
function Glyph({ size = 26 }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '6px',
        border: `1px solid ${INK.line}`,
      }}
    />
  );
}

/**
 * Done is a filled square, pending a hollow one. MockFirstRun's vocabulary.
 *
 * The running step gets a brighter outline and nothing else. A pulsing or
 * spinning mark was the obvious thing and it is the wrong one: the row's own
 * text already changes from "Designing screens…" to "Screens designed", so the
 * square would be a second answer to a question already answered, looping.
 */
function StepMark({ done, running }) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        flexShrink: 0,
        borderRadius: '2px',
        border: `1px solid ${done || running ? INK.bright : INK.line}`,
        bgcolor: done ? INK.bright : 'transparent',
        transition: `background-color 280ms ${SETTLE}, border-color 280ms ${SETTLE}`,
        [REDUCED_MOTION]: { transition: 'none' },
      }}
    />
  );
}

/** One "ships to" card: a slot title, and what this scenario put in it. */
function DestinationCard({ title, detail }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.75,
        borderRadius: RADII.cardSm,
        border: `1px solid ${INK.line}`,
        bgcolor: INK.card,
      }}
    >
      <Glyph />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ ...TYPE.body, fontWeight: 500, color: INK.bright, lineHeight: 1.25 }}>
          {title}
        </Box>
        <Box
          sx={{
            ...TYPE.proof,
            mt: 0.25,
            color: INK.dimmer,
            fontFamily: MONO,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {detail}
        </Box>
      </Box>
    </Box>
  );
}

export default function MockTeamBuild() {
  const reduced = prefersReducedMotion();
  const {
    current,
    typed,
    phase,
    stepsDone,
    cardsShown,
    destinationsShown,
    rowsVisible,
    hoverProps,
  } = useTypedDemo(CASES, { reducedMotion: reduced });

  return (
    // A picture, like every other mockup here: no focusable controls, and
    // everything it says is repeated as real text in the section around it.
    <Box aria-hidden="true" sx={{ width: '100%' }}>
      <Box
        {...hoverProps}
        sx={{
          borderRadius: RADII.mock,
          border: `1px solid ${INK.line}`,
          bgcolor: INK.card,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            bgcolor: INK.cardLift,
            borderBottom: `1px solid ${INK.line}`,
          }}
        >
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                border: `1px solid ${INK.line}`,
              }}
            />
          ))}
          <Box
            sx={{
              flex: 1,
              ml: 2,
              height: 20,
              borderRadius: RADII.pill,
              bgcolor: INK.ground,
              border: `1px solid ${INK.lineSoft}`,
            }}
          />
        </Box>

        {/* The height is RESERVED, not fitted: the four scenarios have four or
            five steps each, and a frame that resized between them would bounce
            the whole page every few seconds. 376 is the measured height of the
            tallest (five steps, plus this box's own padding) - big enough that
            nothing is ever clipped, and no bigger, because the surplus reads as
            an unfinished drawing. */}
        <Box sx={{ p: { xs: 2, md: 3.5 }, minHeight: { xs: 340, md: 376 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              minHeight: 54,
              px: 2,
              py: 1.5,
              borderRadius: RADII.chip,
              border: `1px solid ${INK.line}`,
              bgcolor: INK.ground,
              fontFamily: MONO,
              fontSize: { xs: '0.9rem', md: '1.0625rem' },
              color: INK.bright,
            }}
          >
            <Box component="span">{typed}</Box>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: '2px',
                height: '1.2em',
                ml: '2px',
                bgcolor: INK.bright,
                animation: 'standartCaret 1s steps(2) infinite',
                '@keyframes standartCaret': { '50%': { opacity: 0 } },
                [REDUCED_MOTION]: { animation: 'none' },
              }}
            />
          </Box>

          <Box
            sx={{
              mt: 3,
              display: 'grid',
              gap: 1.25,
              opacity: rowsVisible ? 1 : 0,
              transition: `opacity 400ms ${STANDARD_EASE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {current.steps.map((step, i) => {
              const done = stepsDone > i;
              return (
                <Box
                  key={step.done}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 22 }}
                >
                  <StepMark done={done} running={phase === 'process' && !done} />
                  <MockText tone={done ? 'bright' : 'faint'}>
                    {done ? step.done : step.label}
                  </MockText>
                </Box>
              );
            })}
          </Box>

          <Box
            sx={{
              mt: 3,
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
              opacity: cardsShown ? 1 : 0,
              transform: cardsShown ? 'none' : 'translateY(8px)',
              transition: `opacity 500ms ${SETTLE}, transform 500ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {current.badges.map((badge) => (
              <Box
                key={badge.label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  p: 1.75,
                  borderRadius: RADII.cardSm,
                  border: `1px solid ${INK.line}`,
                  bgcolor: INK.cardLift,
                }}
              >
                <Glyph />
                <Box sx={{ ...TYPE.body, fontWeight: 500, color: INK.bright, minWidth: 0 }}>
                  {badge.label}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          mt: 2,
          ...TYPE.proof,
          fontFamily: MONO,
          color: INK.dimmer,
          letterSpacing: '0.04em',
          opacity: destinationsShown ? 1 : 0,
          transition: `opacity 500ms ${STANDARD_EASE}`,
          [REDUCED_MOTION]: { transition: 'none' },
        }}
      >
        &#8627; saved with:
      </Box>

      <Box
        sx={{
          mt: 1.25,
          display: 'grid',
          gap: 1.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          opacity: destinationsShown ? 1 : 0,
          transform: destinationsShown ? 'none' : 'translateY(8px)',
          transition: `opacity 500ms ${SETTLE}, transform 500ms ${SETTLE}`,
          [REDUCED_MOTION]: { transition: 'none' },
        }}
      >
        {DESTINATION_SLOTS.map((slot, i) => (
          <DestinationCard key={slot.id} title={slot.title} detail={current.destinationsPlain[i]} />
        ))}
      </Box>
    </Box>
  );
}
