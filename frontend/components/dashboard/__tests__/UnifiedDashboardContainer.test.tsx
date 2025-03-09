'use client';

import { render, screen, waitFor } from '@testing-library/react';
import UnifiedDashboardContainer from '../UnifiedDashboardContainer';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { vi } from 'vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    prefetch: vi.fn()
  })),
  useSearchParams: vi.fn()
}));

// Mock the API client
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    setAuthToken: vi.fn(),
    getAnalysisById: vi.fn()
  }
}));

// Mock the DashboardTabs component
vi.mock('../DashboardTabs', () => ({
  default: ({ currentAnalysis }: { currentAnalysis: any }) => (
    <div data-testid="dashboard-tabs">
      {currentAnalysis ? `Analysis ID: ${currentAnalysis.result_id}` : 'No analysis'}
    </div>
  )
}));

describe('UnifiedDashboardContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSearchParams as any).mockReturnValue(new URLSearchParams());
  });
  
  it('renders dashboard tabs without analysis by default', () => {
    render(<UnifiedDashboardContainer />);
    
    expect(screen.getByTestId('dashboard-tabs')).toBeInTheDocument();
    expect(screen.getByText('No analysis')).toBeInTheDocument();
  });
  
  it('fetches analysis when analysisId URL parameter is present', async () => {
    // Mock URL params with analysis ID
    (useSearchParams as any).mockReturnValue(new URLSearchParams('analysisId=123'));
    
    // Mock API response
    const mockAnalysis = {
      result_id: '123',
      status: 'completed',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      themes: [],
      patterns: []
    };
    (apiClient.getAnalysisById as any).mockResolvedValue(mockAnalysis);
    
    render(<UnifiedDashboardContainer />);
    
    // Verify API was called with correct ID
    expect(apiClient.getAnalysisById).toHaveBeenCalledWith('123');
    
    // Wait for analysis to be loaded
    await waitFor(() => {
      expect(screen.getByText('Analysis ID: 123')).toBeInTheDocument();
    });
  });
  
  it('handles API errors gracefully', async () => {
    // Mock URL params with analysis ID
    (useSearchParams as any).mockReturnValue(new URLSearchParams('analysisId=456'));
    
    // Mock API error
    (apiClient.getAnalysisById as any).mockRejectedValue(new Error('API Error'));
    
    // Spy on console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(<UnifiedDashboardContainer />);
    
    // Verify API was called
    expect(apiClient.getAnalysisById).toHaveBeenCalledWith('456');
    
    // Should still render tabs without analysis
    await waitFor(() => {
      expect(screen.getByText('No analysis')).toBeInTheDocument();
    });
    
    // Should log the error
    expect(console.error).toHaveBeenCalled();
  });
  
  it('sets auth token before making API requests', async () => {
    // Mock URL params with analysis ID
    (useSearchParams as any).mockReturnValue(new URLSearchParams('analysisId=789'));
    
    // Mock API response
    (apiClient.getAnalysisById as any).mockResolvedValue({
      result_id: '789',
      status: 'completed'
    });
    
    render(<UnifiedDashboardContainer />);
    
    // Verify auth token was set
    expect(apiClient.setAuthToken).toHaveBeenCalled();
    
    // Verify API was called
    expect(apiClient.getAnalysisById).toHaveBeenCalledWith('789');
  });
});
