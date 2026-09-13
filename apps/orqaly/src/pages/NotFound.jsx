import { Box, Typography, Button, Paper, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';

import AppIcon from '../components/icons/AppIcon';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        py: 4,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 4,
          maxWidth: 420,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <AppIcon
          name="SearchOffOutlined"
          fallback={SearchOffOutlinedIcon}
          sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }}
        />
        <Typography
          variant="h1"
          sx={{
            fontWeight: 800,
            fontSize: '4rem',
            lineHeight: 1,
            color: 'text.secondary',
            opacity: 0.4,
          }}
        >
          404
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 600, mt: 2, mb: 1, color: 'text.primary' }}>
          Page not found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center" flexWrap="wrap">
          <Button
            variant="contained"
            startIcon={<AppIcon name="HomeOutlined" fallback={HomeOutlinedIcon} />}
            onClick={() => navigate('/dashboard')}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Go to Dashboard
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate(-1)}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            Go back
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
