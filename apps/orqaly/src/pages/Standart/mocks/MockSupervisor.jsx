/**
 * Silhouette: four rules mapped to an outcome, two columns joined by a mark.
 *
 * The one drawing on the page where the right column is the important half.
 * Three of the four rules pause the agent and the fourth shuts it down, and that
 * asymmetry is the reason the mockup exists - "it stops" and "it stops
 * permanently" are different promises.
 */
import { Box } from '@mui/material';
import { INK } from '../standartTokens';
import { MockCaption, MockFrame, MockLine, MockTag, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const RULES = [
  { when: 'Scope compiled', then: 'Awaiting approval' },
  { when: 'Scope approved', then: 'Planning' },
  { when: 'Plan compiled', then: 'Awaiting approval' },
  { when: 'Plan approved', then: 'Running', strong: true },
];

export default function MockSupervisor() {
  const [ref, played] = useMockPlay(RULES.length, { step: 150 });

  return (
    <MockFrame ref={ref}>
      {RULES.map((rule, i) => (
        <MockLine key={rule.when} index={i} played={played > i}>
          <MockText sx={{ flex: 1 }}>{rule.when}</MockText>
          <Box sx={{ color: INK.dimmer, fontSize: '0.625rem', px: 0.5 }}>&#8594;</Box>
          <MockTag strong={rule.strong}>{rule.then}</MockTag>
        </MockLine>
      ))}
      <MockCaption>The durable state shows what the Goal is waiting for</MockCaption>
    </MockFrame>
  );
}
