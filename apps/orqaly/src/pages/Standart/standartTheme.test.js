import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { standartTheme } from './standartTheme';
import { FONT_STACK, RADII } from './standartTokens';

describe('standartTheme PR #59 fidelity', () => {
  it('keeps the authoritative dark mono palette and action states', () => {
    expect(standartTheme.mono).toBe(true);
    expect(standartTheme.monoAccent).toBe(false);
    expect(standartTheme.palette).toMatchObject({
      mode: 'dark',
      primary: { main: '#F5F5F5', contrastText: '#0A0A0A' },
      text: { primary: '#E6EDF3', secondary: '#8B949E', disabled: '#475569' },
      background: { default: '#0a0a0a', paper: '#0f0f0f', neutral: '#171717' },
      divider: '#1a1a1a',
      action: {
        hover: 'rgba(245, 245, 245, 0.04)',
        selected: 'rgba(245, 245, 245, 0.08)',
        disabled: 'rgba(100, 116, 139, 0.3)',
        disabledBackground: 'rgba(100, 116, 139, 0.12)',
      },
    });
  });

  it('preserves the enterprise type ramp beneath the landing font override', () => {
    expect(standartTheme.typography.fontFamily).toBe(FONT_STACK);
    expect(standartTheme.typography.h1).toMatchObject({
      fontSize: '2rem',
      fontWeight: 700,
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    });
    expect(standartTheme.typography.body1).toMatchObject({
      fontSize: '0.9375rem',
      lineHeight: 1.6,
      color: '#8B949E',
    });
  });

  it('keeps portal papers and button interactions aligned with PR #59', () => {
    const components = standartTheme.components;
    expect(components.MuiButton.styleOverrides.root).toMatchObject({
      borderRadius: RADII.pill,
      padding: '8px 16px',
      fontWeight: 700,
      '&:focus-visible': {
        outline: '2px solid rgba(245, 245, 245, 0.55)',
        outlineOffset: '2px',
      },
    });
    expect(components.MuiPaper.defaultProps.elevation).toBe(0);
    expect(components.MuiPopover.styleOverrides.paper).toMatchObject({
      borderRadius: 12,
      border: '1px solid #1a1a1a',
      backgroundImage: 'none',
    });
    expect(components.MuiMenu.styleOverrides.paper.borderRadius).toBe(10);
    expect(components.MuiDrawer.styleOverrides.paper).toEqual({
      backgroundImage: 'none',
      borderRadius: 0,
      borderColor: '#1a1a1a',
    });
  });

  it('does not reintroduce the legacy theme graph', () => {
    const source = readFileSync('src/pages/Standart/standartTheme.js', 'utf8');
    expect(source).not.toMatch(/(?:import|from)\s*(?:\(|)['"]\.\.\/\.\.\/theme\//);
  });
});
