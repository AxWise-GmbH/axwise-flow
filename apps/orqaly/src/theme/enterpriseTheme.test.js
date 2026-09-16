import { describe, it, expect } from 'vitest';
import { lighten, darken } from '@mui/material/styles';
import { getAccentCssVars, getEnterpriseTheme, resolveAccent } from './enterpriseTheme';

describe('getAccentCssVars', () => {
  it('returns the brand emerald tokens when no override is set', () => {
    const vars = getAccentCssVars(null);
    expect(vars).toEqual({
      '--app-accent': '#10b981',
      '--app-accent-light': '#34d399',
      '--app-accent-dark': '#059669',
      '--app-accent-rgb': '16, 185, 129',
      '--app-accent-light-rgb': '52, 211, 153',
      '--app-accent-dark-rgb': '5, 150, 105',
    });
  });

  it('treats an empty string the same as no override', () => {
    expect(getAccentCssVars('')).toEqual(getAccentCssVars(null));
  });

  it('derives the accent tokens from a custom hex (Red preset)', () => {
    const vars = getAccentCssVars('#DC2626');
    expect(vars['--app-accent']).toBe('#DC2626');
    expect(vars['--app-accent-rgb']).toBe('220, 38, 38');
    // light/dark must mirror the MUI palette.primary derivation exactly
    expect(vars['--app-accent-light']).toBe(lighten('#DC2626', 0.5));
    expect(vars['--app-accent-dark']).toBe(darken('#DC2626', 0.2));
    expect(vars['--app-accent-light-rgb']).toBe('237, 146, 146');
    expect(vars['--app-accent-dark-rgb']).toBe('176, 30, 30');
  });

  it('produces an --app-accent that matches the MUI palette primary.main', () => {
    const override = '#7C3AED'; // Violet preset
    const theme = getEnterpriseTheme('dark', override);
    expect(getAccentCssVars(override)['--app-accent']).toBe(theme.palette.primary.main);
  });

  it('falls back to the brand tokens for a malformed colour', () => {
    expect(getAccentCssVars('not-a-color')).toEqual(getAccentCssVars(null));
  });
});

describe('resolveAccent', () => {
  const BRAND = { main: '#10B981', light: '#34D399', dark: '#059669', contrastText: '#FFFFFF' };

  it('returns the brand emerald primary when no override and no stored colour', () => {
    localStorage.removeItem('orchestratori-primary-color');
    expect(resolveAccent()).toEqual(BRAND);
  });

  it('reads the persisted accent from localStorage when no explicit override', () => {
    localStorage.setItem('orchestratori-primary-color', '#DC2626');
    const accent = resolveAccent();
    expect(accent.main).toBe('#DC2626');
    expect(accent.light).toBe(lighten('#DC2626', 0.5));
    expect(accent.dark).toBe(darken('#DC2626', 0.2));
    localStorage.removeItem('orchestratori-primary-color');
  });

  it('prefers an explicit override over the stored colour', () => {
    localStorage.setItem('orchestratori-primary-color', '#DC2626');
    expect(resolveAccent('#7C3AED').main).toBe('#7C3AED');
    localStorage.removeItem('orchestratori-primary-color');
  });

  it('matches the MUI palette primary derivation for the same override', () => {
    const override = '#7C3AED';
    const theme = getEnterpriseTheme('dark', override);
    const accent = resolveAccent(override);
    expect(accent.main).toBe(theme.palette.primary.main);
    expect(accent.light).toBe(theme.palette.primary.light);
    expect(accent.dark).toBe(theme.palette.primary.dark);
  });

  it('falls back to the brand primary for a malformed colour', () => {
    expect(resolveAccent('not-a-color')).toEqual(BRAND);
  });
});
