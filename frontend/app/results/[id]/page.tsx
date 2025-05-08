'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeChart } from '@/components/visualization/ThemeChart';
import PatternList from '@/components/visualization/PatternList';
import SentimentGraph from '@/components/visualization/SentimentGraph';
import { PersonaList } from '@/components/visualization/PersonaList';
import type { DetailedAnalysisResult, Theme, AnalyzedTheme } from '@/types/api';
import { apiClient } from '@/lib/apiClient';

export default function AnalysisResultsPage(): JSX.Element | null {
  const params = useParams();
  const searchParams = useSearchParams();
  const analysisId = params?.id as string;
  const { showToast } = useToast();

  // Local state to replace Zustand
  const [analysisData, setAnalysisData] = useState<DetailedAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedTab, setSelectedTab] = useState<'themes' | 'patterns' | 'sentiment' | 'personas'>('themes');

  // Get initial tab from URL if available
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['themes', 'patterns', 'sentiment', 'personas'].includes(tabParam)) {
      setSelectedTab(tabParam as 'themes' | 'patterns' | 'sentiment' | 'personas');
    }
  }, [searchParams]);

  // Fetch analysis data
  useEffect(() => {
    async function fetchAnalysis() {
      if (!analysisId) return;

      setIsLoading(true);
      setError(null);

      try {
        const result = await apiClient.getAnalysisById(analysisId);
        setAnalysisData(result);
      } catch (err) {
        console.error('Error fetching analysis:', err);
        setError(err instanceof Error ? err : new Error('Failed to load analysis data'));
        showToast('Failed to load analysis data', { variant: 'error' });
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalysis();
  }, [analysisId, showToast]);

  // Clear errors function
  const clearErrors = () => {
    setError(null);
  };

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
              // Reload the page to retry
              window.location.reload();
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
    <ErrorBoundary>
      <div className="p-6 max-w-7xl mx-auto">
        <AnalysisHeader data={analysisData} />

        <div className="mt-8">
          <AnalysisTabs
            data={analysisData}
            selectedTab={selectedTab}
            setSelectedTab={setSelectedTab}
          />
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

interface AnalysisTabsProps {
  data: DetailedAnalysisResult;
  selectedTab: 'themes' | 'patterns' | 'sentiment' | 'personas';
  setSelectedTab: (tab: 'themes' | 'patterns' | 'sentiment' | 'personas') => void;
}

function AnalysisTabs({ data, selectedTab, setSelectedTab }: AnalysisTabsProps): JSX.Element {

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
              onClick={() => setSelectedTab('personas')}
            >
              Personas
            </TabButton>
          </div>
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
