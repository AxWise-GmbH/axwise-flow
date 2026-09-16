import { useRouteError } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import AppIcon from '../components/icons/AppIcon';

/**
 * Shown when a route throws (e.g. React error #310).
 * Uses React Router's useRouteError() so it must be rendered as errorElement.
 */
export default function ErrorBoundaryPage() {
  const error = useRouteError();
  const message = error?.message || 'Something went wrong.';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 3,
        bgcolor: 'background.default',
        color: 'text.primary',
      }}
    >
      <AppIcon
        name="ErrorOutline"
        fallback={ErrorOutlineIcon}
        sx={{ fontSize: 64, color: 'error.main' }}
      />
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Something went wrong
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: 'text.secondary', textAlign: 'center', maxWidth: 400 }}
      >
        {message}
      </Typography>
      <Button variant="contained" onClick={() => window.location.assign('/')} sx={{ mt: 1 }}>
        Go to home
      </Button>
    </Box>
  );
}
