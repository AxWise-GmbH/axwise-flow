import { Navigate, useLocation } from 'react-router-dom';
import { SignIn, useAuth as useClerkAuth } from '@clerk/react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import Logo from '../../components/Common/Logo';
import { authEntryUrl, safeAuthReturnTo } from '../../lib/authReturnTo';

const clerkAppearance = {
  variables: {
    colorPrimary: '#2563EB',
    borderRadius: '0.75rem',
    fontFamily: 'inherit',
  },
  elements: {
    rootBox: {
      width: '100%',
    },
    cardBox: {
      width: '100%',
      boxShadow: '0 24px 60px rgba(15, 23, 42, 0.14)',
    },
    card: {
      width: '100%',
      border: '1px solid rgba(148, 163, 184, 0.28)',
    },
  },
};

export default function Login() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();
  const requestedReturnTo =
    location.state?.from || new URLSearchParams(location.search).get('returnTo');
  const returnTo = safeAuthReturnTo(requestedReturnTo);

  if (!isLoaded) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#F1F5F9',
        }}
      >
        <CircularProgress size={32} aria-label="Loading authentication" />
      </Box>
    );
  }

  if (isSignedIn) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: { xs: 4, md: 7 },
        bgcolor: '#F1F5F9',
        backgroundImage:
          'radial-gradient(circle at 15% 10%, rgba(37, 99, 235, 0.12), transparent 36%), radial-gradient(circle at 85% 90%, rgba(14, 165, 233, 0.10), transparent 32%)',
      }}
    >
      <Stack spacing={3} alignItems="center" sx={{ width: '100%', maxWidth: 440 }}>
        <Stack spacing={1.25} alignItems="center" textAlign="center">
          <Box
            sx={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: 'common.white',
              boxShadow: '0 12px 26px rgba(37, 99, 235, 0.28)',
            }}
          >
            <Logo size={34} />
          </Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 900, letterSpacing: '-0.03em' }}
          >
            Welcome to Orqaly
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in securely with your Orqaly account.
          </Typography>
        </Stack>

        <SignIn
          routing="hash"
          signUpUrl={authEntryUrl('/signup', returnTo)}
          fallbackRedirectUrl={returnTo}
          appearance={clerkAppearance}
        />
      </Stack>
    </Box>
  );
}
