/**
 * TokenByPhaseChart — bar chart of tokens + cost per phase for the Report tab.
 * Uses server-provided phaseBudget (tokens + tokenCostUsd) — no client Supabase fetch.
 */
import { useMemo } from 'react';
import { Box, Typography, alpha, useTheme, useMediaQuery } from '@mui/material';
import PropTypes from 'prop-types';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { formatTokens, formatTokensOrZero } from '../../utils/formatTokens';

function statusColor(status, theme) {
  if (status === 'completed') return theme.palette.success.main;
  if (status === 'failed') return theme.palette.error.main;
  if (status === 'executing' || status === 'in_progress' || status === 'active')
    return theme.palette.info.main;
  return theme.palette.warning.main;
}

function shortenLabel(label, maxLen) {
  if (!label || label.length <= maxLen) return label;
  return `${label.slice(0, maxLen - 1)}…`;
}

export default function TokenByPhaseChart({ goal }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const hasLlmInfo = Boolean(goal?.tokenSummary?.hasLlmInfo || goal?.tokenSummary?.hasTokenData);
  const hasTokenData = Boolean(goal?.tokenSummary?.hasTokenData);

  const data = useMemo(() => {
    const budget = Array.isArray(goal?.phaseBudget) ? goal.phaseBudget : [];
    if (!budget.length) return [];

    return budget.map((p) => ({
      phase: p.phaseName || `Phase ${(p.phaseIndex ?? 0) + 1}`,
      status: p.status || 'pending',
      tokens: Number(p.tokens || 0),
      cost: Number(p.tokenCostUsd ?? p.cost ?? 0),
      tokenBreakdown: p.tokenBreakdown || [],
    }));
  }, [goal?.phaseBudget]);

  if (!data.length) {
    return (
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center', py: 2 }}>
        No phase data yet.
      </Typography>
    );
  }

  const tokensAvailable = hasLlmInfo;
  const chartTitle = hasLlmInfo ? 'Tokens & Cost by Phase' : 'Cost by Phase';

  const tooltipFormatter = (value, name, props) => {
    if (name === 'tokens') return [formatTokensOrZero(value), 'Tokens'];
    if (name === 'cost')
      return [`$${Number(value).toFixed(4)}`, hasTokenData ? 'LLM cost' : 'Cost'];
    return [value, name];
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <Box
        sx={{
          p: 1,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          maxWidth: 260,
        }}
      >
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, mb: 0.5 }}>{row?.phase}</Typography>
        {tokensAvailable && (
          <Typography sx={{ fontSize: '0.68rem' }}>
            Tokens: {formatTokensOrZero(row?.tokens)}
          </Typography>
        )}
        {row?.cost > 0 && (
          <Typography sx={{ fontSize: '0.68rem' }}>
            {hasTokenData ? 'LLM cost' : 'Cost'}: ${Number(row.cost).toFixed(4)}
          </Typography>
        )}
        {(row?.tokenBreakdown || []).map((m) => (
          <Typography
            key={`${m.provider}-${m.model}`}
            sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.25 }}
          >
            {m.provider} / {m.model}: {formatTokens(m.tokens)}
            {m.costUsd > 0 ? ` · $${Number(m.costUsd).toFixed(4)}` : ''}
          </Typography>
        ))}
      </Box>
    );
  };

  return (
    <Box sx={{ mt: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>
      <Typography
        sx={{
          fontSize: '0.7rem',
          fontWeight: 700,
          color: 'text.secondary',
          mb: 0.5,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {chartTitle}
      </Typography>
      <ResponsiveContainer width="100%" height={isMobile ? 260 : 220}>
        <BarChart
          data={data}
          margin={{ top: 8, right: isMobile ? 4 : 8, bottom: isMobile ? 52 : 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={alpha(theme.palette.text.primary, 0.08)} />
          <XAxis
            dataKey="phase"
            tick={{ fontSize: isMobile ? 8 : 10 }}
            interval={0}
            angle={isMobile ? -35 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 56 : 30}
            tickFormatter={(value) => shortenLabel(value, isMobile ? 14 : 24)}
          />
          {tokensAvailable && (
            <YAxis
              yAxisId="tokens"
              tick={{ fontSize: isMobile ? 8 : 10 }}
              tickFormatter={(v) => formatTokensOrZero(v)}
              width={isMobile ? 30 : 42}
            />
          )}
          <YAxis
            yAxisId="cost"
            orientation="right"
            tick={{ fontSize: isMobile ? 8 : 10 }}
            tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
            width={isMobile ? 34 : 48}
          />
          <ReTooltip content={<CustomTooltip />} formatter={tooltipFormatter} />
          <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
          {tokensAvailable && (
            <Bar yAxisId="tokens" dataKey="tokens" name="tokens" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={`tok-${i}`} fill={statusColor(d.status, theme)} />
              ))}
            </Bar>
          )}
          <Bar
            yAxisId="cost"
            dataKey="cost"
            name="cost"
            radius={[4, 4, 0, 0]}
            fill={alpha(theme.palette.warning.main, 0.55)}
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

TokenByPhaseChart.propTypes = {
  goal: PropTypes.shape({
    phaseBudget: PropTypes.array,
    tokenSummary: PropTypes.shape({
      hasTokenData: PropTypes.bool,
    }),
  }),
};
