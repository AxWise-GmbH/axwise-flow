/**
 * Pipeline Runs API Service
 * 
 * Handles fetching historical pipeline runs from the database.
 */

import type {
  PipelineRunSummary,
  PipelineRunDetail,
  PipelineRunListResponse,
} from './types';

// Use Next.js API proxy routes to avoid CORS issues
const PIPELINE_RUNS_API_URL = '/api/axpersona/pipeline/runs';

export const pipelineRunsService = {
  /**
   * List all historical pipeline runs with optional filtering and pagination
   */
  async listPipelineRuns(params?: {
    status?: 'pending' | 'running' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  }): Promise<PipelineRunListResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.status) {
      searchParams.set('status', params.status);
    }
    if (params?.limit !== undefined) {
      searchParams.set('limit', params.limit.toString());
    }
    if (params?.offset !== undefined) {
      searchParams.set('offset', params.offset.toString());
    }

    const url = searchParams.toString()
      ? `${PIPELINE_RUNS_API_URL}?${searchParams.toString()}`
      : PIPELINE_RUNS_API_URL;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let message = 'Failed to fetch pipeline runs';
      try {
        const errorData = await response.json();
        const detail = (errorData as any)?.detail;
        if (detail) {
          message = typeof detail === 'string' ? detail : JSON.stringify(detail);
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return await response.json();
  },

  /**
   * Get detailed information about a specific pipeline run
   */
  async getPipelineRunDetail(jobId: string): Promise<PipelineRunDetail> {
    const response = await fetch(`${PIPELINE_RUNS_API_URL}/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      let message = `Failed to fetch pipeline run ${jobId}`;
      try {
        const errorData = await response.json();
        const detail = (errorData as any)?.detail;
        if (detail) {
          message = typeof detail === 'string' ? detail : JSON.stringify(detail);
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return await response.json();
  },
};

