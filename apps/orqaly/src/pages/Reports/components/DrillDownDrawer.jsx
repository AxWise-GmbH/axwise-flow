import { Box, Drawer, Typography, IconButton, Chip, Divider, useTheme, alpha } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import AppIcon from '../../../components/icons/AppIcon';

function humanizeKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value) {
  if (value == null) return '-';
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000)
      return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value % 1 !== 0) return value.toFixed(2);
    return value.toString();
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function DrillDownDrawer({ open, onClose, title, subtitle, payload }) {
  const theme = useTheme();

  const entries = payload && typeof payload === 'object' ? Object.entries(payload) : [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100%', sm: 380 },
            bgcolor: 'background.default',
          },
        },
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.06),
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Drill down
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {title || 'Detail'}
          </Typography>
          {subtitle && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.25 }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close detail">
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} />
        </IconButton>
      </Box>
      <Box sx={{ px: 2.5, py: 2 }}>
        {entries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No additional detail available.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {entries.map(([key, value]) => (
              <Box key={key}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    color: 'text.secondary',
                    display: 'block',
                    mb: 0.25,
                  }}
                >
                  {humanizeKey(key)}
                </Typography>
                {key === 'status' || key === 'funnelStatus' ? (
                  <Chip
                    label={formatValue(value)}
                    size="small"
                    sx={{ fontWeight: 600 }}
                    color={
                      ['At Risk', 'Overdue'].includes(value)
                        ? 'error'
                        : value === 'Paused'
                          ? 'warning'
                          : 'success'
                    }
                    variant="outlined"
                  />
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {formatValue(value)}
                  </Typography>
                )}
                <Divider sx={{ mt: 1.25 }} />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
