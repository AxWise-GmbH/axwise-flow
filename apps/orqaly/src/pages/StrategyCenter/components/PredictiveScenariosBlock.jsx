import { Box, Typography, Paper, Chip, Stack, alpha, useTheme } from '@mui/material';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import { formatCurrency } from '../../../utils/formatters';

export default function PredictiveScenariosBlock({ data }) {
  const d = data || {};
  const scenarios = d.scenarios || [];
  const period = d.period || '6–12 months';
  const theme = useTheme();

  const getColor = (name) => {
    if (name === 'Conservative') return theme.palette.warning.main;
    if (name === 'Base') return theme.palette.primary.main;
    return theme.palette.success.main;
  };

  return (
    <BentoCard
      title="Predictive Scenarios"
      subtitle={`Conservative / Base / Aggressive - ${period}`}
      icon={TrendingUpOutlinedIcon}
      iconColor={theme.palette.success.main}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
        {scenarios.map((s, idx) => (
          <Paper
            key={idx}
            elevation={0}
            sx={{
              flex: 1,
              minWidth: 180,
              p: 2,
              borderRadius: 2,
              border: '2px solid',
              borderColor: alpha(getColor(s.name), 0.35),
              bgcolor: alpha(getColor(s.name), 0.08),
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 800, color: getColor(s.name), mb: 1.5 }}
            >
              {s.name}
            </Typography>
            <Stack spacing={0.75}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Revenue
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {formatCurrency(s.revenue)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  Profit
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                  {formatCurrency(s.profit)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  FTD
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {s.ftd}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  display: 'block',
                  mt: 1,
                  pt: 1,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {s.assumptions}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </BentoCard>
  );
}
