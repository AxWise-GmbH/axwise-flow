import { type ReactNode } from 'react'

// API Response Types
export interface APIResponse<T = unknown> {
  data: T
  error?: string
  status: number
}

// Analysis Types
export interface AnalysisRequest {
  data_id: number
  llm_provider: 'openai' | 'gemini'
  llm_model?: string
}

export interface Theme {
  id: string
  name: string
  confidence: number
  examples: string[]
}

export interface Pattern {
  id: string
  description: string
  frequency: number
  examples: string[]
}

export interface Sentiment {
  overall: 'positive' | 'negative' | 'neutral'
  score: number
  breakdown?: {
    positive: number
    negative: number
    neutral: number
  }
}

export interface AnalysisResults {
  status: 'processing' | 'completed' | 'error'
  result_id?: number
  analysis_date?: string
  results?: {
    themes?: Theme[]
    patterns?: Pattern[]
    sentiment?: Sentiment
  }
  llm_provider?: string
  llm_model?: string
  error?: string
}

// Upload Types
export interface UploadResponse {
  data_id: number
  message: string
}

export interface InterviewData {
  interview_id: string
  participant: string
  date: string
  duration: string
  text: string
  metadata?: {
    age?: number
    role?: string
    experience_level?: string
    [key: string]: unknown
  }
}

export interface InterviewProject {
  name: string
  description?: string
  date_range?: string
  metadata?: Record<string, unknown>
}

export interface InterviewDataset {
  interviews: InterviewData[]
  project?: InterviewProject
}

// UI Types
export interface ErrorWithMessage {
  message: string
  [key: string]: unknown
}

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
}

export interface ToastMessage {
  title: string
  description?: ReactNode
  type?: 'success' | 'error' | 'info' | 'warning'
  duration?: number
}

// Validation Types
export type ValidationResult = {
  isValid: boolean
  errors: string[]
}

export interface ValidationRule<T> {
  test: (value: T) => boolean
  message: string
}

// Utility Types
export type Loaded<T> = {
  [P in keyof T]: NonNullable<T[P]>
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type WithTimestamps = {
  created_at: string
  updated_at: string
}

// Environment Types
export interface Environment {
  API_URL: string
  MODE: 'development' | 'production' | 'test'
  DEBUG: boolean
}

declare global {
  interface Window {
    ENV: Environment
  }
}

// Node.js specific types (for backend interaction)
export type Timeout = ReturnType<typeof setTimeout>
export type NodeCallback<T = void> = (error: Error | null, result?: T) => void