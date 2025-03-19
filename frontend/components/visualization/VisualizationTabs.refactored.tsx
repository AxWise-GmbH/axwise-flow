/**
 * VisualizationTabs Component (Refactored)
 * 
 * ARCHITECTURAL NOTE: This is the refactored visualization tabs component that:
 * 1. Consumes data from context instead of props
 * 2. Uses the DashboardVisualizationContainer for data fetching
 * 3. Implements proper error handling
 * 4. Separates concerns between data and presentation
 */

'use client';

import React from 'react';
import { useVisualizationTab } from '@/store/useDashboardStore.refactored';
import { ThemeChart } from './ThemeChart';
import { PatternList } from './PatternList';
import { SentimentGraph } from './SentimentGraph';
import { PersonaList } from './PersonaList';
import { PriorityInsights } from './PriorityInsights';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useVisualizationContext } from './DashboardVisualizationContainer';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import ApiErrorBoundary from '../error/ApiErrorBoundary';

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
  // Get data from context
  const { analysis } = useVisualizationContext();
  
  // Get tab state from store
  const { tab: activeTab, setTab: setActiveTab } = useVisualizationTab();
  
  // Get the URL query parameters to support specific tab navigation
  const router = useRouter();
  const pathname = window.location.pathname;
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') as TabValue | null;
  
  // Handle tab change
  const handleTabChange = (newTab: string) => {
    // Update the URL to reflect the current tab for sharing/bookmarking
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    
    // Update global state for other components to reference
    setActiveTab(newTab as TabValue);
  };
  
  // Initialize tab from URL if present
  useEffect(() => {
    if (defaultTab && ['themes', 'patterns', 'sentiment', 'personas', 'priority'].includes(defaultTab)) {
      setActiveTab(defaultTab as TabValue);
    }
  }, [defaultTab, setActiveTab]);
  
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
          
          <ApiErrorBoundary context="ThemesTab">
            <TabsContent value="themes" className="mt-6">
              {analysis?.themes.length ? (
                <ThemeChart themes={analysis.themes} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No themes detected in this interview.
                </div>
              )}
            </TabsContent>
          </ApiErrorBoundary>
          
          <ApiErrorBoundary context="PatternsTab">
            <TabsContent value="patterns" className="mt-6">
              {analysis?.patterns.length ? (
                <PatternList patterns={analysis.patterns} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No patterns detected in this interview.
                </div>
              )}
            </TabsContent>
          </ApiErrorBoundary>
          
          <ApiErrorBoundary context="SentimentTab">
            <TabsContent value="sentiment" className="mt-6">
              {analysis?.sentiment.length ? (
                <SentimentGraph 
                  data={analysis.sentimentOverview}
                  detailedData={analysis.sentiment}
                  supportingStatements={analysis.sentimentStatements}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sentiment data available for this interview.
                </div>
              )}
            </TabsContent>
          </ApiErrorBoundary>
          
          <ApiErrorBoundary context="PersonasTab">
            <TabsContent value="personas" className="mt-6">
              {analysis?.personas?.length ? (
                <PersonaList personas={analysis.personas} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No personas detected in this interview.
                </div>
              )}
            </TabsContent>
          </ApiErrorBoundary>
          
          <ApiErrorBoundary context="PriorityTab">
            <TabsContent value="priority" className="mt-6">
              <PriorityInsights analysisId={analysisId || analysis?.id || ''} />
            </TabsContent>
          </ApiErrorBoundary>
        </Tabs>
      </CardContent>
    </Card>
  );
}
