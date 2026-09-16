/**
 * Quick-stat card: configured cost/task with actual LLM tokens stacked underneath.
 */
import { Paper, Typography, Box, alpha } from '@mui/material';
import PropTypes from 'prop-types';
import ReportMetricCell from '../Goals/ReportMetricCell';
import { getMetricInfo } from '../../utils/reportMetricMeta';

export default function AgentCostTokenStat({
  label = 'Cost/Task',
  costUsd = 0,
  tokens = 0,
  metricMeta = {},
  color,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(color, 0.2),
        bgcolor: alpha(color, 0.04),
        textAlign: 'center',
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.25 }}>
        <ReportMetricCell
          costUsd={costUsd}
          tokens={tokens}
          costInfo={getMetricInfo(metricMeta.costReason)}
          tokenInfo={getMetricInfo(metricMeta.tokenReason)}
          align="center"
          compact
        />
      </Box>
    </Paper>
  );
}

AgentCostTokenStat.propTypes = {
  label: PropTypes.string,
  costUsd: PropTypes.number,
  tokens: PropTypes.number,
  metricMeta: PropTypes.shape({
    costReason: PropTypes.string,
    tokenReason: PropTypes.string,
  }),
  color: PropTypes.string,
};
