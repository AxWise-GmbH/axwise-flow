/**
 * API Types for the Interview Insight Analyst application
 */

/**
 * AnalyzedTheme structure used in visualization components
 *
 * This interface represents a theme identified during analysis.
 * It aligns with the backend Theme schema and includes fields for
 * visualization and detailed information.
 */
export interface AnalyzedTheme {
  id: string;
  name: string;
  frequency: number;  // Main frequency field (0-1 representing prevalence)
  sentiment: number;  // Sentiment score (-1 to 1, where -1 is negative, 0 is neutral, 1 is positive)

  // Supporting quotes (statements is the preferred field, examples is for backward compatibility)
  statements: string[];
  examples?: string[];  // Deprecated: Use statements instead

  // Additional theme details
  definition?: string;  // One-sentence description of the theme
  keywords?: string[];  // Related keywords or terms
  codes?: string[];     // Associated codes from the coding process
  reliability?: number; // Inter-rater reliability score (0-1)
  process?: 'basic' | 'enhanced';  // Identifies which analysis process was used

  // Sentiment distribution within the theme
  sentiment_distribution?: {
    positive: number;  // Percentage (0-1) of positive statements
    neutral: number;   // Percentage (0-1) of neutral statements
    negative: number;  // Percentage (0-1) of negative statements
  };

  // Enhanced analysis fields
  hierarchical_codes?: Array<{
    code: string;
    definition: string;
    frequency: number;
    sub_codes?: Array<{
      code: string;
      definition: string;
      frequency: number;
    }>;
  }>;

  reliability_metrics?: {
    cohen_kappa: number;
    percent_agreement: number;
    confidence_interval: [number, number];
  };

  relationships?: Array<{
    related_theme: string;
    relationship_type: string;
    strength: number;
    description: string;
  }>;

  // Legacy field - will be removed in future versions
  prevalence?: number;  // Deprecated: Use frequency instead
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
 *
 * This interface represents a theme as returned by the backend API.
 * It's similar to AnalyzedTheme but with some differences in field types.
 */
export interface Theme {
  id: number;               // Note: This is a number in the API but converted to string in AnalyzedTheme
  name: string;
  frequency: number;        // Frequency score (0-1)
  sentiment: number;        // Sentiment score (-1 to 1)

  // Supporting quotes
  statements: string[];     // Supporting statements from the LLM
  examples?: string[];      // Deprecated: Use statements instead

  // Additional theme details
  definition?: string;      // One-sentence description of the theme
  keywords: string[];       // Related keywords or terms
  codes?: string[];         // Associated codes from the coding process
  reliability?: number;     // Inter-rater reliability score (0-1)
  process?: 'basic' | 'enhanced';  // Identifies which analysis process was used

  // Sentiment distribution within the theme
  sentiment_distribution?: {
    positive: number;  // Percentage (0-1) of positive statements
    neutral: number;   // Percentage (0-1) of neutral statements
    negative: number;  // Percentage (0-1) of negative statements
  };

  // Enhanced analysis fields
  hierarchical_codes?: Array<{
    code: string;
    definition: string;
    frequency: number;
    sub_codes?: Array<{
      code: string;
      definition: string;
      frequency: number;
    }>;
  }>;

  reliability_metrics?: {
    cohen_kappa: number;
    percent_agreement: number;
    confidence_interval: [number, number];
  };

  relationships?: Array<{
    related_theme: string;
    relationship_type: string;
    strength: number;
    description: string;
  }>;
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
  enhanced_themes?: Theme[];  // Enhanced themes from the enhanced analysis process
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
 *
 * This interface represents an insight derived from analysis.
 * It aligns with the backend Insight schema and includes fields for
 * actionable information and prioritization.
 */
export interface Insight {
  topic: string;
  observation: string;
  evidence: string[];
  implication?: string;   // Explains the 'so what?' or consequence of the insight
  recommendation?: string; // Suggests a concrete next step or action
  priority?: 'High' | 'Medium' | 'Low'; // Indicates urgency/importance of the insight
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
