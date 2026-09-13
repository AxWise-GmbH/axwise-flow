import { SignUp, useAuth as useClerkAuth } from '@clerk/react';
import { Box, CircularProgress, Container } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import PublicShell from '../../components/Public/PublicShell';
import { authEntryUrl, safeAuthReturnTo } from '../../lib/authReturnTo';
import { PageHero } from './_shared';

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
      boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)',
    },
    card: {
      width: '100%',
      border: '1px solid rgba(148, 163, 184, 0.28)',
    },
  },
};

export default function Signup() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();
  const returnTo = safeAuthReturnTo(new URLSearchParams(location.search).get('returnTo'));

  if (!isLoaded) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={32} aria-label="Loading authentication" />
      </Box>
    );
  }

  if (isSignedIn) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <PublicShell>
      <PageHero
        eyebrow="Get started"
        title="Create your Orqaly account."
        subtitle="Set up your secure account, then continue directly into your workspace."
      />
      <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="sm" sx={{ display: 'flex', justifyContent: 'center' }}>
          <SignUp
            routing="hash"
            signInUrl={authEntryUrl('/login', returnTo)}
            fallbackRedirectUrl={returnTo}
            appearance={clerkAppearance}
          />
        </Container>
      </Box>
    </PublicShell>
  );
}
