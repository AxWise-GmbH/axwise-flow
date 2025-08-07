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

  // Supporting quotes
  statements: string[];

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

  // Multi-stakeholder analysis fields
  stakeholder_context?: {
    source_stakeholders: string[];
    stakeholder_distribution: Record<string, number>;
    influence_scores: Record<string, number>;
    consensus_level: number;
    conflict_indicators: string[];
  };

  // Enhanced metadata for multi-stakeholder display
  is_enhanced?: boolean;
  source_stakeholders?: string[];
  stakeholder_distribution?: Record<string, number>;
  consensus_level?: number;

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
  evidence?: string[];  // Supporting evidence for the pattern
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
  // Basic information
  name: string;
  archetype?: string;
  description: string;
  role_in_interview?: string; // Role in the interview (Interviewee, Interviewer, Participant)

  // Detailed attributes (new fields)
  demographics?: PersonaTrait;
  goals_and_motivations?: PersonaTrait;
  skills_and_expertise?: PersonaTrait;
  workflow_and_environment?: PersonaTrait;
  challenges_and_frustrations?: PersonaTrait;
  needs_and_desires?: PersonaTrait;
  technology_and_tools?: PersonaTrait;
  attitude_towards_research?: PersonaTrait;
  attitude_towards_ai?: PersonaTrait;
  key_quotes?: PersonaTrait;

  // Legacy fields
  role_context: PersonaTrait;
  key_responsibilities: PersonaTrait;
  tools_used: PersonaTrait;
  collaboration_style: PersonaTrait;
  analysis_approach: PersonaTrait;
  pain_points: PersonaTrait;

  // Overall persona information
  patterns: string[];
  confidence: number;
  evidence: string[];
  metadata?: {
    sample_size?: number;
    timestamp?: string;
    speaker?: string; // Speaker name from transcript
    validation_metrics?: {
      pattern_confidence?: number;
      evidence_count?: number;
      attribute_coverage?: Record<string, number>;
    };
  };

  // Aliases for backward compatibility
  overall_confidence?: number; // Alias for confidence
  supporting_evidence_summary?: string[]; // Alias for evidence
  persona_metadata?: any; // Alias for metadata
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

  // NEW: Optional multi-stakeholder intelligence
  stakeholder_intelligence?: StakeholderIntelligence;
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

  // Multi-stakeholder Data
  stakeholder_intelligence?: StakeholderIntelligence;

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

// Multi-Stakeholder Analysis Types

/**
 * Individual stakeholder detected in the analysis
 */
export interface DetectedStakeholder {
  stakeholder_id: string;
  stakeholder_type:
    | "primary_customer"
    | "secondary_user"
    | "decision_maker"
    | "influencer";
  confidence_score: number;
  demographic_profile?: Record<string, any>;
  individual_insights: Record<string, any>;
  influence_metrics?: Record<string, number>;
}

/**
 * Area where stakeholders show agreement
 */
export interface ConsensusArea {
  topic: string;
  agreement_level: number;
  participating_stakeholders: string[];
  shared_insights: string[];
  business_impact: string;
}

/**
 * Area where stakeholders disagree
 */
export interface ConflictZone {
  topic: string;
  conflicting_stakeholders: string[];
  conflict_severity: "low" | "medium" | "high" | "critical";
  potential_resolutions: string[];
  business_risk: string;
}

/**
 * Influence relationship between stakeholders
 */
export interface InfluenceNetwork {
  influencer: string;
  influenced: string[];
  influence_type: "decision" | "opinion" | "adoption" | "resistance";
  strength: number;
  pathway: string;
}

/**
 * Cross-stakeholder analysis patterns
 */
export interface CrossStakeholderPatterns {
  consensus_areas: ConsensusArea[];
  conflict_zones: ConflictZone[];
  influence_networks: InfluenceNetwork[];
  stakeholder_priority_matrix?: Record<string, any>;
}

/**
 * High-level multi-stakeholder summary
 */
export interface MultiStakeholderSummary {
  total_stakeholders: number;
  consensus_score: number;
  conflict_score: number;
  key_insights: string[];
  implementation_recommendations: string[];
}

/**
 * Complete stakeholder intelligence data
 */
export interface StakeholderIntelligence {
  detected_stakeholders: DetectedStakeholder[];
  cross_stakeholder_patterns?: CrossStakeholderPatterns;
  multi_stakeholder_summary?: MultiStakeholderSummary;
  processing_metadata?: Record<string, any>;
}

/**
 * PRD Response interface (for compatibility)
 */
export interface PRDResponse {
  prd: string;
  metadata?: Record<string, any>;
}
