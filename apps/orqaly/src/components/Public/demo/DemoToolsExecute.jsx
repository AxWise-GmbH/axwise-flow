import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

export default function DemoToolsExecute() {
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
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 2 }}>
        Stripe · execute
      </Typography>
      <Box
        sx={{
          p: 1.5,
          borderRadius: 2,
          mb: 1.5,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: '0.72rem',
          bgcolor: isDark ? alpha('#fff', 0.04) : alpha(theme.palette.text.primary, 0.04),
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        {`{ "action": "refund.create", "amount": 48.20 }`}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip size="small" icon={<AppIcon
          name='PlayCircleOutline'
          fallback={PlayCircleOutlineIcon}
          sx={{ fontSize: '14px !important' }} />} label="Test OK" color="success" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
        <Chip size="small" icon={<AppIcon
          name='CheckCircleOutline'
          fallback={CheckCircleOutlineIcon}
          sx={{ fontSize: '14px !important' }} />} label="Executed" color="primary" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.68rem' }} />
      </Stack>
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', mb: 1 }}>Used by</Typography>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <AppIcon
          name='SmartToyOutlined'
          fallback={SmartToyOutlinedIcon}
          sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>Refund Reviewer</Typography>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1}>
        <AppIcon
          name='HistoryOutlined'
          fallback={HistoryOutlinedIcon}
          sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>12 runs today · logged to audit</Typography>
      </Stack>
    </Box>
  );
}
