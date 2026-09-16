import { Box } from '@mui/material';
import { LoaderRipple } from './LoaderOptions';

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 12,
        gap: 3,
      }}
    >
      <LoaderRipple size={80} />
    </Box>
  );
}
