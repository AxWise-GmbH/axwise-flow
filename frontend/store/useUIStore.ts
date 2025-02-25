import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI Store State Interface
 */
interface UIState {
  // Tab selection
  selectedTab: 'themes' | 'patterns' | 'sentiment';
  
  // Filters
  themeFilters: {
    minFrequency: number;
    sortBy: 'name' | 'frequency' | 'sentiment';
    sortDirection: 'asc' | 'desc';
  };
  
  patternFilters: {
    minFrequency: number;
    categories: string[];
    sortBy: 'name' | 'frequency' | 'sentiment';
    sortDirection: 'asc' | 'desc';
  };
  
  sentimentFilters: {
    timeRange: 'all' | 'week' | 'month' | 'year';
    minScore: number;
    maxScore: number;
  };
  
  // Preferences
  darkMode: boolean;
  sidebarCollapsed: boolean;
  
  // Actions
  setSelectedTab: (tab: 'themes' | 'patterns' | 'sentiment') => void;
  setThemeFilters: (filters: Partial<UIState['themeFilters']>) => void;
  setPatternFilters: (filters: Partial<UIState['patternFilters']>) => void;
  setSentimentFilters: (filters: Partial<UIState['sentimentFilters']>) => void;
  toggleDarkMode: () => void;
  toggleSidebar: () => void;
  resetFilters: () => void;
}

// Default filter values
const DEFAULT_THEME_FILTERS = {
  minFrequency: 0,
  sortBy: 'frequency' as const,
  sortDirection: 'desc' as const,
};

const DEFAULT_PATTERN_FILTERS = {
  minFrequency: 0,
  categories: [],
  sortBy: 'frequency' as const,
  sortDirection: 'desc' as const,
};

const DEFAULT_SENTIMENT_FILTERS = {
  timeRange: 'all' as const,
  minScore: -1,
  maxScore: 1,
};

/**
 * UI Store
 * Manages UI state like selected tabs, filters, and preferences
 * Uses persist middleware to save preferences in localStorage
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Initial state
      selectedTab: 'themes',
      themeFilters: DEFAULT_THEME_FILTERS,
      patternFilters: DEFAULT_PATTERN_FILTERS,
      sentimentFilters: DEFAULT_SENTIMENT_FILTERS,
      darkMode: false,
      sidebarCollapsed: false,
      
      /**
       * Set the selected tab
       * @param tab Tab to select
       */
      setSelectedTab: (tab) => {
        set({ selectedTab: tab });
      },
      
      /**
       * Update theme filters
       * @param filters Partial theme filters to update
       */
      setThemeFilters: (filters) => {
        set((state) => ({
          themeFilters: {
            ...state.themeFilters,
            ...filters,
          },
        }));
      },
      
      /**
       * Update pattern filters
       * @param filters Partial pattern filters to update
       */
      setPatternFilters: (filters) => {
        set((state) => ({
          patternFilters: {
            ...state.patternFilters,
            ...filters,
          },
        }));
      },
      
      /**
       * Update sentiment filters
       * @param filters Partial sentiment filters to update
       */
      setSentimentFilters: (filters) => {
        set((state) => ({
          sentimentFilters: {
            ...state.sentimentFilters,
            ...filters,
          },
        }));
      },
      
      /**
       * Toggle dark mode
       */
      toggleDarkMode: () => {
        set((state) => ({ darkMode: !state.darkMode }));
      },
      
      /**
       * Toggle sidebar collapsed state
       */
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      
      /**
       * Reset all filters to defaults
       */
      resetFilters: () => {
        set({
          themeFilters: DEFAULT_THEME_FILTERS,
          patternFilters: DEFAULT_PATTERN_FILTERS,
          sentimentFilters: DEFAULT_SENTIMENT_FILTERS,
        });
      },
    }),
    {
      name: 'interview-analysis-ui-storage',
      partialize: (state) => ({
        darkMode: state.darkMode,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

/**
 * Selector to get the selected tab
 */
export const useSelectedTab = () => useUIStore((state) => state.selectedTab);

/**
 * Selector to get the theme filters
 */
export const useThemeFilters = () => useUIStore((state) => state.themeFilters);

/**
 * Selector to get the pattern filters
 */
export const usePatternFilters = () => useUIStore((state) => state.patternFilters);

/**
 * Selector to get the sentiment filters
 */
export const useSentimentFilters = () => useUIStore((state) => state.sentimentFilters);

/**
 * Selector to get the dark mode state
 */
export const useDarkMode = () => useUIStore((state) => state.darkMode);

/**
 * Selector to get the sidebar collapsed state
 */
export const useSidebarCollapsed = () => useUIStore((state) => state.sidebarCollapsed);