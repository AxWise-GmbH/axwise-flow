import KpiGrid from '../../Reports/components/KpiGrid';

/**
 * Grid of small sparkline stat cards (tokens, calls, error rate, cached,
 * latency, evaluations). Reuses KpiGrid for one consistent stat visual.
 * `columns` caps the grid width (e.g. 3-up beside the LLM Usage block).
 */
export default function SparkStatRow({ stats = [], loading = false, columns, fillHeight = true }) {
  return (
    <KpiGrid
      data={stats}
      loading={loading}
      animateSparkline
      staggerCards
      size="lg"
      columns={columns}
      fillHeight={fillHeight}
    />
  );
}
