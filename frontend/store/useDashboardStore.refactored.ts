/**
 * Dashboard Store (Refactored)
 * 
 * This is the next-generation Dashboard store that implements:
 * - Versioned schema for safe migrations
 * - Proper error handling
 * - Selectors for computed state
 * - Improved typing
 * 
 * This store is part of the Unified Dashboard refactoring effort.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PrioritizedInsight, DetailedAnalysisResult } from '@/types/api';
import { createVersionedStorage } from '@/lib/storeMigration';
import { createAppError, AppError } from '@/lib/errorUtils';
import { fetchAnalysisById as apiFetchAnalysisById } from '@/lib/api';

// Current version of the store schema
const STORE_VERSION = 1;

// Define tab types
export type DashboardTab = 'upload' | 'visualize' | 'history' | 'documentation';
export type VisualizationTab = 'themes' | 'patterns' | 'sentiment' | 'personas' | 'priority';

// Define the store state
export interface DashboardState {
  // UI State
  activeTab: DashboardTab;
  visualizationTab: VisualizationTab;
  
  // Data State
  currentAnalysis: DetailedAnalysisResult | null;
  analysisHistory: DetailedAnalysisResult[];
  priorityInsights: PrioritizedInsight[] | null;
  
  // Loading States
  isLoading: boolean;
  isPriorityLoading: boolean;
  
  // Error States
  error: AppError | null;
  priorityError: AppError | null;
  
  // Store Metadata
  _version: number;
  
  // Actions
  setActiveTab: (tab: DashboardTab) => void;
  setVisualizationTab: (tab: VisualizationTab) => void;
  fetchAnalysisById: (id: string, withPolling?: boolean) => Promise<DetailedAnalysisResult | null>;
  fetchPriorityInsights: (analysisId: string) => Promise<PrioritizedInsight[] | null>;
  clearCurrentAnalysis: () => void;
  clearErrors: () => void;
}

// Store migrations
const migrations = {
  // Migration from v1 to v2 (for future use)
  2: (state: any) => {
    // Example migration
    return {
      ...state,
      // Add new fields or transform existing ones
      newField: 'default value',
    };
  },
};

// Create the dashboard store
export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      // Initial state
      activeTab: 'upload',
      visualizationTab: 'themes',
      currentAnalysis: null,
      analysisHistory: [],
      priorityInsights: null,
      isLoading: false,
      isPriorityLoading: false,
      error: null,
      priorityError: null,
      _version: STORE_VERSION,
      
      // Actions
      setActiveTab: (tab) => set({ activeTab: tab }),
      
      setVisualizationTab: (tab) => set({ visualizationTab: tab }),
      
      fetchAnalysisById: async (id, withPolling = false) => {
        try {
          set({ isLoading: true, error: null });
          
          const analysis = await apiFetchAnalysisById(id, withPolling);
          
          // Update state with the fetched analysis
          set((state) => {
            // Check if analysis is already in history
            const existingIndex = state.analysisHistory.findIndex(a => a.id === analysis.id);
            
            // Create updated history array
            let updatedHistory = [...state.analysisHistory];
            if (existingIndex >= 0) {
              // Replace existing analysis with updated one
              updatedHistory[existingIndex] = analysis;
            } else {
              // Add new analysis to the start of the history
              updatedHistory = [analysis, ...state.analysisHistory].slice(0, 50); // Keep last 50
            }
            
            return {
              currentAnalysis: analysis,
              analysisHistory: updatedHistory,
              isLoading: false,
            };
          });
          
          return analysis;
        } catch (error) {
          const appError = createAppError(error, 'fetchAnalysisById');
          set({ error: appError, isLoading: false });
          return null;
        }
      },
      
      fetchPriorityInsights: async (analysisId) => {
        try {
          set({ isPriorityLoading: true, priorityError: null });
          
          // Implement API call to fetch priority insights
          // This is a placeholder for now
          const response = await fetch(`/api/analysis/${analysisId}/priority-insights`);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch priority insights: ${response.status}`);
          }
          
          const data = await response.json();
          set({ priorityInsights: data.insights, isPriorityLoading: false });
          
          return data.insights;
        } catch (error) {
          const appError = createAppError(error, 'fetchPriorityInsights');
          set({ priorityError: appError, isPriorityLoading: false });
          return null;
        }
      },
      
      clearCurrentAnalysis: () => set({ currentAnalysis: null }),
      
      clearErrors: () => set({ error: null, priorityError: null }),
    }),
    {
      name: 'dashboard-store',
      ...createVersionedStorage(STORE_VERSION, migrations, { name: 'dashboard-store' }),
    }
  )
);

// Selectors
export const useCurrentAnalysis = () => {
  const { currentAnalysis, isLoading, error } = useDashboardStore();
  return { analysis: currentAnalysis, isLoading, error };
};

export const useVisualizationTab = () => {
  const tab = useDashboardStore(state => state.visualizationTab);
  const setTab = useDashboardStore(state => state.setVisualizationTab);
  return { tab, setTab };
};

export const useAnalysisHistory = () => {
  return useDashboardStore(state => state.analysisHistory);
};

export const useDashboardErrors = () => {
  const error = useDashboardStore(state => state.error);
  const priorityError = useDashboardStore(state => state.priorityError);
  const clearErrors = useDashboardStore(state => state.clearErrors);
  
  return { error, priorityError, clearErrors };
};

export default useDashboardStore;
