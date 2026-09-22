import { createTheme } from '@mui/material/styles';
import { PAGE_BACKGROUND, PAGE_BACKGROUND_LIGHT } from './palette';

const MONO = '"Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

const typography = {
  fontFamily: '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  button: {
    fontFamily: MONO,
    fontSize: '0.78rem',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
};

// A black stage. It has to be a dark-mode theme, not just dark colours: LineOrb
// only stacks its strokes additively (the glow) when palette.mode is 'dark'.
export const instantTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e6e6e6', dark: '#8a8a8a', contrastText: '#000000' },
    background: { default: PAGE_BACKGROUND, paper: '#0c0c0c' },
    text: { primary: '#fafafa', secondary: '#a1a1a1' },
    divider: 'rgba(255, 255, 255, 0.1)',
  },
  typography,
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 999 },
        contained: {
          backgroundColor: '#fafafa',
          color: '#000000',
          '&:hover': {
            backgroundColor: '#ffffff',
            boxShadow: '0 0 32px rgba(255, 255, 255, 0.28)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.22)',
          color: '#fafafa',
          '&:hover': { borderColor: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.06)' },
        },
        text: { color: '#c9c9c9', '&:hover': { color: '#ffffff', backgroundColor: 'transparent' } },
      },
    },
  },
});

// The light twin, picked with the footer switch. Being a light-mode theme is what tells
// LineOrb to paint its strokes normally, so where its fields cross they darken instead.
export const instantLightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#111111', dark: '#6e6e6e', contrastText: '#ffffff' },
    background: { default: PAGE_BACKGROUND_LIGHT, paper: '#ffffff' },
    text: { primary: '#0a0a0a', secondary: '#5c5c5c' },
    divider: 'rgba(0, 0, 0, 0.09)',
  },
  typography,
  shape: { borderRadius: 12 },
});

export const instantThemeFor = (theme) => (theme === 'light' ? instantLightTheme : instantTheme);
