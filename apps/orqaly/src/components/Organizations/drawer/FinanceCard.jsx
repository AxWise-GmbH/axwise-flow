import { Paper, Typography, Box, alpha, useTheme } from '@mui/material';

export default function FinanceCard({ label, value, color, icon: Icon, sub }) {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.75,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(color, 0.18),
        background: `linear-gradient(135deg, ${alpha(color, 0.08)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontWeight: 600,
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              letterSpacing: 0.5,
            }}
          >
            {label}
          </Typography>
          <Typography
            sx={{ fontSize: '1.25rem', fontWeight: 800, color, lineHeight: 1.2, mt: 0.3 }}
          >
            {value}
          </Typography>
          {sub && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
              {sub}
            </Typography>
          )}
        </Box>
        {Icon && (
          <Box
            sx={{
              width: 30,
              height: 30,
              borderRadius: 1.5,
              bgcolor: alpha(color, 0.12),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon sx={{ fontSize: 16, color }} />
          </Box>
        )}
      </Box>
    </Paper>
  );
}
