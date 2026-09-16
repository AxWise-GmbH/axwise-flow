import { Box, Typography, alpha, useTheme } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import BlockShell from '../BlockShell';

import AppIcon from '../../icons/AppIcon';

export default function AlertsBlock({ block, data, ...shellProps }) {
  const theme = useTheme();
  const rows = data?.rows || [];

  if (!rows.length) {
    return (
      <BlockShell title={block?.title || 'Alerts'} {...shellProps}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            All quiet — no alerts.
          </Typography>
        </Box>
      </BlockShell>
    );
  }

  return (
    <BlockShell title={block?.title || 'Alerts'} {...shellProps}>
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
        }}
      >
        {rows.slice(0, 20).map((row) => (
          <Box
            key={String(row.group)}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              p: 1,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.warning.main, 0.06),
              border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
            }}
          >
            <AppIcon
              name="WarningAmber"
              fallback={WarningAmberIcon}
              sx={{ fontSize: 16, color: theme.palette.warning.main, mt: '2px', flexShrink: 0 }}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {String(row.group)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {row.value} {block?.data?.measure?.agg || 'records'}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </BlockShell>
  );
}
