/**
 * Analysis-related methods for the API client
 */

import { apiCore } from './core';
import { AnalysisResponse, AnalysisStatusResponse, EnhancedStatusResponse } from './types';

/**
 * Trigger analysis of uploaded data
 *
 * Note: Enhanced theme analysis is always enabled on the backend,
 * so we've removed the useEnhancedThemeAnalysis parameter.
 *
 * @param dataId The ID of the uploaded data to analyze
 * @param llmProvider The LLM provider to use (default: 'openai')
 * @param llmModel The LLM model to use (optional)
 * @param isTextFile Whether the file is a text file (optional)
 * @param industry The industry context for analysis (optional)
 * @returns A promise that resolves to the analysis response
 */
export async function analyzeData(
  dataId: number,
  llmProvider: 'openai' | 'gemini' = 'openai',
  llmModel?: string,
  isTextFile?: boolean,
  industry?: string
): Promise<AnalysisResponse> {
  const response = await apiCore.getClient().post('/api/analyze', {
    data_id: dataId,
    llm_provider: llmProvider,
    llm_model: llmModel,
    is_free_text: isTextFile || false,
    industry: industry || undefined
    // Enhanced theme analysis is always enabled on the backend
  }, {
    timeout: 60000 // 60 seconds timeout for triggering analysis
  });
  return response.data;
}

/**
 * Check if analysis is complete for a given result ID
 *
 * This method polls the backend API to determine if the analysis process
 * has been completed for a specific analysis result.
 *
 * @param resultId The ID of the analysis result to check
 * @returns A promise that resolves to the analysis status
 */
export async function checkAnalysisStatus(resultId: string): Promise<EnhancedStatusResponse> {
  if (!resultId) {
    console.error('[checkAnalysisStatus] Called with empty resultId');
    return { status: 'failed', error: 'Analysis ID is required for status check.' };
  }

  try {
    console.log(`[checkAnalysisStatus] Checking status for analysis ID: ${resultId}`); // DEBUG LOG

    // Use fetch with proper authentication instead of axios
    const response = await fetch(`/api/analysis/${resultId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.error(`[checkAnalysisStatus] Authentication required for analysis ${resultId}`);
        return { status: 'failed', error: 'Authentication required. Please sign in to check analysis status.' };
      }
      const errorText = await response.text();
      console.error(`[checkAnalysisStatus] API error for ${resultId}:`, response.status, errorText);
      return { status: 'failed', error: `Failed to check analysis status: ${response.status} ${errorText}` };
    }

    const statusData = await response.json();

    console.log(`[checkAnalysisStatus] Received status for ${resultId}:`, statusData); // DEBUG LOG

    // Map 'processing' to 'pending' for frontend consistency
    const frontendStatus = statusData.status === 'processing' ? 'pending' : statusData.status;

    // Return response with snake_case field names to match API
    return {
      status: frontendStatus,
      progress: statusData.progress,
      current_stage: statusData.current_stage,
      stage_states: statusData.stage_states,
      started_at: statusData.started_at,
      completed_at: statusData.completed_at,
      request_id: statusData.request_id,
      // Include error information if status is 'failed'
      ...(frontendStatus === 'failed' && {
        error: statusData.error || statusData.message,
        error_code: statusData.error_code,
        error_stage: statusData.error_stage
      })
    };

  } catch (error: any) {
    // Improved error handling with more detailed logging
    console.error(`[checkAnalysisStatus] Error checking analysis status for ID ${resultId}:`, error);

    // If we have a response object with status code
    if (error.response) {
      console.log(`[checkAnalysisStatus] Response status: ${error.response.status}`);
      console.log(`[checkAnalysisStatus] Response data:`, error.response.data);

      // Extract detailed error information if available
      const errorData = error.response.data;
      const errorMessage = typeof errorData === 'object' && errorData?.message
        ? errorData.message
        : typeof errorData === 'string'
          ? errorData
          : 'Unknown error';

      const errorCode = typeof errorData === 'object' && errorData?.code
        ? errorData.code
        : `HTTP_${error.response.status}`;

      // If the status endpoint returns 404, it might mean the analysis ID is invalid
      // or doesn't belong to the user. Treat as failed for polling purposes.
      if (error.response.status === 404) {
        return {
          status: 'failed',
          error: errorMessage || 'Analysis not found or access denied.',
          error_code: errorCode || 'ANALYSIS_NOT_FOUND',
          request_id: typeof errorData === 'object' && errorData?.request_id ? errorData.request_id : undefined
        };
      }

      // For 500 errors, we'll continue polling as the backend might recover
      if (error.response.status >= 500) {
        console.log(`[checkAnalysisStatus] Server error, will retry polling`);
        return {
          status: 'pending',
          error: errorMessage || 'Server processing error, retrying...',
          error_code: errorCode || 'SERVER_ERROR',
          request_id: typeof errorData === 'object' && errorData?.request_id ? errorData.request_id : undefined
        };
      }
    }

    // For network errors, we'll also continue polling
    if (error.message && error.message.includes('Network Error')) {
      console.log(`[checkAnalysisStatus] Network error, will retry polling`);
      return {
        status: 'pending',
        error: 'Network error, retrying...',
        error_code: 'NETWORK_ERROR'
      };
    }

    // For timeout errors, continue polling with backoff
    if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
      console.log(`[checkAnalysisStatus] Timeout error, will retry polling with backoff`);
      return {
        status: 'pending',
        error: 'Request timed out, retrying...',
        error_code: 'TIMEOUT_ERROR'
      };
    }

    // For other errors, return 'pending' to allow polling to retry
    console.log(`[checkAnalysisStatus] Unhandled error, will retry polling`);
    return {
      status: 'pending',
      error: error.message || 'Unknown error, retrying...',
      error_code: 'UNKNOWN_ERROR'
    };
  }
}

/**
 * Get processing status for an analysis
 *
 * @param analysisId The ID of the analysis to get the status for
 * @returns A promise that resolves to the processing status
 */
export async function getProcessingStatus(analysisId: string): Promise<any> {
  try {
    // Use fetch with proper authentication instead of axios
    const response = await fetch(`/api/analysis/${analysisId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication required. Please sign in to check processing status.');
      }
      // Create an error object that matches the axios error structure for compatibility
      const error = new Error(`HTTP ${response.status}`);
      (error as any).response = { status: response.status };
      throw error;
    }

    return await response.json();
  } catch (error: any) {
    console.error('Error fetching processing status:', error);
    return {
      status: error?.response?.status === 404 ? 'failed' : 'pending',
      current_stage: error?.response?.status === 404 ? 'ERROR' : 'STATUS_UNAVAILABLE',
      progress: 0,
      stage_states: {},
      error: error?.message || 'Unable to retrieve processing status'
    };
  }
}
