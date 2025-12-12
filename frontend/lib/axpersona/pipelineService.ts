import { getAuthToken } from '@/lib/api';
import type {
  BusinessContext,
  PipelineJobResult,
  StakeholderNewsRequest,
  StakeholderNewsResponse,
} from './types';

// Use Next.js API proxy route to avoid CORS issues
// The proxy route handles authentication and forwards to the backend
const PIPELINE_API_URL = '/api/axpersona/pipeline/run-async';

async function buildAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Response from starting a pipeline job
 */
export interface StartPipelineResponse {
  job_id: string;
  status: string;
  message?: string;
}

export const pipelineService = {
  /**
   * Start a pipeline job. Returns immediately with the job_id.
   * Use usePipelineRunDetail() hook to poll for job completion.
   */
  async startPipeline(
    context: BusinessContext,
  ): Promise<StartPipelineResponse> {
    const headers = await buildAuthHeaders();

    const response = await fetch(PIPELINE_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      let message = 'Failed to start AxPersona pipeline';
      try {
        const errorData = await response.json();
        const detail = (errorData as any)?.detail || (errorData as any)?.error;
        if (detail) {
          if (Array.isArray(detail)) {
            message = detail
              .map((d: any) => d?.msg ?? d)
              .join(', ');
          } else {
            message = String(detail);
          }
        }
      } catch {
        // ignore JSON parse errors and fall back to generic message
      }
      throw new Error(message);
    }

    return await response.json();
  },

  /**
   * Search for stakeholder/industry news for a specific year.
   * Uses Gemini's Google Search grounding for real-time information.
   */
  async searchStakeholderNews(
    request: StakeholderNewsRequest,
  ): Promise<StakeholderNewsResponse> {
    const headers = await buildAuthHeaders();

    const response = await fetch('/api/axpersona/search-stakeholder-news', {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      let message = 'Failed to search stakeholder news';
      try {
        const errorData = await response.json();
        const detail = (errorData as any)?.detail || (errorData as any)?.error;
        if (detail) {
          message = String(detail);
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return await response.json();
  },
};

