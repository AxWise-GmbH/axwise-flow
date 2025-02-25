'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { 
  useAnalysisStore, 
  useCurrentAnalysis, 
  useAnalysisLoading, 
  useAnalysisError, 
  useFetchAnalysis 
} from '@/store/useAnalysisStore';
import { 
  useUIStore, 
  useSelectedTab 
} from '@/store/useUIStore';
import type { DetailedAnalysisResult } from '@/types/api';

/**
 * Analysis Results Page
 * Displays detailed analysis results for a specific analysis ID
 */
export default function AnalysisResultsPage() {
  const params = useParams();
  const analysisId = params?.id as string;
  const { showToast } = useToast();
  
  // Get state and actions from stores
  const fetchAnalysis = useFetchAnalysis();
  const analysisData = useCurrentAnalysis();
  const isLoading = useAnalysisLoading();
  const error = useAnalysisError();
  const clearError = useAnalysisStore(state => state.clearError);

  useEffect(() => {
    async function loadAnalysis() {
      try {
        const result = await fetchAnalysis(analysisId);
        if (!result) {
          showToast('Failed to load analysis data', { variant: 'error' });
        }
      } catch (err) {
        console.error('Error in analysis effect:', err);
        showToast('Failed to load analysis data', { variant: 'error' });
      }
    }

    if (analysisId) {
      loadAnalysis();
    }

    // Cleanup on unmount
    return () => {
      clearError();
    };
  }, [analysisId, fetchAnalysis, showToast, clearError]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="Loading analysis results..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Error Loading Analysis</h2>
          <p>{error.message}</p>
          <button 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => {
              clearError();
              fetchAnalysis(analysisId);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-muted p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Analysis Not Found</h2>
          <p>The requested analysis could not be found. It may have been deleted or the ID is incorrect.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="p-6 max-w-7xl mx-auto">
        <AnalysisHeader data={analysisData} />
        
        <div className="mt-8">
          <AnalysisTabs data={analysisData} />
        </div>
      </div>
    </ErrorBoundary>
  );
}

/**
 * Header component for the analysis results page
 */
function AnalysisHeader({ data }: { data: DetailedAnalysisResult }) {
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analysis Results</h1>
          <p className="text-muted-foreground">
            File: {data.fileName}
          </p>
          <p className="text-muted-foreground text-sm">
            Created: {new Date(data.createdAt).toLocaleString()}
          </p>
        </div>
        
        <div className="mt-4 md:mt-0">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            data.status === 'completed' 
              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
              : data.status === 'failed'
              ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
          }`}>
            {data.status}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Tabs component for navigating between different analysis views
 */
function AnalysisTabs({ data }: { data: DetailedAnalysisResult }) {
  // Get tab state from UI store
  const selectedTab = useSelectedTab();
  const setSelectedTab = useUIStore(state => state.setSelectedTab);
  
  return (
    <div>
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'themes'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            onClick={() => setSelectedTab('themes')}
          >
            Themes
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'patterns'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            onClick={() => setSelectedTab('patterns')}
          >
            Patterns
          </button>
          <button
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'sentiment'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            onClick={() => setSelectedTab('sentiment')}
          >
            Sentiment
          </button>
        </nav>
      </div>
      
      <div className="py-6">
        {selectedTab === 'themes' && <ThemeChart data={data.themes} />}
        {selectedTab === 'patterns' && <PatternList data={data.patterns} />}
        {selectedTab === 'sentiment' && <SentimentGraph data={data.sentimentOverview} />}
      </div>
    </div>
  );
}

/**
 * Placeholder component for theme visualization
 */
function ThemeChart({ data }: { data: DetailedAnalysisResult['themes'] }) {
  // Get theme filters from UI store
  const themeFilters = useUIStore(state => state.themeFilters);
  const setThemeFilters = useUIStore(state => state.setThemeFilters);
  
  // Apply filters and sorting
  const filteredData = data
    .filter(theme => (theme.frequency || 0) >= themeFilters.minFrequency)
    .sort((a, b) => {
      if (themeFilters.sortBy === 'name') {
        return themeFilters.sortDirection === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else if (themeFilters.sortBy === 'sentiment') {
        const sentimentA = a.sentiment || 0;
        const sentimentB = b.sentiment || 0;
        return themeFilters.sortDirection === 'asc'
          ? sentimentA - sentimentB
          : sentimentB - sentimentA;
      } else {
        // Default: sort by frequency
        const freqA = a.count || a.frequency || 0;
        const freqB = b.count || b.frequency || 0;
        return themeFilters.sortDirection === 'asc'
          ? freqA - freqB
          : freqB - freqA;
      }
    });
  
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Identified Themes</h2>
          <p className="text-muted-foreground">
            The following themes were identified in the interview data.
          </p>
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center space-x-4">
          <select
            className="px-2 py-1 border border-border rounded-md bg-background text-sm"
            value={themeFilters.sortBy}
            onChange={(e) => setThemeFilters({ sortBy: e.target.value as any })}
          >
            <option value="frequency">Sort by Frequency</option>
            <option value="name">Sort by Name</option>
            <option value="sentiment">Sort by Sentiment</option>
          </select>
          
          <button
            className="p-1 border border-border rounded-md"
            onClick={() => setThemeFilters({ 
              sortDirection: themeFilters.sortDirection === 'asc' ? 'desc' : 'asc' 
            })}
          >
            {themeFilters.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      
      {/* Placeholder for chart */}
      <div className="h-80 bg-muted/30 rounded-md flex items-center justify-center">
        <p className="text-muted-foreground">Theme visualization will be implemented here</p>
      </div>
      
      {/* Simple list representation for now */}
      <div className="mt-6 space-y-4">
        {filteredData.map((theme, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-muted/20 rounded-md">
            <span className="font-medium">{theme.name}</span>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Count: {theme.count || Math.round((theme.frequency || 0) * 100)}</span>
              <span className={`text-sm ${(theme.sentiment || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                Sentiment: {(theme.sentiment || 0) > 0 ? '+' : ''}{(theme.sentiment || 0).toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder component for pattern list
 */
function PatternList({ data }: { data: DetailedAnalysisResult['patterns'] }) {
  // Get pattern filters from UI store
  const patternFilters = useUIStore(state => state.patternFilters);
  const setPatternFilters = useUIStore(state => state.setPatternFilters);
  
  // Apply filters and sorting
  const filteredData = data
    .filter(pattern => {
      // Filter by frequency
      const meetsFrequency = typeof pattern.frequency === 'number'
        ? pattern.frequency >= patternFilters.minFrequency
        : true;
      
      // Filter by categories if any are selected
      const meetsCategory = patternFilters.categories.length === 0 || 
        patternFilters.categories.includes(pattern.category);
      
      return meetsFrequency && meetsCategory;
    })
    .sort((a, b) => {
      if (patternFilters.sortBy === 'name') {
        const nameA = a.name || a.category || '';
        const nameB = b.name || b.category || '';
        return patternFilters.sortDirection === 'asc'
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      } else if (patternFilters.sortBy === 'sentiment') {
        const sentimentA = a.sentiment || 0;
        const sentimentB = b.sentiment || 0;
        return patternFilters.sortDirection === 'asc'
          ? sentimentA - sentimentB
          : sentimentB - sentimentA;
      } else {
        // Default: sort by frequency
        const freqA = typeof a.frequency === 'number' ? a.frequency : 0;
        const freqB = typeof b.frequency === 'number' ? b.frequency : 0;
        return patternFilters.sortDirection === 'asc'
          ? freqA - freqB
          : freqB - freqA;
      }
    });
  
  // Get unique categories for filter dropdown
  const categories = Array.from(new Set(data.map(p => p.category)));
  
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Recognized Patterns</h2>
          <p className="text-muted-foreground">
            The following patterns were recognized across the interviews.
          </p>
        </div>
        
        <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-4">
          {categories.length > 0 && (
            <select
              className="px-2 py-1 border border-border rounded-md bg-background text-sm"
              value={patternFilters.categories[0] || ''}
              onChange={(e) => {
                const value = e.target.value;
                setPatternFilters({ 
                  categories: value ? [value] : [] 
                });
              }}
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          )}
          
          <select
            className="px-2 py-1 border border-border rounded-md bg-background text-sm"
            value={patternFilters.sortBy}
            onChange={(e) => setPatternFilters({ sortBy: e.target.value as any })}
          >
            <option value="frequency">Sort by Frequency</option>
            <option value="name">Sort by Name</option>
            <option value="sentiment">Sort by Sentiment</option>
          </select>
          
          <button
            className="p-1 border border-border rounded-md"
            onClick={() => setPatternFilters({ 
              sortDirection: patternFilters.sortDirection === 'asc' ? 'desc' : 'asc' 
            })}
          >
            {patternFilters.sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      
      <div className="space-y-4">
        {filteredData.map((pattern, index) => (
          <div key={index} className="p-4 border border-border rounded-md">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{pattern.name || pattern.category}</h3>
              <span className={`px-2 py-1 text-xs rounded-full ${
                (pattern.sentiment || 0) > 0 
                  ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' 
                  : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
              }`}>
                {(pattern.sentiment || 0) > 0 ? 'Positive' : 'Negative'}
              </span>
            </div>
            <div className="mt-2 flex items-center text-sm text-muted-foreground">
              <span className="capitalize">
                {typeof pattern.frequency === 'number' 
                  ? `Frequency: ${Math.round(pattern.frequency * 100)}%` 
                  : `Frequency: ${pattern.frequency}`}
              </span>
              <span className="mx-2">•</span>
              <span>Sentiment: {(pattern.sentiment || 0).toFixed(1)}</span>
            </div>
            <p className="mt-3 text-sm">
              {pattern.description || 'This pattern appeared consistently across multiple interviews, indicating it\'s a significant aspect of the user experience.'}
            </p>
            {pattern.examples && pattern.examples.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Examples:</p>
                <ul className="text-xs list-disc list-inside mt-1 text-muted-foreground">
                  {pattern.examples.slice(0, 3).map((example, i) => (
                    <li key={i}>{example}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder component for sentiment visualization
 */
function SentimentGraph({ data }: { data: DetailedAnalysisResult['sentimentOverview'] }) {
  // Get sentiment filters from UI store
  const sentimentFilters = useUIStore(state => state.sentimentFilters);
  
  return (
    <div className="bg-card p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Sentiment Analysis</h2>
      <p className="text-muted-foreground mb-6">
        Overall sentiment distribution across the interviews.
      </p>
      
      {/* Placeholder for sentiment chart */}
      <div className="h-80 bg-muted/30 rounded-md flex items-center justify-center">
        <p className="text-muted-foreground">Sentiment visualization will be implemented here</p>
      </div>
      
      {/* Simple representation for now */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="p-4 bg-green-100 dark:bg-green-800/30 rounded-md">
          <h3 className="font-medium text-green-800 dark:text-green-300">Positive</h3>
          <p className="text-2xl font-bold text-green-800 dark:text-green-300">
            {(data.positive * 100).toFixed(0)}%
          </p>
        </div>
        <div className="p-4 bg-blue-100 dark:bg-blue-800/30 rounded-md">
          <h3 className="font-medium text-blue-800 dark:text-blue-300">Neutral</h3>
          <p className="text-2xl font-bold text-blue-800 dark:text-blue-300">
            {(data.neutral * 100).toFixed(0)}%
          </p>
        </div>
        <div className="p-4 bg-red-100 dark:bg-red-800/30 rounded-md">
          <h3 className="font-medium text-red-800 dark:text-red-300">Negative</h3>
          <p className="text-2xl font-bold text-red-800 dark:text-red-300">
            {(data.negative * 100).toFixed(0)}%
          </p>
        </div>
      </div>
    </div>
  );
}