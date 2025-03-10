import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../page';

// Mock API client
const mockUploadData = vi.fn();
const mockAnalyzeData = vi.fn();
const mockGetAnalysisById = vi.fn();
const mockSetAuthToken = vi.fn();
const mockListAnalyses = vi.fn();
const mockGetProcessingStatus = vi.fn();

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
      name: 'Navigation Feedback',
      category: 'User Interface',
      description: 'Users consistently mention navigation elements',
      frequency: 0.3,
      examples: ['The menu is well organized', 'I can find what I need'],
      sentiment: 0.5
    }
  ],
  sentiment: [
    { timestamp: '2023-10-15T15:30:00Z', score: 0.8, text: 'I love the design' },
    { timestamp: '2023-10-15T15:31:00Z', score: -0.6, text: 'But it crashes frequently' }
  ],
  sentimentOverview: {
    positive: 0.45,
    neutral: 0.25,
    negative: 0.3
  },
  sentimentStatements: {
    positive: ['I love the design', 'The interface is intuitive'],
    neutral: ['It has many features', 'Seems complex at first'],
    negative: ['It crashes frequently', 'Too slow to load']
  },
  personas: [
    {
      name: 'Technical User',
      description: 'Experienced user with technical background',
      role_context: {
        value: 'Software development',
        confidence: 0.9,
        evidence: ['Talks about code structure', 'Mentions development tools']
      },
      key_responsibilities: {
        value: 'Building and maintaining applications',
        confidence: 0.8,
        evidence: ['Discusses coding practices', 'Mentions team collaboration']
      },
      tools_used: {
        value: 'IDE, version control, debugging tools',
        confidence: 0.85,
        evidence: ['References VSCode', 'Talks about Git usage']
      },
      collaboration_style: {
        value: 'Collaborative with technical teams',
        confidence: 0.7,
        evidence: ['Mentions code reviews', 'Discusses team decisions']
      },
      analysis_approach: {
        value: 'Systematic problem-solving',
        confidence: 0.8,
        evidence: ['Describes debugging process', 'Methodical analysis of issues']
      },
      pain_points: {
        value: 'Performance issues and unclear documentation',
        confidence: 0.75,
        evidence: ['Frustrated with slow loading', 'Confused by documentation']
      },
      patterns: ['Technical focus', 'Efficiency-driven'],
      confidence: 0.85,
      evidence: ['Technical language throughout', 'Professional context']
    }
  ]
};

// Mock API client
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    uploadData: mockUploadData,
    analyzeData: mockAnalyzeData,
    getAnalysisById: mockGetAnalysisById,
    setAuthToken: mockSetAuthToken,
    listAnalyses: mockListAnalyses,
    getProcessingStatus: mockGetProcessingStatus
  }
}));

// Mock file upload component with real functionality
vi.mock('@/components/FileUpload', () => ({
  FileUpload: ({ onUploadComplete }: { onUploadComplete: (dataId: number) => void }) => {
    return (
      <div data-testid="file-upload">
        <input 
          type="file" 
          data-testid="file-input"
          onChange={() => {
            // Simulate successful upload
            mockUploadData.mockResolvedValueOnce(mockUploadResponse);
            onUploadComplete(mockUploadResponse.data_id);
          }}
        />
        <button data-testid="upload-button">Upload File</button>
      </div>
    );
  }
}));

// Mock other UI components
vi.mock('@/components/loading-spinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner">Loading...</div>
}));

vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}));

vi.mock('@/components/visualization/UnifiedVisualization', () => ({
  __esModule: true,
  default: ({ data }: { data: any }) => (
    <div data-testid="visualization">
      <div data-testid="themes-count">{data?.themes?.length || 0} Themes</div>
      <div data-testid="patterns-count">{data?.patterns?.length || 0} Patterns</div>
      <div data-testid="sentiment-positive">{Math.round(data?.sentimentOverview?.positive * 100) || 0}% Positive</div>
    </div>
  )
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
}));

describe('Unified Dashboard - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    mockUploadData.mockResolvedValue(mockUploadResponse);
    mockAnalyzeData.mockResolvedValue(mockAnalysisResponse);
    mockGetAnalysisById.mockResolvedValue(mockAnalysisResult);
    mockGetProcessingStatus.mockResolvedValue({
      current_stage: 'COMPLETION',
      progress: 1,
      stage_states: {
        FILE_UPLOAD: { status: 'completed', progress: 1 },
        ANALYSIS: { status: 'completed', progress: 1 },
        COMPLETION: { status: 'completed', progress: 1 }
      }
    });
  });

  it('renders the initial upload state', () => {
    render(<Dashboard />);
    
    // Verify initial state shows upload step
    expect(screen.getByText('Step 1: Upload Data')).toBeInTheDocument();
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
  });

  it('completes the full analysis workflow from upload to visualization', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Select a file and trigger upload
    const fileInput = screen.getByTestId('file-input');
    const file = new File(['test interview data'], 'interview.json', { type: 'application/json' });
    
    await act(async () => {
      await user.upload(fileInput, file);
    });
    
    // Verify upload API was called
    expect(mockUploadData).toHaveBeenCalledTimes(1);
    expect(mockUploadData).toHaveBeenCalledWith(expect.any(File), false);
    
    // Step 2: Verify analyze button appears and is enabled
    const analyzeButton = await screen.findByText(/analyze with/i);
    expect(analyzeButton).not.toBeDisabled();
    
    // Step 3: Click analyze button
    await user.click(analyzeButton);
    
    // Verify analyze API was called with correct data ID and provider
    expect(mockAnalyzeData).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeData).toHaveBeenCalledWith(
      mockUploadResponse.data_id,
      expect.any(String), // Provider (openai or gemini)
      expect.any(String), // Model
      false
    );
    
    // Step 4: Verify loading state is shown during analysis
    expect(mockGetProcessingStatus).toHaveBeenCalled();
    
    // Step 5: Verify results are fetched and displayed
    await waitFor(() => {
      expect(mockGetAnalysisById).toHaveBeenCalledWith(expect.stringContaining('456'));
    });
    
    // Step 6: Verify visualization is shown with correct data
    await waitFor(() => {
      expect(screen.getByTestId('visualization')).toBeInTheDocument();
      expect(screen.getByTestId('themes-count')).toHaveTextContent('2 Themes');
      expect(screen.getByTestId('patterns-count')).toHaveTextContent('1 Patterns');
      expect(screen.getByTestId('sentiment-positive')).toHaveTextContent('45% Positive');
    });
  });

  it('handles API errors during upload process', async () => {
    // Mock an upload error
    mockUploadData.mockRejectedValueOnce(new Error('Upload failed: Invalid file format'));
    
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Attempt to upload a file
    const uploadButton = screen.getByTestId('upload-button');
    await user.click(uploadButton);
    
    // Verify upload API was called
    expect(mockUploadData).toHaveBeenCalledTimes(1);
    
    // Verify error handling (error should be shown to user)
    // This would ideally check for toast or error message,
    // but we can at least verify that analysis wasn't attempted
    expect(mockAnalyzeData).not.toHaveBeenCalled();
  });

  it('handles API errors during analysis process', async () => {
    // Set up for successful upload but failed analysis
    mockAnalyzeData.mockRejectedValueOnce(new Error('Analysis failed: Server error'));
    
    const user = userEvent.setup();
    render(<Dashboard />);
    
    // Step 1: Trigger upload
    const fileInput = screen.getByTestId('file-input');
    await act(async () => {
      await user.upload(fileInput, new File(['test data'], 'test.json'));
    });
    
    // Step 2: Click analyze button
    const analyzeButton = await screen.findByText(/analyze with/i);
    await user.click(analyzeButton);
    
    // Verify analyze API was called
    expect(mockAnalyzeData).toHaveBeenCalledTimes(1);
    
    // Verify error handling (analysis should fail but not crash the app)
    expect(mockGetProcessingStatus).not.toHaveBeenCalled();
  });
}); 