import { Box, Typography, useTheme } from '@mui/material';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatTokensOrZero } from '../../../utils/formatTokens';
import ChartReveal from './ChartReveal';

/** LLM usage donut: tokens by model/provider, with a centered total + legend. */
export default function UsageDonut({ rows = [] }) {
  const theme = useTheme();
  const palette = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.secondary.main,
    theme.palette.info?.main || theme.palette.primary.dark,
  ];

  if (!rows.length) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          No usage recorded for this window.
        </Typography>
      </Box>
    );
  }

  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  // "Other" (the rolled-up long tail beyond the top slices) reads as a muted
  // grey rather than cycling the palette.
  const colorFor = (row, i) =>
    row.group === 'Other' ? theme.palette.text.disabled : palette[i % palette.length];

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Box sx={{ position: 'relative', width: '100%', height: 200 }}>
        <ChartReveal sx={{ width: '100%', height: '100%' }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="group"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              >
                {rows.map((row, i) => (
                  <Cell key={row.group} fill={colorFor(row, i)} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatTokensOrZero(value)}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: `1px solid ${theme.palette.divider}`,
                  background: theme.palette.background.paper,
                  color: theme.palette.text.primary,
                }}
                itemStyle={{ color: theme.palette.text.primary }}
                labelStyle={{ color: theme.palette.text.primary }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartReveal>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1, color: 'text.primary' }}>
            {formatTokensOrZero(total)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Total Tokens
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
        {rows.map((row, i) => (
          <Box
            key={row.group}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.75rem' }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: colorFor(row, i),
                flexShrink: 0,
              }}
            />
            <Typography
              variant="caption"
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'text.primary',
              }}
            >
              {row.group}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {formatTokensOrZero(row.value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
