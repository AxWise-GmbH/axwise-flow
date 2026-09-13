import { useCallback, useEffect, useState } from 'react';
import { isWorkingBuild } from './workflow-build-presentation.js';

export function useWorkflowBuilds(client, { runId, agentId, enabled = true } = {}) {
  const scopeKey = JSON.stringify([runId || null, agentId || null]);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  useEffect(() => {
    if (!enabled || !client.solutionBuildRequests) return undefined;
    let cancelled = false;
    let timer;
    const read = async () => {
      let delay = 15_000;
      try {
        const response = await client.solutionBuildRequests({ runId, agentId });
        if (cancelled) return;
        if (!Array.isArray(response.buildRequests))
          throw new Error('Build status could not be verified.');
        setSnapshot({ scopeKey, builds: response.buildRequests });
        setError(null);
        if (response.buildRequests.some(isWorkingBuild)) delay = 3000;
      } catch (value) {
        if (!cancelled) setError({ scopeKey, value });
      }
      if (!cancelled) {
        timer = setTimeout(read, delay);
      }
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, runId, agentId, enabled, refreshKey, scopeKey]);
  const currentError = error?.scopeKey === scopeKey ? error.value : null;
  return {
    builds: snapshot?.scopeKey === scopeKey ? snapshot.builds : [],
    loading:
      enabled && !!client.solutionBuildRequests && snapshot?.scopeKey !== scopeKey && !currentError,
    error: currentError,
    refresh,
  };
}

export function useWorkflowBuild(client, id) {
  const [build, setBuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const adopt = useCallback(
    (response) => {
      const next = response?.buildRequest;
      if (!next || next.id !== id || !Number.isInteger(next.rowVersion))
        throw new Error('The server returned an unexpected build record.');
      setBuild((current) =>
        current?.id === id && current.rowVersion > next.rowVersion ? current : next
      );
      setError(null);
    },
    [id]
  );
  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    const read = async () => {
      let delay = 15_000;
      try {
        const response = await client.solutionBuildRequest(id);
        if (cancelled) return;
        adopt(response);
        if (isWorkingBuild(response.buildRequest)) delay = 3000;
      } catch (value) {
        if (!cancelled) setError(value);
      }
      if (!cancelled) {
        setLoading(false);
        timer = setTimeout(read, delay);
      }
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, id, adopt, refreshKey]);
  return { build: build?.id === id ? build : null, loading, error, refresh, adopt };
}
