import { createTheme } from '@mui/material/styles';

const MONO = '"Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

// A black stage. It has to be a dark-mode theme, not just dark colours: LineOrb
// only stacks its strokes additively (the glow) when palette.mode is 'dark'.
export const instantTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e6e6e6', dark: '#8a8a8a', contrastText: '#000000' },
    background: { default: '#000000', paper: '#0c0c0c' },
    text: { primary: '#fafafa', secondary: '#a1a1a1' },
    divider: 'rgba(255, 255, 255, 0.1)',
  },
  typography: {
    fontFamily: '"Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: {
      fontFamily: MONO,
      fontSize: '0.78rem',
      fontWeight: 500,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
  },
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
