import { useQuery, useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import type { DetailedAnalysisResult } from '@/types/api'
import { useToast } from '@/components/ui/use-toast'

interface AnalysisRequest {
  data_id: number
  llm_provider: 'openai' | 'gemini'
  llm_model?: string
  is_free_text?: boolean
  industry?: string
}

type AnalysisResults = DetailedAnalysisResult

interface UseAnalysisOptions {
  onSuccess?: (results: AnalysisResults) => void
  onError?: (error: Error) => void
  pollingInterval?: number
}

export function useAnalysis(
  dataId: number | null,
  options: UseAnalysisOptions = {}
) {
  const { toast } = useToast()
  const [resultId, setResultId] = useState<number | null>(null)

  // Mutation for starting analysis
  const analyzeMutation = useMutation({
    mutationFn: (request: AnalysisRequest) => apiClient.analyzeData(
      request.data_id,
      request.llm_provider,
      request.llm_model,
      request.is_free_text,
      request.industry
    ),
    onSuccess: (response) => {
      setResultId(response.result_id)
      toast({
        title: 'Analysis Started',
        description: 'Your data is being analyzed...',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Error',
        description: error.message,
        variant: 'destructive',
      })
      options.onError?.(error)
    },
  })

  // Query for polling results
  const resultsQuery = useQuery({
    queryKey: ['analysis', resultId],
    queryFn: async () => {
      if (!resultId) throw new Error('No result ID available')
      const status = await apiClient.checkAnalysisStatus(String(resultId))
      if (status.status === 'completed' && status.completed_at) {
        return apiClient.getAnalysisById(String(resultId))
      }
      if (status.status === 'failed') {
        return { status: 'failed', error: status.error || 'Analysis failed' } as AnalysisResults
      }
      return { status: 'pending' } as AnalysisResults
    },
    enabled: !!resultId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || data.status === 'pending') {
        return options.pollingInterval || 2000 // Poll every 2 seconds while processing
      }
      return false // Stop polling when complete or error
    },
  })

  const lastNotification = useRef<string | null>(null)
  useEffect(() => {
    const data = resultsQuery.data
    const notificationKey = data ? `${resultId}:${data.status}` : null
    if (!data || !notificationKey || notificationKey === lastNotification.current) return

    if (data.status === 'completed') {
      lastNotification.current = notificationKey
      toast({ title: 'Analysis Complete', description: 'Your results are ready!' })
      options.onSuccess?.(data)
    } else if (data.status === 'failed') {
      lastNotification.current = notificationKey
      const message = data.error || 'An unknown error occurred'
      toast({ title: 'Analysis Failed', description: message, variant: 'destructive' })
      options.onError?.(new Error(message))
    }
  }, [options, resultId, resultsQuery.data, toast])

  useEffect(() => {
    if (!resultsQuery.error) return
    const error = resultsQuery.error as Error
    toast({ title: 'Error Fetching Results', description: error.message, variant: 'destructive' })
    options.onError?.(error)
  }, [options, resultsQuery.error, toast])

  // Function to start analysis
  const startAnalysis = async (
    provider: 'openai' | 'gemini' = 'openai',
    industry?: string
  ) => {
    if (!dataId) {
      throw new Error('No data ID provided')
    }

    return analyzeMutation.mutateAsync({
      data_id: dataId,
      llm_provider: provider,
      llm_model: provider === 'openai' ? 'gpt-4o-2024-08-06' : 'models/gemini-2.5-flash',
      industry: industry
    })
  }

  return {
    startAnalysis,
    isAnalyzing: analyzeMutation.isPending || (resultsQuery.data?.status === 'pending'),
    isLoading: analyzeMutation.isPending || resultsQuery.isPending,
    results: resultsQuery.data,
    error: analyzeMutation.error || resultsQuery.error,
    resultId,
  }
}
