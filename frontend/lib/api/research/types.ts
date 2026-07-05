/**
 * Research API Types
 * 
 * Core type definitions for the research API client.
 */

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string | Date;
  metadata?: Record<string, unknown>;
}

export interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  multiStakeholderConsidered?: boolean;
  multiStakeholderDetected?: boolean;
  location?: string;
  detectedStakeholders?: {
    primary: string[];
    secondary: string[];
    industry?: string;
  };
}

export interface ChatRequest {
  messages: Message[];
  input: string;
  context?: ResearchContext;
  session_id?: string;
  user_id?: string;
  enable_enhanced_analysis?: boolean;
  enable_thinking_process?: boolean;
}

export interface ChatResponse {
  content: string;
  suggestions?: string[];
  metadata?: {
    questionCategory?: string;
    researchStage?: string;
    suggestions?: string[];
    extracted_context?: Record<string, unknown>;
    full_prompt?: string;
  };
  questions?: GeneratedQuestions;
  session_id?: string;
  thinking_process?: ThinkingStep[];
  enhanced_analysis?: Record<string, unknown>;
  performance_metrics?: Record<string, unknown>;
  api_version?: string;
}

export interface ThinkingStep {
  step: string;
  status: 'in_progress' | 'completed' | 'failed';
  details: string;
  duration_ms: number;
  timestamp: number;
}

export interface GeneratedQuestions {
  problemDiscovery: string[];
  solutionValidation: string[];
  followUp: string[];
}

export interface ResearchSession {
  id: number;
  session_id: string;
  user_id?: string;
  business_idea?: string;
  target_customer?: string;
  problem?: string;
  industry: string;
  location?: string;
  stage: string;
  status: string;
  questions_generated: boolean;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  message_count?: number;
  messages?: Message[];
  conversation_context?: string;
  isLocal?: boolean;
}

