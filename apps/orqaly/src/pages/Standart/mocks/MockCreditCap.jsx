/**
 * Silhouette: a meter against a ceiling line, over a short ledger.
 *
 * A fork of the welcome deck's MockSpend rather than a reuse of it. That one
 * draws a $5 grant, which is right for an illustration in an onboarding slide
 * and wrong on a marketing page: the real default allowance is $50
 * (DEFAULT_PLATFORM_CREDITS_LIMIT_USD in lib/security/platform-credits.js), and
 * a page that quotes a number has to quote the one the product uses.
 *
 * The ceiling is drawn as a line rather than implied by the end of the track,
 * because the claim is that the work STOPS there rather than that the bar fills
 * up. A bar with no marked ceiling is a progress bar; this is a limit.
 */
import { Box } from '@mui/material';
import { MockCaption, MockFrame, MockLine, MockMeter, MockText } from './mockChrome';
import useMockPlay from './useMockPlay';

const LEDGER = [
  { what: 'Planning', cost: '$0.18' },
  { what: 'Research', cost: '$0.15' },
  { what: 'Panel review', cost: '$0.09' },
];

export default function MockCreditCap() {
  const [ref, played] = useMockPlay(LEDGER.length + 1, { step: 140 });
  const filled = played > 0;

  return (
    <MockFrame ref={ref}>
      <Box sx={{ display: 'grid', gap: 0.75, pb: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <MockText tone="bright" strong>
            $12.40
          </MockText>
          <MockText tone="faint">of $50.00</MockText>
        </Box>
        {/* 12.40 / 50 = 0.248. The ceiling sits at 1, and the line marks it. */}
        <MockMeter value={filled ? 0.248 : 0} cap={1} />
      </Box>

      {LEDGER.map((row, i) => (
        <MockLine key={row.what} index={i} played={played > i}>
          <MockText sx={{ flex: 1 }}>{row.what}</MockText>
          <MockText tone="bright" strong sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {row.cost}
          </MockText>
        </MockLine>
      ))}

      <MockCaption>The work stops at the ceiling rather than continuing</MockCaption>
    </MockFrame>
  );
}
