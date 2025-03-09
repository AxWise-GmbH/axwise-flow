'use client';

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadTab } from '../UploadTab';
import { apiClient } from '@/lib/apiClient';
import { vi } from 'vitest';

// Mock the toast provider
vi.mock('@/components/providers/toast-provider', () => ({
  useToast: () => ({
    showToast: vi.fn()
  })
}));

// Mock the API client
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    setAuthToken: vi.fn(),
    uploadData: vi.fn(),
    analyzeData: vi.fn()
  }
}));

// Mock FileUploadForm and AnalysisOptions components
vi.mock('../FileUploadForm', () => ({
  __esModule: true,
  default: ({ onFileSelect }: { onFileSelect: (file: File, isText: boolean) => void }) => (
    <div data-testid="file-upload-form">
      <button 
        onClick={() => onFileSelect(new File(['test'], 'test.txt', { type: 'text/plain' }), true)}
        data-testid="select-file-btn"
      >
        Select File
      </button>
    </div>
  )
}));

vi.mock('../AnalysisOptions', () => ({
  __esModule: true,
  default: ({ onLlmProviderChange }: { onLlmProviderChange: (provider: 'openai' | 'gemini') => void }) => (
    <div data-testid="analysis-options">
      <button 
        onClick={() => onLlmProviderChange('openai')}
        data-testid="select-openai-btn"
      >
        Select OpenAI
      </button>
    </div>
  )
}));

// Mock AnalysisProgress component
vi.mock('@/components/AnalysisProgress', () => ({
  __esModule: true,
  default: ({ analysisId }: { analysisId: string }) => (
    <div data-testid="analysis-progress">Analysis ID: {analysisId}</div>
  )
}));

describe('UploadTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('renders the upload form', () => {
    render(<UploadTab />);
    
    expect(screen.getByText(/upload interview data/i)).toBeInTheDocument();
    expect(screen.getByTestId('file-upload-form')).toBeInTheDocument();
    expect(screen.getByTestId('analysis-options')).toBeInTheDocument();
  });
  
  it('updates state when a file is selected', () => {
    render(<UploadTab />);
    
    // The upload button should be disabled initially (no file selected)
    const uploadButton = screen.getByRole('button', { name: /upload/i });
    expect(uploadButton).toBeDisabled();
    
    // Select a file
    fireEvent.click(screen.getByTestId('select-file-btn'));
    
    // Now the upload button should be enabled
    expect(uploadButton).not.toBeDisabled();
  });
  
  it('calls the API client when uploading a file', async () => {
    // Mock successful upload response
    (apiClient.uploadData as any).mockResolvedValue({ 
      data_id: 123,
      filename: 'test.txt',
      status: 'uploaded'
    });
    
    render(<UploadTab />);
    
    // Select a file
    fireEvent.click(screen.getByTestId('select-file-btn'));
    
    // Click upload
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    
    // Check that the API was called
    await waitFor(() => {
      expect(apiClient.uploadData).toHaveBeenCalled();
    });
  });
  
  it('enables start analysis button after successful upload', async () => {
    // Mock successful upload response
    (apiClient.uploadData as any).mockResolvedValue({ 
      data_id: 123,
      filename: 'test.txt',
      status: 'uploaded'
    });
    
    render(<UploadTab />);
    
    // Select a file
    fireEvent.click(screen.getByTestId('select-file-btn'));
    
    // Upload button should be enabled, start analysis should be disabled
    expect(screen.getByRole('button', { name: /upload/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /start analysis/i })).toBeDisabled();
    
    // Click upload
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    
    // After upload, start analysis should be enabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start analysis/i })).not.toBeDisabled();
    });
  });
  
  it('shows progress when analysis is started', async () => {
    // Mock successful upload response
    (apiClient.uploadData as any).mockResolvedValue({ 
      data_id: 123,
      filename: 'test.txt',
      status: 'uploaded'
    });
    
    // Mock successful analysis response
    (apiClient.analyzeData as any).mockResolvedValue({ 
      result_id: '456',
      status: 'processing'
    });
    
    render(<UploadTab />);
    
    // Select a file and upload it
    fireEvent.click(screen.getByTestId('select-file-btn'));
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    
    // Wait for upload to complete
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start analysis/i })).not.toBeDisabled();
    });
    
    // Start analysis
    fireEvent.click(screen.getByRole('button', { name: /start analysis/i }));
    
    // Check that progress is shown
    await waitFor(() => {
      expect(screen.getByTestId('analysis-progress')).toBeInTheDocument();
      expect(screen.getByText(/analysis id: 456/i)).toBeInTheDocument();
    });
  });
});
