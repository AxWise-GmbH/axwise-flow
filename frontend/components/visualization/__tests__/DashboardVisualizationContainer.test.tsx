import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardVisualizationContainer, { useVisualizationContext } from '../DashboardVisualizationContainer';

// Use a separate import to avoid the casting issues
import { useDashboardStore, useCurrentAnalysis, useVisualizationTab } from '@/store/useDashboardStore.refactored';

// Mock the modules, not the imports
jest.mock('@/store/useDashboardStore.refactored', () => ({
  __esModule: true,
  useDashboardStore: jest.fn(),
  useCurrentAnalysis: jest.fn(),
  useVisualizationTab: jest.fn(),
}));

// Get the mocked functions for test use
const mockedUseDashboardStore = useDashboardStore as jest.MockedFunction<typeof useDashboardStore>;
const mockedUseCurrentAnalysis = useCurrentAnalysis as jest.MockedFunction<typeof useCurrentAnalysis>;
const mockedUseVisualizationTab = useVisualizationTab as jest.MockedFunction<typeof useVisualizationTab>;

// Simple test component that consumes the context
function TestConsumer() {
  const { analysis, isLoading, activeTab } = useVisualizationContext();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!analysis) {
    return <div>No analysis available</div>;
  }
  
  return (
    <div>
      <h1>{analysis.fileName}</h1>
      <p>Active tab: {activeTab}</p>
    </div>
  );
}

describe('DashboardVisualizationContainer', () => {
  beforeEach(() => {
    // Reset mock implementations
    jest.clearAllMocks();
  });
  
  it('shows loading state when data is loading', () => {
    // Mock loading state
    mockedUseCurrentAnalysis.mockReturnValue({
      analysis: null,
      isLoading: true,
      error: null,
    });
    
    mockedUseVisualizationTab.mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Set up the mock for useDashboardStore
    const mockFetchAnalysis = jest.fn();
    mockedUseDashboardStore.mockReturnValue({ fetchAnalysisById: mockFetchAnalysis } as any);
    
    render(
      <DashboardVisualizationContainer>
        <TestConsumer />
      </DashboardVisualizationContainer>
    );
    
    expect(screen.getByText('Loading analysis...')).toBeInTheDocument();
  });
  
  it('shows error message when there is an error', () => {
    // Mock error state
    mockedUseCurrentAnalysis.mockReturnValue({
      analysis: null,
      isLoading: false,
      error: { 
        message: 'Failed to load data',
        timestamp: Date.now() 
      },
    });
    
    mockedUseVisualizationTab.mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Set up the mock for useDashboardStore
    const mockFetchAnalysis = jest.fn();
    mockedUseDashboardStore.mockReturnValue({ fetchAnalysisById: mockFetchAnalysis } as any);
    
    render(
      <DashboardVisualizationContainer>
        <TestConsumer />
      </DashboardVisualizationContainer>
    );
    
    expect(screen.getByText('Error Loading Analysis')).toBeInTheDocument();
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });
  
  it('shows no analysis message when analysis is null', () => {
    // Mock empty state
    mockedUseCurrentAnalysis.mockReturnValue({
      analysis: null,
      isLoading: false,
      error: null,
    });
    
    mockedUseVisualizationTab.mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Set up the mock for useDashboardStore
    const mockFetchAnalysis = jest.fn();
    mockedUseDashboardStore.mockReturnValue({ fetchAnalysisById: mockFetchAnalysis } as any);
    
    render(
      <DashboardVisualizationContainer>
        <TestConsumer />
      </DashboardVisualizationContainer>
    );
    
    expect(screen.getByText('No Analysis Selected')).toBeInTheDocument();
  });
  
  it('renders children and provides context when analysis is available', () => {
    const mockAnalysis = {
      id: '123',
      fileName: 'test-file.txt',
      createdAt: '2023-01-01T00:00:00.000Z',
      status: 'completed' as const,
      themes: [],
      patterns: [],
      sentiment: [],
      sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
    };
    
    // Mock loaded state
    mockedUseCurrentAnalysis.mockReturnValue({
      analysis: mockAnalysis,
      isLoading: false,
      error: null,
    });
    
    mockedUseVisualizationTab.mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Set up the mock for useDashboardStore
    const mockFetchAnalysis = jest.fn();
    mockedUseDashboardStore.mockReturnValue({ fetchAnalysisById: mockFetchAnalysis } as any);
    
    render(
      <DashboardVisualizationContainer>
        <TestConsumer />
      </DashboardVisualizationContainer>
    );
    
    expect(screen.getByText('test-file.txt')).toBeInTheDocument();
    expect(screen.getByText('Active tab: themes')).toBeInTheDocument();
  });
  
  it('fetches analysis when analysisId is provided', () => {
    const mockFetchAnalysis = jest.fn();
    
    // Mock loaded state
    mockedUseCurrentAnalysis.mockReturnValue({
      analysis: null,
      isLoading: true,
      error: null,
    });
    
    mockedUseVisualizationTab.mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Set up the mock for useDashboardStore
    mockedUseDashboardStore.mockReturnValue({ fetchAnalysisById: mockFetchAnalysis } as any);
    
    render(
      <DashboardVisualizationContainer analysisId="123">
        <TestConsumer />
      </DashboardVisualizationContainer>
    );
    
    expect(mockFetchAnalysis).toHaveBeenCalledWith('123', true);
  });
});
