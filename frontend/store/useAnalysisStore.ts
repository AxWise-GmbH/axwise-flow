import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult, AnalysisResponse, ListAnalysesParams } from '@/types/api';
import { useToast } from '@/components/providers/toast-provider';

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
      }
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
export const useAnalysisHistory = () => useAnalysisStore(state => ({
  history: state.analysisHistory,
  isLoading: state.isLoadingHistory,
  error: state.historyError,
  filters: state.historyFilters,
  setFilters: state.setHistoryFilters,
  fetchHistory: state.fetchAnalysisHistory
}));

/**
 * Selector to get and set the visualization tab
 */
export const useVisualizationTab = () => {
  const tab = useAnalysisStore(state => state.visualizationTab);
  const setTab = useAnalysisStore(state => state.setVisualizationTab);
  return { tab, setTab };
};