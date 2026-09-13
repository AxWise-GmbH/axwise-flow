/**
 * Silhouette: a phone frame with a thread in it.
 *
 * The only device-shaped drawing on the page, which is the point - it is the one
 * place the reader is meant to picture themselves rather than the product. It
 * takes a message as a prop, because the chip selector above it changes what the
 * agent says, and a phone whose content did not change with the chips would make
 * the chips look decorative.
 *
 * The cascade uses threadReveal's numbers (55ms step, 420ms) rather than the
 * page's, because this is a picture of a message thread and that is the pace the
 * real thread arrives at.
 */
import { Box } from '@mui/material';
import { INK, RADII } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import useMockPlay from './useMockPlay';

export default function MockRoomThread({
  speaker = 'Assistant',
  message = 'The result is ready.',
}) {
  // Three beats: the header settles, the agent's line arrives, then the reply.
  // Re-keyed on the message, so switching chips replays it rather than swapping
  // the text under a thread that has already finished animating.
  const [ref, played] = useMockPlay(3, { step: 220, start: 240 });

  return (
    <Box
      ref={ref}
      aria-hidden="true"
      key={message}
      sx={{
        width: '100%',
        maxWidth: 300,
        mx: 'auto',
        borderRadius: RADII.phone,
        border: `1px solid ${INK.line}`,
        bgcolor: INK.card,
        p: 1.25,
        display: 'grid',
        gap: 1,
        alignContent: 'start',
        minHeight: 380,
      }}
    >
      {/* The notch. A shape, not a picture of a camera. */}
      <Box
        sx={{
          width: 64,
          height: 5,
          borderRadius: '999px',
          bgcolor: INK.line,
          mx: 'auto',
          mt: 0.5,
          mb: 1,
        }}
      />

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pb: 1,
          borderBottom: `1px solid ${INK.line}`,
        }}
      >
        <Box
          sx={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `1px solid ${INK.dim}`,
            flexShrink: 0,
          }}
        />
        <Box sx={{ fontSize: '0.75rem', fontWeight: 600, color: INK.bright }}>{speaker}</Box>
      </Box>

      {[
        { from: 'agent', text: message },
        { from: 'you', text: 'Open the Goal.' },
      ].map((bubble, i) => {
        const shown = played > i + 1;
        const mine = bubble.from === 'you';
        return (
          <Box
            key={bubble.from}
            sx={{
              justifySelf: mine ? 'end' : 'start',
              maxWidth: '86%',
              px: 1.25,
              py: 0.875,
              borderRadius: '14px',
              bgcolor: mine ? INK.bright : INK.cardLift,
              color: mine ? INK.ground : INK.dim,
              border: mine ? 'none' : `1px solid ${INK.line}`,
              fontSize: '0.75rem',
              lineHeight: 1.45,
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(8px)',
              transition: `opacity 420ms ${SETTLE}, transform 420ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none', opacity: 1, transform: 'none' },
            }}
          >
            {bubble.text}
          </Box>
        );
      })}

      <Box
        sx={{
          mt: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.25,
          py: 0.875,
          borderRadius: '999px',
          border: `1px solid ${INK.line}`,
          color: INK.dimmer,
          fontSize: '0.75rem',
        }}
      >
        Message {speaker}
      </Box>
    </Box>
  );
}
