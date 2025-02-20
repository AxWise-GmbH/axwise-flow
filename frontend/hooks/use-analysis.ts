import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import type { AnalysisRequest, AnalysisResults } from '@/lib/apiClient'
import { useToast } from '@/components/ui/use-toast'

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
    mutationFn: (request: AnalysisRequest) => apiClient.analyzeData(request),
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
    queryFn: () => {
      if (!resultId) throw new Error('No result ID available')
      return apiClient.getResults(resultId)
    },
    enabled: !!resultId,
    refetchInterval: (data) => {
      if (!data || data.status === 'processing') {
        return options.pollingInterval || 2000 // Poll every 2 seconds while processing
      }
      return false // Stop polling when complete or error
    },
    onSuccess: (data) => {
      if (data.status === 'completed') {
        toast({
          title: 'Analysis Complete',
          description: 'Your results are ready!',
        })
        options.onSuccess?.(data)
      } else if (data.status === 'error') {
        toast({
          title: 'Analysis Failed',
          description: data.error || 'An unknown error occurred',
          variant: 'destructive',
        })
        options.onError?.(new Error(data.error || 'Analysis failed'))
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Fetching Results',
        description: error.message,
        variant: 'destructive',
      })
      options.onError?.(error)
    },
  })

  // Function to start analysis
  const startAnalysis = async (provider: 'openai' | 'gemini' = 'openai') => {
    if (!dataId) {
      throw new Error('No data ID provided')
    }

    return analyzeMutation.mutateAsync({
      data_id: dataId,
      llm_provider: provider,
      llm_model: provider === 'openai' ? 'gpt-4o-2024-08-06' : 'gemini-2.0-flash'
    })
  }

  return {
    startAnalysis,
    isAnalyzing: analyzeMutation.isPending || (resultsQuery.data?.status === 'processing'),
    isLoading: analyzeMutation.isPending || resultsQuery.isPending,
    results: resultsQuery.data,
    error: analyzeMutation.error || resultsQuery.error,
    resultId,
  }
}