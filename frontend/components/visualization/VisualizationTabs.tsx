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
import { ThemeChart } from './ThemeChart';
import { PatternList } from './PatternList';
import { SentimentGraph } from './SentimentGraph';
import { PersonaList } from './PersonaList';
import { PriorityInsights } from './PriorityInsights';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRouter, useSearchParams } from 'next/navigation';
import CustomErrorBoundary from './ErrorBoundary';
import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult } from '@/types/api';

interface VisualizationTabsProps {
  analysisId?: string;
  analysisData?: DetailedAnalysisResult | null;
}

// Define a type for the tab values
export type TabValue = 'themes' | 'patterns' | 'sentiment' | 'personas' | 'priority';

/**
 * VisualizationTabs Component (Refactored)
 * Displays visualization tabs for themes, patterns, sentiment, and personas
 * Can consume data from props (server-fetched) or client-side fetch as fallback
 */
export default function VisualizationTabsRefactored({ 
  analysisId,
  analysisData: serverAnalysisData 
}: VisualizationTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabFromUrl = searchParams.get('visualizationTab') as TabValue | null;
  const [activeTab, setActiveTab] = useState<TabValue>(activeTabFromUrl || 'themes');
  const [localAnalysis, setLocalAnalysis] = useState<any>({ themes: [], patterns: [], sentiment: null, personas: [] });
  const [loading, setLoading] = useState<boolean>(!serverAnalysisData);
  const [error, setError] = useState<string | null>(null);
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
      console.log('Using server-provided analysis data');
      return;
    }
    
    let isMounted = true;
    
    // Skip if no analysis ID is available
    if (!effectiveAnalysisId) {
      console.log('No analysis ID available, skipping fetch');
      return;
    }
    
    // Skip duplicate fetches for the same ID
    if (lastFetchedId.current === effectiveAnalysisId) {
      console.log('Already fetched this analysis ID, skipping:', effectiveAnalysisId);
      return;
    }
    
    const fetchAnalysis = async () => {
      try {
        console.log('Client-side fallback fetch for ID:', effectiveAnalysisId);
        setLoading(true);
        setError(null);
        
        // Reset analysis data first to avoid mixing with previous data
        if (isMounted) {
          setLocalAnalysis({ themes: [], patterns: [], sentiment: null, personas: [] });
        }
        
        // Make actual API call to fetch the data
        const result = await apiClient.getAnalysisById(effectiveAnalysisId);
        
        // Debug: Log the raw theme data from API
        console.log('Raw API response:', result);
        console.log('Themes count:', result.themes?.length || 0);
        
        if (isMounted) {
          setLocalAnalysis(result);
          lastFetchedId.current = effectiveAnalysisId;
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
        if (isMounted) {
          setError('Failed to load analysis data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchAnalysis();

    return () => {
      isMounted = false;
    };
  }, [effectiveAnalysisId, serverAnalysisData]); // Added serverAnalysisData as dependency

  // Update URL when active tab changes, but only if it's different from current URL
  // Use a ref to track if this is the initial render to avoid unnecessary URL updates
  const initialRender = useRef(true);

  useEffect(() => {
    // Skip URL update on initial render
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    // Only update URL if we're running in browser environment
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const currentTabParam = url.searchParams.get('visualizationTab');

      // Only update if the tab has actually changed
      if (currentTabParam !== activeTab) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('visualizationTab', activeTab);

        // Use router.replace instead of directly modifying URL to avoid triggering re-renders
        router.replace(`${window.location.pathname}?${newParams.toString()}`, { scroll: false });
      }
    }
  }, [activeTab, router, searchParams]);

  // Set active tab based on URL parameter, but only on first render
  useEffect(() => {
    if (activeTabFromUrl && activeTab !== activeTabFromUrl) {
      setActiveTab(activeTabFromUrl);
    }
  }, []); // Empty dependency array means it only runs on first render

  // Set active tab function
  const setActiveTabSafe = useCallback((tab: TabValue) => {
    setActiveTab(tab);
  }, []);

  // Prepare data for rendering
  const analyzedThemes = useMemo(() => {
    return (analysis?.themes || []).map((theme: any) => ({
      id: theme.id?.toString() || '',
      name: theme.name || '',
      prevalence: theme.frequency || 0,
      frequency: theme.frequency || 0,
      sentiment: theme.sentiment,
      keywords: theme.keywords || [],
      statements: theme.statements || [],
      examples: theme.examples || [],
      definition: theme.definition || '',
      reliability: theme.reliability,
      process: theme.process,
      codes: theme.codes || []
    }));
  }, [analysis?.themes]);

  // Handle tab change
  const handleTabChange = (newTab: string) => {
    setActiveTabSafe(newTab as TabValue);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Analysis Results: {analysis?.fileName}</CardTitle>
        <CardDescription>
          Created {analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString() : 'Date unavailable'} • {analysis?.llmProvider || 'AI'} Analysis
        </CardDescription>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analysis data...</p>
          </div>
        )}
        
        {error && (
          <div className="p-4 border border-red-300 bg-red-50 rounded-md">
            <h3 className="text-lg font-semibold text-red-700">Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        )}
        
        {!loading && !error && (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="themes">Themes</TabsTrigger>
              <TabsTrigger value="patterns">Patterns</TabsTrigger>
              <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
              <TabsTrigger value="personas">Personas</TabsTrigger>
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
                  <ThemeChart themes={analyzedThemes} />
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
                  <h3 className="text-lg font-semibold text-red-700">Error in Sentiment Visualization</h3>
                  <p className="text-red-600">There was an error rendering the sentiment visualization.</p>
                </div>
              }
            >
              <TabsContent value="sentiment" className="mt-6">
                {console.log("Sentiment tab rendering with data:", analysis.sentiment)}
                {console.log("SentimentStatements available:", 
                  analysis.sentimentStatements || 
                  (analysis.sentiment && analysis.sentiment.sentimentStatements) || 
                  "MISSING")}
                
                {/* Add debugging button to manually check data structure */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="mb-4 p-2 border border-blue-200 rounded-md bg-blue-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-blue-700">Developer Debug</span>
                      <button 
                        onClick={() => {
                          console.log("Full analysis object:", analysis);
                          console.log("Results property:", analysis.results);
                          console.log("Sentiment object:", analysis.sentiment);
                          console.log("SentimentStatements:", 
                            analysis.sentimentStatements || 
                            (analysis.sentiment && analysis.sentiment.sentimentStatements) ||
                            (analysis.results && analysis.results.sentimentStatements) ||
                            "Not found in any expected location"
                          );
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded-md"
                      >
                        Log Sentiment Data
                      </button>
                    </div>
                  </div>
                )}
                
                {analysis.sentiment && (
                  <SentimentGraph 
                    data={analysis.sentiment.sentimentOverview || analysis.sentimentOverview} 
                    detailedData={[]} 
                    supportingStatements={
                      // First try to get real sentimentStatements from various possible locations
                      (analysis.sentimentStatements && 
                       analysis.sentimentStatements.positive && 
                       analysis.sentimentStatements.positive.length > 0) 
                        ? analysis.sentimentStatements
                        : (analysis.sentiment && 
                           analysis.sentiment.sentimentStatements && 
                           analysis.sentiment.sentimentStatements.positive && 
                           analysis.sentiment.sentimentStatements.positive.length > 0)
                          ? analysis.sentiment.sentimentStatements
                          : (analysis.results && 
                             analysis.results.sentimentStatements && 
                             analysis.results.sentimentStatements.positive && 
                             analysis.results.sentimentStatements.positive.length > 0)
                            ? analysis.results.sentimentStatements
                            // If no real data is found, use explicit sample data for development
                            : process.env.NODE_ENV === 'development'
                              ? {
                                  positive: [
                                    "I really appreciated how intuitive the interface was.",
                                    "The new features save me a lot of time on my daily tasks."
                                  ],
                                  neutral: [
                                    "It works as expected for the most part.",
                                    "The application performs standard functions adequately."
                                  ],
                                  negative: [
                                    "The system occasionally freezes when processing large files.",
                                    "Error messages could be more descriptive."
                                  ]
                                }
                              // In production, use empty arrays
                              : {positive: [], neutral: [], negative: []}
                    }
                  />
                )}
                {!analysis.sentiment && (
                  <div className="text-center text-muted-foreground">
                    No sentiment data available
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
              <p><strong>Error:</strong> {error || 'None'}</p>
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
