/**
 * VisualizationTabs Component (Refactored)
 *
 * ARCHITECTURAL NOTE: This is the refactored visualization tabs component that:
 * 1. Consumes data from context instead of props
 * 2. Uses a context provider for data
 * 3. Implements error handling
 * 4. Separates concerns between data and presentation
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
/**
 * ARCHITECTURAL NOTE: We're using the canonical ThemeChart component which displays themes
 * without distinguishing between basic and enhanced analysis. The backend always runs enhanced
 * theme analysis, and we display all themes regardless of their process type.
 */
import { ThemeChart } from './ThemeChart.simplified'; // This is now the canonical ThemeChart component
import { PatternList } from './PatternList';
import { PersonaList } from './PersonaList';
import { InsightList } from './InsightList';
import { PriorityInsights } from './PriorityInsights';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'next/navigation';
import CustomErrorBoundary from './ErrorBoundary';
import { apiClient } from '@/lib/apiClient'; // Keep apiClient if needed elsewhere
import { LoadingSpinner } from '@/components/loading-spinner'; // Import LoadingSpinner
import { ExportButton } from './ExportButton';
import type { DetailedAnalysisResult } from '@/types/api'; // Remove PrioritizedInsight import
// import { useAnalysisStore } from '@/store/useAnalysisStore'; // Remove store import if only used for priority insights

interface VisualizationTabsProps {
  analysisId?: string;
  analysisData?: DetailedAnalysisResult | null;
  initialTab?: string | null;
}

// Define a type for the tab values
export type TabValue = 'themes' | 'patterns' | 'personas' | 'insights' | 'priority';

// No helper functions needed

/**
 * VisualizationTabs Component (Refactored)
 * Displays visualization tabs for themes, patterns, sentiment, and personas
 * Can consume data from props (server-fetched) or client-side fetch as fallback
 */
export default function VisualizationTabsRefactored({
  analysisId,
  analysisData: serverAnalysisData,
  initialTab
}: VisualizationTabsProps) {
  // No router needed
  const searchParams = useSearchParams();
  const activeTabFromUrl = searchParams.get('visualizationTab') as TabValue | null;
  const [activeTab, setActiveTab] = useState<TabValue>(
    initialTab as TabValue || activeTabFromUrl || 'themes'
  );
  const [localAnalysis, setLocalAnalysis] = useState<any>({ themes: [], patterns: [], sentiment: null, personas: [] });
  const [loading, setLoading] = useState<boolean>(!serverAnalysisData); // Initial loading based on server data
  const [fetchError, setFetchError] = useState<string | null>(null); // Renamed for clarity
  const lastFetchedId = useRef<string | null>(null);

  // Extract result_id from URL if analysisId is not provided as prop
  const urlAnalysisId = searchParams.get('analysisId') || searchParams.get('result_id');
  const effectiveAnalysisId = analysisId || urlAnalysisId;

  // Use server data if available, otherwise use local state
  const analysis = serverAnalysisData || localAnalysis;

  // Reset analysis data when analysisId changes and fetch new data
  useEffect(() => {
    // Skip if we have server-provided data
    if (serverAnalysisData) {
      return;
    }

    let isMounted = true;

    // Skip if no analysis ID is available
    if (!effectiveAnalysisId) {
      return;
    }

    // Skip duplicate fetches for the same ID
    if (lastFetchedId.current === effectiveAnalysisId) {
      return;
    }

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        setFetchError(null);

        // Reset analysis data first to avoid mixing with previous data
        if (isMounted) {
          setLocalAnalysis({ themes: [], patterns: [], sentiment: null, personas: [] });
        }

        // Make actual API call to fetch the data
        const result = await apiClient.getAnalysisById(effectiveAnalysisId);

        if (isMounted) {
          setLocalAnalysis(result);
          lastFetchedId.current = effectiveAnalysisId;
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
        const errMsg = error instanceof Error ? error.message : 'Failed to load analysis data';
        if (isMounted) {
          setFetchError(errMsg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAnalysis();

    return () => {
      isMounted = false; // Cleanup function
    };
  }, [effectiveAnalysisId, serverAnalysisData]); // Added serverAnalysisData as dependency

  // We're disabling URL updates for tab changes to prevent tab jumping issues
  // Instead, we'll only read the initial tab from the URL
  const initialRender = useRef(true);

  // Set active tab based on URL parameter, but only on first render
  useEffect(() => {
    if (initialRender.current && activeTabFromUrl) {
      initialRender.current = false;
      setActiveTab(activeTabFromUrl);
    }
  }, []); // Empty dependency array means it only runs once on mount

  // Set active tab function
  const setActiveTabSafe = useCallback((tab: TabValue) => {
    setActiveTab(tab);
  }, []);

  // Prepare data for rendering
  const analyzedThemes = useMemo(() => {
    // Process themes
    return (analysis?.themes || []).map((theme: any) => ({
      id: theme.id?.toString() || '',
      name: theme.name || '',
      frequency: theme.frequency || 0,
      keywords: theme.keywords || [],
      statements: theme.statements || [],
      examples: theme.examples || [],
      definition: theme.definition || '',
      reliability: theme.reliability,
      codes: theme.codes || []
    }));
  }, [analysis?.themes]);

  // Handle tab change
  const handleTabChange = (newTab: string) => {
    setActiveTabSafe(newTab as TabValue);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Analysis Results: {analysis?.fileName}</CardTitle>
          <CardDescription>
            Created {analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString() : 'Date unavailable'} • {analysis?.llmProvider || 'AI'} Analysis
          </CardDescription>
        </div>
        {effectiveAnalysisId && !loading && !fetchError && (
          <ExportButton analysisId={effectiveAnalysisId} />
        )}
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="text-center py-8">
            {/* Use LoadingSpinner component */}
            <LoadingSpinner label="Loading analysis data..." />
            <p className="mt-4 text-muted-foreground">Loading analysis data...</p>
          </div>
        )}

        {fetchError && !loading && ( // Show error only if not loading
          <div className="p-4 border border-red-300 bg-red-50 rounded-md">
            <h3 className="text-lg font-semibold text-red-700">Error</h3>
            <p className="text-red-600">{fetchError}</p>
          </div>
        )}

        {!loading && !fetchError && analysis && ( // Ensure analysis data exists
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="themes">Themes</TabsTrigger>
              <TabsTrigger value="patterns">Patterns</TabsTrigger>
              <TabsTrigger value="personas">Personas</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="priority">Priority</TabsTrigger>
            </TabsList>

            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in Themes Visualization</h3>
                  <p className="text-red-600">There was an error rendering the themes visualization.</p>
                </div>
              }
            >
              <TabsContent value="themes" className="mt-6">
                {analyzedThemes.length ? (
                  <ThemeChart
                    themes={analyzedThemes}
                  />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No themes detected in this interview.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>

            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in Patterns Visualization</h3>
                  <p className="text-red-600">There was an error rendering the patterns visualization.</p>
                </div>
              }
            >
              <TabsContent value="patterns" className="mt-6">
                {analysis?.patterns.length ? (
                  <PatternList patterns={analysis.patterns} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No patterns detected in this interview.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>



            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in Personas Visualization</h3>
                  <p className="text-red-600">There was an error rendering the personas visualization.</p>
                </div>
              }
            >
              <TabsContent value="personas" className="mt-6">
                {analysis?.personas?.length ? (
                  <PersonaList personas={analysis.personas} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No personas detected in this interview.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>

            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in Insights Visualization</h3>
                  <p className="text-red-600">There was an error rendering the insights visualization.</p>
                </div>
              }
            >
              <TabsContent value="insights" className="mt-6">
                {analysis?.insights?.length ? (
                  <InsightList insights={analysis.insights || []} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No insights detected in this interview.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>

            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in Priority Visualization</h3>
                  <p className="text-red-600">There was an error rendering the priority visualization.</p>
                </div>
              }
            >
              <TabsContent value="priority" className="mt-6">
                <PriorityInsights analysisId={effectiveAnalysisId || ''} />
              </TabsContent>
            </CustomErrorBoundary>

          </Tabs>
        )}

        {/* Debug panel for development - hidden in production */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 border border-gray-200 rounded-md bg-gray-50">
            <h3 className="font-medium mb-2">Debug Information</h3>
            <div className="space-y-2">
              <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
              <p><strong>Error:</strong> {fetchError || 'None'}</p>
              <p><strong>Analysis ID:</strong> {effectiveAnalysisId || 'None'}</p>
              <p><strong>Active Tab:</strong> {activeTab}</p>
              <p><strong>Theme Count:</strong> {analysis?.themes?.length || 0}</p>
              <p><strong>Has Sentiment Statements:</strong> {
                (analysis?.sentimentStatements ||
                (analysis?.sentiment?.sentimentStatements)) ? 'Yes' : 'No'
              }</p>
              <p><strong>Has Results Property:</strong> {analysis?.results ? 'Yes' : 'No'}</p>

              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium">Raw Analysis Data</summary>
                <pre className="text-xs p-2 bg-gray-100 rounded mt-2 overflow-auto max-h-96">
                  {JSON.stringify(analysis, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
