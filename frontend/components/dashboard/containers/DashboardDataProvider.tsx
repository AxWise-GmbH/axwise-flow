'use client';

import { useState, useEffect, createContext, ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { useToast } from '@/components/providers/toast-provider';
import { useAnalysisStore, useCurrentDashboardData } from '@/store/useAnalysisStore';
import { DashboardData } from '@/types/api';

interface DataContextType {
  dashboardData: DashboardData | null;
  isLoading: boolean;
  error: string | null;
}

export const DashboardDataContext = createContext<DataContextType>({
  dashboardData: null,
  isLoading: false,
  error: null
});

interface DashboardDataProviderProps {
  children: ReactNode;
}

export const DashboardDataProvider = ({ children }: DashboardDataProviderProps) => {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { fetchAnalysisById } = useAnalysisStore();
  const { dashboardData, isLoading, error: dashboardError } = useCurrentDashboardData();
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('testuser123'); // To be replaced with real auth
  
  // Handle loading analysis results from URL
  useEffect(() => {
    const analysisId = searchParams.get('analysisId');
    const tab = searchParams.get('tab');
    
    if (analysisId && tab === 'visualize') {
      const fetchAnalysis = async () => {
        try {
          setError(null);
          apiClient.setAuthToken(authToken);
          const result = await fetchAnalysisById(analysisId, true);
          if (!result) {
            throw new Error('Failed to fetch analysis');
          }
        } catch (err) {
          console.error('Error fetching analysis:', err);
          setError(`Failed to load analysis: ${err instanceof Error ? err.message : String(err)}`);
          showToast(`Failed to load analysis: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
        }
      };
      
      fetchAnalysis();
    }
  }, [searchParams, showToast, authToken, fetchAnalysisById]);
  
  // Set error from dashboard if available
  useEffect(() => {
    if (dashboardError) {
      setError(dashboardError.message);
    }
  }, [dashboardError]);
  
  return (
    <DashboardDataContext.Provider value={{ 
      dashboardData, 
      isLoading, 
      error 
    }}>
      {children}
    </DashboardDataContext.Provider>
  );
}; 