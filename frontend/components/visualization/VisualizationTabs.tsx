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
import { ThemeChart } from './ThemeChart'; // The canonical ThemeChart component
import { PatternList } from './PatternList';

import PersonasTabContent from './PersonasTabContent';

import { InsightList } from './InsightList';
import { PriorityInsightsDisplay } from './PriorityInsightsDisplay';
import { apiClient } from '@/lib/apiClient';

import { PRDDisplay } from './PRDDisplay';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useSearchParams, useRouter } from 'next/navigation';
import CustomErrorBoundary from './ErrorBoundary';
import { Network } from 'lucide-react';

import { LoadingSpinner } from '@/components/loading-spinner'; // Import LoadingSpinner
import { ExportButton } from './ExportButton';
import type { DetailedAnalysisResult } from '@/types/api'; // Remove PrioritizedInsight import
import { StakeholderDynamicsDisplay } from './StakeholderDynamicsDisplay';
// import { useAnalysisStore } from '@/store/useAnalysisStore'; // Remove store import if only used for priority insights

interface VisualizationTabsProps {
  analysisId?: string;
  analysisData?: DetailedAnalysisResult | null;
  initialTab?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prdData?: any | null; // PRD data from server-side generation
}

// Define a type for the tab values
export type TabValue = 'themes' | 'patterns' | 'personas' | 'insights' | 'priority' | 'prd' | 'stakeholder-dynamics';

// No helper functions needed

/**
 * VisualizationTabs Component (Refactored)
 * Displays visualization tabs for themes, patterns, sentiment, and personas
 * Can consume data from props (server-fetched) or client-side fetch as fallback
 */
export default function VisualizationTabsRefactored({
  analysisId,
  analysisData: serverAnalysisData,
  initialTab,
  prdData
}: VisualizationTabsProps): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // OSS mode compatibility: provide mock user for development
  const enableClerkValidation = process.env.NEXT_PUBLIC_ENABLE_CLERK_...=***REMOVED*** 'true';
  const user = enableClerkValidation ? null : { primaryEmailAddress: { emailAddress: 'oss-user@localhost' } };

  const activeTabFromUrl = searchParams.get('visualizationTab') as TabValue | null;
  const [activeTab, setActiveTab] = useState<TabValue>(
    activeTabFromUrl || initialTab as TabValue || 'themes'
  );


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const fetchAnalysis = async (): Promise<void> => {
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
          console.log('VisualizationTabs: Received analysis result:', result);
          const personasCount = Array.isArray(result.personas) ? result.personas.length : 0;
          console.log('VisualizationTabs: Personas in result:', personasCount);
          if (personasCount > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.log('VisualizationTabs: Persona names:', (result.personas as any[]).map((p) => p.name));
          }
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



  // Sync active tab with URL parameter whenever it changes
  useEffect(() => {
    if (activeTabFromUrl && activeTabFromUrl !== activeTab) {
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('URL tab change detected:', activeTabFromUrl);
        console.log('Current tab:', activeTab);
        console.log('Is valid tab value:', ['themes', 'patterns', 'personas', 'insights', 'priority', 'prd', 'stakeholder-dynamics'].includes(activeTabFromUrl));
      }
      setActiveTab(activeTabFromUrl);
    }
  }, [activeTabFromUrl, activeTab]); // Update when URL parameter changes

  // Set active tab function
  const setActiveTabSafe = useCallback((tab: TabValue) => {
    setActiveTab(tab);
  }, []);

  // Get stakeholder intelligence from either storage location
  // Support both storage locations: dedicated column and nested in results
  const stakeholderIntelligence = analysis?.stakeholder_intelligence || analysis?.results?.stakeholder_intelligence;

  // Prepare data for rendering
  const analyzedThemes = useMemo(() => {
    // Debug logging for theme data
    if (process.env.NODE_ENV === 'development') {
      console.log('Processing themes...');
      console.log('Regular themes:', analysis?.themes?.length || 0);
      console.log('Enhanced themes:', analysis?.enhanced_themes?.length || 0);
      console.log('Stakeholder intelligence themes:', stakeholderIntelligence ? 'Available' : 'Not available');
    }

    // Use enhanced themes if available, otherwise fall back to regular themes
    const themesToUse = analysis?.enhanced_themes || analysis?.themes || [];

    // Debug logging for enhanced themes
    if (process.env.NODE_ENV === 'development') {
      console.log('Enhanced themes available:', !!analysis?.enhanced_themes);
      console.log('Enhanced themes count:', analysis?.enhanced_themes?.length || 0);
      if (analysis?.enhanced_themes?.length > 0) {
        console.log('First enhanced theme sample:', analysis.enhanced_themes[0]);
        console.log('First enhanced theme has stakeholder_context:', !!analysis.enhanced_themes[0]?.stakeholder_context);
        if (analysis.enhanced_themes[0]?.stakeholder_context) {
          console.log('Stakeholder context:', analysis.enhanced_themes[0].stakeholder_context);
        }
      }
    }

    // Process themes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processedThemes = themesToUse.map((theme: any) => {
      const processed = {
        id: theme.id?.toString() || '',
        name: theme.name || '',
        frequency: theme.frequency || 0,
        keywords: theme.keywords || [],
        statements: theme.statements || [],
        // examples field removed
        definition: theme.definition || '',
        reliability: theme.reliability,
        codes: theme.codes || [],
        // Add stakeholder context if available
        stakeholder_context: theme.stakeholder_context || null,
        // Add enhanced metadata for multi-stakeholder display
        is_enhanced: !!theme.stakeholder_context,
        source_stakeholders: theme.stakeholder_context?.source_stakeholders || [],
        stakeholder_distribution: theme.stakeholder_context?.stakeholder_distribution || {},
        consensus_level: theme.stakeholder_context?.consensus_level || null
      };

      // Debug logging for first theme
      if (process.env.NODE_ENV === 'development' && theme.name) {
        console.log(`Theme "${theme.name}" processing:`, {
          has_stakeholder_context: !!theme.stakeholder_context,
          is_enhanced: processed.is_enhanced,
          source_stakeholders_count: processed.source_stakeholders.length
        });
      }

      return processed;
    });

    return processedThemes;
  }, [analysis?.themes, analysis?.enhanced_themes, stakeholderIntelligence]);

  // Handle tab change
  const handleTabChange = (newTab: string): void => {
    const newTabValue = newTab as TabValue;

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('Tab change requested:', newTab);
      console.log('Current active tab:', activeTab);
      console.log('Is multi-stakeholder:', isMultiStakeholder);
    }

    setActiveTabSafe(newTabValue);

    // Update URL to reflect the new tab
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.set('visualizationTab', newTabValue);

    // Preserve analysisId and other parameters
    const newUrl = `/unified-dashboard?${currentParams.toString()}`;

    // Debug logging
    if (process.env.NODE_ENV === 'development') {
      console.log('Navigating to URL:', newUrl);
    }

    router.push(newUrl);
  };

  // Check if this is multi-stakeholder analysis (require at least 2 stakeholders)
  const stakeholderCount = stakeholderIntelligence?.detected_stakeholders?.length || 0;
  const isMultiStakeholder = stakeholderCount >= 2;

  // Determine if Stakeholder Dynamics has meaningful content to show
  const dynamicsCounts = {
    consensus: stakeholderIntelligence?.cross_stakeholder_patterns?.consensus_areas?.length || 0,
    conflicts: stakeholderIntelligence?.cross_stakeholder_patterns?.conflict_zones?.length || 0,
    influence: stakeholderIntelligence?.cross_stakeholder_patterns?.influence_networks?.length || 0,
  };
  const hasDynamicsContent = (dynamicsCounts.consensus + dynamicsCounts.conflicts + dynamicsCounts.influence) > 0
    || !!stakeholderIntelligence?.multi_stakeholder_summary;

  // Feature flag: hide Stakeholder Dynamics by default in OSS until ready
  const dynamicsEnabled = process.env.NEXT_PUBLIC_...=***REMOVED*** 'true';
  const showStakeholderDynamics = dynamicsEnabled && isMultiStakeholder && hasDynamicsContent;

  // Debug logging for stakeholder intelligence (temporarily enabled for production debugging)
  console.log('Analysis data keys:', analysis ? Object.keys(analysis) : 'No analysis');
  console.log('Has stakeholder_intelligence:', !!stakeholderIntelligence);
  console.log('Stakeholder intelligence data:', stakeholderIntelligence);
  console.log('Stakeholders detected:', stakeholderCount);
  console.log('Is multi-stakeholder:', isMultiStakeholder);
  console.log('Dynamics content counts:', dynamicsCounts);
  console.log('Show Stakeholder Dynamics:', showStakeholderDynamics);
  console.log('Environment variables:', {
    NEXT_PUBLIC_...=***REMOVED***
    NEXT_PUBLIC_...=***REMOVED***
    NODE_ENV: process.env.NODE_ENV
  });

  // If URL requests Stakeholder Dynamics but it's not available, redirect to a safe tab
  useEffect(() => {
    if (activeTabFromUrl === 'stakeholder-dynamics' && !showStakeholderDynamics) {
      const currentParams = new URLSearchParams(searchParams.toString());
      currentParams.set('visualizationTab', 'themes');
      router.replace(`/unified-dashboard?${currentParams.toString()}`);
      setActiveTabSafe('themes');
    }
  }, [activeTabFromUrl, showStakeholderDynamics, router, searchParams, setActiveTabSafe]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Analysis Results: {analysis?.fileName}</CardTitle>
          <CardDescription>
            Created {analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString() : 'Date unavailable'} • {analysis?.llmProvider || 'AI'} Analysis
            {/* NEW: Multi-stakeholder indicator - moved outside CardDescription to avoid div in p */}
            {showStakeholderDynamics && (
              <> • {stakeholderCount} Stakeholders</>
            )}
          </CardDescription>
          {/* Multi-stakeholder badge moved outside CardDescription */}
          {showStakeholderDynamics && (
            <Badge variant="outline" className="ml-2 text-xs mt-1">
              Multi-Stakeholder Analysis
            </Badge>
          )}
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
            {/* Enhanced TabsList - conditionally show 7th tab */}
            <TabsList className={`w-full ${showStakeholderDynamics ? 'grid-cols-7' : 'grid-cols-6'} grid`}>
              <TabsTrigger value="themes">
                Themes
                {showStakeholderDynamics && <Badge variant="outline" className="ml-1 text-xs">Multi</Badge>}
              </TabsTrigger>
              <TabsTrigger value="patterns">Patterns</TabsTrigger>
              <TabsTrigger value="personas">Personas</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="priority">Priority</TabsTrigger>
              <TabsTrigger value="prd">PRD</TabsTrigger>
              {/* NEW: Stakeholder Dynamics tab - only show for multi-stakeholder data */}
              {showStakeholderDynamics && (
                <TabsTrigger value="stakeholder-dynamics">
                  <div className="flex items-center gap-1">
                    <Network className="h-3 w-3" />
                    Stakeholder Dynamics
                  </div>
                </TabsTrigger>
              )}
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
                {analyzedThemes.length || stakeholderIntelligence?.cross_stakeholder_patterns?.consensus_areas?.length ? (
                  <ThemeChart
                    themes={analyzedThemes}
                    stakeholderIntelligence={stakeholderIntelligence}
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
                {analysis?.patterns?.length || stakeholderIntelligence?.cross_stakeholder_patterns?.conflict_zones?.length || stakeholderIntelligence?.cross_stakeholder_patterns?.influence_networks?.length ? (
                  <PatternList
                    patterns={analysis.patterns || []}
                    stakeholderIntelligence={stakeholderIntelligence}
                  />
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
                /* eslint-disable @typescript-eslint/no-explicit-any */
            >
              <TabsContent value="personas" className="mt-6">
                {analysis?.personas?.length || (isMultiStakeholder && stakeholderIntelligence?.detected_stakeholders?.length) ? (
                  <PersonasTabContent
                    personas={analysis.personas || []}
                    stakeholderIntelligence={stakeholderIntelligence}
                    isMultiStakeholder={isMultiStakeholder}
                    resultId={analysisId as any}
                    // Dev-only Phase 0 fields
                    personasSSOT={(analysis as any)?.personas_ssot || []}
                    validationSummary={(analysis as any)?.validation_summary || null}
                    validationStatus={(analysis as any)?.validation_status || null}
                    confidenceComponents={(analysis as any)?.confidence_components || null}
                    sourceInfo={(analysis as any)?.source || {}}
                /* eslint-enable @typescript-eslint/no-explicit-any */
                  />
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
                {analysis ? (
                  <PriorityInsightsDisplay analysis={analysis} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No analysis data available for priority insights.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>



            <CustomErrorBoundary
              fallback={
                <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                  <h3 className="text-lg font-semibold text-red-700">Error in PRD Visualization</h3>
                  <p className="text-red-600">There was an error rendering the PRD visualization.</p>
                </div>
              }
            >
              <TabsContent value="prd" className="mt-6">
                {prdData ? (
                  <PRDDisplay analysis={analysis} prdData={prdData} />
                ) : analysis ? (
                  <PRDDisplay analysis={analysis} />
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No analysis data available for PRD generation.
                  </div>
                )}
              </TabsContent>
            </CustomErrorBoundary>

            {/* NEW: Stakeholder Dynamics Tab */}
            {showStakeholderDynamics && (
              <CustomErrorBoundary
                fallback={
                  <div className="p-4 border border-red-300 bg-red-50 rounded-md mt-6">
                    <h3 className="text-lg font-semibold text-red-700">Error in Stakeholder Dynamics Visualization</h3>
                    <p className="text-red-600">There was an error rendering the stakeholder dynamics visualization.</p>
                  </div>
                }
              >
                <TabsContent value="stakeholder-dynamics" className="mt-6">
                  {stakeholderIntelligence ? (
                    <StakeholderDynamicsDisplay
                      stakeholderIntelligence={stakeholderIntelligence}
                      analysisData={analysis}
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No stakeholder intelligence data available.
                    </div>
                  )}
                </TabsContent>
              </CustomErrorBoundary>
            )}

          </Tabs>
        )}

        {/* Debug panel - visible in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 border border-blue-200 rounded-md bg-blue-50">
            <h3 className="font-medium mb-2">Stakeholder Intelligence Debug</h3>
            <div className="space-y-2">
              <p><strong>Analysis Keys:</strong> {analysis ? Object.keys(analysis).join(', ') : 'No analysis'}</p>
              <p><strong>Has stakeholder_intelligence:</strong> {!!stakeholderIntelligence ? 'Yes' : 'No'}</p>
              <p><strong>Is Multi-Stakeholder:</strong> {isMultiStakeholder ? 'Yes' : 'No'}</p>
              <p><strong>Stakeholder Count:</strong> {stakeholderCount}</p>
              <p><strong>Data Source:</strong> {analysis?.stakeholder_intelligence ? 'Dedicated Column' : analysis?.results?.stakeholder_intelligence ? 'Nested in Results' : 'None'}</p>

              {stakeholderIntelligence && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">Stakeholder Intelligence Data</summary>
                  <pre className="text-xs p-2 bg-white rounded mt-2 overflow-auto max-h-64">
                    {JSON.stringify(stakeholderIntelligence, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Admin debug panel - only visible to admin users */}
        {process.env.NODE_ENV === 'development' && user?.primaryEmailAddress?.emailAddress === 'vitalijs@axwise.de' && (
          <div className="mt-8 p-4 border border-gray-200 rounded-md bg-gray-50">
            <h3 className="font-medium mb-2">Debug Information (Admin Only)</h3>
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
              <p><strong>Server Data:</strong> {serverAnalysisData ? 'Yes' : 'No'}</p>
              <p><strong>User Email:</strong> {user?.primaryEmailAddress?.emailAddress || 'None'}</p>

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
