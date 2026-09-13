/**
 * KPI anomaly scan pulse — detects breaches across the user's active
 * goal_kpis rows and triggers the Phase 4 auto-pivot when warranted.
 *
 * Stays a no-op until Phase 4's goal_kpis table is populated by a real
 * KPI sync. Until then, returns { status: 'done', anomalies: 0 }.
 */
import { detectAnomalies, maybeAutoPivot } from '../../kpi/anomaly.js';

export async function handleKpiAnomalyScan(admin, pulse, { req } = {}) {
  const anomalies = await detectAnomalies(admin, { userId: pulse.user_id });
  if (!anomalies || anomalies.length === 0) return { status: 'done', anomalies: 0 };

  const pivots = [];
  for (const a of anomalies) {
    const pivot = await maybeAutoPivot(admin, a, { req });
    if (pivot) pivots.push(pivot);
  }
  return { status: 'done', anomalies: anomalies.length, pivots: pivots.length };
}
