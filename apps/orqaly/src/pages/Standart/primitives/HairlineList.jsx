/**
 * [module: design-system]
 *
 * A list of rows separated by rules rather than gaps.
 *
 * This is Standart's list shape, and the reason it looks the way it does: with
 * no colour and no card chrome available, what tells the reader "these things
 * are the same kind of thing" is a shared left edge and a hairline between them.
 * Gaps would say the opposite.
 *
 * The rule is on every row but the first, so a list of one draws no stray line.
 */
import { Box, Typography } from '@mui/material';
import { INK, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';

/**
 * @param {object} props
 * @param {Array<{ id?: string, title?: string, label?: string, body?: string,
 *   desc?: string, proof?: string, meta?: string }>} props.items
 * @param {(item: object, index: number) => void} [props.onSelect] makes each row
 *   a button. Without it the rows are plain text, which is correct for a list
 *   that is telling rather than offering.
 * @param {boolean} [props.arrow] draw the reference's up-right mark on each row
 */
export default function HairlineList({ items = [], onSelect, arrow = false, sx }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, ...sx }}>
      {items.map((item, index) => {
        const heading = item.title ?? item.label;
        const detail = item.body ?? item.desc;
        const interactive = Boolean(onSelect);

        return (
          <Box
            component="li"
            key={item.id ?? heading ?? index}
            sx={{
              '&:not(:first-of-type)': { borderTop: `1px solid ${INK.line}` },
            }}
          >
            <Box
              component={interactive ? 'button' : 'div'}
              type={interactive ? 'button' : undefined}
              onClick={interactive ? () => onSelect(item, index) : undefined}
              sx={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 0,
                font: 'inherit',
                cursor: interactive ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'baseline',
                gap: 2,
                py: 2,
                color: 'inherit',
                ...(interactive
                  ? {
                      transitionProperty: 'color',
                      transitionDuration: `${HOVER_MS}ms`,
                      transitionTimingFunction: STANDARD_EASE,
                      '@media (hover: hover)': {
                        // The house hover: the label brightens and gains weight.
                        // Nothing moves and nothing glows.
                        '&:hover .hairline-heading': { color: INK.bright, fontWeight: 600 },
                        '&:hover .hairline-arrow': { opacity: 1 },
                      },
                      '&:focus-visible': {
                        outline: `2px solid ${INK.bright}`,
                        outlineOffset: -2,
                      },
                      '&:focus-visible .hairline-heading': { color: INK.bright },
                      [REDUCED_MOTION]: { transition: 'none' },
                    }
                  : null),
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0, display: 'grid', gap: 0.5 }}>
                {heading && (
                  <Typography
                    className="hairline-heading"
                    sx={{
                      ...TYPE.body,
                      color: INK.bright,
                      m: 0,
                      transition: `color ${HOVER_MS}ms ${STANDARD_EASE}, font-weight ${HOVER_MS}ms ${STANDARD_EASE}`,
                      [REDUCED_MOTION]: { transition: 'none' },
                    }}
                  >
                    {heading}
                  </Typography>
                )}
                {detail && (
                  <Typography sx={{ ...TYPE.body, color: INK.dim, m: 0 }}>{detail}</Typography>
                )}
                {item.proof && (
                  <Typography sx={{ ...TYPE.proof, color: INK.dimmer, m: 0 }}>
                    {item.proof}
                  </Typography>
                )}
              </Box>

              {item.meta && (
                <Typography
                  sx={{ ...TYPE.proof, color: INK.dimmer, flexShrink: 0, whiteSpace: 'nowrap' }}
                >
                  {item.meta}
                </Typography>
              )}

              {arrow && (
                <Box
                  className="hairline-arrow"
                  aria-hidden="true"
                  sx={{
                    flexShrink: 0,
                    color: INK.dimmer,
                    opacity: 0.5,
                    fontSize: '0.8rem',
                    lineHeight: 1,
                    transition: `opacity ${HOVER_MS}ms ${STANDARD_EASE}`,
                    [REDUCED_MOTION]: { transition: 'none' },
                  }}
                >
                  {/* The reference's mark. A glyph rather than an icon component:
                      AppIcon renders an Iconify element outside Simple mode and
                      drops `sx` entirely, so a size set here would be a no-op. */}
                  &#8599;
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
