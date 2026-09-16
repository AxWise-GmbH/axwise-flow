import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import TerminalIcon from '@mui/icons-material/Terminal';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import AppIcon from '../../icons/AppIcon';

const VOTES = [
  { member: 'Analyst', vote: 'Approve', score: 8.2 },
  { member: 'Critic', vote: 'Approve', score: 7.5 },
  { member: "Devil's advocate", vote: 'Dissent', score: 5.1 },
];

export default function DemoCommConsilium() {
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
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AppIcon
            name='GavelOutlined'
            fallback={GavelOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Consilium log
          </Typography>
        </Stack>
        <Chip size="small" icon={<AppIcon
          name='CheckCircleOutline'
          fallback={CheckCircleOutlineIcon}
          sx={{ fontSize: '14px !important' }} />} label="Proceed 4–1" color="success" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />
      </Stack>
      <Stack spacing={1}>
        {VOTES.map((v) => (
          <Stack
            key={v.member}
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: isDark ? alpha('#fff', 0.02) : alpha(theme.palette.text.primary, 0.015),
            }}
          >
            <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.82rem' }}>{v.member}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: v.vote === 'Dissent' ? 'warning.main' : 'success.main', fontWeight: 700 }}>{v.vote}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', fontFamily: 'ui-monospace, monospace' }}>{v.score}</Typography>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${theme.palette.divider}` }}>
        <AppIcon
          name='Terminal'
          fallback={TerminalIcon}
          sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>Controller · 12 commands today</Typography>
      </Stack>
    </Box>
  );
}
