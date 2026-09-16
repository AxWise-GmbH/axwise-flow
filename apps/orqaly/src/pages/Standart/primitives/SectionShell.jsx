/**
 * [module: design-system]
 *
 * One section: the anchor, the heading, the rhythm, the entrance.
 *
 * Every section on the page goes through here, which is what makes three
 * separate things impossible to get out of step:
 *
 *  - the id the nav scrolls to,
 *  - the `data-standart-zone` the scroll orb measures,
 *  - and the heading level.
 *
 * They are one prop. The existing landing page keeps its orb zones and its nav
 * anchors in two hand-maintained lists, and it has a zone in the DOM with no
 * entry in the orb's config - which silently inherits the hero's pose. One
 * source here means that cannot happen, and standartLanding.test.js checks the
 * rendered ids against SECTION_IDS.
 */
import { Box } from '@mui/material';
import SectionReveal from './SectionReveal';
import TwoToneHeading from './TwoToneHeading';
import { INK, SPACE, TYPE } from '../standartTokens';

/**
 * @param {object} props
 * @param {string} props.id both the anchor and the orb zone
 * @param {{ bright: string, dim?: string }} [props.heading]
 * @param {string} [props.lead] one paragraph under the heading
 * @param {string} [props.eyebrow]
 * @param {'left'|'center'} [props.align]
 * @param {boolean} [props.divider] a rule above the section
 */
export default function SectionShell({
  id,
  heading,
  lead,
  eyebrow,
  align = 'left',
  divider = true,
  children,
  sx,
}) {
  const centred = align === 'center';

  return (
    <Box
      component="section"
      id={id}
      data-standart-zone={id}
      // Sections take focus when the nav sends the reader to one, so they need
      // an accessible name. The heading provides it where there is one; where
      // there is not, the id is a poor name but a name.
      aria-label={heading ? undefined : id}
      sx={{
        position: 'relative',
        // Above the scroll orb, which sits at zIndex 0.
        zIndex: 1,
        py: SPACE.section,
        px: SPACE.gutter,
        // The section takes focus programmatically; it must not draw a ring for
        // that, only for a real keyboard visit.
        outline: 'none',
        ...(divider ? { borderTop: `1px solid ${INK.line}` } : null),
        ...sx,
      }}
    >
      <Box sx={{ maxWidth: SPACE.maxWidth, mx: 'auto', width: '100%' }}>
        {(heading || lead || eyebrow) && (
          <SectionReveal
            sx={{
              display: 'grid',
              gap: 2,
              mb: { xs: 4, md: 6 },
              maxWidth: centred ? 760 : 860,
              ...(centred ? { mx: 'auto', textAlign: 'center' } : null),
            }}
          >
            {eyebrow && (
              <Box component="p" sx={{ ...TYPE.eyebrow, color: INK.dimmer, m: 0 }}>
                {eyebrow}
              </Box>
            )}
            {heading && <TwoToneHeading bright={heading.bright} dim={heading.dim} />}
            {lead && (
              <Box component="p" sx={{ ...TYPE.lead, color: INK.dim, m: 0 }}>
                {lead}
              </Box>
            )}
          </SectionReveal>
        )}
        {children}
      </Box>
    </Box>
  );
}
