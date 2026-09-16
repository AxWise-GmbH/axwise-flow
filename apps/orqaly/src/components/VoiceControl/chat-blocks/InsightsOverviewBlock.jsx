/**
 * InsightsOverviewBlock — dashboard-style KPI grid for insights.overview/weekly/monthly.
 */
import { Box, Typography, useTheme } from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import {
  composerAccent,
  composerBlockSx,
  composerInk,
  composerInkAlpha,
} from '../../../theme/composerSurface';

const TREND_ICON = {
  up: ArrowUpwardRoundedIcon,
  down: ArrowDownwardRoundedIcon,
  stable: RemoveRoundedIcon,
};

export default function InsightsOverviewBlock({ block }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const metrics = Array.isArray(c.metrics) ? c.metrics : [];
  const rangeLabel =
    c.range === 'weekly' ? 'This week' : c.range === 'monthly' ? 'This month' : "Today's overview";

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        ...composerBlockSx(theme),
        backdropFilter: 'blur(8px)',
        p: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <InsightsRoundedIcon sx={{ fontSize: 18, color: composerAccent(theme) }} />
        <Typography variant="body2" sx={{ color: composerInk(theme), fontWeight: 700 }}>
          {rangeLabel}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 1,
        }}
      >
        {metrics.map((m, i) => {
          const TrendIcon = TREND_ICON[m.trend] || RemoveRoundedIcon;
          const trendColor =
            m.trend === 'up'
              ? theme.palette.success.light
              : m.trend === 'down'
                ? theme.palette.error.light
                : composerInkAlpha(theme, 0.4);
          return (
            <Box
              key={`m-${i}`}
              sx={{
                p: 1,
                borderRadius: 1.5,
                bgcolor: composerInkAlpha(theme, 0.04),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography
                  variant="h6"
                  sx={{
                    color: composerInk(theme),
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    lineHeight: 1.1,
                  }}
                >
                  {m.value}
                </Typography>
                <TrendIcon sx={{ fontSize: 13, color: trendColor }} />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: composerInkAlpha(theme, 0.5),
                  fontSize: '0.66rem',
                }}
              >
                {m.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
