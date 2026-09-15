import { createTheme } from '@mui/material/styles';

// The public site is intentionally light. The signed-in workspace keeps its own theme.
export const landingTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#6f50e7', dark: '#5637c8', contrastText: '#ffffff' },
    background: { default: '#f8f9fe', paper: '#ffffff' },
    text: { primary: '#171d35', secondary: '#5e657c' },
    divider: '#e0e3ef',
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
