import { describe, it, expect, vi } from 'vitest';
import { createTheme } from '@mui/material/styles';
import {
  REDUCED_MOTION,
  auroraHeaderSx,
  magneticPillSx,
  paneSwapSx,
  parallaxGlyphSx,
  railIndicatorSx,
  withViewTransition,
} from './settingsMotion.js';

const dark = createTheme({ palette: { mode: 'dark' } });
const light = createTheme({ palette: { mode: 'light' } });

describe('settingsMotion', () => {
  it('drifts the aurora and stops it under reduced motion', () => {
    const sx = auroraHeaderSx(dark);
    expect(sx.animation).toContain('settingsAurora');
    expect(sx[REDUCED_MOTION].animation).toBe('none');
  });

  it('keeps the aurora fainter in light mode', () => {
    expect(auroraHeaderSx(light).opacity).toBeLessThan(auroraHeaderSx(dark).opacity);
  });

  it('places the indicator where the rail measured it', () => {
    const sx = railIndicatorSx(dark, { x: 120, w: 88, ready: true });
    expect(sx.transform).toBe('translateX(120px)');
    expect(sx.width).toBe(88);
    expect(sx.opacity).toBe(1);
    expect(sx.transition).toContain('transform');
  });

  it('hides the indicator and refuses to animate before the rail has measured', () => {
    const sx = railIndicatorSx(dark);
    expect(sx.opacity).toBe(0);
    expect(sx.transition).toBe('none');
  });

  it('leans a pill only where there is a real pointer', () => {
    const sx = magneticPillSx();
    expect(sx['@media (pointer: fine)'].transform).toContain('--mx');
    expect(sx[REDUCED_MOTION].transform).toBe('none');
  });

  it('replays the pane entrance and skips it under reduced motion', () => {
    const sx = paneSwapSx();
    expect(sx.animation).toContain('settingsPaneIn');
    expect(sx[REDUCED_MOTION].animation).toBe('none');
  });

  it('guards the glyph parallax behind @supports', () => {
    const sx = parallaxGlyphSx();
    expect(sx['@supports (animation-timeline: view())'].animationTimeline).toBe('view()');
    expect(sx[REDUCED_MOTION].animation).toBe('none');
  });
});

describe('withViewTransition', () => {
  it('uses the browser transition when there is one', () => {
    const apply = vi.fn();
    document.startViewTransition = vi.fn((fn) => fn());
    withViewTransition(apply);
    expect(document.startViewTransition).toHaveBeenCalled();
    expect(apply).toHaveBeenCalled();
    delete document.startViewTransition;
  });

  it('still applies the change when there is none', () => {
    const apply = vi.fn();
    withViewTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('falls back when the browser throws', () => {
    const apply = vi.fn();
    document.startViewTransition = vi.fn(() => {
      throw new Error('nope');
    });
    withViewTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    delete document.startViewTransition;
  });
});
