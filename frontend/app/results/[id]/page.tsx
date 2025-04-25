'use client';

import React, { useEffect, useMemo } from 'react';
 // Import useMemo
import { useParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { useAnalysisStore } from '@/store/useAnalysisStore';
import {
  useUIStore,
  useSelectedTab
} from '@/store/useUIStore';
import { ThemeChart } from '@/components/visualization/ThemeChart';
import PatternList from '@/components/visualization/PatternList';
import SentimentGraph from '@/components/visualization/SentimentGraph';
import { PersonaList } from '@/components/visualization/PersonaList';
 // Use named import
import type { DetailedAnalysisResult, Theme, AnalyzedTheme } from '@/types/api'; // Import Theme and AnalyzedTheme

export default function AnalysisResultsPage(): JSX.Element | null { // Add return type
  const params = useParams();
  const analysisId = params?.id as string;
  const { showToast } = useToast();

  const {
    fetchAnalysisById,
    currentAnalysis: analysisData,
    isLoadingAnalysis: isLoading,
    analysisError: error,
    clearErrors
  } = useAnalysisStore();

  useEffect(() => {
    async function loadAnalysis(): Promise<void> { // Add return type
      try {
        const result = await fetchAnalysisById(analysisId);
        if (!result) {
          showToast('Failed to load analysis data', { variant: 'error' });
        } else {
          console.log('Analysis data loaded:', result);
        }
      } catch (err) {
        console.error('Error in analysis effect:', err);
        showToast('Failed to load analysis data', { variant: 'error' });
      }
    }

    if (analysisId) {
      loadAnalysis();
    }

    return () => {
      clearErrors();
    };
  }, [analysisId, fetchAnalysisById, showToast, clearErrors]);

  if (isLoading) {
    return (
 // JSX.Element
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="Loading analysis results..." />
      </div>
    );
  }

  if (error) {
    return (
 // JSX.Element
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Error Loading Analysis</h2>
          <p>{error.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => {
              clearErrors();
              fetchAnalysisById(analysisId);
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
 // JSX.Element
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-muted p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Analysis Not Found</h2>
          <p>The requested analysis could not be found. It may have been deleted or the ID is incorrect.</p>
        </div>
      </div>
    );
  }

  return (
    // JSX.Element
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

function AnalysisHeader({ data }: { data: DetailedAnalysisResult }): JSX.Element { // Add return type
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

// TabButton component for consistent tab styling
// Corrected position of return type annotation
function TabButton({ isActive, onClick, children }: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      className={`py-4 px-1 border-b-2 font-medium text-sm ${
        isActive
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TabOptions(): JSX.Element { // Add return type
  const { selectedTab, setSelectedTab } = useUIStore();

  return (
    <div className="flex space-x-8">
      <TabButton
        isActive={selectedTab === 'themes'}
        onClick={() => setSelectedTab('themes')}
      >
        Themes
      </TabButton>
      <TabButton
        isActive={selectedTab === 'patterns'}
        onClick={() => setSelectedTab('patterns')}
      >
        Patterns
      </TabButton>
      <TabButton
        isActive={selectedTab === 'sentiment'}
        onClick={() => setSelectedTab('sentiment')}
      >
        Sentiment
      </TabButton>
      <TabButton
        isActive={selectedTab === 'personas'}
        onClick={() => setSelectedTab('personas' as 'themes' | 'patterns' | 'sentiment' | 'personas')} // Use specific type
      >
        Personas
      </TabButton>
    </div>
  );
}

function AnalysisTabs({ data }: { data: DetailedAnalysisResult }): JSX.Element { // Add return type
  const selectedTab = useSelectedTab();

  // Map Theme[] to AnalyzedTheme[] for ThemeChart compatibility
  const analyzedThemes: AnalyzedTheme[] = useMemo(() => {
    return data.themes.map((theme: Theme) => ({
      ...theme,
      prevalence: theme.frequency, // Map frequency to prevalence
      id: String(theme.id) // Ensure id is string as expected by AnalyzedTheme? Check ThemeChart usage if needed. Assuming string for now.
    }));
  }, [data.themes]);

  useEffect(() => {
    if (selectedTab === 'sentiment') {
      console.log('Sentiment tab selected, data:', {
        sentimentOverview: data.sentimentOverview,
        sentiment: data.sentiment,
        statements: data.sentimentStatements
      });
    }
  }, [selectedTab, data]);

  // Always use unified view (removed toggle)

  return (
    <div className="space-y-4">
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          <TabOptions />
        </nav>
      </div>

      {/* Removed View Type Toggle */}

      <div className="py-6">
        {/* Always use Unified View */}
        <div className="mt-4">
          {selectedTab === 'themes' && (
            <ThemeChart
              themes={analyzedThemes} // Pass the mapped array
            />
          )}
          {selectedTab === 'patterns' && (
            <PatternList
              patterns={data.patterns}
            />
          )}
          {selectedTab === 'sentiment' && (
            <SentimentGraph
              data={data.sentimentOverview}
              supportingStatements={data.sentimentStatements || {
                positive: data.sentiment.filter(s => s.score > 0.2).map(s => s.text).slice(0, 5),
                neutral: data.sentiment.filter(s => s.score > -0.2 && s.score < 0.2).map(s => s.text).slice(0, 5),
                negative: data.sentiment.filter(s => s.score < -0.2).map(s => s.text).slice(0, 5)
              }}
            />
          )}
          {selectedTab === 'personas' && (
            <PersonaList
              personas={data.personas || []}
            />
          )}
        </div>
      </div>
    </div>
  );
}
