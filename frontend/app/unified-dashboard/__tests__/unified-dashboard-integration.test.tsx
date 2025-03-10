import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../page';

// Define mock functions for API client
const mockUploadData = vi.fn();
const mockAnalyzeData = vi.fn();
const mockGetAnalysisById = vi.fn();
const mockGetProcessingStatus = vi.fn();
const mockListAnalyses = vi.fn();
const mockSetAuthToken = vi.fn();

// Mock API client - using direct path instead of aliases
vi.mock('../../../lib/apiClient', () => ({
  apiClient: {
    uploadData: mockUploadData,
    analyzeData: mockAnalyzeData,
    getAnalysisById: mockGetAnalysisById,
    getProcessingStatus: mockGetProcessingStatus,
    listAnalyses: mockListAnalyses,
    setAuthToken: mockSetAuthToken
  }
}));

// Mock other dependencies - using direct paths
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
  default: ({ data }: { data: any }) => (
    <div data-testid="visualization">
      <div data-testid="themes-count">{data?.themes?.length || 0} Themes</div>
      <div data-testid="patterns-count">{data?.patterns?.length || 0} Patterns</div>
      <div data-testid="sentiment-score">Sentiment: {data?.sentiment?.overview?.positive || 0}</div>
    </div>
  )
}));

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({ id: undefined }),
}));

// Toast provider mock
vi.mock('../../../components/ui/toast-provider', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

// Mock API responses
const mockUploadResponse = {
  data_id: 123,
  message: 'File uploaded successfully',
  filename: 'interview.json',
  upload_date: '2023-10-15T14:30:00Z',
  status: 'success'
};

const mockAnalysisResponse = {
  result_id: 456,
  message: 'Analysis started successfully',
  status: 'started'
};

// Complete mock analysis result with all components
const mockAnalysisResult = {
  id: 'analysis-456',
  status: 'completed',
  createdAt: '2023-10-15T15:30:00Z',
  fileName: 'interview.json',
  fileSize: 2048,
  themes: [
    { 
      id: 1, 
      name: 'User Experience', 
      frequency: 0.35, 
      keywords: ['interface', 'design', 'navigation'],
      sentiment: 0.2,
      examples: ['I found the interface intuitive', 'The navigation is clear']
    },
    { 
      id: 2, 
      name: 'Performance Issues', 
      frequency: 0.25, 
      keywords: ['slow', 'loading', 'crash'],
      sentiment: -0.7,
      examples: ['The app is too slow', 'It crashes when I try to save']
    }
  ],
  patterns: [
    {
      id: 1,
      description: 'Users frequently mention navigation issues',
      sentiment: -0.3,
      frequency: 0.2,
      examples: ['Hard to find settings', 'Menu structure is confusing']
    },
    {
      id: 2,
      description: 'Positive feedback about new features',
      sentiment: 0.8,
      frequency: 0.15,
      examples: ['Love the new dashboard', 'The export feature is very useful']
    }
  ],
  sentiment: {
    overall: 0.1,
    overview: {
      positive: 0.45,
      neutral: 0.30,
      negative: 0.25
    },
    statements: {
      positive: ['Love the new dashboard', 'The export feature is very useful'],
      neutral: ['The application has many features', 'I use it daily'],
      negative: ['The app is too slow', 'It crashes when I try to save']
    },
    data: [
      { timestamp: '2023-10-15T14:30:00Z', score: 0.3 },
      { timestamp: '2023-10-15T14:35:00Z', score: -0.2 },
      { timestamp: '2023-10-15T14:40:00Z', score: 0.5 }
    ]
  },
  personas: [
    {
      id: 1,
      name: 'Technical User',
      characteristics: ['tech-savvy', 'detail-oriented', 'efficiency-focused'],
      needs: ['fast performance', 'advanced features', 'customization options'],
      frustrations: ['slow loading times', 'limited export options'],
      quotes: ['I need more keyboard shortcuts', 'The advanced settings are useful']
    },
    {
      id: 2,
      name: 'Casual User',
      characteristics: ['occasional use', 'simplicity-focused', 'visual learner'],
      needs: ['intuitive interface', 'guided workflows', 'clear documentation'],
      frustrations: ['complex terminology', 'too many options'],
      quotes: ['I just want it to work', 'The tutorial was helpful']
    }
  ]
};

// Mock processing status responses
const mockProcessingStatus = {
  id: 'analysis-456',
  status: 'processing',
  progress: 0.6,
  message: 'Processing interview data...',
  started_at: '2023-10-15T14:35:00Z'
};

const mockCompletedStatus = {
  id: 'analysis-456',
  status: 'completed',
  progress: 1.0,
  message: 'Analysis complete',
  started_at: '2023-10-15T14:35:00Z',
  completed_at: '2023-10-15T14:40:00Z'
};

// Mock analyses list
const mockAnalysesList = [
  {
    id: 'analysis-456',
    status: 'completed',
    createdAt: '2023-10-15T15:30:00Z',
    fileName: 'interview.json',
    fileSize: 2048
  },
  {
    id: 'analysis-123',
    status: 'processing',
    createdAt: '2023-10-15T15:20:00Z',
    fileName: 'survey.json',
    fileSize: 1536
  }
];

describe('Unified Dashboard - Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Default mock implementations
    mockUploadData.mockResolvedValue(mockUploadResponse);
    mockAnalyzeData.mockResolvedValue(mockAnalysisResponse);
    mockGetAnalysisById.mockResolvedValue(mockAnalysisResult);
    mockGetProcessingStatus.mockResolvedValue(mockCompletedStatus);
    mockListAnalyses.mockResolvedValue(mockAnalysesList);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the initial upload state correctly', async () => {
    render(<Dashboard />);
    
    // Check for file upload component visibility
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
    expect(screen.getByText(/Upload File/i)).toBeInTheDocument();
  });

  it('completes the full analysis workflow from upload to visualization', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Upload a file
    await user.click(screen.getByTestId('mock-upload-button'));
    
    // Verify upload API was called
    expect(mockUploadData).toHaveBeenCalledTimes(0); // Not called directly since we mocked the component
    
    // Verify that the "Analyze" button appears
    const analyzeButton = screen.getByRole('button', { name: /analyze/i });
    expect(analyzeButton).toBeInTheDocument();
    
    // Step 2: Initiate analysis
    await user.click(analyzeButton);
    expect(mockAnalyzeData).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeData).toHaveBeenCalledWith(123);
    
    // Step 3: Should show loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    
    // Step 4: Check for processing status polling
    await waitFor(() => {
      expect(mockGetProcessingStatus).toHaveBeenCalled();
    });
    
    // Step 5: Once analysis is complete, verify results are displayed
    await waitFor(() => {
      expect(screen.getByTestId('visualization')).toBeInTheDocument();
      expect(screen.getByTestId('themes-count')).toHaveTextContent('2 Themes');
      expect(screen.getByTestId('patterns-count')).toHaveTextContent('2 Patterns');
      expect(screen.getByTestId('sentiment-score')).toHaveTextContent('Sentiment: 0.45');
    });
  });

  it('handles API errors during upload gracefully', async () => {
    // Mock upload to fail
    mockUploadData.mockRejectedValue(new Error('Upload failed'));
    
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Trigger upload
    await user.click(screen.getByTestId('mock-upload-button'));
    
    // Should still be on upload screen (no analysis UI)
    expect(screen.queryByRole('button', { name: /analyze/i })).not.toBeInTheDocument();
  });

  it('handles API errors during analysis gracefully', async () => {
    // Setup: First allow upload to succeed
    mockUploadData.mockResolvedValue(mockUploadResponse);
    
    // But make analysis fail
    mockAnalyzeData.mockRejectedValue(new Error('Analysis failed'));
    
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Upload a file
    await user.click(screen.getByTestId('mock-upload-button'));
    
    // Step 2: Try to analyze
    const analyzeButton = screen.getByRole('button', { name: /analyze/i });
    await user.click(analyzeButton);
    
    // Verify analysis was attempted
    expect(mockAnalyzeData).toHaveBeenCalledTimes(1);
    
    // Should not proceed to visualization
    await waitFor(() => {
      expect(screen.queryByTestId('visualization')).not.toBeInTheDocument();
    });
    
    // Should still have analyze button visible (to retry)
    expect(screen.getByRole('button', { name: /analyze/i })).toBeInTheDocument();
  });

  it('handles loading state and polling for analysis status', async () => {
    // First return processing, then completed
    mockGetProcessingStatus
      .mockResolvedValueOnce(mockProcessingStatus)
      .mockResolvedValueOnce(mockProcessingStatus)
      .mockResolvedValue(mockCompletedStatus);
    
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Upload a file
    await user.click(screen.getByTestId('mock-upload-button'));
    
    // Step 2: Initiate analysis
    await user.click(screen.getByRole('button', { name: /analyze/i }));
    
    // Verify loading spinner is visible
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    
    // Wait for progress to be shown
    await waitFor(() => {
      expect(mockGetProcessingStatus).toHaveBeenCalledTimes(1);
    });
    
    // After multiple status checks, it should eventually show results
    await waitFor(() => {
      expect(screen.getByTestId('visualization')).toBeInTheDocument();
    }, { timeout: 5000 });
    
    // Verify number of polling attempts
    expect(mockGetProcessingStatus).toHaveBeenCalledTimes(3);
  });
}); 