/**
 * Silhouette: a roster with one member opened.
 *
 * The fifteenth drawing, and it takes a shape nothing else in the set occupies.
 * The two it could have collided with, and why it does not:
 *  - MockOrgTree is an INDENTED tree with connector rules; this is a flat list
 *    with a detail panel hanging off one row.
 *  - MockSupervisor maps rules to outcomes across a gap; this has no gap and
 *    nothing crossing it.
 *
 * The claim on the card is "a controlled team, configured down to the tools",
 * so the drawing has to show BOTH: the roster proves there is a team with a lead
 * at the top of it, and the opened row proves a single agent is where the
 * settings live. A roster on its own would only prove the first half.
 *
 * The lead's mark is a filled disc and everyone else's is a ring - weight, not
 * colour, exactly as `MockTag` does it.
 */
import { Box } from '@mui/material';
import { MockCaption, MockFrame, MockLine, MockTag, MockText } from './mockChrome';
import { INK, RADII } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import useMockPlay from './useMockPlay';

const ROSTER = [
  { name: 'Operations', role: 'Lead', lead: true },
  { name: 'Research', role: 'Specialist' },
  { name: 'Writer', role: 'Specialist' },
  { name: 'Quality', role: 'Reviewer' },
];

/** The tools the opened row has been given, and the one it has not. */
const TOOLS = [
  { label: 'Read files', on: true },
  { label: 'Search web', on: true },
  { label: 'Send email', on: false },
];

function Seat({ lead }) {
  return (
    <Box
      sx={{
        width: 10,
        height: 10,
        flexShrink: 0,
        borderRadius: '50%',
        border: `1px solid ${lead ? INK.bright : INK.line}`,
        bgcolor: lead ? INK.bright : 'transparent',
      }}
    />
  );
}

export default function MockTeamRoster() {
  const [ref, played] = useMockPlay(ROSTER.length + 1, { step: 130 });
  const opened = played > ROSTER.length;

  return (
    <MockFrame ref={ref}>
      {ROSTER.map((member, i) => (
        <MockLine key={member.name} index={i} played={played > i}>
          <Seat lead={member.lead} />
          <MockText tone={member.lead ? 'bright' : 'dim'} strong={member.lead} sx={{ flex: 1 }}>
            {member.name}
          </MockText>
          <MockTag strong={member.lead}>{member.role}</MockTag>
        </MockLine>
      ))}

      {/* The opened row. Indented under the last member and ruled off from it,
          so it reads as belonging to that agent rather than to the team. */}
      <Box
        sx={{
          ml: 2.25,
          mt: 0.5,
          p: 1,
          display: 'grid',
          gap: 0.5,
          borderRadius: RADII.chip,
          border: `1px solid ${INK.line}`,
          bgcolor: INK.card,
          opacity: opened ? 1 : 0,
          transform: opened ? 'none' : 'translateY(6px)',
          transition: `opacity 320ms ${SETTLE}, transform 320ms ${SETTLE}`,
          [REDUCED_MOTION]: { transition: 'none' },
        }}
      >
        {TOOLS.map((tool) => (
          <Box key={tool.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '2px',
                border: `1px solid ${tool.on ? INK.bright : INK.line}`,
                bgcolor: tool.on ? INK.bright : 'transparent',
              }}
            />
            <MockText tone={tool.on ? 'dim' : 'faint'} sx={{ flex: 1 }}>
              {tool.label}
            </MockText>
          </Box>
        ))}
      </Box>

      <MockCaption>Tools granted one at a time, per agent</MockCaption>
    </MockFrame>
  );
}
