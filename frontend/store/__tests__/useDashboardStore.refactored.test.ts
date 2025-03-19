import { renderHook, act } from '@testing-library/react';
import { useDashboardStore, useCurrentAnalysis, useVisualizationTab } from '../useDashboardStore.refactored';

// Mock the API module
jest.mock('@/lib/api', () => ({
  fetchAnalysisById: jest.fn(),
}));

// Import the mocked API for test usage
const mockApi = jest.requireMock('@/lib/api');

describe('useDashboardStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset store state between tests
    act(() => {
      useDashboardStore.setState({
        activeTab: 'upload',
        visualizationTab: 'themes',
        currentAnalysis: null,
        analysisHistory: [],
        priorityInsights: null,
        isLoading: false,
        isPriorityLoading: false,
        error: null,
        priorityError: null,
        _version: 1,
      });
    });
  });
  
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useDashboardStore());
    
    expect(result.current.activeTab).toBe('upload');
    expect(result.current.visualizationTab).toBe('themes');
    expect(result.current.currentAnalysis).toBeNull();
    expect(result.current.analysisHistory).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current._version).toBe(1);
  });
  
  it('should update active tab', () => {
    const { result } = renderHook(() => useDashboardStore());
    
    act(() => {
      result.current.setActiveTab('visualize');
    });
    
    expect(result.current.activeTab).toBe('visualize');
  });
  
  it('should update visualization tab', () => {
    const { result } = renderHook(() => useDashboardStore());
    
    act(() => {
      result.current.setVisualizationTab('patterns');
    });
    
    expect(result.current.visualizationTab).toBe('patterns');
  });
  
  it('should fetch analysis and update state', async () => {
    const mockAnalysis = {
      id: '123',
      fileName: 'test.txt',
      createdAt: '2023-01-01T00:00:00Z',
      status: 'completed' as const,
      themes: [],
      patterns: [],
      sentiment: [],
      sentimentOverview: {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
    };
    
    // Mock successful API response
    mockApi.fetchAnalysisById.mockResolvedValue(mockAnalysis);
    
    const { result } = renderHook(() => useDashboardStore());
    
    expect(result.current.isLoading).toBe(false);
    
    act(() => {
      result.current.fetchAnalysisById('123');
    });
    
    // Check loading state
    expect(result.current.isLoading).toBe(true);
    
    // Wait for the async action to complete
    await act(async () => {
      await Promise.resolve();
    });
    
    // Check final state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentAnalysis).toEqual(mockAnalysis);
    expect(result.current.analysisHistory).toEqual([mockAnalysis]);
    expect(result.current.error).toBeNull();
    
    // Verify API was called correctly
    expect(mockApi.fetchAnalysisById).toHaveBeenCalledWith('123', undefined);
  });
  
  it('should handle API errors', async () => {
    // Mock API error
    const errorMessage = 'Network error';
    mockApi.fetchAnalysisById.mockRejectedValue(new Error(errorMessage));
    
    const { result } = renderHook(() => useDashboardStore());
    
    act(() => {
      result.current.fetchAnalysisById('123');
    });
    
    // Wait for the async action to complete
    await act(async () => {
      await Promise.resolve();
    });
    
    // Check error state
    expect(result.current.isLoading).toBe(false);
    expect(result.current.currentAnalysis).toBeNull();
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe(errorMessage);
  });
  
  it('should clear current analysis', () => {
    const { result } = renderHook(() => useDashboardStore());
    
    // Set a mock analysis
    act(() => {
      useDashboardStore.setState({
        currentAnalysis: {
          id: '123',
          fileName: 'test.txt',
          createdAt: '2023-01-01T00:00:00Z',
          status: 'completed' as const,
          themes: [],
          patterns: [],
          sentiment: [],
          sentimentOverview: {
            positive: 0,
            neutral: 0,
            negative: 0,
          },
        },
      });
    });
    
    expect(result.current.currentAnalysis).not.toBeNull();
    
    act(() => {
      result.current.clearCurrentAnalysis();
    });
    
    expect(result.current.currentAnalysis).toBeNull();
  });
  
  it('should clear errors', () => {
    const { result } = renderHook(() => useDashboardStore());
    
    // Set mock errors
    act(() => {
      useDashboardStore.setState({
        error: { timestamp: Date.now(), message: 'Test error' },
        priorityError: { timestamp: Date.now(), message: 'Priority test error' },
      });
    });
    
    expect(result.current.error).not.toBeNull();
    expect(result.current.priorityError).not.toBeNull();
    
    act(() => {
      result.current.clearErrors();
    });
    
    expect(result.current.error).toBeNull();
    expect(result.current.priorityError).toBeNull();
  });
});

describe('useCurrentAnalysis hook', () => {
  it('should return current analysis state', () => {
    // Set initial state
    act(() => {
      useDashboardStore.setState({
        currentAnalysis: {
          id: '123',
          fileName: 'test.txt',
          createdAt: '2023-01-01T00:00:00Z',
          status: 'completed' as const,
          themes: [],
          patterns: [],
          sentiment: [],
          sentimentOverview: {
            positive: 0,
            neutral: 0,
            negative: 0,
          },
        },
        isLoading: false,
        error: null,
      });
    });
    
    const { result } = renderHook(() => useCurrentAnalysis());
    
    expect(result.current.analysis).toEqual({
      id: '123',
      fileName: 'test.txt',
      createdAt: '2023-01-01T00:00:00Z',
      status: 'completed',
      themes: [],
      patterns: [],
      sentiment: [],
      sentimentOverview: {
        positive: 0,
        neutral: 0,
        negative: 0,
      },
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useVisualizationTab hook', () => {
  it('should return visualization tab state and setter', () => {
    // Set initial state
    act(() => {
      useDashboardStore.setState({
        visualizationTab: 'patterns',
      });
    });
    
    const { result } = renderHook(() => useVisualizationTab());
    
    expect(result.current.tab).toBe('patterns');
    
    // Call the setter
    act(() => {
      result.current.setTab('sentiment');
    });
    
    // Check the state was updated
    expect(useDashboardStore.getState().visualizationTab).toBe('sentiment');
  });
});
