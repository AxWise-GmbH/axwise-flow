/**
 * DashboardVisualizationContainer Component
 * 
 * This component serves as a container for visualization components and handles:
 * - Data fetching and state management
 * - Error handling
 * - Loading states
 * - Context provision for child components
 * 
 * It implements the container pattern, separating the data handling logic from
 * the presentation components.
 */

'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { 
  useDashboardStore, 
  useCurrentAnalysis,
  useVisualizationTab
} from '@/store/useDashboardStore.refactored';
import { DetailedAnalysisResult } from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import ApiErrorBoundary from '../error/ApiErrorBoundary';
import { formatErrorMessage } from '@/lib/errorUtils';

// Create a context for visualization data
interface VisualizationContextType {
  analysis: DetailedAnalysisResult | null;
  isLoading: boolean;
  activeTab: string;
}

const VisualizationContext = createContext<VisualizationContextType>({
  analysis: null,
  isLoading: false,
  activeTab: 'themes',
});

// Hook to consume the visualization context
export const useVisualizationContext = () => useContext(VisualizationContext);

interface DashboardVisualizationContainerProps {
  analysisId?: string;
  children: React.ReactNode;
}

/**
 * Container component for visualization tabs
 * Handles data fetching and provides context
 */
export default function DashboardVisualizationContainer({ 
  analysisId, 
  children 
}: DashboardVisualizationContainerProps) {
  // Get current analysis and tab state
  const { analysis, isLoading, error } = useCurrentAnalysis();
  const { tab: activeTab } = useVisualizationTab();
  
  // Get fetch action from store
  const fetchAnalysisById = useDashboardStore(state => state.fetchAnalysisById);
  
  // If an analysisId is provided, fetch the analysis when the component mounts
  useEffect(() => {
    if (analysisId && (!analysis || analysis.id !== analysisId)) {
      fetchAnalysisById(analysisId, true); // Fetch with polling
    }
  }, [analysisId, analysis, fetchAnalysisById]);
  
  // Create context value
  const contextValue = useMemo(() => ({
    analysis,
    isLoading,
    activeTab,
  }), [analysis, isLoading, activeTab]);
  
  // If still loading, show spinner
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading analysis...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // If there's an error, display it
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Analysis</AlertTitle>
        <AlertDescription>{formatErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }
  
  // If no analysis is loaded, show message
  if (!analysis) {
    return (
      <Card className="w-full">
        <CardContent className="py-12">
          <div className="text-center">
            <h3 className="text-lg font-medium">No Analysis Selected</h3>
            <p className="text-muted-foreground mt-2">
              Please upload a file and run an analysis, or select an analysis from your history.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Render children within context provider and error boundary
  return (
    <ApiErrorBoundary context="Visualization">
      <VisualizationContext.Provider value={contextValue}>
        {children}
      </VisualizationContext.Provider>
    </ApiErrorBoundary>
  );
}
