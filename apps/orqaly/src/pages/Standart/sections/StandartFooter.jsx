/**
 * The footer.
 *
 * The site's own six lanes, drawn in one ink - see the note on `FOOTER` in
 * standartCopy.js for what was deliberately left out of the port (the four dead
 * social links, and a language chip with no i18n behind it).
 *
 * The lanes wrap rather than scroll on a narrow screen: two columns at `xs`,
 * three at `sm`, all six at `lg`. A horizontal scroller in a footer is a place
 * links go to be missed.
 */
import { Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { FOOTER } from '../standartCopy';
import { INK, SPACE, TYPE } from '../standartTokens';
import { HOVER_MS, REDUCED_MOTION, STANDARD_EASE } from '../standartMotion';
import BrandOrb from '../primitives/BrandOrb';

const linkSx = {
  ...TYPE.body,
  color: INK.dim,
  textDecoration: 'none',
  transition: `color ${HOVER_MS}ms ${STANDARD_EASE}`,
  '@media (hover: hover)': { '&:hover': { color: INK.bright } },
  '&:focus-visible': { outline: `2px solid ${INK.bright}`, outlineOffset: 2 },
  [REDUCED_MOTION]: { transition: 'none' },
};

export default function StandartFooter({ year }) {
  return (
    <Box
      component="footer"
      sx={{
        position: 'relative',
        zIndex: 1,
        // OPAQUE, though it is the same colour as the page. The closing CTA
        // above parks the orb dead centre at its largest pose, and without a
        // ground of its own the footer draws six columns of links over the top
        // of it. The orb belongs behind the ask, not behind the sitemap.
        bgcolor: INK.ground,
        borderTop: `1px solid ${INK.line}`,
        px: SPACE.gutter,
        py: { xs: 6, md: 8 },
      }}
    >
      <Box sx={{ maxWidth: SPACE.maxWidth, mx: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gap: { xs: 4, md: 4 },
            // The brand cell is wider than a lane and sits alone on its own row
            // until there is room for it beside them.
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(3, 1fr)',
              lg: '1.4fr repeat(6, 1fr)',
            },
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              alignContent: 'start',
              gridColumn: { sm: 'span 3', lg: 'span 1' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <BrandOrb />
              <Box sx={{ ...TYPE.body, color: INK.bright, fontWeight: 600 }}>{FOOTER.brand}</Box>
            </Box>
            <Box component="p" sx={{ ...TYPE.body, color: INK.dim, m: 0, maxWidth: 260 }}>
              {FOOTER.blurb}
            </Box>
          </Box>

          {FOOTER.lanes.map((lane) => (
            <Box key={lane.id} sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
              <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>{lane.label}</Box>
              {lane.links.map((link) => (
                <Box key={link.to + link.label} component={RouterLink} to={link.to} sx={linkSx}>
                  {link.label}
                </Box>
              ))}
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            mt: { xs: 5, md: 7 },
            pt: 3,
            borderTop: `1px solid ${INK.line}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ ...TYPE.proof, color: INK.dimmer }}>
            &copy; {year} {FOOTER.copyright}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
            {FOOTER.legal.map((link) => (
              <Box
                key={link.label}
                component={RouterLink}
                to={link.to}
                sx={{ ...linkSx, ...TYPE.proof }}
              >
                {link.label}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
