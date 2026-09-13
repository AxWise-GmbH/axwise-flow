/** Re-export shared metric meta for frontend Report tab. */
import {
  METRIC_REASONS,
  getMetricInfo,
  isLikelyDurationAsTokens,
  resolvePhaseMetricMeta,
  resolveAgentMetricMeta,
} from '../../lib/_shared/report-metric-meta.js';

export {
  METRIC_REASONS,
  getMetricInfo,
  isLikelyDurationAsTokens,
  resolvePhaseMetricMeta,
  resolveAgentMetricMeta,
};

export function resolveMetricDisplay({ cost, tokens, metricMeta = {} }) {
  const costNum = Number(cost || 0);
  const tokenNum = Number(tokens || 0);
  const compact = (v) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(v);
  };
  return {
    costLabel: `$${costNum.toFixed(4)}`,
    tokenLabel: `${tokenNum >= 1000 ? compact(tokenNum) : String(tokenNum)} tokens`,
    costInfo: getMetricInfo(metricMeta.costReason),
    tokenInfo: getMetricInfo(metricMeta.tokenReason),
  };
}
