/**
 * [module: connection-hub]
 * useConsiliumLog — data hook for Consilium Log tab.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  getEvaluations,
  getEvaluationDetail,
  getDecisionAnalytics,
} from '../services/communicatorService';

const DEFAULT_FILTERS = {
  boardId: '',
  approved: 'all',
  decisionLevel: 'all',
  dateFrom: null,
  dateTo: null,
  search: '',
};

export function useConsiliumLog() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const [selectedEval, setSelectedEval] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchEvaluations = useCallback(
    async (f) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getEvaluations(f || filters);
        setEvaluations(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const selectEvaluation = useCallback(async (id) => {
    if (!id) {
      setSelectedEval(null);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await getEvaluationDetail(id);
      setSelectedEval(data);
    } catch {
      setSelectedEval(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getDecisionAnalytics();
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const applyFilters = useCallback(
    (updates) => {
      const next = { ...filters, ...updates };
      setFilters(next);
      fetchEvaluations(next);
    },
    [filters, fetchEvaluations]
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    fetchEvaluations(DEFAULT_FILTERS);
  }, [fetchEvaluations]);

  // Initial load
  useEffect(() => {
    fetchEvaluations();
    fetchAnalytics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    evaluations,
    loading,
    error,
    filters,
    selectedEval,
    detailLoading,
    analytics,
    analyticsLoading,
    fetchEvaluations,
    selectEvaluation,
    fetchAnalytics,
    applyFilters,
    resetFilters,
  };
}
