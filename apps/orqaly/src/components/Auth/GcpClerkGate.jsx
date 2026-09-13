import { Fragment } from 'react';
import { useAuth } from '@clerk/react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';

export default function GcpClerkGate({ children }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#0A0A0A' }}>
        <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
          <CircularProgress size={28} color="inherit" aria-label="Loading authentication" />
          <Typography variant="body2" color="text.secondary">
            Checking your session…
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!isSignedIn) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Fragment key={userId || 'signed-in'}>{children}</Fragment>;
}
