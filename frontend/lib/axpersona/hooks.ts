'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/providers/toast-provider';
import { pipelineService, StartPipelineResponse } from './pipelineService';
import { pipelineRunsService } from './pipelineRunsService';
import type {
  BusinessContext,
  PipelineRunListResponse,
  PipelineRunDetail,
} from './types';

/**
 * Hook to start a pipeline job.
 * Returns immediately with job_id - use usePipelineRunDetail() to track progress.
 */
export function useStartPipeline() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation<StartPipelineResponse, Error, BusinessContext>({
    mutationFn: (context) => pipelineService.startPipeline(context),
    onSuccess: (data) => {
      showToast('Pipeline job started. Generating dataset...', { variant: 'success' });
      // Invalidate pipeline runs list to show the new job
      queryClient.invalidateQueries({ queryKey: ['pipelineRuns'] });
    },
    onError: (error) => {
      showToast(error.message || 'Failed to start AxPersona pipeline', {
        variant: 'error',
      });
    },
  });
}

/**
 * @deprecated Use useStartPipeline() instead - it returns immediately and doesn't block
 */
export function useRunPipeline() {
  return useStartPipeline();
}

/**
 * Hook to fetch list of pipeline runs with optional filtering and pagination
 */
export function usePipelineRuns(params?: {
  status?: 'pending' | 'running' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  const { enabled = true, ...queryParams } = params || {};

  return useQuery<PipelineRunListResponse, Error>({
    queryKey: ['pipelineRuns', queryParams],
    queryFn: () => pipelineRunsService.listPipelineRuns(queryParams),
    enabled,
    refetchInterval: 5000, // Refetch every 5 seconds to show live updates
    staleTime: 2000, // Consider data stale after 2 seconds
  });
}

/**
 * Hook to fetch detailed information about a specific pipeline run
 */
export function usePipelineRunDetail(jobId: string | null) {
  return useQuery<PipelineRunDetail, Error>({
    queryKey: ['pipelineRun', jobId],
    queryFn: () => pipelineRunsService.getPipelineRunDetail(jobId!),
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Stop refetching if the run is completed or failed
      if (data?.status === 'completed' || data?.status === 'failed') {
        return false;
      }
      // Refetch every 5 seconds for pending/running jobs
      return 5000;
    },
  });
}

