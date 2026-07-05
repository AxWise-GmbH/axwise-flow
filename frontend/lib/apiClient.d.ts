/**
 * Type definitions for the API client
 */

import type { AnalysisResponse, DetailedAnalysisResult, PriorityInsightsResponse, UploadResponse } from '@/types/api';

/**
 * Request parameters for analyzing data
 */
export interface AnalysisRequest {
  data_id: number;
  llm_provider: 'openai' | 'gemini';
  llm_model?: string;
  is_free_text?: boolean;
  industry?: string;
}

/**
 * Results from an analysis
 */
export type AnalysisResults = DetailedAnalysisResult;

/**
 * Parameters for generating a persona directly from text
 */
export interface PersonaGenerationParams {
  text: string;
  llmProvider?: string;
  llmModel?: string;
  returnAllPersonas?: boolean;
  industry?: string;
}
