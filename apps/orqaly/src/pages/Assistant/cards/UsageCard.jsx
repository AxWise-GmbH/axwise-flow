import { useState } from 'react';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  alpha,
  useTheme,
} from '@mui/material';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import BentoCard from '../../../components/Common/BentoCard';

function fmtTokens(n) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
function fmtCost(n) {
  return `$${Number(n).toFixed(2)}`;
}

function UsageRow({ label, valueText, pct, theme }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Typography
        sx={{ fontWeight: 700, fontSize: '0.8rem', flexBasis: 150, flexShrink: 0, minWidth: 0 }}
        noWrap
      >
        {label}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: alpha(theme.palette.primary.main, 0.12),
          '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: theme.palette.primary.main },
        }}
      />
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: '0.8rem',
          whiteSpace: 'nowrap',
          width: 52,
          textAlign: 'right',
        }}
      >
        {valueText}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ width: 34, textAlign: 'right' }}>
        {pct}%
      </Typography>
    </Box>
  );
}

/** Per-model token / cost breakdown + a tokens-over-time sparkline (assistant-scoped). */
export default function UsageCard({ usage }) {
  const theme = useTheme();
  const [tab, setTab] = useState('tokens');
  const showCost = tab === 'cost';
  const series = (usage.timeseries || []).map((p) => ({
    date: p.date,
    value: showCost ? p.cost : p.tokens,
  }));

  return (
    <BentoCard
      title="Usage"
      icon={QueryStatsRoundedIcon}
      plainHeader
      scrollBody
      action={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tab}
          onChange={(_e, v) => v && setTab(v)}
          aria-label="Usage metric"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontWeight: 700,
              px: 1.5,
              py: 0.25,
            },
          }}
        >
          <ToggleButton value="tokens">Tokens</ToggleButton>
          <ToggleButton value="cost">Cost</ToggleButton>
        </ToggleButtonGroup>
      }
    >
      {series.length > 1 && (
        <Box sx={{ height: 56, mb: 1.5, mx: -0.5 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="assistantUsageSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.palette.primary.main} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={theme.palette.primary.main} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip
                cursor={{ stroke: alpha(theme.palette.primary.main, 0.4) }}
                contentStyle={{
                  background: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [
                  showCost ? fmtCost(v) : fmtTokens(v),
                  showCost ? 'Cost' : 'Tokens',
                ]}
                labelStyle={{ color: theme.palette.text.secondary }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={theme.palette.primary.main}
                strokeWidth={2}
                fill="url(#assistantUsageSpark)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}

      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontSize: '0.62rem',
          mb: 1,
          display: 'block',
        }}
      >
        Model
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {usage.models.map((m) => (
          <UsageRow
            key={m.model}
            label={m.model}
            pct={m.pct}
            valueText={showCost ? fmtCost(m.cost) : fmtTokens(m.tokens)}
            theme={theme}
          />
        ))}
      </Box>

      <Box
        sx={{
          mt: 'auto',
          pt: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Total</Typography>
        <Typography sx={{ fontWeight: 800 }}>
          {showCost ? fmtCost(usage.totalCost) : usage.totalTokens.toLocaleString()}
        </Typography>
      </Box>
    </BentoCard>
  );
}
