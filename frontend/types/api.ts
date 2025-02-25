/**
 * API Types for the Interview Insight Analyst application
 */

/**
 * Response from the upload endpoint
 */
export interface UploadResponse {
  data_id: number;
  filename: string;
  upload_date: string;
  status: 'success' | 'error' | 'processing';
  message?: string;
}

/**
 * Response from the analyze endpoint
 */
export interface AnalysisResponse {
  result_id: number;
  message: string;
  status?: 'started' | 'error';
  error?: string;
}

/**
 * Theme data structure
 */
export interface Theme {
  id: number;
  name: string;
  frequency: number;
  keywords: string[];
  examples?: string[];
  sentiment?: number;
}

/**
 * Pattern data structure
 */
export interface Pattern {
  id: number;
  category: string;
  description: string;
  frequency: number;
  examples: string[];
  sentiment?: number;
}

/**
 * Sentiment data structure
 */
export interface SentimentData {
  timestamp: string;
  score: number;
  text: string;
}

/**
 * Sentiment overview data structure
 */
export interface SentimentOverview {
  positive: number;
  neutral: number;
  negative: number;
}

/**
 * Analysis result data structure
 */
export interface AnalysisResult {
  themes: Theme[];
  patterns: Pattern[];
  sentiment: SentimentData[];
  dataId: number;
}

/**
 * Detailed analysis result data structure
 */
export interface DetailedAnalysisResult {
  id: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
  fileName: string;
  fileSize?: number;
  themes: Theme[];
  patterns: Pattern[];
  sentiment: SentimentData[];
  sentimentOverview: SentimentOverview;
  llmProvider?: string;
  llmModel?: string;
  error?: string;
}

/**
 * Parameters for listing analyses
 */
export interface ListAnalysesParams {
  sortBy?: 'createdAt' | 'fileName';
  sortDirection?: 'asc' | 'desc';
  status?: 'completed' | 'pending' | 'failed';
  limit?: number;
  offset?: number;
}