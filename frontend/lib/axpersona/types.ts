import type { DetailedAnalysisResult } from '@/types/api';

export interface BusinessContext {
  business_idea: string;
  target_customer: string;
  problem: string;
  industry: string;
  location: string;
}

export interface PipelineStageTrace {
  stage_name: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_seconds: number;
  outputs: Record<string, unknown>;
  error?: string;
}

export interface AxPersonaDataset {
  scope_id: string;
  scope_name: string;
  description: string;
  personas: Record<string, unknown>[];
  interviews: Record<string, unknown>[];
  analysis: DetailedAnalysisResult;
  quality: Record<string, unknown>;
}

export type PipelineStatus = 'completed' | 'partial' | 'failed';

export interface PipelineExecutionResult {
  dataset?: AxPersonaDataset;
  execution_trace: PipelineStageTrace[];
  total_duration_seconds: number;
  status: PipelineStatus;
  job_id?: string; // Added by the frontend proxy to enable auto-selection
}

export type PipelineJobStatus = 'pending' | 'running' | PipelineStatus;

export interface PipelineJobResult {
  job_id: string;
  status: PipelineJobStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: PipelineExecutionResult;
}


export type ScopeStatus = 'idle' | 'running' | PipelineStatus;

export interface ScopeSummary {
  id: string;
  name: string;
  description?: string;
  status: ScopeStatus;
  createdAt: string;
  lastRunAt?: string;
  businessContext: BusinessContext;
}

// Pipeline Run Persistence Types (matching backend models)

export interface PipelineRunSummary {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;

  // Business context summary
  business_idea?: string;
  target_customer?: string;
  industry?: string;
  location?: string;

  // Quick metrics
  questionnaire_stakeholder_count?: number;
  persona_count?: number;
  interview_count?: number;

  error?: string;
}

export interface PipelineRunDetail {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;

  // Full business context
  business_context: BusinessContext;

  // Execution details
  execution_trace: PipelineStageTrace[];
  total_duration_seconds?: number;

  // Results
  dataset?: AxPersonaDataset;

  // Metadata
  questionnaire_stakeholder_count?: number;
  simulation_id?: string;
  analysis_id?: string;
  persona_count?: number;
  interview_count?: number;

  error?: string;
}

export interface PipelineRunListResponse {
  runs: PipelineRunSummary[];
  total: number;
  limit: number;
  offset: number;
}

// Persona Dataset Summary for search-ready display
export interface PersonaDatasetSummary {
  datasetId: string;          // from dataset.scope_id
  version: string;            // e.g. "v1" (default for now)
  title: string;              // human-readable title for catalog/search
  subtitle: string;           // 1-liner from business_context
  status: 'draft' | 'validated' | 'live';  // mapped from pipeline status + quality
  tags: string[];             // industry, location, use-case tags
  personasCount: number;
  interviewsCount: number;
  qualityScore?: number;
  createdAt: string;
  searchText: string;         // concatenated text for PageIndex later

  // Keep reference to underlying run for selection
  jobId: string;
}

