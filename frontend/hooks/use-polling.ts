import { useState, useEffect, useCallback, useRef } from 'react'

interface UsePollingOptions<T> {
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
  interval?: number
  maxAttempts?: number
  stopCondition?: (data: T) => boolean
  enabled?: boolean
  immediate?: boolean
}

interface PollingState<T> {
  data: T | null
  error: Error | null
  isPolling: boolean
  attempts: number
}

/**
 * A hook for polling data with configurable options
 * @template T The type of data being polled
 * @param fetchFn The function to fetch data
 * @param options Polling configuration options
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions<T> = {}
) {
  const {
    interval = 2000,
    maxAttempts = Infinity,
    stopCondition = () => false,
    enabled = true,
    immediate = true,
    onSuccess,
    onError,
  } = options

  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    isPolling: false,
    attempts: 0,
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

    try {
      const data = await fetchFn()

      if (!mountedRef.current) return

      setState((prev) => ({
        ...prev,
        data,
        error: null,
        attempts: prev.attempts + 1,
      }))

      onSuccess?.(data)

      // Check if we should stop polling
      if (stopCondition(data) || state.attempts >= maxAttempts) {
        stopPolling()
        return
      }

      // Schedule next poll
      timeoutRef.current = setTimeout(poll, interval)
    } catch (error) {
      if (!mountedRef.current) return

      const normalizedError = error instanceof Error ? error : new Error(String(error))

      setState((prev) => ({
        ...prev,
        error: normalizedError,
        attempts: prev.attempts + 1,
      }))

      onError?.(normalizedError)

      // Check if we should stop polling due to max attempts
      if (state.attempts >= maxAttempts) {
        stopPolling()
        return
      }

      // Schedule next poll even on error
      timeoutRef.current = setTimeout(poll, interval)
    }
  }, [
    enabled,
    fetchFn,
    interval,
    maxAttempts,
    onError,
    onSuccess,
    stopCondition,
    stopPolling,
    state.attempts,
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
    })
  }, [stopPolling])

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