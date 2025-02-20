import { renderHook, act } from '@testing-library/react'
import { useAnalysis } from '../use-analysis'
import { apiClient } from '@/lib/apiClient'
import { mockAnalysisResults } from '@/lib/utils/__tests__/test-helpers'

// Mock the API client
jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    analyzeData: jest.fn(),
    getResults: jest.fn(),
  },
}))

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

describe('useAnalysis Hook', () => {
  const mockDataId = 123
  const mockResultId = 456

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useAnalysis(mockDataId))

    expect(result.current.isAnalyzing).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.results).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('starts analysis successfully', async () => {
    // Mock successful analysis start
    (apiClient.analyzeData as jest.Mock).mockResolvedValueOnce({
      result_id: mockResultId,
    })

    const { result } = renderHook(() => useAnalysis(mockDataId))

    await act(async () => {
      await result.current.startAnalysis()
    })

    expect(apiClient.analyzeData).toHaveBeenCalledWith({
      data_id: mockDataId,
      llm_provider: 'openai',
      llm_model: 'gpt-4o-2024-08-06',
    })
    expect(result.current.resultId).toBe(mockResultId)
  })

  it('handles analysis error', async () => {
    const mockError = new Error('Analysis failed')
    (apiClient.analyzeData as jest.Mock).mockRejectedValueOnce(mockError)

    const { result } = renderHook(() => useAnalysis(mockDataId))

    await act(async () => {
      await result.current.startAnalysis()
    })

    expect(result.current.error).toBe(mockError)
    expect(result.current.isAnalyzing).toBe(false)
  })

  it('polls for results when analysis starts', async () => {
    // Mock successful analysis start
    (apiClient.analyzeData as jest.Mock).mockResolvedValueOnce({
      result_id: mockResultId,
    })

    // Mock results polling
    (apiClient.getResults as jest.Mock)
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce(mockAnalysisResults)

    const { result } = renderHook(() => 
      useAnalysis(mockDataId, {
        pollingInterval: 100, // Fast polling for tests
      })
    )

    await act(async () => {
      await result.current.startAnalysis()
    })

    // Wait for polling to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    expect(apiClient.getResults).toHaveBeenCalledWith(mockResultId)
    expect(result.current.results).toEqual(mockAnalysisResults)
    expect(result.current.isAnalyzing).toBe(false)
  })

  it('stops polling when analysis completes', async () => {
    // Mock successful analysis start
    (apiClient.analyzeData as jest.Mock).mockResolvedValueOnce({
      result_id: mockResultId,
    })

    // Mock completed results
    (apiClient.getResults as jest.Mock).mockResolvedValueOnce({
      ...mockAnalysisResults,
      status: 'completed',
    })

    const { result } = renderHook(() => 
      useAnalysis(mockDataId, {
        pollingInterval: 100,
      })
    )

    await act(async () => {
      await result.current.startAnalysis()
    })

    // Wait for polling to potentially continue
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300))
    })

    // Should only be called once since status is 'completed'
    expect(apiClient.getResults).toHaveBeenCalledTimes(1)
  })

  it('handles polling error', async () => {
    // Mock successful analysis start
    (apiClient.analyzeData as jest.Mock).mockResolvedValueOnce({
      result_id: mockResultId,
    })

    // Mock polling error
    const mockError = new Error('Polling failed')
    (apiClient.getResults as jest.Mock).mockRejectedValueOnce(mockError)

    const { result } = renderHook(() => 
      useAnalysis(mockDataId, {
        pollingInterval: 100,
      })
    )

    await act(async () => {
      await result.current.startAnalysis()
    })

    expect(result.current.error).toBe(mockError)
    expect(result.current.isAnalyzing).toBe(false)
  })

  it('calls onSuccess callback when analysis completes', async () => {
    const onSuccess = jest.fn()
    
    // Mock successful analysis
    (apiClient.analyzeData as jest.Mock).mockResolvedValueOnce({
      result_id: mockResultId,
    })
    (apiClient.getResults as jest.Mock).mockResolvedValueOnce({
      ...mockAnalysisResults,
      status: 'completed',
    })

    const { result } = renderHook(() => 
      useAnalysis(mockDataId, {
        onSuccess,
        pollingInterval: 100,
      })
    )

    await act(async () => {
      await result.current.startAnalysis()
    })

    expect(onSuccess).toHaveBeenCalledWith(mockAnalysisResults)
  })

  it('calls onError callback when analysis fails', async () => {
    const onError = jest.fn()
    const mockError = new Error('Analysis failed')
    
    // Mock analysis failure
    (apiClient.analyzeData as jest.Mock).mockRejectedValueOnce(mockError)

    const { result } = renderHook(() => 
      useAnalysis(mockDataId, {
        onError,
      })
    )

    await act(async () => {
      await result.current.startAnalysis()
    })

    expect(onError).toHaveBeenCalledWith(mockError)
  })
})