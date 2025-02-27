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
  statements?: string[];    // Supporting statements from the LLM
  examples?: string[];      // Legacy field for backward compatibility
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
  evidence?: string[];     // Supporting evidence from the LLM
  examples?: string[];     // Legacy field for backward compatibility
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
 * Supporting statements for each sentiment category
 */
export interface SentimentStatements {
  positive: string[];
  neutral: string[];
  negative: string[];
}

/**
 * Analysis result data structure
 */
export interface AnalysisResult {
  themes: Theme[];
  patterns: Pattern[];
  sentiment: SentimentData[];
  sentimentStatements?: SentimentStatements;  // Supporting statements for sentiment categories
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
  sentimentStatements?: SentimentStatements;  // Supporting statements for sentiment categories
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