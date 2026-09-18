import { SignIn, SignUp, useAuth } from '@clerk/react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom';
import { authEntryUrl, safeAuthReturnTo } from '../../lib/authReturnTo';

const appearance = {
  variables: {
    colorPrimary: '#7458DC',
    colorBackground: '#FFFFFF',
    colorText: '#192035',
    colorTextSecondary: '#60677B',
    colorInputBackground: '#F8F7FD',
    colorInputText: '#192035',
    borderRadius: '0.75rem',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none' },
    card: { width: '100%', border: '1px solid #E3DFF0', boxShadow: 'none' },
  },
};

export default function GcpAuthPage({ mode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const requested = location.state?.from || new URLSearchParams(location.search).get('returnTo');
  const returnTo = safeAuthReturnTo(requested, '/home');

  const isSignedOut = new URLSearchParams(location.search).get('signout') === 'true';

  if (!isLoaded)
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} aria-label="Loading authentication" />
      </Box>
    );
  if (isSignedIn && !isSignedOut) return <Navigate to={returnTo} replace />;

  const signingUp = mode === 'signup';
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 0.8fr) minmax(420px, 1.2fr)' },
        bgcolor: '#F8F7FD',
        color: '#192035',
        colorScheme: 'light',
      }}
    >
      <Stack
        justifyContent="space-between"
        spacing={5}
        sx={{ p: { xs: 3, sm: 5, md: 7 }, borderRight: { md: '1px solid #E3DFF0' } }}
      >
        <Typography
          component={RouterLink}
          to="/"
          sx={{ color: '#192035', textDecoration: 'none', fontWeight: 700 }}
        >
          Orqanix
        </Typography>
        <Box>
          <Typography variant="h3" component="h1" sx={{ maxWidth: 540, letterSpacing: '-0.04em' }}>
            {signingUp ? 'Start with one job.' : 'Welcome back.'}
          </Typography>
          <Typography sx={{ color: '#60677B', mt: 2, maxWidth: 480 }}>
            One chat, a connected workspace, and useful results. Pick up where you left off.
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: '#60677B' }}>
          Authentication and account security are managed by Clerk.
        </Typography>
      </Stack>
      <Box sx={{ display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
        {signingUp ? (
          <SignUp
            routing="hash"
            signInUrl={authEntryUrl('/login', returnTo)}
            fallbackRedirectUrl={returnTo}
            appearance={appearance}
          />
        ) : (
          <SignIn
            routing="hash"
            signUpUrl={authEntryUrl('/signup', returnTo)}
            fallbackRedirectUrl={returnTo}
            appearance={appearance}
          />
        )}
      </Box>
    </Box>
  );
}
