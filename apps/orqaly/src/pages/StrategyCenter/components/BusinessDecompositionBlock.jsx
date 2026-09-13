import { Box, Typography, Chip, Stack, alpha, useTheme } from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import BentoCard from '../../../components/Common/BentoCard';

function ChipSection({ title, items, color }) {
  const theme = useTheme();
  const accent = color || theme.palette.primary.main;
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          display: 'block',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} useFlexGap>
        {(items || []).map((item, idx) => (
          <Chip
            key={`${title}-${idx}`}
            label={item}
            size="small"
            sx={{
              fontSize: '0.75rem',
              height: 26,
              bgcolor: alpha(accent, 0.12),
              borderColor: alpha(accent, 0.35),
              border: '1px solid',
              color: 'text.primary',
              '& .MuiChip-label': { px: 1.25 },
            }}
            variant="outlined"
          />
        ))}
      </Stack>
    </Box>
  );
}

export default function BusinessDecompositionBlock({ data }) {
  const d = data || {};
  const theme = useTheme();

  return (
    <BentoCard
      title="Business Decomposition"
      subtitle="Value drivers, revenue levers, cost drivers, constraints, leading vs lagging indicators"
      icon={AccountTreeOutlinedIcon}
      iconColor={theme.palette.primary.main}
    >
      <Box sx={{ display: 'grid', gap: 2 }}>
        <ChipSection
          title="Value Drivers"
          items={d.valueDrivers}
          color={theme.palette.success.main}
        />
        <ChipSection
          title="Revenue Levers"
          items={d.revenueLevers}
          color={theme.palette.success.main}
        />
        <ChipSection
          title="Cost Drivers"
          items={d.costDrivers}
          color={theme.palette.warning.main}
        />
        <ChipSection title="Constraints" items={d.constraints} color={theme.palette.error.main} />
        <ChipSection
          title="Leading Indicators"
          items={d.leadingIndicators}
          color={theme.palette.info.main}
        />
        <ChipSection
          title="Lagging Indicators"
          items={d.laggingIndicators}
          color={theme.palette.secondary.main}
        />
      </Box>
    </BentoCard>
  );
}
