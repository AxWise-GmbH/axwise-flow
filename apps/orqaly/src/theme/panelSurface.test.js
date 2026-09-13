import { describe, it, expect } from 'vitest';
import { createTheme } from '@mui/material/styles';
import { alpha } from '@mui/material';
import { panelSurfaceTokens, PANEL_DARK } from './panelSurface';

const theme = createTheme({ palette: { primary: { main: '#10B981' } } });

describe('panelSurfaceTokens - dark', () => {
  // These are the literals the two setup drawers used before they shared a
  // scale. If one of them changes, a panel changed appearance, which is the
  // one thing porting them onto this module was not supposed to do.
  it('returns the exact surface both drawers hardcoded', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.bg).toBe('#141414');
    expect(t.fg).toBe('#FFFFFF');
    expect(t.hairline).toBe(alpha('#FFFFFF', 0.08));
    expect(t.textMuted).toBe(alpha('#FFFFFF', 0.75));
    expect(t.textDim).toBe(alpha('#FFFFFF', 0.55));
    expect(t.textFaint).toBe(alpha('#FFFFFF', 0.5));
    expect(t.fill).toBe(alpha('#FFFFFF', 0.04));
    expect(t.fillHover).toBe(alpha('#FFFFFF', 0.07));
    expect(t.iconWell).toBe(alpha('#FFFFFF', 0.06));
    expect(t.iconFg).toBe(alpha('#FFFFFF', 0.8));
    expect(t.controlBorder).toBe(alpha('#FFFFFF', 0.15));
  });

  it('paperSx is the drawer paper, and goes full width on a phone', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.paperSx({ width: 400 })).toMatchObject({
      width: 400,
      maxWidth: '100%',
      bgcolor: PANEL_DARK.bg,
      color: PANEL_DARK.fg,
    });
    expect(t.paperSx({ width: 400, fullScreen: true }).width).toBe('100%');
  });

  it('the sticky header is opaque, so the body cannot scroll through it', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.headerSx.position).toBe('sticky');
    expect(t.headerSx.bgcolor).toBe(PANEL_DARK.bg);
  });

  it('the body scrolls on its own, not with the page', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.bodySx).toMatchObject({ flex: 1, minHeight: 0, overflowY: 'auto' });
  });

  it('fieldSx paints the notched outline, not just the text', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.fieldSx.color).toBe(PANEL_DARK.fg);
    expect(t.fieldSx['.MuiOutlinedInput-notchedOutline'].borderColor).toBe(t.controlBorder);
  });

  it('menuSlotProps drags popovers onto the panel ground', () => {
    const t = panelSurfaceTokens(theme);
    expect(t.menuSlotProps.paper.sx.bgcolor).toBe(PANEL_DARK.bg);
    expect(t.menuSlotProps.paper.sx.color).toBe(PANEL_DARK.fg);
  });
});

describe('panelSurfaceTokens - auto', () => {
  it('maps every tone onto the palette, never onto a literal', () => {
    const light = panelSurfaceTokens(theme, { mode: 'auto' });
    expect(light.bg).toBe(theme.palette.background.paper);
    expect(light.fg).toBe(theme.palette.text.primary);
    expect(light.bg).not.toBe(PANEL_DARK.bg);
    expect(light.hairline).toBe(alpha(theme.palette.text.primary, 0.08));
  });

  it('follows a dark palette too, rather than pinning its own', () => {
    const dark = createTheme({ palette: { mode: 'dark' } });
    const t = panelSurfaceTokens(dark, { mode: 'auto' });
    expect(t.bg).toBe(dark.palette.background.paper);
    expect(t.fg).toBe(dark.palette.text.primary);
  });
});
