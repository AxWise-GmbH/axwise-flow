'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { DashboardTabsContainer } from '../DashboardTabsContainer';
import { DashboardDataContext } from '../DashboardDataProvider';
import { useRouter } from 'next/navigation';
import { vi } from 'vitest';

// Mock the DashboardTabs component
vi.mock('../../DashboardTabs', () => ({
  default: ({ dashboardData }: { dashboardData: any }) => (
    <div data-testid="dashboard-tabs">
      {dashboardData ? `Analysis ID: ${dashboardData.analysisId}` : 'No analysis'}
    </div>
  )
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}));

describe('DashboardTabsContainer', () => {
  const renderWithContext = (contextValue: any) => {
    return render(
      <DashboardDataContext.Provider value={contextValue}>
        <DashboardTabsContainer />
      </DashboardDataContext.Provider>
    );
  };
  
  it('should render dashboard tabs with data', () => {
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
    
    renderWithContext({
      dashboardData: mockDashboardData,
      isLoading: false,
      error: null
    });
    
    expect(screen.getByTestId('dashboard-tabs')).toBeInTheDocument();
    expect(screen.getByText('Analysis ID: 123')).toBeInTheDocument();
  });
  
  it('should render dashboard tabs without data when data is null', () => {
    renderWithContext({
      dashboardData: null,
      isLoading: false,
      error: null
    });
    
    expect(screen.getByTestId('dashboard-tabs')).toBeInTheDocument();
    expect(screen.getByText('No analysis')).toBeInTheDocument();
  });
  
  it('should render loading indicator when isLoading is true', () => {
    renderWithContext({
      dashboardData: null,
      isLoading: true,
      error: null
    });
    
    expect(screen.getByText('Loading analysis data...')).toBeInTheDocument();
  });
  
  it('should render error view when error is present', () => {
    renderWithContext({
      dashboardData: null,
      isLoading: false,
      error: 'Test error message'
    });
    
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
    expect(screen.getByText('Go Back')).toBeInTheDocument();
  });
}); 