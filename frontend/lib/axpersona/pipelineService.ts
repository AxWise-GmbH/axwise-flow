import { getAuthToken } from '@/lib/api';
import type {
  BusinessContext,
  PipelineExecutionResult,
  PipelineJobResult,
} from './types';

// Use Next.js API proxy route to avoid CORS issues
// The proxy route handles authentication and forwards to the backend
const PIPELINE_API_URL = '/api/axpersona/pipeline/run-async';

// The Next.js proxy route implements job creation + server-side polling against
// the backend job endpoints, so from the frontend's perspective this function
// can continue to behave as a single long-running call that returns the final
// PipelineExecutionResult.

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

export const pipelineService = {
  async runPipeline(
    context: BusinessContext,
  ): Promise<PipelineExecutionResult> {
    const headers = await buildAuthHeaders();

    const response = await fetch(PIPELINE_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(context),
    });

    if (!response.ok) {
      let message = 'AxPersona pipeline run failed';
      try {
        const errorData = await response.json();
        const detail = (errorData as any)?.detail;
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

    const data = (await response.json()) as PipelineExecutionResult;
    return data;
  },
};

