import { Box, Chip, Rating, Stack, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';

import AppIcon from '../../icons/AppIcon';

export default function DemoGoalResults() {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        bgcolor: isDark ? alpha('#fff', 0.025) : '#fff',
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: `0 16px 40px ${alpha(primary, 0.14)}`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='CheckCircleOutline'
          fallback={CheckCircleOutlineIcon}
          sx={{ fontSize: 18, color: 'success.main' }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
          Result · completed
        </Typography>
      </Stack>
      <Stack spacing={1.5} sx={{ p: 2.5 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.25}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: `1px solid ${alpha(theme.palette.success.main, 0.25)}`,
            bgcolor: alpha(theme.palette.success.main, 0.06),
          }}
        >
          <AppIcon
            name='DescriptionOutlined'
            fallback={DescriptionOutlinedIcon}
            sx={{ fontSize: 20, color: 'success.main' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Landing page v1</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>Deliverable · $128.40 spent</Typography>
          </Box>
          <Chip size="small" icon={<AppIcon
            name='OpenInNew'
            fallback={OpenInNewIcon}
            sx={{ fontSize: '12px !important' }} />} label="Deployed" color="success" sx={{ height: 22, fontSize: '0.62rem', fontWeight: 700 }} />
        </Stack>
        <Box sx={{ p: 1.5, borderRadius: 2.5, border: `1px solid ${theme.palette.divider}` }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}>Rate agents</Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Rating value={5} readOnly size="small" />
            <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>Sales Follow-up</Typography>
          </Stack>
        </Box>
        <Chip
          size="small"
          icon={<AppIcon
            name='RestartAltOutlined'
            fallback={RestartAltOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="Retry from goals list"
          variant="outlined"
          sx={{ alignSelf: 'flex-start', fontWeight: 700, fontSize: '0.68rem' }}
        />
      </Stack>
    </Box>
  );
}
