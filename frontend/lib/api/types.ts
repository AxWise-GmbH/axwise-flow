/**
 * Shared types for API responses and requests
 */

// Re-export types from the main types directory to maintain compatibility
export type {
  UploadResponse,
  DetailedAnalysisResult,
  AnalysisResponse,
  SentimentOverview,
  PriorityInsightsResponse
} from '@/types/api';

// Add a custom property to the AxiosRequestConfig type to fix the _retry issue
declare module 'axios' {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}

// Add an interface for the window object that includes showToast
declare global {
  interface Window {
    showToast?: (message: string, options?: any) => void;
    Clerk?: {
      session?: {
        getToken: () => Promise<string>;
      };
    };
  }
}

/**
 * Enhanced status response type from the status endpoint
 */
export type EnhancedStatusResponse = {
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  current_stage?: string;
  stage_states?: Record<string, any>;
  started_at?: string;
  completed_at?: string;
  request_id?: string;
  error?: string;
  error_code?: string;
  error_stage?: string;
  error_time?: string;
  message?: string;
};

/**
 * Analysis status response type
 */
export type AnalysisStatusResponse = {
  status: 'pending' | 'completed' | 'failed';
  progress?: number;
  currentStage?: string;
  stageStates?: Record<string, any>;
  startedAt?: string;
  completedAt?: string;
  requestId?: string;
  analysis?: any;
  error?: string;
  errorCode?: string;
  errorStage?: string;
};

/**
 * Options for persona generation
 */
export type PersonaGenerationOptions = {
  llmProvider?: string;
  llmModel?: string;
  returnAllPersonas?: boolean;
};
