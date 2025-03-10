import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// IMPORTANT: Mock setup must be done before importing the component being tested

// Mock all dependencies first with inline functions
vi.mock('../../../lib/apiClient', () => ({
  apiClient: {
    uploadData: vi.fn().mockResolvedValue({
      data_id: 123,
      message: 'File uploaded successfully',
      filename: 'interview.json',
      upload_date: '2023-10-15T14:30:00Z',
      status: 'success'
    }),
    analyzeData: vi.fn().mockResolvedValue({
      result_id: 456,
      message: 'Analysis started successfully',
      status: 'started'
    }),
    getAnalysisById: vi.fn().mockResolvedValue({
      id: 'analysis-456',
      status: 'completed',
      themes: [
        { id: 1, name: 'Theme 1', frequency: 0.5 },
        { id: 2, name: 'Theme 2', frequency: 0.3 }
      ],
      patterns: [
        { id: 1, description: 'Pattern 1', frequency: 0.4 },
        { id: 2, description: 'Pattern 2', frequency: 0.2 }
      ],
      sentiment: {
        overview: { positive: 0.45, neutral: 0.3, negative: 0.25 }
      }
    }),
    getProcessingStatus: vi.fn().mockResolvedValue({
      id: 'analysis-456',
      status: 'completed',
      progress: 1.0
    }),
    listAnalyses: vi.fn(),
    setAuthToken: vi.fn()
  }
}));

vi.mock('../../../components/FileUpload', () => ({
  FileUpload: ({ onUploadComplete }: { onUploadComplete: (id: number) => void }) => (
    <div data-testid="file-upload">
      <button 
        data-testid="mock-upload-button" 
        onClick={() => onUploadComplete(123)}
      >
        Upload File
      </button>
    </div>
  )
}));

vi.mock('../../../components/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>
}));

vi.mock('../../../components/unified-visualization', () => ({
  default: ({ data }: { data: Record<string, any> }) => (
    <div data-testid="visualization">
      <div data-testid="themes-count">{data?.themes?.length || 0} Themes</div>
      <div data-testid="patterns-count">{data?.patterns?.length || 0} Patterns</div>
      <div data-testid="sentiment-score">Sentiment: {data?.sentiment?.overview?.positive || 0}</div>
    </div>
  )
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({ id: undefined }),
}));

vi.mock('../../../components/ui/toast-provider', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useToast: () => ({
    toast: {
      success: vi.fn(),
      error: vi.fn()
    }
  })
}));

// NOW import the component under test (after all mocks are setup)
import Dashboard from '../page';

describe('Dashboard Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Get references to the mocked functions
    const { apiClient } = require('../../../lib/apiClient');
    
    // Reset mock implementations if needed
    apiClient.getProcessingStatus
      .mockResolvedValueOnce({ 
        id: 'analysis-456', 
        status: 'processing', 
        progress: 0.5 
      })
      .mockResolvedValue({ 
        id: 'analysis-456', 
        status: 'completed', 
        progress: 1.0 
      });
  });

  it('renders the initial upload state correctly', () => {
    render(<Dashboard />);
    
    // Check for file upload component
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    expect(screen.getByText('Upload File')).toBeInTheDocument();
  });

  it('completes the full analysis workflow', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Upload a file
    await user.click(screen.getByTestId('mock-upload-button'));
    
    // Verify analyze button appears
    const analyzeButton = screen.getByRole('button', { name: /analyze/i });
    expect(analyzeButton).toBeInTheDocument();
    
    // Step 2: Initiate analysis
    await user.click(analyzeButton);
    
    // Step 3: Should show loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    
    // Step 4: Eventually should show results
    await waitFor(() => {
      expect(screen.getByTestId('visualization')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    expect(screen.getByTestId('themes-count')).toHaveTextContent('2 Themes');
    expect(screen.getByTestId('patterns-count')).toHaveTextContent('2 Patterns');
    expect(screen.getByTestId('sentiment-score')).toHaveTextContent('Sentiment: 0.45');
  });
}); 