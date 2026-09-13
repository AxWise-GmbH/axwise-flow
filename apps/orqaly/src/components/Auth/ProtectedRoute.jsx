import { Fragment } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import Logo from '../Common/Logo';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#F1F5F9',
          gap: 2,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
            color: '#fff',
          }}
        >
          <Logo size={32} />
        </Box>
        <CircularProgress size={32} sx={{ color: 'primary.main' }} />
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
          Loading...
        </Typography>
      </Box>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from: returnTo }} />;
  }

  // Remount the authenticated shell on an in-place Clerk account switch so
  // component-local data from the previous user cannot survive one render.
  return <Fragment key={user?.uid || user?.id || 'authenticated'}>{children}</Fragment>;
}
