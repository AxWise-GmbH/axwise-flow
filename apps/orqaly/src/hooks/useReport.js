/**
 * useReport Hook
 *
 * Manages report state: template selection, filters, snapshot fetching,
 * polling, and freshness tracking.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchReportSnapshot, clearSnapshotCache } from '../services/reportService';
import {
  getTemplateById,
  getAllTemplates,
  REPORT_TEMPLATES,
} from '../pages/Reports/reportTemplates';
import { maybeNotify } from '../services/emailNotificationDispatcher';
import { usePartnerAccessOptional } from '../context/PartnerAccessContext';

const POLL_INTERVAL_MS = 60_000;

export function useReport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const pollRef = useRef(null);
  const partnerAccess = usePartnerAccessOptional();

  // Derive template from URL
  const templateId = searchParams.get('template') || '';
  const template = useMemo(() => getTemplateById(templateId), [templateId]);

  // Derive filters from URL (Partner role: effective filters include linkedPartnerId for report backend)
  const filters = useMemo(() => {
    const f = {};
    for (const [key, value] of searchParams.entries()) {
      if (key !== 'template' && key !== 'refresh') {
        f[key] = value;
      }
    }
    if (partnerAccess?.isPartnerRole && partnerAccess?.linkedPartnerId) {
      f.partnerId = partnerAccess.linkedPartnerId;
    }
    return f;
  }, [searchParams, partnerAccess?.isPartnerRole, partnerAccess?.linkedPartnerId]);

  // Select a template (updates URL)
  const selectTemplate = useCallback(
    (id) => {
      const params = new URLSearchParams(searchParams);
      params.set('template', id);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Update a filter (updates URL)
  const setFilter = useCallback(
    (key, value) => {
      const params = new URLSearchParams(searchParams);
      if (!value || value === 'All') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (templateId) params.set('template', templateId);
    setSearchParams(params, { replace: true });
  }, [templateId, setSearchParams]);

  // Fetch snapshot
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!templateId) return;
      setLoading(true);
      setError(null);
      setErrorStatus(null);
      try {
        const data = await fetchReportSnapshot(templateId, filters, forceRefresh);
        setSnapshot(data);
        setLastFetched(new Date());
        if (forceRefresh && data) {
          const tpl = getTemplateById(templateId);
          maybeNotify('report_generated', {
            reportName: tpl?.name || templateId,
            reportType: tpl?.category || templateId,
            computedAt: data.computedAt || new Date().toISOString(),
          });
        }
      } catch (err) {
        setError(err.message || 'Failed to load report data');
        // ReportApiError carries the HTTP status so the UI can differentiate
        // 401 (re-auth) / 429 (rate limit) / 5xx.
        setErrorStatus(err?.status ?? null);
      } finally {
        setLoading(false);
      }
    },
    [templateId, filters]
  );

  // Force refresh
  const refresh = useCallback(() => {
    clearSnapshotCache();
    return fetchData(true);
  }, [fetchData]);

  // Auto-fetch when template or filters change
  useEffect(() => {
    if (templateId) {
      fetchData();
    } else {
      setSnapshot(null);
    }
  }, [templateId, fetchData]);

  // Polling — only while a template is open, auto-refresh is enabled, and the
  // tab is visible. Pausing on hidden tabs avoids wasted requests/billing.
  useEffect(() => {
    if (!templateId || !autoRefresh) return undefined;

    const clear = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const start = () => {
      clear(); // never stack intervals when deps change
      if (typeof document !== 'undefined' && document.hidden) return;
      pollRef.current = setInterval(() => fetchData(false), POLL_INTERVAL_MS);
    };

    start();
    const onVisibility = () => start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      clear();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [templateId, autoRefresh, fetchData]);

  // Freshness
  const freshness = useMemo(() => {
    if (!snapshot?.computedAt) return null;
    const computed = new Date(snapshot.computedAt);
    const diffMs = Date.now() - computed.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }, [snapshot?.computedAt, lastFetched]);

  return {
    // Template
    template,
    templateId,
    allTemplates: getAllTemplates(),
    builtInTemplates: REPORT_TEMPLATES,
    selectTemplate,
    // Filters
    filters,
    setFilter,
    clearFilters,
    // Data
    snapshot,
    loading,
    error,
    errorStatus,
    // Freshness
    freshness,
    lastFetched,
    version: snapshot?.version || null,
    computedAt: snapshot?.computedAt || null,
    // Auto-refresh control
    autoRefresh,
    setAutoRefresh,
    // Actions
    refresh,
  };
}
