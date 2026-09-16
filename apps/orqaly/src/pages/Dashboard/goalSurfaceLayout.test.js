/**
 * [module: frontend]
 *
 * The thread scrolls inside the screen, or the screen scrolls and the composer
 * goes with it. These cases pin the arithmetic that decides which.
 */
import { describe, it, expect } from 'vitest';
import {
  DOCK_CLEARANCE_PX,
  HEADER_OFFSET_PX,
  SURFACE_TOP_PAD_PX,
  TYPING_CLEARANCE_PX,
  goalSurfaceHeight,
  heroMinHeight,
} from './goalSurfaceLayout';
import { HEADER_HEIGHT, HEADER_OFFSET, SIDEBAR_INSET } from '../../utils/constants';

describe('goalSurfaceHeight', () => {
  it('starts from the header the shell already offsets main by', () => {
    expect(HEADER_OFFSET_PX).toBe(HEADER_HEIGHT + SIDEBAR_INSET);
    expect(goalSurfaceHeight().sm).toContain(`- ${HEADER_OFFSET_PX}px`);
    expect(goalSurfaceHeight().xs).toContain(`- ${HEADER_OFFSET.xs}px`);
  });

  // Padding for the dock twice - once in main, once here - is what left a band
  // of dead space under the composer.
  it('subtracts the dock clearance main already reserves, once', () => {
    const { xs, sm } = goalSurfaceHeight();
    expect(xs).toContain(`- ${DOCK_CLEARANCE_PX.xs}px`);
    expect(sm).toContain(`- ${DOCK_CLEARANCE_PX.sm}px`);
    expect(sm.match(/- 96px/g)).toHaveLength(1);
  });

  it('leaves room for the surface own top padding', () => {
    expect(goalSurfaceHeight().sm).toContain(`- ${SURFACE_TOP_PAD_PX}px`);
    expect(goalSurfaceHeight({ topPad: 0 }).sm).not.toContain('- 4px');
  });

  // vh keeps measuring the tall viewport while a mobile browser's toolbar is
  // showing, which puts the composer below the fold for as long as it is.
  it('measures the dynamic viewport, not the static one', () => {
    const { xs, sm } = goalSurfaceHeight();
    [xs, sm].forEach((value) => {
      expect(value).toContain('100dvh');
      expect(value).not.toContain('100vh -');
    });
  });

  it('keeps clear of the home indicator on a notched phone', () => {
    expect(goalSurfaceHeight().xs).toContain('env(safe-area-inset-bottom, 0px)');
  });

  // A definite height is the whole point: min-height would let it grow again.
  it('is a definite length, not an open-ended one', () => {
    const { xs, sm } = goalSurfaceHeight();
    [xs, sm].forEach((value) => expect(value.startsWith('calc(')).toBe(true));
  });

  it('returns dock clearance while typing so the composer reaches the footer', () => {
    const { xs, sm } = goalSurfaceHeight({ bottomClearance: TYPING_CLEARANCE_PX });
    expect(xs).toContain(`- ${TYPING_CLEARANCE_PX.xs}px`);
    expect(sm).toContain(`- ${TYPING_CLEARANCE_PX.sm}px`);
  });

  it('derives the empty hero minimum from the same header offsets', () => {
    expect(heroMinHeight()).toEqual({
      xs: `calc(100dvh - ${HEADER_OFFSET.xs}px)`,
      sm: `calc(100dvh - ${HEADER_OFFSET.sm}px)`,
    });
  });
});
