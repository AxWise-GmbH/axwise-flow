import { useAuth as useClerkAuth } from '@clerk/react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';

function buildClerkHandoff(search) {
  const incoming = new URLSearchParams(search);
  const outgoing = new URLSearchParams();

  // Clerk invitation links use a short-lived ticket. Only pass Clerk-owned
  // callback state through; old Supabase codes and arbitrary external redirects
  // are intentionally discarded.
  for (const key of ['__clerk_ticket', '__clerk_status']) {
    const value = incoming.get(key);
    if (value) outgoing.set(key, value);
  }

  const redirectUrl = incoming.get('redirect_url');
  if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//')) {
    outgoing.set('redirect_url', redirectUrl);
  }

  const flow = String(incoming.get('flow') || incoming.get('type') || '').toLowerCase();
  const isInvite = outgoing.has('__clerk_ticket') || flow.includes('invite');
  const path = isInvite ? '/signup' : '/login';
  const query = outgoing.toString();

  return query ? `${path}?${query}` : path;
}

export default function InviteCallback() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <Stack spacing={2} alignItems="center">
          <CircularProgress size={30} aria-label="Loading authentication" />
          <Typography variant="body2" color="text.secondary">
            Finishing secure sign-in…
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (isSignedIn) {
    return <Navigate to="/home" replace />;
  }

  return <Navigate to={buildClerkHandoff(location.search)} replace />;
}
