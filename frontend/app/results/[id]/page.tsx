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
import { ThemeChart, PatternList, SentimentGraph } from '@/components/visualization';
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
        {selectedTab === 'themes' && <ThemeChart data={data.themes} className="mt-4" />}
        {selectedTab === 'patterns' && <PatternList data={data.patterns} className="mt-4" />}
        {selectedTab === 'sentiment' && <SentimentGraph data={data.sentimentOverview} detailedData={data.sentiment} className="mt-4" />}
      </div>
    </div>
  );
}

/**
 * Placeholder component for theme visualization
 */
