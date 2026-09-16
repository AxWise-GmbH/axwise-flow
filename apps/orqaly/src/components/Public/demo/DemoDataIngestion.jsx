import { Box, Typography, Stack, alpha, useTheme, LinearProgress, CircularProgress, Grid } from '@mui/material';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

export default function DemoDataIngestion() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const primary = theme.palette.primary.main;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: isDark ? alpha('#111318', 0.8) : alpha('#ffffff', 0.9),
        borderRadius: 4,
        border: `1px solid ${isDark ? alpha('#ffffff', 0.1) : alpha('#000', 0.1)}`,
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: isDark 
          ? `0 24px 64px ${alpha('#000', 0.6)}`
          : `0 24px 64px ${alpha('#000', 0.1)}`,
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        '& *': {
          fontFamily: '"Inter", "Roboto", sans-serif',
        }
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.25rem', color: 'text.primary', mb: 0.5 }}>
            Dataset Enrichment
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            Real-time synthetic data generation
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(primary, 0.1), color: primary }}>
          <AppIcon name='StorageOutlined' fallback={StorageOutlinedIcon} />
        </Box>
      </Stack>
      <Stack spacing={4}>
        <Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.primary' }}>
              Conversational Tokens
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: primary }}>
              24M / 50M
            </Typography>
          </Stack>
          <LinearProgress 
            variant="determinate" 
            value={48} 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              bgcolor: alpha(primary, 0.1),
              '& .MuiLinearProgress-bar': { borderRadius: 4 }
            }} 
          />
        </Box>

        <Box>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.primary' }}>
              Decision Matrices
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#10B981' }}>
              12K / 15K
            </Typography>
          </Stack>
          <LinearProgress 
            variant="determinate" 
            value={80} 
            sx={{ 
              height: 8, 
              borderRadius: 4,
              bgcolor: alpha('#10B981', 0.1),
              '& .MuiLinearProgress-bar': { bgcolor: '#10B981', borderRadius: 4 }
            }} 
          />
        </Box>

        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid size={{ xs: 6 }}>
            <Box sx={{ p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AppIcon
                  name='TimelineOutlined'
                  fallback={TimelineOutlinedIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>Velocity</Typography>
              </Stack>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: 'text.primary' }}>450 / sec</Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Box sx={{ p: 2, borderRadius: 3, border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`, bgcolor: alpha(theme.palette.text.primary, 0.02) }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AppIcon
                  name='CheckCircleOutline'
                  fallback={CheckCircleOutlineIcon}
                  sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>Quality Score</Typography>
              </Stack>
              <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: 'text.primary' }}>98.4%</Typography>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ p: 3, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.03), border: `1px dashed ${alpha(theme.palette.text.primary, 0.2)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
           <CircularProgress size={20} thickness={5} sx={{ color: primary }} />
           <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.primary' }}>
             Processing New Interactions...
           </Typography>
        </Box>
      </Stack>
    </Box>
  );
}
