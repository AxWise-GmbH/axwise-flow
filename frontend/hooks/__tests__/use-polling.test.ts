import { renderHook, act } from '@testing-library/react'
import { usePolling } from '../use-polling'

interface MockData {
  status: 'processing' | 'completed' | 'error'
  data?: any
  timestamp?: string
}

describe('usePolling Hook', () => {
  // Mock the current time for consistent testing
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('initializes with correct default state', () => {
    const mockFetch = jest.fn()
    const { result } = renderHook(() => usePolling<MockData>(mockFetch))

    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isPolling).toBe(false)
    expect(result.current.attempts).toBe(0)
  })

  it('starts polling when enabled', async () => {
    const mockData: MockData = { status: 'processing' }
    const mockFetch = jest.fn().mockResolvedValue(mockData)
    
    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        enabled: true,
        immediate: true,
      })
    )

    // Initial fetch
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(mockData)
    expect(result.current.isPolling).toBe(true)

    // Next interval
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000)
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('stops polling when stopCondition is met', async () => {
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({ status: 'processing' } as MockData)
      .mockResolvedValueOnce({ status: 'completed' } as MockData)

    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        stopCondition: data => data.status === 'completed',
        immediate: true,
      })
    )

    // Initial fetch
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    // Next interval that triggers stop condition
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000)
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.current.isPolling).toBe(false)
    expect(result.current.data?.status).toBe('completed')
  })

  it('stops polling after maxAttempts', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ status: 'processing' } as MockData)
    
    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        maxAttempts: 3,
        immediate: true,
      })
    )

    // Run through all attempts
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0) // First attempt
      await jest.advanceTimersByTimeAsync(1000) // Second attempt
      await jest.advanceTimersByTimeAsync(1000) // Third attempt
      await jest.advanceTimersByTimeAsync(1000) // Should not fetch
    })

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.current.isPolling).toBe(false)
    expect(result.current.attempts).toBe(3)
  })

  it('handles fetch errors', async () => {
    const mockError = new Error('Fetch failed')
    const mockFetch = jest.fn().mockRejectedValue(mockError)
    const onError = jest.fn()
    
    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        onError,
        immediate: true,
      })
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    expect(result.current.error).toBe(mockError)
    expect(onError).toHaveBeenCalledWith(mockError)
  })

  it('calls onSuccess when data is fetched', async () => {
    const mockData: MockData = { status: 'completed' }
    const mockFetch = jest.fn().mockResolvedValue(mockData)
    const onSuccess = jest.fn()
    
    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        onSuccess,
        immediate: true,
      })
    )

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    expect(onSuccess).toHaveBeenCalledWith(mockData)
  })

  it('can be manually started and stopped', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ status: 'processing' } as MockData)
    
    const { result } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        immediate: false,
      })
    )

    // Start polling manually
    act(() => {
      result.current.startPolling()
    })

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0)
    })

    expect(mockFetch).toHaveBeenCalled()
    expect(result.current.isPolling).toBe(true)

    // Stop polling manually
    act(() => {
      result.current.stopPolling()
    })

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1) // Should not have fetched again
    expect(result.current.isPolling).toBe(false)
  })

  it('cleans up on unmount', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ status: 'processing' } as MockData)
    
    const { unmount } = renderHook(() => 
      usePolling<MockData>(mockFetch, {
        interval: 1000,
        immediate: true,
      })
    )

    unmount()

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000)
    })

    expect(mockFetch).toHaveBeenCalledTimes(1) // Should not fetch after unmount
  })
})