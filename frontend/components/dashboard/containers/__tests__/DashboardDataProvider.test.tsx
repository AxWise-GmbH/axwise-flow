'use client';

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardDataProvider, DashboardDataContext } from '../DashboardDataProvider';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';
import { useAnalysisStore, useCurrentDashboardData } from '@/store/useAnalysisStore';
import { apiClient } from '@/lib/apiClient';
import { vi } from 'vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn()
}));

// Mock the toast provider
vi.mock('@/components/providers/toast-provider', () => ({
  useToast: vi.fn()
}));

// Mock the analysis store
vi.mock('@/store/useAnalysisStore', () => ({
  useAnalysisStore: vi.fn(),
  useCurrentDashboardData: vi.fn()
}));

// Mock the API client
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    setAuthToken: vi.fn()
  }
}));

describe('DashboardDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    (useSearchParams as any).mockReturnValue(new URLSearchParams());
    (useToast as any).mockReturnValue({ showToast: vi.fn() });
    (useAnalysisStore as any).mockReturnValue({ fetchAnalysisById: vi.fn().mockResolvedValue(true) });
    (useCurrentDashboardData as any).mockReturnValue({
      dashboardData: null,
      isLoading: false,
      error: null
    });
  });
  
  it('should provide dashboard data context to children', () => {
    // Mock dashboard data
    const mockDashboardData = {
      analysisId: '123',
      status: 'completed',
      createdAt: '2023-01-01',
      fileName: 'test.txt',
      themes: [],
      patterns: [],
      sentiment: [],
      sentimentOverview: { positive: 0, neutral: 0, negative: 0 }
    };
    
    (useCurrentDashboardData as any).mockReturnValue({
      dashboardData: mockDashboardData,
      isLoading: false,
      error: null
    });
    
    // Create test component that consumes the data context
    const TestComponent = () => {
      const { dashboardData } = React.useContext(DashboardDataContext);
      return (
        <div>
          {dashboardData ? (
            <span data-testid="analysis-id">{dashboardData.analysisId}</span>
          ) : (
            <span>No data</span>
          )}
        </div>
      );
    };
    
    render(
      <DashboardDataProvider>
        <TestComponent />
      </DashboardDataProvider>
    );
    
    expect(screen.getByTestId('analysis-id')).toHaveTextContent('123');
  });
  
  it('should fetch analysis when analysisId URL parameter is present and tab is visualize', async () => {
    // Mock URL params
    (useSearchParams as any).mockReturnValue(new URLSearchParams('analysisId=456&tab=visualize'));
    
    // Mock fetch function
    const fetchMock = vi.fn().mockResolvedValue(true);
    (useAnalysisStore as any).mockReturnValue({ fetchAnalysisById: fetchMock });
    
    render(
      <DashboardDataProvider>
        <div>Test Child</div>
      </DashboardDataProvider>
    );
    
    // Should set the auth token
    expect(apiClient.setAuthToken).toHaveBeenCalled();
    
    // Should call fetch with the right ID
    expect(fetchMock).toHaveBeenCalledWith('456', true);
  });
  
  it('should handle fetch errors and show toast', async () => {
    // Mock URL params
    (useSearchParams as any).mockReturnValue(new URLSearchParams('analysisId=789&tab=visualize'));
    
    // Mock error
    const error = new Error('Fetch failed');
    const fetchMock = vi.fn().mockRejectedValue(error);
    (useAnalysisStore as any).mockReturnValue({ fetchAnalysisById: fetchMock });
    
    // Mock toast
    const showToastMock = vi.fn();
    (useToast as any).mockReturnValue({ showToast: showToastMock });
    
    // Spy on console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <DashboardDataProvider>
        <div>Test Child</div>
      </DashboardDataProvider>
    );
    
    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
}); 