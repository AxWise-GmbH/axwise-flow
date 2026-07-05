import { renderHook, act } from '@testing-library/react'
import { useUpload } from '../use-upload'
import { apiClient } from '@/lib/apiClient'
import { createMockFile } from '@/lib/utils/__tests__/test-helpers'

// Mock the API client
jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    uploadData: jest.fn(),
  },
}))

// Mock the toast hook
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}))

describe('useUpload Hook', () => {
  const mockFile = createMockFile(JSON.stringify({ test: 'data' }), 'application/json')
  const mockDataId = 123

  beforeEach(() => {
    jest.clearAllMocks()
    ;(apiClient.uploadData as jest.Mock).mockResolvedValue({ data_id: mockDataId })
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useUpload())

    expect(result.current.isUploading).toBe(false)
    expect(result.current.progress).toBe(0)
    expect(result.current.error).toBeNull()
    expect(result.current.dataId).toBeNull()
  })

  it('handles successful file upload', async () => {
    const onSuccess = jest.fn()
    const { result } = renderHook(() => useUpload({ onSuccess }))

    await act(async () => {
      await result.current.upload(mockFile)
    })

    expect(apiClient.uploadData).toHaveBeenCalledWith(mockFile)
    expect(result.current.dataId).toBe(mockDataId)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.progress).toBe(100)
    expect(onSuccess).toHaveBeenCalledWith(mockDataId)
  })

  it('handles upload failure', async () => {
    const error = new Error('Upload failed')
    const onError = jest.fn()
    ;(apiClient.uploadData as jest.Mock).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useUpload({ onError }))

    await act(async () => {
      await result.current.upload(mockFile)
    })

    expect(result.current.error).toBe(error)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.progress).toBe(0)
    expect(onError).toHaveBeenCalledWith(error)
  })

  it('validates file size', async () => {
    const maxFileSize = 1024 * 1024 // 1MB
    const largeFile = new File(
      [new ArrayBuffer(maxFileSize + 1)],
      'large.json',
      { type: 'application/json' }
    )

    const { result } = renderHook(() => useUpload({ maxFileSize }))

    await act(async () => {
      await result.current.upload(largeFile)
    })

    expect(result.current.error?.message).toContain('File too large')
    expect(apiClient.uploadData).not.toHaveBeenCalled()
  })

  it('validates file type', async () => {
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' })
    const { result } = renderHook(() => useUpload())

    await act(async () => {
      await result.current.upload(invalidFile)
    })

    expect(result.current.error?.message).toContain('Please upload a JSON file')
    expect(apiClient.uploadData).not.toHaveBeenCalled()
  })

  it('updates progress during upload', async () => {
    const { result } = renderHook(() => useUpload())
    const progressValues: number[] = []

    // Mock the progress callback
    const onProgress = jest.fn((progress: number) => {
      progressValues.push(progress)
    })

    await act(async () => {
      await result.current.upload(mockFile)
    })

    expect(progressValues).toContain(0) // Initial progress
    expect(progressValues).toContain(100) // Final progress
    expect(Math.max(...progressValues)).toBe(100)
    expect(Math.min(...progressValues)).toBe(0)
  })

  it('resets state correctly', async () => {
    const { result } = renderHook(() => useUpload())

    // First upload
    await act(async () => {
      await result.current.upload(mockFile)
    })

    expect(result.current.dataId).toBe(mockDataId)

    // Reset
    act(() => {
      result.current.reset()
    })

    expect(result.current.dataId).toBeNull()
    expect(result.current.progress).toBe(0)
    expect(result.current.error).toBeNull()
    expect(result.current.isUploading).toBe(false)
  })

  it('prevents concurrent uploads', async () => {
    const { result } = renderHook(() => useUpload())

    // Start first upload
    const firstUpload = result.current.upload(mockFile)

    // Attempt second upload
    const secondUpload = result.current.upload(mockFile)

    await act(async () => {
      await Promise.all([firstUpload, secondUpload])
    })

    // Should only call uploadData once
    expect(apiClient.uploadData).toHaveBeenCalledTimes(1)
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useUpload())

    unmount()

    // Add assertions for any cleanup if needed
    // For example, checking if progress updates are stopped
  })
})