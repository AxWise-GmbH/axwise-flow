/**
 * [module: design-system]
 *
 * Standart, drawn from Standart's own numbers.
 *
 * This is the picture the page is named for, so it is the one mockup that must
 * not be approximately right. Every measurement below is IMPORTED from
 * `theme/standardPage.js` rather than typed: the nav row's 38px, the 14px glyph,
 * the table's '8px 16px' cell padding, the 1.5px tab underline, the 20px radius
 * on a banded row's outer corners, and the band itself - which is not a literal
 * either, it comes off `rowBandStrength`'s single dial.
 *
 * That matters because a hardcoded mock lies slowly. If someone retunes
 * ROW_BAND_STRENGTH_DEFAULT next year, every real table in the product changes
 * and a mock full of literals quietly starts advertising the old one.
 *
 * This is the ONLY file in src/pages/Standart that imports from theme/standardPage,
 * and standartMocks.test.jsx enforces that. Everywhere else on this page uses the
 * marketing tokens; here, and only here, the product's own scale is the point.
 *
 * The band is deliberately faint. rowBandColor(15) resolves to roughly
 * rgba(255,255,255,0.0175) - a hint, not a zebra. A mock that draws a legible
 * stripe would be advertising a table the product does not have.
 */
import { Box } from '@mui/material';
import { MONO_ROW_BAND, MONO_ROW_RADIUS_PX, STANDARD_PAGE } from '../standartProductTokens';
import { INK, RADII } from '../standartTokens';
import { REDUCED_MOTION, SETTLE } from '../standartMotion';
import useMockPlay from './useMockPlay';

const NAV = ['New chat', 'Assistant', 'Goals', 'Settings'];
const ACTIVE_NAV = 'Goals';

const TABS = ['Active', 'Completed', 'All'];

const COLUMNS = [
  { key: 'name', label: 'Goal', width: '1.4fr', role: 'identity' },
  { key: 'tier', label: 'Status', width: '1fr', role: 'tag' },
  { key: 'agent', label: 'Stage', width: '1fr', role: 'actor' },
  { key: 'updated', label: 'Updated', width: '0.8fr', role: 'time' },
];

const ROWS = [
  { name: 'Market brief', tier: 'Running', agent: 'Research', updated: '2m ago' },
  { name: 'Launch plan', tier: 'Waiting', agent: 'Plan approval', updated: '8m ago' },
  { name: 'Policy review', tier: 'Completed', agent: 'Final artifact', updated: '1d ago' },
  { name: 'Vendor comparison', tier: 'Completed', agent: 'Final artifact', updated: '2d ago' },
];

export default function MockMonoTable() {
  // Three steps: the underline slides from the first tab to the second, and the
  // rows arrive behind it.
  const [ref, played] = useMockPlay(3, { start: 420, step: 240 });
  const activeTab = played >= 1 ? 1 : 0;

  return (
    <Box
      ref={ref}
      aria-hidden="true"
      sx={{
        borderRadius: RADII.window,
        border: `1px solid ${INK.line}`,
        bgcolor: INK.card,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: 260,
      }}
    >
      {/* Title bar. Rings rather than filled dots: a monochrome window has no
          traffic lights, and three coloured circles would be the only colour on
          the entire page. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.5,
          height: 34,
          borderBottom: `1px solid ${INK.line}`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{ width: 8, height: 8, borderRadius: '50%', border: `1px solid ${INK.line}` }}
          />
        ))}
        <Box
          sx={{
            flex: 1,
            textAlign: 'center',
            fontSize: STANDARD_PAGE.metaFontSize,
            color: INK.dimmer,
          }}
        >
          Goals
        </Box>
        {/* Balances the three rings so the title sits centred. */}
        <Box sx={{ width: 30 }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '96px 1fr', sm: '120px 1fr' } }}>
        {/* The rail. No border and no card - standardFrameSx's whole point is
            that Standart's page has no chrome around its blocks. */}
        <Box sx={{ borderRight: `1px solid ${INK.line}`, py: 1, px: 0.75 }}>
          {NAV.map((item) => {
            const active = item === ACTIVE_NAV;
            return (
              <Box
                key={item}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  // The nav row's own height, imported. The rail beside a page is
                  // the same row as the menu to its left.
                  height: STANDARD_PAGE.row,
                  gap: STANDARD_PAGE.gap,
                  px: 1,
                  borderRadius: MONO_ROW_RADIUS_PX,
                  bgcolor: active ? MONO_ROW_BAND.dark : 'transparent',
                }}
              >
                {/* Two strokes rather than an outlined box.
                    A 14px square with a 1.5px border reads as an unticked
                    checkbox, which turned the whole rail into a to-do list in the
                    first render. Strokes read as a glyph standing in for an icon,
                    which is what this is. */}
                <Box
                  sx={{
                    width: STANDARD_PAGE.glyph,
                    height: STANDARD_PAGE.glyph,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: '3px',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <Box
                    sx={{
                      height: '1.5px',
                      width: '100%',
                      bgcolor: active ? INK.bright : INK.dimmer,
                    }}
                  />
                  <Box
                    sx={{
                      height: '1.5px',
                      width: '60%',
                      bgcolor: active ? INK.bright : INK.dimmer,
                    }}
                  />
                </Box>
                <Box
                  sx={{
                    fontSize: STANDARD_PAGE.labelFontSize,
                    fontWeight: active ? 600 : 500,
                    color: active ? INK.bright : INK.dim,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* The tab band, and the underline that moves rather than jumping. */}
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              gap: 2,
              px: 1.5,
              pt: STANDARD_PAGE.tabBandPad,
              pb: STANDARD_PAGE.tabBandPad,
              borderBottom: `1px solid ${INK.line}`,
            }}
          >
            {TABS.map((tab, i) => (
              <Box
                key={tab}
                sx={{
                  fontSize: STANDARD_PAGE.labelFontSize,
                  fontWeight: i === activeTab ? 600 : 500,
                  color: i === activeTab ? INK.bright : INK.dim,
                  transition: `color 220ms ${SETTLE}`,
                  [REDUCED_MOTION]: { transition: 'none' },
                }}
              >
                {tab}
              </Box>
            ))}
            <Box
              sx={{
                position: 'absolute',
                left: 12,
                bottom: 0,
                // The product's own mark, at the product's own weight.
                height: STANDARD_PAGE.tabIndicatorHeight,
                width: activeTab === 0 ? 20 : 68,
                bgcolor: INK.bright,
                // translateX, never `left`: the same reason the real indicator
                // does it, so the browser can composite the move.
                transform: `translateX(${activeTab === 0 ? 0 : 32}px)`,
                transition: `transform 300ms ${SETTLE}, width 300ms ${SETTLE}`,
                [REDUCED_MOTION]: { transition: 'none' },
              }}
            />
          </Box>

          <Box sx={{ px: 1, py: 0.5, minWidth: 0 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: COLUMNS.map((c) => c.width).join(' '),
                px: '16px',
                pb: 0.5,
              }}
            >
              {COLUMNS.map((c) => (
                <Box
                  key={c.key}
                  sx={{
                    fontSize: '0.625rem',
                    fontWeight: 500,
                    color: INK.dimmer,
                    letterSpacing: '0.01em',
                  }}
                >
                  {c.label}
                </Box>
              ))}
            </Box>

            {ROWS.map((row, i) => {
              const shown = played >= 2 || i < 2;
              return (
                <Box
                  key={row.name}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: COLUMNS.map((c) => c.width).join(' '),
                    alignItems: 'center',
                    // The real cell padding, imported.
                    padding: STANDARD_PAGE.cellPadding,
                    // Odd rows banded, at the strength the one dial names.
                    bgcolor: i % 2 === 0 ? MONO_ROW_BAND.dark : 'transparent',
                    borderRadius: MONO_ROW_RADIUS_PX,
                    opacity: shown ? 1 : 0,
                    transition: `opacity 320ms ${SETTLE}`,
                    [REDUCED_MOTION]: { transition: 'none', opacity: 1 },
                  }}
                >
                  {COLUMNS.map((c) => {
                    // Three loud moments only: identity, state, quantity. The
                    // rest sit back. That is standardCell's whole scheme, and it
                    // is what replaces colour as the thing separating values.
                    const loud = c.role === 'identity';
                    return (
                      <Box
                        key={c.key}
                        sx={{
                          fontSize: loud ? STANDARD_PAGE.labelFontSize : STANDARD_PAGE.metaFontSize,
                          fontWeight: loud ? 600 : 500,
                          color: loud ? INK.bright : INK.dim,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row[c.key]}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
