import { Box, Typography, Paper, Chip, Stack, alpha, useTheme } from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import { formatCurrency } from '../../../utils/formatters';

export default function RoiModelBlock({ data }) {
  const d = data || {};
  const theme = useTheme();

  return (
    <BentoCard
      title="ROI Model"
      subtitle="Implementation cost, benefit, payback, NPV"
      icon={AccountBalanceOutlinedIcon}
      iconColor={theme.palette.success.main}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr 1fr' },
          gap: 1.5,
          mb: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.warning.main, 0.08),
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Implementation Cost
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {formatCurrency(d.implementationCost)}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.success.main, 0.08),
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Annual Benefit
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, color: 'success.main' }}>
            {formatCurrency(d.annualBenefit)}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.info.main, 0.08),
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Payback (months)
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {d.paybackMonths}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.08),
          }}
        >
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            NPV (3y)
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            {formatCurrency(d.npv3y)}
          </Typography>
        </Paper>
      </Box>
      {(d.risks || []).length > 0 && (
        <Box>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Risks
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.5 }}>
            {(d.risks || []).map((r, i) => (
              <Chip
                key={i}
                size="small"
                label={r}
                sx={{
                  fontSize: '0.72rem',
                  height: 24,
                  bgcolor: alpha(theme.palette.warning.main, 0.15),
                  borderColor: alpha(theme.palette.warning.main, 0.4),
                  border: '1px solid',
                  borderRadius: 1,
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        </Box>
      )}
    </BentoCard>
  );
}
