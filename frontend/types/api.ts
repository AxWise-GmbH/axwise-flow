/**
 * API Types for the Interview Insight Analyst application
 */

/**
 * AnalyzedTheme structure used in visualization components
 */
export interface AnalyzedTheme {
  id: string;
  name: string;
  prevalence: number;
  sentiment?: number;
  frequency?: number;
  keywords?: string[];
  statements?: string[];
  examples?: string[];
  definition?: string;
  codes?: string[];
  reliability?: number;
  process?: 'basic' | 'enhanced';
}

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
  definition?: string;      // One-sentence description of the theme
  codes?: string[];         // Associated codes from the coding process
  reliability?: number;     // Inter-rater reliability score (0-1)
  process?: 'basic' | 'enhanced';  // Identifies which analysis process was used
}

/**
 * Pattern structure used in visualization components
 */
export interface Pattern {
  id: string;
  name: string;
  count: number;
  category?: string;
  description?: string;
  frequency?: number;
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
  industry?: string; // The detected industry for context-aware analysis
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

export type PersonaTrait = {
  value: string;
  confidence: number;
  evidence: string[];
};

/**
 * Insight data structure
 */
export interface Insight {
  topic: string;
  observation: string;
  evidence: string[];
}

export type Persona = {
  name: string;
  description: string;
  role_context: PersonaTrait;
  key_responsibilities: PersonaTrait;
  tools_used: PersonaTrait;
  collaboration_style: PersonaTrait;
  analysis_approach: PersonaTrait;
  pain_points: PersonaTrait;
  patterns: string[];
  confidence: number;
  evidence: string[];
  metadata?: {
    sample_size?: number;
    timestamp?: string;
    validation_metrics?: {
      pattern_confidence?: number;
      evidence_count?: number;
      attribute_coverage?: Record<string, number>;
    };
  };
};

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
  industry?: string; // Industry context detected from content
  personas?: Persona[];
  insights?: Insight[];
  llmProvider?: string;
  llmModel?: string;
  error?: string;
}

/**
 * Unified data structure for dashboard visualization components
 * This consolidated interface ensures consistent data structure across dashboard components
 */
export interface DashboardData {
  // Metadata
  analysisId: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  fileName: string;
  fileSize?: number;
  llmProvider?: string;
  llmModel?: string;

  // Analysis Data
  themes: Theme[];
  patterns: Pattern[];
  sentiment: SentimentData[];
  sentimentOverview: SentimentOverview;
  sentimentStatements?: SentimentStatements;
  industry?: string; // Industry context for sentiment analysis
  personas?: Persona[];
  insights?: Insight[];

  // Error Information
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

/**
 * Prioritized Insight structure for prioritized insights endpoint
 */
export interface PrioritizedInsight {
  type: 'theme' | 'pattern';
  name: string;
  description: string;
  priority_score: number;
  urgency: 'high' | 'medium' | 'low';
  sentiment: number;
  frequency: number;
  category?: string;  // Only for patterns
  original: Theme | Pattern;
}

/**
 * Response from the priority insights endpoint
 */
export interface PriorityInsightsResponse {
  insights: PrioritizedInsight[];
  metrics: {
    high_urgency_count: number;
    medium_urgency_count: number;
    low_urgency_count: number;
  };
}