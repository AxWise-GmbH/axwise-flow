// frontend/hooks/usePolling.ts
import { useState, useRef, useCallback, useEffect } from 'react';

interface PollingOptions<T> {
  fetchFn: (id: string) => Promise<T>;
  interval: number;
  onSuccess: (data: T) => void;
  onError: (error: Error) => void;
  stopCondition: (data: T) => boolean;
}

interface PollingControls {
  startPolling: (id: string) => void;
  stopPolling: () => void;
  isPolling: boolean;
}

/**
 * Custom hook for polling an asynchronous operation status.
 *
 * @param options - Configuration options for polling.
 * @returns Controls to start/stop polling and the current polling state.
 */
export function usePolling<T>(options: PollingOptions<T>): PollingControls {
  const { fetchFn, interval, onSuccess, onError, stopCondition } = options;

  const [isPolling, setIsPolling] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true); // Track mount status

  // Set mount status to false on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isMountedRef.current) {
       setIsPolling(false);
       setPollingId(null);
       console.log('[usePolling] Polling stopped.');
    }
  }, []);

  const performPoll = useCallback(async (id: string) => {
    if (!isMountedRef.current) return; // Don't run if unmounted

    console.log(`[usePolling] Polling for ID: ${id}`);
    try {
      const data = await fetchFn(id);
      if (!isMountedRef.current) return; // Check again after await

      if (stopCondition(data)) {
        console.log('[usePolling] Stop condition met.');
        onSuccess(data);
        stopPolling();
      } else {
         // Optionally call onSuccess even if not stopped, if needed for progress updates
         // onSuccess(data); // Uncomment if intermediate updates are desired
         console.log('[usePolling] Stop condition not met, continuing poll.');
      }
    } catch (error) {
       if (!isMountedRef.current) return; // Check again after await
       console.error('[usePolling] Fetch error:', error);
       onError(error instanceof Error ? error : new Error('Polling fetch failed'));
       // Decide whether to stop polling on error
       // stopPolling(); // Uncomment to stop polling on any fetch error
    }
  }, [fetchFn, stopCondition, onSuccess, onError, stopPolling]);


  const startPolling = useCallback((id: string) => {
    if (intervalRef.current) {
      console.warn('[usePolling] Polling already in progress.');
      return;
    }
    if (!id) {
        console.error('[usePolling] Cannot start polling without an ID.');
        return;
    }

    console.log(`[usePolling] Starting polling for ID: ${id} with interval: ${interval}ms`);
    setPollingId(id);
    setIsPolling(true);

    // Perform initial poll immediately
    performPoll(id);

    // Set up interval
    intervalRef.current = setInterval(() => performPoll(id), interval);
  }, [interval, performPoll]);


  return { startPolling, stopPolling, isPolling };
}