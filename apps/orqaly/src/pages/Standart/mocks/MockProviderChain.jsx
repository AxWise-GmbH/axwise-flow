/**
 * Silhouette: provider chips joined by arrows, with one hop failing over.
 *
 * The animation is the claim. A static row of ten logos says "we support these";
 * a first hop that fails and a second that takes over says "the work carries on",
 * which is the thing a business owner is actually buying.
 *
 * Deliberately vague about WHY the first one failed. The chain in the product is
 * failure-driven - it switches when a provider errors - and nothing here should
 * suggest it picks the cheapest, because it does not.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import { MockCaption, MockFrame, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const CHAIN = ['OpenAI', 'Anthropic', 'Groq'];

function Arrow({ dim }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 18,
        height: 1,
        bgcolor: dim ? INK.line : INK.dim,
        position: 'relative',
        transition: `background-color 320ms ${SETTLE}`,
        [REDUCED_MOTION]: { transition: 'none' },
        '&::after': {
          content: '""',
          position: 'absolute',
          right: 0,
          top: -2,
          width: 5,
          height: 5,
          borderTop: `1px solid ${dim ? INK.line : INK.dim}`,
          borderRight: `1px solid ${dim ? INK.line : INK.dim}`,
          transform: 'rotate(45deg)',
        },
      }}
    />
  );
}

export default function MockProviderChain() {
  // Two beats: the first provider drops, then the next one picks the work up.
  const [ref, played] = useMockPlay(2, { step: 700, start: 500 });
  const failedIndex = played >= 1 ? 0 : -1;
  const activeIndex = played >= 2 ? 1 : 0;

  return (
    <MockFrame ref={ref} minHeight={148}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'nowrap', py: 1.5 }}>
        {CHAIN.map((name, i) => {
          const failed = i === failedIndex;
          const active = i === activeIndex;
          return (
            <Box key={name} sx={{ display: 'contents' }}>
              {i > 0 && <Arrow dim={i > activeIndex} />}
              <Box
                sx={{
                  flexShrink: 0,
                  px: 1,
                  py: 0.5,
                  borderRadius: '8px',
                  border: `1px solid ${active ? INK.bright : INK.line}`,
                  color: failed ? INK.dimmer : active ? INK.bright : INK.dim,
                  fontSize: '0.6875rem',
                  fontWeight: active ? 600 : 500,
                  textDecoration: failed ? 'line-through' : 'none',
                  transition: `border-color 320ms ${SETTLE}, color 320ms ${SETTLE}`,
                  [REDUCED_MOTION]: { transition: 'none' },
                }}
              >
                {name}
              </Box>
            </Box>
          );
        })}
        <MockText tone="faint" sx={{ pl: 0.5 }}>
          +7
        </MockText>
      </Box>

      <MockCaption>
        {played >= 2 ? 'Switched over. The job never stopped.' : 'Ten providers behind one switch'}
      </MockCaption>
    </MockFrame>
  );
}
