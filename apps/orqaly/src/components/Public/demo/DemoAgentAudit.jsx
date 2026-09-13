import { Box, Chip, Stack, Typography, alpha, useTheme } from '@mui/material';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined';

import AppIcon from '../../icons/AppIcon';

const LINES = [
  { t: '12:04', action: 'agent.run.completed', who: 'Triage Voice' },
  { t: '12:02', action: 'tool.refund.approved', who: 'Refund Reviewer' },
  { t: '11:58', action: 'agent.version.promoted', who: 'Sales Follow-up' },
];

export default function DemoAgentAudit() {
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
        <Stack direction="row" spacing={1} alignItems="center">
          <AppIcon
            name='HistoryOutlined'
            fallback={HistoryOutlinedIcon}
            sx={{ fontSize: 18, color: 'text.secondary' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            Audit log
          </Typography>
        </Stack>
        <Chip
          size="small"
          icon={<AppIcon
            name='RestoreOutlined'
            fallback={RestoreOutlinedIcon}
            sx={{ fontSize: '14px !important' }} />}
          label="v3 · rollback"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: '0.68rem' }}
        />
      </Stack>
      <Stack spacing={1.25}>
        {LINES.map((line) => (
          <Stack
            key={line.t + line.action}
            direction="row"
            spacing={1.5}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.75rem',
            }}
          >
            <Typography sx={{ color: 'text.disabled', minWidth: 36 }}>{line.t}</Typography>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ color: 'primary.main', fontWeight: 600 }}>{line.action}</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>{line.who}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
