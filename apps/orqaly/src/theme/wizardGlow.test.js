import { describe, it, expect } from 'vitest';
import { createTheme } from '@mui/material/styles';
import { glowPillSx, cardHoverGlowSx, stepEntranceSx, openSectionSx } from './wizardGlow';
import { createHoverGlowShadow } from './hoverGlow';

const theme = createTheme({ palette: { primary: { main: '#10B981' } } });

describe('wizardGlow', () => {
  it('glowPillSx is an outlined pill without a pulse by default', () => {
    const sx = glowPillSx(theme);
    expect(sx.borderRadius).toBe(2);
    expect(sx.textTransform).toBe('none');
    expect(sx.animation).toBeUndefined();
  });

  it('glowPillSx adds the pulse keyframe when pulse:true', () => {
    const sx = glowPillSx(theme, { pulse: true });
    expect(sx.animation).toMatch(/howWorksGlow/);
    expect(sx['@keyframes howWorksGlow']).toBeTruthy();
  });

  it('cardHoverGlowSx has a hover boxShadow', () => {
    const sx = cardHoverGlowSx(theme);
    expect(sx['&:hover'].boxShadow).toMatch(/px/);
  });

  it('stepEntranceSx hides until mounted and staggers by index', () => {
    expect(stepEntranceSx(false, 2).opacity).toBe(0);
    expect(stepEntranceSx(true, 0).opacity).toBe(1);
    expect(stepEntranceSx(true, 0).transition).not.toBe(stepEntranceSx(true, 1).transition);
  });

  it('openSectionSx leaves a closed section unlit, on its resting border', () => {
    const sx = openSectionSx(theme, { open: false, restingBorderColor: 'rgba(255,255,255,0.08)' });
    expect(sx.boxShadow).toBeUndefined();
    expect(sx.borderColor).toBe('rgba(255,255,255,0.08)');
  });

  it('openSectionSx lights an open section with the shared halo', () => {
    const sx = openSectionSx(theme, { open: true, restingBorderColor: 'rgba(255,255,255,0.08)' });
    expect(sx.boxShadow).toBe(createHoverGlowShadow(theme));
    expect(sx.borderColor).not.toBe('rgba(255,255,255,0.08)');
  });

  // The resting override is spread after cardHoverGlowSx, so it must not take
  // the hover halo down with it - a closed section still lights under the
  // cursor like every other card on the platform.
  it('openSectionSx keeps the hover halo through the resting override', () => {
    const closed = openSectionSx(theme, { open: false, restingBorderColor: 'red' });
    expect(closed['&:hover'].boxShadow).toBe(createHoverGlowShadow(theme));
    expect(closed.transition).toMatch(/box-shadow/);
  });
});
