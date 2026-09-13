/**
 * Silhouette: a split before/after pane.
 *
 * The only two-column mockup on the page, which is what keeps it distinct from
 * the six list-shaped ones. It draws a version comparison rather than a search
 * box, because "every version is kept and you can see what changed" is the
 * harder claim to picture and the more useful one - a search box looks like
 * every other search box ever drawn.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import { MockCaption, MockFrame, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const BEFORE = ['Objective: broad analysis', 'Boundaries: unset', 'Deliverable: unset'];
const AFTER = [
  'Objective: market comparison',
  'Boundaries: EU launch',
  'Deliverable: Markdown brief',
];

function Pane({ title, lines, changed, played }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.5, alignContent: 'start' }}>
      <MockText tone="faint">{title}</MockText>
      {lines.map((line, i) => {
        const isChanged = changed.includes(i);
        return (
          <Box
            key={line}
            sx={{
              fontSize: '0.625rem',
              lineHeight: 1.5,
              color: isChanged && played ? INK.bright : INK.dim,
              borderLeft: `2px solid ${isChanged && played ? INK.bright : 'transparent'}`,
              pl: 0.75,
              transition: `color 320ms ${SETTLE}, border-color 320ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {line}
          </Box>
        );
      })}
    </Box>
  );
}

export default function MockKnowledgeDiff() {
  const [ref, played] = useMockPlay(1, { start: 480 });

  return (
    <MockFrame ref={ref}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
        <MockText tone="bright" strong sx={{ flex: 1 }}>
          Goal scope
        </MockText>
        <MockText tone="faint">draft to accepted</MockText>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
        <Pane title="Before" lines={BEFORE} changed={[0, 2]} played={false} />
        <Box sx={{ width: '1px', bgcolor: INK.line }} />
        <Pane title="After" lines={AFTER} changed={[0, 2]} played={played > 0} />
      </Box>

      <MockCaption>The approved scope stays attached to the Goal</MockCaption>
    </MockFrame>
  );
}
