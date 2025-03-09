'use client';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HistoryTab from '../HistoryTab';
import { apiClient } from '@/lib/apiClient';
import { useRouter } from 'next/navigation';
import { vi } from 'vitest';

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
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams('')
}));

// Mock toast provider
vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({
    showToast: vi.fn()
  })
}));

describe('HistoryTab', () => {
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
    render(<HistoryTab />);
    
    expect(screen.getByText(/loading your analysis history/i)).toBeInTheDocument();
  });

  it('displays analyses after loading', async () => {
    render(<HistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(screen.queryByText(/loading your analysis history/i)).not.toBeInTheDocument();
    });
    
    // Check that analyses are displayed
    expect(screen.getByText('interview1.txt')).toBeInTheDocument();
    expect(screen.getByText('interview2.txt')).toBeInTheDocument();
  });

  it('sorts analyses when sort option is changed', async () => {
    render(<HistoryTab />);
    
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
    const pushMock = vi.fn();
    (useRouter as any).mockReturnValue({
      push: pushMock,
      refresh: vi.fn()
    });
    
    render(<HistoryTab />);
    
    // Wait for analyses to load
    await waitFor(() => {
      expect(screen.queryByText(/loading your analysis history/i)).not.toBeInTheDocument();
    });
    
    // Find and click an analysis
    const analysisCard = screen.getByText('interview1.txt').closest('div[role="button"]');
    fireEvent.click(analysisCard!);
    
    // Should navigate to the analysis
    expect(pushMock).toHaveBeenCalledWith('?tab=visualization&analysisId=123');
  });

  it('confirms and deletes an analysis', async () => {
    // Mock the deleteAnalysis method
    mockedApiClient.deleteAnalysis.mockResolvedValue({ success: true });
    
    render(<HistoryTab />);
    
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
