import { useCallback, useEffect, useRef, useState } from 'react';

function runtimeError(value) {
  return value instanceof Error ? value : new Error('Runtime readiness could not be checked.');
}

export function useAgentRuntimeStatus(client) {
  const requestEpoch = useRef(0);
  const [state, setState] = useState({ runtime: null, loading: true, error: null });

  const load = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      if (typeof client?.agentRuntimeStatus !== 'function') {
        throw new Error('Runtime status is not available in this deployment.');
      }
      const runtime = await client.agentRuntimeStatus();
      if (requestEpoch.current !== epoch) return;
      setState({
        runtime: { ...runtime, checkedAt: new Date().toISOString() },
        loading: false,
        error: null,
      });
    } catch (value) {
      if (requestEpoch.current !== epoch) return;
      setState((current) => ({
        runtime: current.runtime,
        loading: false,
        error: runtimeError(value),
      }));
    }
  }, [client]);

  useEffect(() => {
    void load();
    return () => {
      requestEpoch.current += 1;
    };
  }, [load]);

  return { ...state, retry: load };
}
