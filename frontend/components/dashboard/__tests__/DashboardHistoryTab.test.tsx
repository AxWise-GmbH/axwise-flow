'use client';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardHistoryTab from '../DashboardHistoryTab';
import { apiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { vi } from 'vitest';

// Import type for router mock
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';


// Create a proper mock type that includes Vitest's mock functions
type MockApiClient = {
  listAnalyses: ReturnType<typeof vi.fn>;
  deleteAnalysis: ReturnType<typeof vi.fn>;
};

// Mock the API client with additional methods needed for testing
vi.mock('@/lib/apiClient', () => {
  const mockApiClient = {
    listAnalyses: vi.fn(),
    deleteAnalysis: vi.fn()
  };
  return { apiClient: mockApiClient };
});

// Get the mocked API client with proper typing
const mockedApiClient = apiClient as unknown as MockApiClient;

// Mock Next.js navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockReplace = vi.fn(); // Add mock
const mockBack = vi.fn(); // Add mock
const mockForward = vi.fn(); // Add mock
const mockUseRouter = vi.fn((): AppRouterInstance => ({ // Return full AppRouterInstance
  push: mockPush,
  refresh: mockRefresh,
  replace: mockReplace, // Add method
  back: mockBack,       // Add method
  forward: mockForward, // Add method
  prefetch: vi.fn(),    // Add method
}));
const mockUseSearchParams = vi.fn(() => new URLSearchParams(''));
vi.mock('next/navigation', () => ({
  useRouter: mockUseRouter,
  useSearchParams: mockUseSearchParams,
}));

// Mock toast provider
vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({
    showToast: vi.fn()
  })
}));

describe('DashboardHistoryTab', () => {
  const mockAnalyses = [
    {
      result_id: '123',
      status: 'completed',
      created_at: '2023-01-01T00:00:00Z',
      metadata: {
        filename: 'interview1.txt',
        filesize: 1024,
        file_type: 'text'
      }
    },
    {
      result_id: '456',
      status: 'processing',
      created_at: '2023-01-02T00:00:00Z',
      metadata: {
        filename: 'interview2.txt',
        filesize: 2048,
        file_type: 'text'
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiClient.listAnalyses.mockResolvedValue({
      results: mockAnalyses,
      total: 2,
      page: 1,
      limit: 10
    });
  });

  it('renders the history tab with loading state initially', () => {
    render(<DashboardHistoryTab />);
    
    expect(screen.getByText(/loading your analysis history/i)).toBeInTheDocument();
  });

  it('displays analyses after loading', async () => {
    render(<DashboardHistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(screen.queryByText(/loading your analysis history/i)).not.toBeInTheDocument();
    });
    
    // Check that analyses are displayed
    expect(screen.getByText('interview1.txt')).toBeInTheDocument();
    expect(screen.getByText('interview2.txt')).toBeInTheDocument();
  });

  it('sorts analyses when sort option is changed', async () => {
    render(<DashboardHistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(mockedApiClient.listAnalyses).toHaveBeenCalledTimes(1);
    });
    
    // Find and click the sort dropdown
    const sortDropdown = screen.getByRole('combobox', { name: /sort by/i });
    fireEvent.change(sortDropdown, { target: { value: 'status' } });
    
    // Should call API with new sort parameter
    expect(mockedApiClient.listAnalyses).toHaveBeenCalledTimes(2);
    expect(mockedApiClient.listAnalyses).toHaveBeenLastCalledWith(expect.objectContaining({
      sort: 'status'
    }));
  });

  it('navigates to analysis details when an analysis is clicked', async () => {
    // No need to mock router here as it's done globally and correctly typed now
    
    render(<DashboardHistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(screen.queryByText(/loading your analysis history/i)).not.toBeInTheDocument();
    });
    
    // Find and click an analysis
    const analysisCard = screen.getByTestId(`analysis-item-${mockAnalyses[0].result_id}`); // Use testid
    fireEvent.click(analysisCard!);
    
    // Should navigate to the analysis
    expect(mockPush).toHaveBeenCalledWith('?tab=visualization&analysisId=123'); // Use the globally defined mockPush
  });

  it('confirms and deletes an analysis', async () => {
    // Mock the deleteAnalysis method
    mockedApiClient.deleteAnalysis.mockResolvedValue({ success: true });
    
    render(<DashboardHistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(screen.queryByText(/loading your analysis history/i)).not.toBeInTheDocument();
    });
    
    // Find and click delete button on first analysis
    const deleteButtons = screen.getAllByLabelText(/delete analysis/i);
    fireEvent.click(deleteButtons[0]);
    
    // Find and click confirm button in the dialog
    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmButton);
    
    // Check that delete API was called
    await waitFor(() => {
      expect(mockedApiClient.deleteAnalysis).toHaveBeenCalledWith('123');
    });
    
    // Check that list is refreshed
    expect(mockedApiClient.listAnalyses).toHaveBeenCalledTimes(2);
  });
});
