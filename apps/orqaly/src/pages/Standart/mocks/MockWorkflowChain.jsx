/**
 * Silhouette: nodes joined by paths, with two picked out.
 *
 * Inline SVG rather than boxes, because this is the one mockup whose shape is a
 * branch: the run splits after the model step, and a row of divs cannot draw the
 * join. A fixed viewBox with preserveAspectRatio="none" would stretch the text,
 * so the text sits in HTML on top and only the lines are drawn.
 *
 * The two outlined nodes are the ones that matter to a buyer - the point where
 * it waits for a person, and the point where it checks the budget. Everything
 * else is deliberately dim.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import { MockCaption, MockFrame } from './mockChrome';
import useMockPlay from './useMockPlay';

const NODES = [
  { id: 'request', label: 'Request', x: 6, y: 50 },
  { id: 'scope', label: 'Scope', x: 31, y: 50 },
  { id: 'scopeApproval', label: 'Approve scope', x: 58, y: 22, strong: true },
  { id: 'planApproval', label: 'Approve plan', x: 58, y: 78, strong: true },
  { id: 'result', label: 'Result', x: 90, y: 50 },
];

const EDGES = [
  ['request', 'scope'],
  ['scope', 'scopeApproval'],
  ['scopeApproval', 'planApproval'],
  ['planApproval', 'result'],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

export default function MockWorkflowChain() {
  const [ref, played] = useMockPlay(EDGES.length, { step: 130, start: 320 });

  return (
    <MockFrame ref={ref} minHeight={172}>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 108 }}>
        <Box
          component="svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {EDGES.map(([from, to], i) => (
            <line
              key={`${from}-${to}`}
              x1={byId[from].x}
              y1={byId[from].y}
              x2={byId[to].x}
              y2={byId[to].y}
              stroke={played > i ? INK.dim : INK.line}
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </Box>

        {NODES.map((node) => (
          <Box
            key={node.id}
            sx={{
              position: 'absolute',
              left: `${node.x}%`,
              top: `${node.y}%`,
              transform: 'translate(-50%, -50%)',
              px: 0.75,
              py: 0.375,
              borderRadius: '6px',
              bgcolor: INK.cardLift,
              border: `1px solid ${node.strong ? INK.bright : INK.line}`,
              color: node.strong ? INK.bright : INK.dimmer,
              fontSize: '0.5625rem',
              fontWeight: node.strong ? 600 : 500,
              whiteSpace: 'nowrap',
              transition: `border-color 320ms ${SETTLE}`,
              [REDUCED_MOTION]: { transition: 'none' },
            }}
          >
            {node.label}
          </Box>
        ))}
      </Box>

      <MockCaption>Scope and plan each wait for your approval</MockCaption>
    </MockFrame>
  );
}
