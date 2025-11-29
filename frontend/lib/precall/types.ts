/**
 * PRECALL - Pre-Call Intelligence Dashboard Types
 * 
 * TypeScript interfaces matching the backend Pydantic models.
 * Used for type safety across the frontend application.
 */

// ============================================================================
// Input Types - ProspectData
// ============================================================================

/**
 * Flexible input data for call intelligence generation.
 * Accepts any JSON structure - the AI will interpret and extract relevant information.
 * Can be AxPersona output, CRM data, meeting notes, or any structured prospect info.
 */
export type ProspectData = Record<string, unknown>;

/**
 * Create an empty ProspectData object
 */
export function createEmptyProspectData(): ProspectData {
  return {};
}

// ============================================================================
// Output Types - CallIntelligence
// ============================================================================

/**
 * A single key insight for the call
 */
export interface KeyInsight {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
}

/**
 * A single time allocation entry for call planning
 */
export interface TimeAllocationItem {
  phase: string; // discovery, presentation, discussion, close
  percentage: number;
}

/**
 * Structured guide for conducting the call
 */
export interface CallGuide {
  opening_line: string;
  discovery_questions: string[];
  value_proposition: string;
  closing_strategy: string;
  time_allocation: TimeAllocationItem[];
}

/**
 * Detailed profile for a stakeholder persona
 */
export interface PersonaDetail {
  name: string;
  role: string;
  communication_style: string;
  likely_questions: string[];
  engagement_tips: string[];
  decision_factors: string[];
}

/**
 * Potential objection with prepared responses
 */
export interface ObjectionDetail {
  objection: string;
  likelihood: 'high' | 'medium' | 'low';
  rebuttal: string;
  hook: string;
  supporting_evidence: string[];
}

/**
 * Complete call intelligence output from the AI
 */
export interface CallIntelligence {
  keyInsights: KeyInsight[];
  callGuide: CallGuide;
  personas: PersonaDetail[];
  objections: ObjectionDetail[];
  summary: string;
  /** Location-based bonding insights for ice-breakers */
  localIntelligence?: LocalIntelligence;
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Request body for intelligence generation
 */
export interface GenerateIntelligenceRequest {
  prospect_data: ProspectData;
}

/**
 * Response from intelligence generation endpoint
 */
export interface GenerateIntelligenceResponse {
  success: boolean;
  intelligence: CallIntelligence | null;
  error: string | null;
  processing_time_ms: number | null;
}

/**
 * Single message in chat history
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Request body for coaching chat
 */
export interface CoachingRequest {
  question: string;
  prospect_data: ProspectData;
  intelligence: CallIntelligence | null;
  chat_history: ChatMessage[];
  /** Context about what the user is currently viewing (tab, section, etc.) */
  view_context?: string;
}

/**
 * Response from coaching endpoint
 */
export interface CoachingResponse {
  success: boolean;
  response: string;
  suggestions: string[];
  error: string | null;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Local bonding insight for ice-breakers based on location
 */
export interface LocalBondingInsight {
  category: string; // e.g., "Transportation", "Sports", "Local News", "Culture", "Food & Drink"
  hook: string; // The conversation starter/hook
  context: string; // Why this is relevant or interesting
  tip: string; // How to use this in conversation
}

/**
 * Location-based intelligence for building rapport
 */
export interface LocalIntelligence {
  location: string; // City, region, country
  cultural_notes: string[]; // General cultural observations
  bonding_hooks: LocalBondingInsight[]; // Specific ice-breakers
  current_events: string[]; // Recent news/events relevant to the area
  conversation_starters: string[]; // Ready-to-use opening lines
}

/**
 * Overall state for the PRECALL dashboard
 */
export interface PrecallState {
  prospectData: ProspectData | null;
  intelligence: CallIntelligence | null;
  chatHistory: ChatMessage[];
  isGenerating: boolean;
  isChatting: boolean;
  error: string | null;
}

// ============================================================================
// Persona Image Generation Types
// ============================================================================

/**
 * Request body for persona image generation
 */
export interface PersonaImageRequest {
  persona_name: string;
  persona_role: string;
  communication_style?: string;
  company_context?: string;
}

/**
 * Response from persona image generation endpoint
 */
export interface PersonaImageResponse {
  success: boolean;
  image_data_uri: string | null;
  error: string | null;
}

// ============================================================================
// Local News Search Types (Gemini Google Search Grounding)
// ============================================================================

/**
 * Request body for local news search
 */
export interface LocalNewsRequest {
  location: string;
  days_back?: number;
  max_items?: number;
}

/**
 * A news source with title and URL
 */
export interface NewsSource {
  title: string;
  url?: string | null;
}

/**
 * A single structured news item
 */
export interface NewsItem {
  category: string; // Sports, Transportation, Events, Economic, Weather, Political
  headline: string;
  details: string;
  date?: string | null;
  source_hint?: string | null;
}

/**
 * Response from local news search endpoint
 */
export interface LocalNewsResponse {
  success: boolean;
  location: string;
  news_items: NewsItem[];
  raw_response?: string; // Fallback if structured parsing fails
  search_queries: string[];
  sources: NewsSource[];
  error?: string;
}

