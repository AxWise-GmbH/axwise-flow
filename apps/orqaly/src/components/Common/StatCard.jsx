import { Paper, Box, Typography, alpha, useTheme } from '@mui/material';

/**
 * Gradient stat card used in MetricsStrip. Canonical styling from the Knowledge tab.
 *
 * Props:
 *   label   — caption above the value
 *   value   — main metric (number or short string)
 *   helper  — small secondary text below the value
 *   color   — hex (from theme.palette.*.main); drives border, gradient, icon bg
 *   icon    — MUI icon component (@mui/icons-material)
 */
export default function StatCard({ label, value, helper, color, icon: Icon }) {
  const theme = useTheme();

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        height: '100%',
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.22),
        background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Box
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography
            sx={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: 'text.primary',
              lineHeight: 1.15,
              mt: 0.45,
            }}
          >
            {value}
          </Typography>
          {helper !== undefined && helper !== null && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', display: 'block', mt: 0.35 }}
            >
              {helper}
            </Typography>
          )}
        </Box>
        {Icon && (
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2,
              bgcolor: alpha(color, 0.16),
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 18 }} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
