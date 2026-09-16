import { useAuth } from '@clerk/react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';

function clerkHandoff(search) {
  const incoming = new URLSearchParams(search);
  const outgoing = new URLSearchParams();
  for (const key of ['__clerk_ticket', '__clerk_status']) {
    const value = incoming.get(key);
    if (value) outgoing.set(key, value);
  }
  const redirectUrl = incoming.get('redirect_url');
  if (redirectUrl?.startsWith('/') && !redirectUrl.startsWith('//'))
    outgoing.set('redirect_url', redirectUrl);
  const flow = String(incoming.get('flow') || incoming.get('type') || '').toLowerCase();
  const path = outgoing.has('__clerk_ticket') || flow.includes('invite') ? '/signup' : '/login';
  return outgoing.size ? `${path}?${outgoing}` : path;
}

export default function GcpInviteCallback() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  if (!isLoaded)
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28} aria-label="Loading authentication" />
      </Box>
    );
  return <Navigate to={isSignedIn ? '/home' : clerkHandoff(location.search)} replace />;
}
