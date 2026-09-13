/**
 * Silhouette: toggle rows in two groups, one on and one off.
 *
 * Drawn from the real shape in src/config/mcpToolCatalog.js, where every entry
 * carries a risk rating plus two separate lists - the actions that are enabled
 * when you connect, and the ones you have to turn on yourself, one at a time.
 * The drawing has to show both lists at once or the claim does not land: it is
 * the CONTRAST between the two groups that is the feature.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { MockCaption, MockFrame, MockLine, MockTag, MockText, MockToggle } from './mockChrome';
import useMockPlay from './useMockPlay';

const SAFE = ['See channels', 'Read a thread'];
const SENSITIVE = ['Send a message', 'Remove a channel'];

export default function MockToolPermissions() {
  // Only the safe actions animate on. The sensitive ones never move, which is
  // the whole story: they stay off until a person turns them on.
  const [ref, played] = useMockPlay(SAFE.length, { step: 220, start: 380 });

  return (
    <MockFrame ref={ref}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0.5 }}>
        <MockText tone="bright" strong sx={{ flex: 1 }}>
          Slack
        </MockText>
        <MockTag>Medium risk</MockTag>
      </Box>

      {SAFE.map((label, i) => (
        <MockLine key={label} index={i}>
          <MockText sx={{ flex: 1 }}>{label}</MockText>
          <MockToggle on={played > i} />
        </MockLine>
      ))}

      <Box sx={{ borderTop: `1px solid ${INK.line}`, mt: 0.5, pt: 0.5 }}>
        {SENSITIVE.map((label) => (
          <MockLine key={label} sx={{ '&:not(:first-of-type)': { borderTop: 'none' } }}>
            <MockText tone="faint" sx={{ flex: 1 }}>
              {label}
            </MockText>
            <MockToggle on={false} />
          </MockLine>
        ))}
      </Box>

      <MockCaption>Off until you turn them on, one at a time</MockCaption>
    </MockFrame>
  );
}
