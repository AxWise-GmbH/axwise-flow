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

interface VisualizationTabsProps {
  analysisId?: string;
}

// Define a type for the tab values
export type TabValue = 'themes' | 'patterns' | 'sentiment' | 'personas' | 'priority';

/**
 * VisualizationTabs Component (Refactored)
 * Displays visualization tabs for themes, patterns, sentiment, and personas
 * Consumes data from context
 */
export default function VisualizationTabsRefactored({ analysisId }: VisualizationTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabFromUrl = searchParams.get('visualizationTab') as TabValue | null;
  const [activeTab, setActiveTab] = useState<TabValue>(activeTabFromUrl || 'themes');
  const [analysis, setAnalysis] = useState<any>({ themes: [], patterns: [], sentiment: null, personas: [] });

  // Fetch analysis data when analysisId changes
  useEffect(() => {
    let isMounted = true;

    const fetchAnalysis = async () => {
      try {
        if (!analysisId) return;

        // Make actual API call to fetch the data instead of using mock data
        if (isMounted) {
          const result = await apiClient.getAnalysisById(analysisId);
          
          // Debug: Log the raw theme data from API
          console.log('Raw API theme data:', result.themes);
          
          // Debug: Check for statements, supporting_quotes, and examples in the first theme
          if (result.themes && result.themes.length > 0) {
            const firstTheme = result.themes[0];
            console.log('First theme details:', {
              name: firstTheme.name,
              statements: firstTheme.statements,
              supporting_quotes: (firstTheme as any).supporting_quotes,
              examples: firstTheme.examples,
              quotes: (firstTheme as any).quotes
            });
          }
          
          setAnalysis(result);
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
      }
    };

    fetchAnalysis();

    return () => {
      isMounted = false;
    };
  }, [analysisId]); // Only re-run when analysisId changes

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
          Created {new Date(analysis?.createdAt || '').toLocaleString()} • {analysis?.llmProvider || 'AI'} Analysis
        </CardDescription>
      </CardHeader>

      <CardContent>
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
              {analysis.sentiment && (
                <SentimentGraph 
                  data={analysis.sentiment.sentimentOverview} 
                  detailedData={[]} 
                  supportingStatements={analysis.sentiment.sentimentStatements}
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
              <PriorityInsights analysisId={analysisId || analysis?.id || ''} />
            </TabsContent>
          </CustomErrorBoundary>
        </Tabs>
      </CardContent>
    </Card>
  );
}
