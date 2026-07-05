/**
 * API Client for interacting with the backend API
 *
 * This file is maintained for backward compatibility.
 * It re-exports all functionality from the modularized API client.
 *
 * New code should import directly from the modular API client:
 * ```typescript
 * import { uploadData, analyzeData } from '@/lib/api';
 * ```
 */

// Import all functionality from the modular API client
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  uploadData,
  analyzeData,
  checkAnalysisStatus,
  getAnalysisById,
  listAnalyses,
  getProcessingStatus,
  getAnalysisByIdWithPolling,
  getAnalysisHistory,
  generatePersonaFromText,
  getPriorityInsights,
  generateMockAnalyses,
  generateMockPersonas,
  exportAnalysisMarkdown,
  getMarkdownExportUrl
} from './api';

/**
 * API Client for interacting with the backend API
 *
 * Implemented as a true singleton to ensure consistent API interaction across the application.
 * Always import the pre-instantiated singleton instance:
 * ```typescript
 * import { apiClient } from '@/lib/apiClient';
 * ```
 *
 * @deprecated Use the modular API client instead: import from '@/lib/api'
 */
class ApiClient {
  private static instance: ApiClient | null = null;

  /**
   * Private constructor to prevent direct instantiation.
   * Use ApiClient.getInstance() instead.
   */
  private constructor() {}

  /**
   * Get the singleton instance of ApiClient.
   * This is the only way to access the ApiClient.
   */
  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  /**
   * Get an authentication token from Clerk if available
   */
  public async getAuthToken(): Promise<string | null> {
    return getAuthToken();
  }

  /**
   * Set the authentication token for API requests
   */
  setAuthToken(token: string): void {
    setAuthToken(token);
  }

  /**
   * Clear the authentication token for API requests
   */
  clearAuthToken(): void {
    clearAuthToken();
  }

  /**
   * Upload data to the API
   */
  async uploadData(file: File, isTextFile: boolean = false) {
    return uploadData(file, isTextFile);
  }

  /**
   * Trigger analysis of uploaded data
   */
  async analyzeData(
    dataId: number,
    llmProvider: 'openai' | 'gemini' = 'openai',
    llmModel?: string,
    isTextFile?: boolean,
    industry?: string
  ) {
    return analyzeData(dataId, llmProvider, llmModel, isTextFile, industry);
  }

  /**
   * Get analysis result by ID
   */
  async getAnalysisById(id: string) {
    return getAnalysisById(id);
  }

  /**
   * List all analyses
   */
  async listAnalyses(params?: unknown) {
    return listAnalyses(params);
  }

  /**
   * Get processing status for an analysis
   */
  async getProcessingStatus(analysisId: string) {
    return getProcessingStatus(analysisId);
  }

  /**
   * Generate personas from free text
   */
  async generatePersonaFromText(text: string, options: any = {}) {
    return generatePersonaFromText(text, options);
  }

  /**
   * Get priority insights for an analysis
   */
  async getPriorityInsights(analysisId: string) {
    return getPriorityInsights(analysisId);
  }

  /**
   * Check if analysis is complete for a given result ID
   */
  async checkAnalysisStatus(resultId: string) {
    return checkAnalysisStatus(resultId);
  }

  /**
   * Get analysis by ID with polling until completion
   */
  async getAnalysisByIdWithPolling(
    id: string,
    interval: number = 1000,
    maxAttempts: number = 30
  ) {
    return getAnalysisByIdWithPolling(id, interval, maxAttempts);
  }

  /**
   * Get analysis history with pagination
   */
  async getAnalysisHistory(skip: number = 0, limit: number = 10) {
    return getAnalysisHistory(skip, limit);
  }

  /**
   * Generate mock analyses data for fallback
   */
  generateMockAnalyses() {
    return generateMockAnalyses();
  }

  /**
   * Generate mock personas data for fallback
   */
  generateMockPersonas() {
    return generateMockPersonas();
  }

  /**
   * Export analysis results as Markdown
   */
  async exportAnalysisMarkdown(analysisId: string) {
    return exportAnalysisMarkdown(analysisId);
  }

  /**
   * Get the URL for exporting analysis results as Markdown
   */
  getMarkdownExportUrl(analysisId: string) {
    return getMarkdownExportUrl(analysisId);
  }
}

/**
 * The singleton instance of ApiClient.
 * Always use this instance instead of creating a new one.
 */
export const apiClient = ApiClient.getInstance();
