import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import WorkflowV2 from '@workflow-v2-page';
import './styles.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

if (!clerkPublishableKey) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required');
}

if (!import.meta.env.VITE_ORQALY_API_URL) {
  throw new Error('VITE_ORQALY_API_URL is required');
}

const theme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#171717' },
        background: { default: '#f5f5f2', paper: '#ffffff' },
        divider: 'rgba(23, 23, 23, 0.14)',
      },
    },
    dark: {
      palette: {
        primary: { main: '#f4f4ef' },
        background: { default: '#101111', paper: '#171818' },
        divider: 'rgba(244, 244, 239, 0.16)',
      },
    },
  },
  typography: {
    fontFamily,
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
});

const clerkAppearance = {
  variables: {
    colorPrimary: '#171717',
    borderRadius: '6px',
    fontFamily,
  },
  elements: {
    cardBox: { boxShadow: 'none' },
    card: {
      border: '1px solid rgba(23, 23, 23, 0.14)',
      boxShadow: 'none',
    },
    formButtonPrimary: {
      boxShadow: 'none',
      textTransform: 'none',
    },
    footerActionLink: { fontWeight: 600 },
  },
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInFallbackRedirectUrl="/workflows-v2"
      signUpFallbackRedirectUrl="/workflows-v2"
      appearance={clerkAppearance}
    >
      <ThemeProvider theme={theme} defaultMode="system">
        <CssBaseline />
        <WorkflowV2 />
      </ThemeProvider>
    </ClerkProvider>
  </StrictMode>
);
