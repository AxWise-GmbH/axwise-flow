/**
 * [module: design-system]
 *
 * A block that arrives when the reader reaches it.
 *
 * WHY THIS EXISTS RATHER THAN `components/Common/Reveal`.
 *
 * `Reveal` is the project's scroll-entrance component and it is the obvious
 * thing to reach for. It is also wrong here, and quietly so. In Standart it
 * takes the `theme.mono` branch, DROPS the ref, and hands straight to
 * `recordRowRevealSx` - a mount-triggered cascade. That is exactly right for its
 * job: a table dealing its rows in as a page loads, at the same step the left
 * menu uses, so the page and the shell read as one product.
 *
 * On a fourteen-section marketing page mounted inside a mono theme it means
 * every section below the fold finishes animating before the reader has scrolled
 * anywhere near it. The motion is not broken; it is spent.
 *
 * So this keeps the platform's motion language and fixes only the trigger:
 * `useInView` decides when, `standartMotion` decides how. `useInView` is used
 * exactly as it is - it already reports in-view immediately under reduced motion
 * or when IntersectionObserver is missing, and carries a 600ms safety net for
 * elements that mount late.
 */
import { Box } from '@mui/material';
import useInView from '../../../components/Common/useInView';
import { sectionRevealSx } from '../standartMotion';

/**
 * @param {object} props
 * @param {number} [props.index] place in the cascade; later blocks arrive later
 * @param {number} [props.base] a delay added on top, for a block that should
 *   wait for something above it to finish
 * @param {'div'|'section'|'li'|string} [props.as] the element to render
 * @param {object} [props.sx] merged AFTER the reveal - see the note below
 */
export default function SectionReveal({ children, index = 0, base = 0, as = 'div', sx, ...rest }) {
  const [ref, inView] = useInView();

  return (
    <Box
      ref={ref}
      component={as}
      sx={{
        // THE ORDER TRAP. The reveal goes LAST of the two, always.
        //
        // `recordRowRevealSx` emits animation LONGHANDS on purpose, and a
        // longhand only beats a later `animation: 'none'` shorthand if it is
        // spread after it. `standardTileSx` sets that shorthand in mono, so a
        // card that composed the two the other way round would still emit the
        // longhand - and a test that only checked the longhand was present would
        // pass while nothing moved. theme/recordMotion.render.test.jsx asserts
        // that failure mode explicitly.
        //
        // This component uses transitions rather than animations, so it is not
        // vulnerable itself; the ordering is kept anyway so the rule is the same
        // everywhere on the page and nobody has to remember which is which.
        ...sx,
        ...sectionRevealSx(index, inView, { base }),
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
