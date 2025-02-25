import { create } from 'zustand';
import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult } from '@/types/api';

/**
 * Analysis Store State Interface
 */
interface AnalysisState {
  // Data
  currentAnalysis: DetailedAnalysisResult | null;
  analyses: Record<string, DetailedAnalysisResult>;
  
  // Status
  isLoading: boolean;
  error: Error | null;
  
  // Actions
  fetchAnalysis: (id: string) => Promise<DetailedAnalysisResult | null>;
  setCurrentAnalysis: (analysis: DetailedAnalysisResult) => void;
  clearCurrentAnalysis: () => void;
  clearError: () => void;
}

/**
 * Analysis Store
 * Manages the state of analysis data and provides actions to fetch and update it
 */
export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  // Initial state
  currentAnalysis: null,
  analyses: {},
  isLoading: false,
  error: null,
  
  /**
   * Fetch analysis by ID
   * @param id Analysis ID
   * @returns The fetched analysis or null if an error occurred
   */
  fetchAnalysis: async (id: string) => {
    try {
      set({ isLoading: true, error: null });
      
      // Check if we already have this analysis in the cache
      const cachedAnalysis = get().analyses[id];
      if (cachedAnalysis) {
        set({ currentAnalysis: cachedAnalysis, isLoading: false });
        return cachedAnalysis;
      }
      
      // Fetch from API
      const analysis = await apiClient.getAnalysisById(id);
      
      // Update state
      set(state => ({
        currentAnalysis: analysis,
        analyses: {
          ...state.analyses,
          [id]: analysis
        },
        isLoading: false
      }));
      
      return analysis;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Failed to fetch analysis');
      set({ error: errorObj, isLoading: false });
      return null;
    }
  },
  
  /**
   * Set the current analysis
   * @param analysis Analysis to set as current
   */
  setCurrentAnalysis: (analysis: DetailedAnalysisResult) => {
    set(state => ({
      currentAnalysis: analysis,
      analyses: {
        ...state.analyses,
        [analysis.id]: analysis
      }
    }));
  },
  
  /**
   * Clear the current analysis
   */
  clearCurrentAnalysis: () => {
    set({ currentAnalysis: null });
  },
  
  /**
   * Clear any error
   */
  clearError: () => {
    set({ error: null });
  }
}));

/**
 * Selector to get the current analysis
 */
export const useCurrentAnalysis = () => useAnalysisStore(state => state.currentAnalysis);

/**
 * Selector to get the loading state
 */
export const useAnalysisLoading = () => useAnalysisStore(state => state.isLoading);

/**
 * Selector to get the error state
 */
export const useAnalysisError = () => useAnalysisStore(state => state.error);

/**
 * Selector to get the fetch analysis action
 */
export const useFetchAnalysis = () => useAnalysisStore(state => state.fetchAnalysis);