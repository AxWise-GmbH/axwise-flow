import { createTheme } from '@mui/material/styles';

// The public site is intentionally light. The signed-in workspace keeps its own theme.
export const landingTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#111111', dark: '#000000', contrastText: '#ffffff' },
    background: { default: '#f8f8f8', paper: '#ffffff' },
    text: { primary: '#1e1e1e', secondary: '#666666' },
    divider: '#e3e3e3',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
});
