/**
 * [module: design-system]
 *
 * The card grids.
 *
 * CSS Grid rather than MUI's `Grid`, because the shapes this page needs are one
 * declaration each here and a pile of per-breakpoint span props there. The
 * 3 + 2 + 3 layout in particular is a six-column grid where small cells span two
 * and wide cells span three; expressed as MUI Grid items that is six `size`
 * objects that have to agree with each other.
 *
 * Cells carry a minimum height rather than an aspect ratio, so a long sentence
 * grows the card instead of clipping the mockup underneath it.
 */
import { Box } from '@mui/material';

const LAYOUTS = {
  /** Three equal cards. */
  three: {
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
  },
  /** Two by two. */
  quad: {
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
  },
  /** Five across, for the suite row. */
  five: {
    gridTemplateColumns: {
      xs: '1fr',
      sm: 'repeat(2, 1fr)',
      md: 'repeat(3, 1fr)',
      lg: 'repeat(5, 1fr)',
    },
  },
  /**
   * Three small, two wide, three small.
   *
   * Six columns so both rhythms divide it. The children opt in with
   * `data-span="wide"`; anything else takes two columns.
   */
  threeTwoThree: {
    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' },
    '& > *': { gridColumn: { md: 'span 2' } },
    '& > [data-span="wide"]': { gridColumn: { sm: 'span 2', md: 'span 3' } },
  },
};

/**
 * @param {object} props
 * @param {'three'|'quad'|'five'|'threeTwoThree'} [props.layout]
 */
export default function Bento({ children, layout = 'three', sx, ...rest }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: { xs: 1.5, md: 2 },
        alignItems: 'stretch',
        ...LAYOUTS[layout],
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
