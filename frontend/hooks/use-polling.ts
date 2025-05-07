import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePollingOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  interval?: number
  maxAttempts?: number
  stopCondition?: (data: T) => boolean
  enabled?: boolean
  immediate?: boolean
  useExponentialBackoff?: boolean
  maxBackoffInterval?: number
  retryStatusCodes?: number[]
  maxDurationMs?: number // Maximum total polling duration in milliseconds
  stuckDetectionCount?: number // Number of identical responses before considering polling stuck
}

interface PollingState<T> {
  data: T | null
  error: Error | null
  isPolling: boolean
  attempts: number
  currentInterval: number
  lastErrorCode?: number
  consecutiveErrors: number
  lastProgressValue?: number | string
  sameProgressCount: number
  startTime: number
}

/**
 * A hook for polling data with configurable options
 * @template T The type of data being polled
 * @param fetchFn The function to fetch data
 * @param options Polling configuration options
 * @returns An object with polling state and control functions
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions<T> = {}
): {
  data: T | null;
  error: Error | null;
  isPolling: boolean;
  attempts: number;
  startPolling: () => void;
  stopPolling: () => void;
  resetPolling: () => void;
} {
  const {
    interval = 2000,
    maxAttempts = Infinity,
    stopCondition = () => false,
    enabled = true,
    immediate = true,
    onSuccess,
    onError,
    useExponentialBackoff = true,
    maxBackoffInterval = 30000, // 30 seconds max
    retryStatusCodes = [408, 429, 500, 502, 503, 504], // Common retry status codes
    maxDurationMs = 5 * 60 * 1000, // Default to 5 minutes max polling time
    stuckDetectionCount = 5, // Default to 5 identical responses before considering stuck
  } = options

  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    isPolling: false,
    attempts: 0,
    currentInterval: interval,
    consecutiveErrors: 0,
    sameProgressCount: 0,
    startTime: Date.now(),
  })

  const timeoutRef = useRef<NodeJS.Timeout>()
  const mountedRef = useRef(true)

  const clearPollingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }
  }, [])

  const stopPolling = useCallback(() => {
    clearPollingTimeout()
    if (mountedRef.current) {
      setState((prev) => ({ ...prev, isPolling: false }))
    }
  }, [clearPollingTimeout])

  const poll = useCallback(async () => {
    if (!mountedRef.current || !enabled) return

    // Check if we've exceeded the maximum polling duration
    const elapsedTime = Date.now() - state.startTime;
    if (elapsedTime > maxDurationMs) {
      console.log(`[Polling] Maximum polling duration (${maxDurationMs}ms) exceeded. Stopping.`);
      stopPolling();

      // Notify about timeout
      const timeoutError = new Error(`Polling timed out after ${Math.round(elapsedTime / 1000)} seconds`);
      setState(prev => ({
        ...prev,
        error: timeoutError,
        isPolling: false
      }));

      onError?.(timeoutError);
      return;
    }

    try {
      const data = await fetchFn()

      if (!mountedRef.current) return

      // Check for stuck progress
      let newSameProgressCount = 0;
      let progressValue: number | string | undefined = undefined;

      // Extract progress value if available (works with our API response format)
      if (data && typeof data === 'object') {
        const typedData = data as Record<string, unknown>;
        if ('progress' in typedData &&
            (typeof typedData.progress === 'number' || typeof typedData.progress === 'string')) {
          progressValue = typedData.progress;
        } else if ('status' in typedData &&
                  (typeof typedData.status === 'string' || typeof typedData.status === 'number')) {
          progressValue = typedData.status;
        }
      }

      // Check if progress is the same as last time
      if (progressValue !== undefined && progressValue === state.lastProgressValue) {
        newSameProgressCount = state.sameProgressCount + 1;

        // If progress is stuck for too long, log a warning
        if (newSameProgressCount >= stuckDetectionCount) {
          console.warn(`[Polling] Progress appears to be stuck at ${progressValue} for ${newSameProgressCount} consecutive polls`);

          // If progress is stuck at a high value and status is still 'pending',
          // consider it as potentially completed but not reported correctly
          if (
            (typeof progressValue === 'number' && progressValue > 0.9) ||
            (data && typeof data === 'object' && 'status' in data && data.status === 'pending' && state.attempts > 10)
          ) {
            console.log('[Polling] Progress is high but status still pending. Checking if analysis is actually complete...');
          }
        }
      } else {
        // Progress changed, reset counter
        newSameProgressCount = 0;
      }

      // Reset backoff on success
      setState((prev) => ({
        ...prev,
        data,
        error: null,
        attempts: prev.attempts + 1,
        currentInterval: interval, // Reset to base interval
        consecutiveErrors: 0, // Reset consecutive errors
        lastErrorCode: undefined,
        lastProgressValue: progressValue,
        sameProgressCount: newSameProgressCount
      }))

      onSuccess?.(data)

      // Enhanced stop condition checks
      const shouldStop = (
        stopCondition(data) ||
        state.attempts >= maxAttempts ||
        // Stop if progress is stuck at a high value for too long
        (typeof progressValue === 'number' &&
         progressValue > 0.95 &&
         newSameProgressCount >= stuckDetectionCount * 2)
      );

      if (shouldStop) {
        console.log(`[Polling] Stopping poll: ${
          stopCondition(data) ? 'Stop condition met' :
          state.attempts >= maxAttempts ? 'Max attempts reached' :
          'Progress appears complete but stuck'
        }`);
        stopPolling();
        return;
      }

      // Schedule next poll with base interval (success resets backoff)
      timeoutRef.current = setTimeout(poll, interval)
    } catch (error) {
      if (!mountedRef.current) return

      const normalizedError = error instanceof Error ? error : new Error(String(error))

      // Extract status code if it's an HTTP error
      let statusCode: number | undefined = undefined;

      // Try to extract status code from various error formats
      const errorObj = error as Record<string, unknown>;
      if ('status' in errorObj && typeof errorObj.status === 'number') {
        statusCode = errorObj.status;
      } else if ('statusCode' in errorObj && typeof errorObj.statusCode === 'number') {
        statusCode = errorObj.statusCode;
      } else if ('code' in errorObj && typeof errorObj.code === 'number') {
        statusCode = errorObj.code;
      } else if (normalizedError.message.includes('status code')) {
        // Try to extract from message like "Request failed with status code 500"
        const match = normalizedError.message.match(/status code (\d+)/i);
        if (match && match[1]) {
          statusCode = parseInt(match[1], 10);
        }
      }

      // Calculate next interval with exponential backoff if enabled
      let nextInterval = interval;
      let shouldRetry = true;

      if (useExponentialBackoff) {
        setState((prev) => {
          // Determine if we should retry based on status code
          const isRetryableStatusCode = statusCode ? retryStatusCodes.includes(statusCode) : true;
          shouldRetry = isRetryableStatusCode && prev.attempts < maxAttempts;

          // Calculate backoff with jitter
          const newConsecutiveErrors = prev.consecutiveErrors + 1;
          const backoffFactor = Math.min(10, Math.pow(2, newConsecutiveErrors - 1)); // 2^(n-1) up to max of 10
          const jitter = Math.random() * 0.3 + 0.85; // Random between 0.85 and 1.15
          const calculatedInterval = Math.min(
            maxBackoffInterval,
            Math.floor(interval * backoffFactor * jitter)
          );

          return {
            ...prev,
            error: normalizedError,
            attempts: prev.attempts + 1,
            currentInterval: calculatedInterval,
            lastErrorCode: statusCode,
            consecutiveErrors: newConsecutiveErrors,
            // Keep other state values
            lastProgressValue: prev.lastProgressValue,
            sameProgressCount: prev.sameProgressCount,
            startTime: prev.startTime
          };
        });

        nextInterval = state.currentInterval;
      } else {
        // Simple non-backoff update
        setState((prev) => ({
          ...prev,
          error: normalizedError,
          attempts: prev.attempts + 1,
          lastErrorCode: statusCode,
          // Keep other state values
          lastProgressValue: prev.lastProgressValue,
          sameProgressCount: prev.sameProgressCount,
          startTime: prev.startTime
        }));
      }

      onError?.(normalizedError)

      // Check if we should stop polling due to max attempts
      if (state.attempts >= maxAttempts || !shouldRetry) {
        stopPolling()
        return
      }

      // Schedule next poll with calculated interval
      timeoutRef.current = setTimeout(poll, nextInterval)

      console.log(`Polling retry in ${nextInterval}ms (attempt ${state.attempts + 1}/${maxAttempts})`);
    }
  }, [
    enabled,
    fetchFn,
    interval,
    maxAttempts,
    maxBackoffInterval,
    maxDurationMs,
    onError,
    onSuccess,
    retryStatusCodes,
    stopCondition,
    stopPolling,
    state,
    stuckDetectionCount,
    useExponentialBackoff,
  ])

  const startPolling = useCallback(() => {
    if (!enabled || state.isPolling) return

    setState((prev) => ({ ...prev, isPolling: true, attempts: 0 }))
    poll()
  }, [enabled, poll, state.isPolling])

  const resetPolling = useCallback(() => {
    stopPolling()
    setState({
      data: null,
      error: null,
      isPolling: false,
      attempts: 0,
      currentInterval: interval,
      consecutiveErrors: 0,
      lastErrorCode: undefined,
      sameProgressCount: 0,
      lastProgressValue: undefined,
      startTime: Date.now(), // Reset the start time for the next polling session
    })
  }, [stopPolling, interval])

  useEffect(() => {
    if (immediate && enabled) {
      startPolling()
    }

    return () => {
      mountedRef.current = false
      clearPollingTimeout()
    }
  }, [immediate, enabled, startPolling, clearPollingTimeout])

  return {
    data: state.data,
    error: state.error,
    isPolling: state.isPolling,
    attempts: state.attempts,
    startPolling,
    stopPolling,
    resetPolling,
  }
}
