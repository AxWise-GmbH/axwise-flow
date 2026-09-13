import { describe, it, expect } from 'vitest';
import { getEnterpriseTheme } from './enterpriseTheme';
import {
  composerCardSx,
  composerInputColor,
  composerToolIconSx,
  composerSendSx,
  composerChipSx,
  composerBubbleSx,
  composerInk,
  composerShimmerBase,
  composerInkAlpha,
  composerBlockSx,
  composerAccent,
  composerTooltipBg,
  composerSurfaceTone,
  withComposerSurfaceTone,
} from './composerSurface';

const dark = getEnterpriseTheme('dark', null);
const light = getEnterpriseTheme('light', null);

/**
 * The dark values are what shipped before the light pass. They are frozen here
 * because the whole point of the refactor was to move colour out of two
 * components without moving any pixels in the theme people already use.
 */
describe('composerSurface: dark is exactly what shipped', () => {
  it('card', () => {
    expect(composerCardSx(dark)).toEqual({
      bgcolor: 'rgba(0, 0, 0, 0.3)',
      border: '1px solid',
      borderColor: 'rgba(255, 255, 255, 0.12)',
      boxShadow: 'none',
      transition: 'border-color .2s, box-shadow .2s',
    });
  });

  it('input, ink and shimmer are white', () => {
    expect(composerInputColor(dark)).toBe('#fff');
    expect(composerInk(dark)).toBe('#fff');
    expect(composerInk(dark, { muted: true })).toBe('rgba(255, 255, 255, 0.6)');
    expect(composerShimmerBase(dark)).toBe('#fff');
  });

  it('send keeps the translucent accent fill', () => {
    expect(composerSendSx(dark)).toEqual({
      color: '#fff',
      bgcolor: 'rgba(16, 185, 129, 0.35)',
      transition: 'background-color .2s',
      '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.5)' },
      '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.3)', bgcolor: 'transparent' },
    });
  });

  it('the assistant bubble keeps its faint white wash', () => {
    expect(composerBubbleSx(dark)).toEqual({
      bgcolor: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    });
  });

  it('keeps each shipped dark chip variant', () => {
    expect(composerChipSx(dark, { variant: 'suggestion' })).toEqual({
      bgcolor: 'rgba(255, 255, 255, 0.06)',
      color: 'rgba(255, 255, 255, 0.85)',
      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
    });
    expect(composerChipSx(dark, { variant: 'model' })).toEqual({
      bgcolor: 'rgba(255, 255, 255, 0.08)',
      color: 'rgba(255, 255, 255, 0.85)',
      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.14)' },
    });
    expect(composerChipSx(dark, { on: false })).toEqual({
      color: 'rgba(255, 255, 255, 0.6)',
      bgcolor: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid',
      borderColor: 'transparent',
      '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.12)' },
    });
  });

  it('keeps the shipped white hairline on the dark user bubble', () => {
    expect(composerBubbleSx(dark, { isUser: true })).toEqual({
      bgcolor: 'rgba(16, 185, 129, 0.22)',
      border: '1px solid',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    });
  });
});

describe('composerSurface: light reads on white', () => {
  it('the card is a white card with a hairline and a soft lift', () => {
    const sx = composerCardSx(light);
    expect(sx.bgcolor).toBe(light.palette.background.paper);
    expect(sx.borderColor).toBe(light.palette.divider);
    expect(sx.boxShadow).not.toBe('none');
  });

  it('typed text is ink, not white', () => {
    expect(composerInputColor(light)).toBe(light.palette.text.primary);
  });

  it('send fills solid, because a white glyph on 35% accent is invisible', () => {
    const sx = composerSendSx(light);
    expect(sx.bgcolor).toBe(light.palette.primary.main);
    expect(sx.color).toBe(light.palette.primary.contrastText);
  });

  it('an engaged chip uses the darker accent, not the near-white primary.light', () => {
    expect(composerChipSx(light, { on: true }).color).toBe(light.palette.primary.dark);
    expect(composerChipSx(light, { on: true }).color).not.toBe(light.palette.primary.light);
  });

  it('an engaged tool icon uses the darker accent', () => {
    expect(composerToolIconSx(light, { active: true }).color).toBe(light.palette.primary.dark);
    expect(composerToolIconSx(light).color).toBe(light.palette.text.secondary);
  });

  /**
   * The bug class this pass exists to kill: alpha('#fff', x) -> a translucent
   * white, which is a wash on a white page. Solid #FFFFFF is fine and expected
   * here - background.paper and primary.contrastText both resolve to it.
   */
  it('never hands back a translucent white', () => {
    const all = [
      composerCardSx(light),
      composerToolIconSx(light),
      composerToolIconSx(light, { active: true }),
      composerSendSx(light),
      composerChipSx(light),
      composerChipSx(light, { on: true }),
      composerBubbleSx(light),
      composerBubbleSx(light, { isUser: true }),
      { a: composerInputColor(light), b: composerInk(light), c: composerShimmerBase(light) },
    ];
    expect(JSON.stringify(all)).not.toContain('rgba(255, 255, 255');
  });

  it('takes its colours from the theme, so a custom accent tracks', () => {
    const violet = getEnterpriseTheme('light', '#7C3AED');
    expect(composerSendSx(violet).bgcolor).toBe(violet.palette.primary.main);
    expect(composerChipSx(violet, { on: true }).color).toBe(violet.palette.primary.dark);
    expect(violet.palette.primary.main).not.toBe(light.palette.primary.main);
  });
});

describe('composerSurface: reply blocks', () => {
  it('flips the ink base while preserving its alpha', () => {
    expect(composerInkAlpha(dark, 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(composerInkAlpha(light, 0.5)).toBe('rgba(15, 23, 42, 0.5)');
  });

  it('keeps the dark block treatment and gives light mode a readable surface', () => {
    expect(composerBlockSx(dark)).toEqual({
      border: '1px solid',
      borderColor: 'rgba(255, 255, 255, 0.08)',
      bgcolor: 'rgba(0, 0, 0, 0.25)',
    });
    expect(composerBlockSx(light).borderColor).toBe(light.palette.divider);
  });

  it('uses visible accent and tooltip colours in both modes', () => {
    expect(composerAccent(dark)).toBe(dark.palette.primary.light);
    expect(composerAccent(light)).toBe(light.palette.primary.main);
    expect(composerTooltipBg(dark)).toBe('#111');
    expect(composerTooltipBg(light)).toBe(light.palette.background.paper);
  });
});

describe('composerSurface: explicit host-surface tone', () => {
  it('keeps Voice Studio controls and chart tokens dark on a light app theme', () => {
    const studio = withComposerSurfaceTone(light, 'dark');

    expect(studio).not.toBe(light);
    expect(composerSurfaceTone(light)).toBe('light');
    expect(composerSurfaceTone(studio)).toBe('dark');
    expect(composerChipSx(studio, { variant: 'model' }).color).toBe('rgba(255, 255, 255, 0.85)');
    expect(composerToolIconSx(studio).color).toBe('rgba(255, 255, 255, 0.6)');
    expect(composerBlockSx(studio)).toEqual(composerBlockSx(dark));
    expect(composerInkAlpha(studio, 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(composerTooltipBg(studio)).toBe('#111');
  });

  it('uses the ambient palette for auto or invalid overrides', () => {
    expect(withComposerSurfaceTone(light, 'auto')).toBe(light);
    expect(composerSurfaceTone(withComposerSurfaceTone(dark, 'auto'))).toBe('dark');
  });
});
