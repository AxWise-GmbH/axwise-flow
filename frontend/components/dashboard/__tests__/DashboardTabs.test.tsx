'use client';

import { render, screen, fireEvent } from '@testing-library/react';
import DashboardTabs from '../DashboardTabs';
import { useRouter, useSearchParams } from 'next/navigation';
import { DetailedAnalysisResult } from '@/types/api';
import { vi } from 'vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}));

// Mock sample analysis data
const mockAnalysis: DetailedAnalysisResult = {
  result_id: '123',
  status: 'completed',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  metadata: {
    filename: 'test-interview.txt',
    filesize: 1024,
    file_type: 'text',
    language: 'en'
  },
  themes: [],
  patterns: [],
  summary: 'Test summary',
  sentiments: [],
  user_personas: []
};

describe('DashboardTabs', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: vi.fn(),
      prefetch: vi.fn()
    });
    (useSearchParams as any).mockReturnValue(new URLSearchParams('tab=upload'));
  });

  it('renders all tabs correctly', () => {
    render(<DashboardTabs currentAnalysis={null} />);
    
    // Check that all main tabs are rendered
    expect(screen.getByRole('tab', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /visualization/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /documentation/i })).toBeInTheDocument();
  });

  it('sets the active tab based on URL parameter', () => {
    render(<DashboardTabs currentAnalysis={null} />);
    
    // The 'upload' tab should be active based on our mock URL params
    const uploadTab = screen.getByRole('tab', { name: /upload/i });
    expect(uploadTab).toHaveAttribute('data-state', 'active');
  });

  it('changes tab when clicked', () => {
    const pushMock = vi.fn();
    (useRouter as any).mockReturnValue({
      push: pushMock,
      prefetch: vi.fn()
    });

    render(<DashboardTabs currentAnalysis={null} />);
    
    // Click the Visualization tab
    fireEvent.click(screen.getByRole('tab', { name: /visualization/i }));
    
    // Check that the router was called to update the URL
    expect(pushMock).toHaveBeenCalledWith('?tab=visualization');
  });

  it('shows visualization tab content when analysis is present', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('tab=visualization'));
    
    render(<DashboardTabs currentAnalysis={mockAnalysis} />);
    
    // We should see the visualization content when tab is 'visualization' and analysis exists
    expect(screen.getByText(/visualization options/i, { exact: false })).toBeInTheDocument();
  });

  it('shows no results view when visualization tab is active but no analysis is present', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('tab=visualization'));
    
    render(<DashboardTabs currentAnalysis={null} />);
    
    // Should show the NoResultsView component
    expect(screen.getByText(/no analysis results/i, { exact: false })).toBeInTheDocument();
  });
});
