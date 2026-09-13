/**
 * Silhouette: role rows with a verdict, one struck through.
 *
 * The struck-through row is the point of the drawing. A board member can be put
 * in quarantine, and a quarantined member is excluded from the deliberation
 * rather than merely ignored - so the picture shows a seat that is present and
 * not counted, which is a thing worth seeing rather than reading.
 */
import { Box } from '@mui/material';
import { MockCaption, MockFrame, MockLine, MockTag, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const SEATS = [
  { role: 'Objective', verdict: 'Reviewed' },
  { role: 'Deliverables', verdict: 'Reviewed' },
  { role: 'Boundaries', verdict: 'Reviewed' },
  { role: 'Assumptions', verdict: 'Reviewed' },
  { role: 'Approval', verdict: 'Required', out: true },
];

export default function MockBoardVote() {
  // One step per seat, then a final step for the outcome.
  const [ref, played] = useMockPlay(SEATS.length + 1, { step: 120 });

  return (
    <MockFrame ref={ref}>
      {SEATS.map((seat, i) => (
        <MockLine key={seat.role} index={i} played={played > i}>
          <MockText tone={seat.out ? 'faint' : 'bright'} strong sx={{ flex: 1 }}>
            <Box
              component="span"
              sx={seat.out ? { textDecoration: 'line-through', opacity: 0.7 } : null}
            >
              {seat.role}
            </Box>
          </MockText>
          <MockTag strong={!seat.out}>{seat.verdict}</MockTag>
        </MockLine>
      ))}
      <MockCaption>
        {played > SEATS.length ? 'Exact scope ready for your decision' : 'Reviewing scope'}
      </MockCaption>
    </MockFrame>
  );
}
