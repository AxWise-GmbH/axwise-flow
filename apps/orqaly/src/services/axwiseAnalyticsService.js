/**
 * AxWise analytics service - thin façade over usageService so the AxWise
 * analytics page has a single import. Health reuses the aggregate
 * usage-analytics endpoint scoped to source='axwise'; impact uses its
 * detail=divergence mode. Auth/caching/fallbacks live in usageService.
 */
import { fetchUsage, fetchAxwiseDivergence, emptyDivergenceSnapshot } from './usageService';

/** Operational health for AxWise calls (calls, cost, latency, error rate, timeseries). */
export function fetchAxwiseHealth(opts = {}) {
  return fetchUsage('all', { ...opts, source: 'axwise' });
}

/** AxWise-vs-local decision divergence (impact). */
export function fetchAxwiseImpact(opts = {}) {
  return fetchAxwiseDivergence(opts);
}

export { emptyDivergenceSnapshot };
