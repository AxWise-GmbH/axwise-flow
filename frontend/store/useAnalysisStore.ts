/**
 * @deprecated This store is deprecated and scheduled for removal.
 * Use server actions and React context instead.
 * Server-side data fetching with getServerSideAnalysis() is the recommended approach.
 * Last Updated: 2025-03-25
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult, ListAnalysesParams, DashboardData } from '@/types/api';

/**
 * Analysis Store State Interface
 */
interface AnalysisState {
  // Data
  currentAnalysis: DetailedAnalysisResult | null;
  analysisHistory: DetailedAnalysisResult[];
  analysisMap: Record<string, DetailedAnalysisResult>;
  
  // Status
  isLoadingAnalysis: boolean;
  isLoadingHistory: boolean;
  analysisError: Error | null;
  historyError: Error | null;
  
  // Filters for history
  historyFilters: {
    sortBy: 'createdAt' | 'fileName';
    sortDirection: 'asc' | 'desc';
    status: 'all' | 'completed' | 'pending' | 'failed';
  };
  
  // Visualization settings
  visualizationTab: 'themes' | 'patterns' | 'sentiment' | 'personas';
  
  // Actions
  fetchAnalysisById: (id: string, withPolling?: boolean) => Promise<DetailedAnalysisResult | null>;
  fetchAnalysisHistory: (filters?: Partial<ListAnalysesParams>) => Promise<DetailedAnalysisResult[]>;
  setCurrentAnalysis: (analysis: DetailedAnalysisResult) => void;
  clearCurrentAnalysis: () => void;
  setVisualizationTab: (tab: 'themes' | 'patterns' | 'sentiment' | 'personas') => void;
  setHistoryFilters: (filters: Partial<AnalysisState['historyFilters']>) => void;
  clearErrors: () => void;
  
  // New function to convert to dashboard data format
  getDashboardData: (analysisResult: DetailedAnalysisResult | null) => DashboardData | null;
}

/**
 * Analysis Store
 * Manages the state for analysis results and visualization
 */
export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentAnalysis: null,
      analysisHistory: [],
      analysisMap: {},
      isLoadingAnalysis: false,
      isLoadingHistory: false,
      analysisError: null,
      historyError: null,
      historyFilters: {
        sortBy: 'createdAt',
        sortDirection: 'desc',
        status: 'all',
      },
      visualizationTab: 'themes',
      
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
       * Set the active visualization tab
       */
      setVisualizationTab: (tab) => {
        set({ visualizationTab: tab });
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
      name: 'interview-analysis-store',
      partialize: (state) => ({
        visualizationTab: state.visualizationTab,
        historyFilters: state.historyFilters,
      }),
    }
  )
);

/**
 * Selector to get the current analysis
 */
export const useCurrentAnalysis = () => useAnalysisStore(state => ({
  analysis: state.currentAnalysis,
  isLoading: state.isLoadingAnalysis,
  error: state.analysisError
}));

/**
 * Selector to get analysis history
 */
export const useAnalysisHistory = () => {
  // Memoize each selector to prevent infinite re-renders
  const history = useAnalysisStore(state => state.analysisHistory);
  const isLoading = useAnalysisStore(state => state.isLoadingHistory);
  const error = useAnalysisStore(state => state.historyError);
  const filters = useAnalysisStore(state => state.historyFilters);
  const setFilters = useAnalysisStore(state => state.setHistoryFilters);
  const fetchHistory = useAnalysisStore(state => state.fetchAnalysisHistory);
  
  return {
    history,
    isLoading,
    error,
    filters,
    setFilters,
    fetchHistory
  };
};

/**
 * Selector to get and set the visualization tab
 */
export const useVisualizationTab = () => {
  // Memoize each selector to prevent infinite re-renders
  const tab = useAnalysisStore(state => state.visualizationTab);
  const setTab = useAnalysisStore(state => state.setVisualizationTab);
  return { tab, setTab };
};

/**
 * Selector to get the current analysis as DashboardData
 */
export const useCurrentDashboardData = () => useAnalysisStore(state => ({
  dashboardData: state.currentAnalysis ? state.getDashboardData(state.currentAnalysis) : null,
  isLoading: state.isLoadingAnalysis,
  error: state.analysisError
}));