import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/apiClient'
import { useToast } from '@/components/ui/use-toast'

export interface UseUploadOptions {
  onSuccess?: (dataId: number) => void
  onError?: (error: Error) => void
  onProgress?: (progress: number) => void
  maxFileSize?: number // in bytes
}

export interface UseUploadResult {
  upload: (file: File) => Promise<void>
  isUploading: boolean
  progress: number
  error: Error | null
  reset: () => void
  dataId: number | null
}

export function useUpload(options: UseUploadOptions = {}): UseUploadResult {
  const [progress, setProgress] = useState(0)
  const [dataId, setDataId] = useState<number | null>(null)
  const { toast } = useToast()

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Validate file size
      if (options.maxFileSize && file.size > options.maxFileSize) {
        throw new Error(
          `File too large. Maximum size is ${Math.floor(
            options.maxFileSize / 1024 / 1024
          )}MB`
        )
      }

      // Validate file type
      if (file.type !== 'application/json') {
        throw new Error('Please upload a JSON file')
      }

      try {
        // Reset progress
        setProgress(0)
        options.onProgress?.(0)

        // Simulate upload progress
        const progressInterval = setInterval(() => {
          setProgress((prev) => {
            const next = Math.min(prev + 10, 90)
            options.onProgress?.(next)
            return next
          })
        }, 100)

        // Perform upload
        const response = await apiClient.uploadData(file)

        // Clear interval and set to 100%
        clearInterval(progressInterval)
        setProgress(100)
        options.onProgress?.(100)

        // Set data ID
        setDataId(response.data_id)

        return response
      } catch (error) {
        // Reset progress on error
        setProgress(0)
        options.onProgress?.(0)
        throw error
      }
    },
    onSuccess: (response) => {
      toast({
        title: 'Upload Successful',
        description: 'Your file has been uploaded successfully.',
      })
      options.onSuccess?.(response.data_id)
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      })
      options.onError?.(error)
    },
  })

  const upload = useCallback(
    async (file: File) => {
      try {
        await uploadMutation.mutateAsync(file)
      } catch (error) {
        // Error is handled by mutation error handler
      }
    },
    [uploadMutation]
  )

  const reset = useCallback(() => {
    setProgress(0)
    setDataId(null)
    options.onProgress?.(0)
  }, [options])

  return {
    upload,
    isUploading: uploadMutation.isPending,
    progress,
    error: uploadMutation.error as Error | null,
    reset,
    dataId,
  }
}