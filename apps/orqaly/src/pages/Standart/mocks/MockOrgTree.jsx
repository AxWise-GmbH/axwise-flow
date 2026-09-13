/**
 * Silhouette: an indented tree with connector rules.
 *
 * The four levels are the four values the product actually validates - holding,
 * subsidiary, division, department - and not a generic org chart. Drawn with
 * borders rather than an SVG because the shape is nothing but right angles, and
 * a border-drawn tree reflows with the type where a fixed viewBox would not.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { MockCaption, MockFrame, MockLine, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const NODES = [
  { label: 'Northwind Group', depth: 0, kind: 'Holding' },
  { label: 'Northwind Retail', depth: 1, kind: 'Subsidiary' },
  { label: 'Operations', depth: 2, kind: 'Division' },
  { label: 'Fulfilment', depth: 3, kind: 'Department' },
];

export default function MockOrgTree() {
  const [ref, played] = useMockPlay(NODES.length, { step: 130 });

  return (
    <MockFrame ref={ref}>
      {NODES.map((node, i) => (
        <MockLine
          key={node.label}
          index={i}
          played={played > i}
          sx={{ '&:not(:first-of-type)': { borderTop: 'none' } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
            {/* One rule per level of indent, so the depth is drawn rather than
                implied by whitespace. */}
            {Array.from({ length: node.depth }).map((_, d) => (
              <Box
                key={d}
                sx={{
                  width: 14,
                  alignSelf: 'stretch',
                  borderLeft: `1px solid ${INK.line}`,
                  ml: d === 0 ? 0.5 : 0,
                }}
              />
            ))}
            <Box
              sx={{
                width: 6,
                height: 6,
                flexShrink: 0,
                mr: 1,
                borderRadius: '1px',
                border: `1px solid ${node.depth === 0 ? INK.bright : INK.dimmer}`,
              }}
            />
            <MockText tone={node.depth === 0 ? 'bright' : 'dim'} strong={node.depth === 0}>
              {node.label}
            </MockText>
          </Box>
          <MockText tone="faint">{node.kind}</MockText>
        </MockLine>
      ))}
      <MockCaption>Each level gets its own oversight</MockCaption>
    </MockFrame>
  );
}
