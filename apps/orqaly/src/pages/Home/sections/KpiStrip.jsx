import KpiGrid from '../../Reports/components/KpiGrid';

/**
 * Org-overview KPI strip. Thin wrapper over the shared KpiGrid (count-up values,
 * delta chips, sparklines, responsive 2/3/6 column grid).
 */
export default function KpiStrip({ kpis = [], loading = false }) {
  return <KpiGrid data={kpis} loading={loading} animateSparkline />;
}
