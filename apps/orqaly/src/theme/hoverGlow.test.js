import { describe, it, expect } from 'vitest';
import { buildAssistantPulseSx } from './hoverGlow';

const mockTheme = { palette: { primary: { main: '#10B981' } } };

describe('buildAssistantPulseSx', () => {
  const sx = buildAssistantPulseSx(mockTheme);

  it('removes all button chrome from the host (no fill/border/box-shadow)', () => {
    expect(sx).not.toHaveProperty('bgcolor');
    expect(sx).not.toHaveProperty('border');
    expect(sx).not.toHaveProperty('borderColor');
    expect(sx).not.toHaveProperty('boxShadow');
    // and no host-level :hover background that would re-create the button feel
    expect(sx['&:hover']).toBeUndefined();
  });

  it('paints the icon and label with the primary (emerald) color', () => {
    expect(sx['& .MuiListItemIcon-root'].color).toBe('#10B981');
    expect(sx['& .MuiTypography-root'].color).toBe('#10B981');
  });

  it('pulses the letters and icon via their own keyframes', () => {
    expect(sx['& .MuiTypography-root'].animation).toContain('assistantTextPulse');
    expect(sx['& .MuiListItemIcon-root'].animation).toContain('assistantIconPulse');
    expect(sx['@keyframes assistantTextPulse']).toBeDefined();
    expect(sx['@keyframes assistantIconPulse']).toBeDefined();
  });

  it('glows at the midpoint of each keyframe', () => {
    // alpha() resolves the emerald hex to its rgba form
    expect(sx['@keyframes assistantTextPulse']['50%'].textShadow).toContain('rgba(16, 185, 129');
    expect(sx['@keyframes assistantTextPulse']['50%'].opacity).toBe(1);
    expect(sx['@keyframes assistantIconPulse']['50%'].filter).toContain('drop-shadow');
    expect(sx['@keyframes assistantIconPulse']['50%'].filter).toContain('rgba(16, 185, 129');
  });

  it('disables the animation under prefers-reduced-motion', () => {
    const reduced = sx['@media (prefers-reduced-motion: reduce)'];
    expect(reduced['& .MuiListItemIcon-root, & .MuiTypography-root'].animation).toBe('none');
    expect(reduced['& .MuiListItemIcon-root, & .MuiTypography-root'].opacity).toBe(1);
  });
});
