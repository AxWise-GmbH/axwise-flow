/**
 * @deprecated This store is deprecated and scheduled for removal.
 * Use server actions and React context instead.
 * For dashboard state, use URL params and server components.
 * Last Updated: 2025-03-25
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/apiClient';
import type { 
  DetailedAnalysisResult, 
  AnalysisResponse, 
  ListAnalysesParams, 
  DashboardData 
} from '@/types/api';

/**
 * Dashboard Store State Interface
 * Centralizes all dashboard-related state to reduce prop drilling and state fragmentation
 */
interface DashboardState {
  // Analysis data
  currentAnalysis: DetailedAnalysisResult | null;
  analysisHistory: DetailedAnalysisResult[];
  analysisMap: Record<string, DetailedAnalysisResult>;
  
  // UI State
  activeTab: 'upload' | 'visualize' | 'history' | 'documentation';
  visualizationTab: 'themes' | 'patterns' | 'sentiment' | 'personas';
  
  // Loading States
  isLoadingAnalysis: boolean;
  isLoadingHistory: boolean;
  
  // Error States
  analysisError: Error | null;
  historyError: Error | null;
  
  // Filters for history
  historyFilters: {
    sortBy: 'createdAt' | 'fileName';
    sortDirection: 'asc' | 'desc';
    status: 'all' | 'completed' | 'pending' | 'failed';
  };
  
  // Actions
  setActiveTab: (tab: DashboardState['activeTab']) => void;
  setVisualizationTab: (tab: DashboardState['visualizationTab']) => void;
  fetchAnalysisById: (id: string, withPolling?: boolean) => Promise<DetailedAnalysisResult | null>;
  fetchAnalysisHistory: (filters?: Partial<ListAnalysesParams>) => Promise<DetailedAnalysisResult[]>;
  setCurrentAnalysis: (analysis: DetailedAnalysisResult) => void;
  clearCurrentAnalysis: () => void;
  setHistoryFilters: (filters: Partial<DashboardState['historyFilters']>) => void;
  clearErrors: () => void;
  
  // Utility methods
  getDashboardData: (analysisResult: DetailedAnalysisResult | null) => DashboardData | null;
}

/**
 * Dashboard Store
 * Centralized state management for the dashboard to reduce prop drilling and state fragmentation
 */
export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentAnalysis: null,
      analysisHistory: [],
      analysisMap: {},
      activeTab: 'upload',
      visualizationTab: 'themes',
      isLoadingAnalysis: false,
      isLoadingHistory: false,
      analysisError: null,
      historyError: null,
      historyFilters: {
        sortBy: 'createdAt',
        sortDirection: 'desc',
        status: 'all',
      },
      
      /**
       * Set the active dashboard tab
       */
      setActiveTab: (tab) => {
        set({ activeTab: tab });
      },
      
      /**
       * Set the active visualization tab
       */
      setVisualizationTab: (tab) => {
        set({ visualizationTab: tab });
      },
      
      /**
       * Fetch analysis by ID
       * @param id Analysis ID
       * @param withPolling Whether to poll until analysis is complete
       */
      fetchAnalysisById: async (id: string, withPolling = false) => {
        try {
          set({ isLoadingAnalysis: true, analysisError: null });
          
          let analysis: DetailedAnalysisResult;
          
          if (withPolling) {
            // Poll until analysis is complete or max attempts reached
            analysis = await apiClient.getAnalysisByIdWithPolling(id);
          } else {
            // Just get the current state
            analysis = await apiClient.getAnalysisById(id);
          }
          
          // Store in map for caching
          set(state => ({
            currentAnalysis: analysis,
            analysisMap: {
              ...state.analysisMap,
              [id]: analysis
            },
            isLoadingAnalysis: false
          }));
          
          return analysis;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Error fetching analysis:', err);
          
          set({ 
            analysisError: err,
            isLoadingAnalysis: false
          });
          
          return null;
        }
      },
      
      /**
       * Fetch analysis history
       */
      fetchAnalysisHistory: async (filters?: Partial<ListAnalysesParams>) => {
        const { historyFilters } = get();
        
        try {
          set({ isLoadingHistory: true, historyError: null });
          
          // Convert internal filters to API format
          const apiParams: ListAnalysesParams = {
            sortBy: filters?.sortBy || historyFilters.sortBy,
            sortDirection: filters?.sortDirection || historyFilters.sortDirection,
            // Only set status if not 'all'
            ...(historyFilters.status !== 'all' && { status: historyFilters.status }),
          };
          
          const analyses = await apiClient.listAnalyses(apiParams);
          
          // Update the analysis map with fetched analyses
          const newMap: Record<string, DetailedAnalysisResult> = {};
          analyses.forEach(analysis => {
            newMap[analysis.id] = analysis;
          });
          
          set(state => ({
            analysisHistory: analyses,
            analysisMap: {
              ...state.analysisMap,
              ...newMap
            },
            isLoadingHistory: false
          }));
          
          return analyses;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Error fetching analysis history:', err);
          
          set({ 
            historyError: err,
            isLoadingHistory: false
          });
          
          return [];
        }
      },
      
      /**
       * Set the current analysis for visualization
       */
      setCurrentAnalysis: (analysis) => {
        set(state => ({
          currentAnalysis: analysis,
          analysisMap: {
            ...state.analysisMap,
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
       * Update history filters
       */
      setHistoryFilters: (filters) => {
        set(state => ({
          historyFilters: {
            ...state.historyFilters,
            ...filters
          }
        }));
      },
      
      /**
       * Clear error states
       */
      clearErrors: () => {
        set({ analysisError: null, historyError: null });
      },
      
      /**
       * Convert DetailedAnalysisResult to DashboardData format
       * This provides a consistent data structure for dashboard components
       */
      getDashboardData: (analysisResult: DetailedAnalysisResult | null): DashboardData | null => {
        if (!analysisResult) return null;
        
        return {
          analysisId: analysisResult.id,
          status: analysisResult.status,
          createdAt: analysisResult.createdAt,
          fileName: analysisResult.fileName,
          fileSize: analysisResult.fileSize,
          llmProvider: analysisResult.llmProvider,
          llmModel: analysisResult.llmModel,
          themes: analysisResult.themes || [],
          patterns: analysisResult.patterns || [],
          sentiment: analysisResult.sentiment || [],
          sentimentOverview: analysisResult.sentimentOverview || { positive: 0, neutral: 0, negative: 0 },
          sentimentStatements: analysisResult.sentimentStatements || { positive: [], neutral: [], negative: [] },
          personas: analysisResult.personas || [],
          error: analysisResult.error
        };
      },
    }),
    {
      name: 'interview-analysis-dashboard-store',
      partialize: (state) => ({
        // Only persist UI preferences
        visualizationTab: state.visualizationTab,
        historyFilters: state.historyFilters,
      }),
    }
  )
);

/**
 * Selector to get the current active tab
 * Optimized to prevent unnecessary re-renders
 */
export const useActiveTab = () => useDashboardStore(state => state.activeTab);

/**
 * Selector to get the current visualization tab
 * Optimized to prevent unnecessary re-renders
 */
export const useVisualizationTab = () => useDashboardStore(state => state.visualizationTab);

/**
 * Selector to get the current analysis with loading and error states
 * Optimized to prevent unnecessary re-renders
 */
export const useCurrentAnalysis = () => useDashboardStore(state => ({
  analysis: state.currentAnalysis,
  isLoading: state.isLoadingAnalysis,
  error: state.analysisError
}));

/**
 * Selector to get analysis history with loading and error states
 * Optimized to prevent unnecessary re-renders
 */
export const useAnalysisHistory = () => useDashboardStore(state => ({
  history: state.analysisHistory,
  isLoading: state.isLoadingHistory,
  error: state.historyError,
  filters: state.historyFilters
}));

/**
 * Selector to get dashboard data from current analysis
 * Optimized to prevent unnecessary re-renders
 */
export const useCurrentDashboardData = () => useDashboardStore(state => ({
  dashboardData: state.getDashboardData(state.currentAnalysis),
  isLoading: state.isLoadingAnalysis,
  error: state.analysisError
}));

/**
 * Selector to get history filters
 * Optimized to prevent unnecessary re-renders
 */
export const useHistoryFilters = () => useDashboardStore(state => state.historyFilters); 