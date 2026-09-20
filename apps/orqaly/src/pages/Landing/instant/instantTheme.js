import { createTheme } from '@mui/material/styles';

const MONO = '"Geist Mono", ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

// A black stage. It has to be a dark-mode theme, not just dark colours: LineOrb
// only stacks its strokes additively (the glow) when palette.mode is 'dark'.
export const instantTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4a9f7a', dark: '#1d5f42', contrastText: '#060a08' },
    background: { default: '#030b07', paper: '#07140e' },
    text: { primary: '#f4f6f5', secondary: '#8d919c' },
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
          backgroundColor: '#f4f6f5',
          color: '#060a08',
          '&:hover': {
            backgroundColor: '#ffffff',
            boxShadow: '0 0 32px rgba(143, 217, 179, 0.45)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.22)',
          color: '#f4f6f5',
          '&:hover': { borderColor: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.06)' },
        },
        text: { color: '#c9ccd6', '&:hover': { color: '#ffffff', backgroundColor: 'transparent' } },
      },
    },
  },
});
