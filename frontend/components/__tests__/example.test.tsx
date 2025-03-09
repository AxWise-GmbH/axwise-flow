/**
 * Example test file demonstrating how to use the testing mocks
 * 
 * This file shows how to:
 * 1. Mock the API client
 * 2. Use mock data
 * 3. Use test utilities
 * 4. Test component rendering
 * 5. Test user interactions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import mock utilities
import mockApiClient from '@/test/mocks/apiClient';
import { createMockAnalysis, mockThemes } from '@/test/mocks/mockData';
import { createMockFile, renderWithProviders, wait } from '@/test/mocks/testUtils';

// Mock the API client module
vi.mock('@/lib/apiClient', () => ({
  default: mockApiClient
}));

// Example component we're testing
// Note: This is a placeholder - in a real test, you would import the actual component
const ExampleAnalysisComponent = ({ 
  analysisId, 
  onSelectTheme 
}: { 
  analysisId: string, 
  onSelectTheme?: (theme: string) => void 
}) => {
  return (
    <div>
      <h1>Analysis Viewer</h1>
      <p data-testid="analysis-id">Analysis ID: {analysisId}</p>
      <div>
        <h2>Themes</h2>
        <ul>
          {mockThemes.map(theme => (
            <li 
              key={theme.name} 
              data-testid={`theme-${theme.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => onSelectTheme?.(theme.name)}
            >
              {theme.name} (Sentiment: {theme.sentiment.toFixed(2)})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// Example test suite
describe('Example Analysis Component', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockApiClient.resetMockResponses();
    vi.clearAllMocks();
  });

  it('displays analysis ID and themes', () => {
    // Render the component with a test analysis ID
    render(<ExampleAnalysisComponent analysisId="test-123" />);
    
    // Verify the analysis ID is displayed
    expect(screen.getByTestId('analysis-id')).toHaveTextContent('Analysis ID: test-123');
    
    // Verify themes are displayed
    expect(screen.getByTestId('theme-company-culture')).toBeInTheDocument();
    expect(screen.getByTestId('theme-work-life-balance')).toBeInTheDocument();
    expect(screen.getByTestId('theme-career-growth')).toBeInTheDocument();
  });

  it('calls onSelectTheme when a theme is clicked', async () => {
    // Create a mock function for the theme selection handler
    const handleThemeSelect = vi.fn();
    
    // Render the component with the mock handler
    render(
      <ExampleAnalysisComponent 
        analysisId="test-123" 
        onSelectTheme={handleThemeSelect} 
      />
    );
    
    // Simulate clicking on a theme
    const themeElement = screen.getByTestId('theme-company-culture');
    await userEvent.click(themeElement);
    
    // Verify the handler was called with the correct theme name
    expect(handleThemeSelect).toHaveBeenCalledWith('Company Culture');
  });

  it('demonstrates using the mock API client', async () => {
    // Set up a mock response for getAnalysisById
    const mockAnalysis = createMockAnalysis('test-456');
    mockApiClient.setMockResponse('getAnalysisById', mockAnalysis);
    
    // Create a component that would use the API client
    // This is just an example - in a real test, this would be your actual component
    const ExampleComponent = () => {
      const [analysis, setAnalysis] = vi.fn().mockReturnValue([mockAnalysis, vi.fn()]);
      const [loading, setLoading] = vi.fn().mockReturnValue([false, vi.fn()]);
      const [error, setError] = vi.fn().mockReturnValue([null, vi.fn()]);
      
      // Just for example - this would happen in useEffect in a real component
      mockApiClient.getAnalysisById('test-456');
      
      return (
        <div>
          <h1>Analysis Details</h1>
          {mockAnalysis && (
            <div>
              <p data-testid="analysis-summary">{mockAnalysis.summary}</p>
              <p data-testid="theme-count">Theme Count: {mockAnalysis.themes.length}</p>
            </div>
          )}
        </div>
      );
    };
    
    // Render the component
    render(<ExampleComponent />);
    
    // Verify the component displays data from the mock
    expect(screen.getByTestId('analysis-summary')).toHaveTextContent('This is a mock analysis summary');
    expect(screen.getByTestId('theme-count')).toHaveTextContent('Theme Count: 5');
    
    // Verify the API client was called with the correct ID
    expect(mockApiClient.getAnalysisById).toHaveBeenCalledWith('test-456');
  });

  it('demonstrates using test utilities', async () => {
    // Create a mock file for upload testing
    const mockFile = createMockFile('interview.txt', 'text/plain', 2048);
    
    // Verify the mock file has the expected properties
    expect(mockFile.name).toBe('interview.txt');
    expect(mockFile.type).toBe('text/plain');
    expect(mockFile.size).toBe(2048);
    
    // Example of using renderWithProviders (useful for components that need providers)
    const MockComponent = () => <div data-testid="test-component">Test Component</div>;
    const { user } = renderWithProviders(<MockComponent />);
    
    expect(screen.getByTestId('test-component')).toBeInTheDocument();
    
    // Demonstrate using wait utility
    let asyncCompleted = false;
    setTimeout(() => {
      asyncCompleted = true;
    }, 50);
    
    // Wait for the async operation to complete
    await wait(100);
    expect(asyncCompleted).toBe(true);
  });
});

/**
 * Example test for a file upload component
 */
describe('Example File Upload', () => {
  beforeEach(() => {
    mockApiClient.resetMockResponses();
    vi.clearAllMocks();
  });

  it('handles file uploads using mock API client', async () => {
    // Mock the uploadData method to return a success response
    mockApiClient.setMockResponse('uploadData', {
      id: 'upload-123',
      dataId: 456,
      status: 'success',
      message: 'File uploaded successfully'
    });
    
    // Create a simple file upload component
    const FileUploader = () => {
      const [uploadStatus, setUploadStatus] = vi.fn().mockReturnValue(['', vi.fn()]);
      const [uploadId, setUploadId] = vi.fn().mockReturnValue('', vi.fn());
      
      const handleUpload = async (file: File) => {
        // This simulates what your real component would do
        const result = await mockApiClient.uploadData(file, file.type === 'text/plain');
        return result;
      };
      
      return (
        <div>
          <input 
            type="file" 
            data-testid="file-input"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleUpload(e.target.files[0]);
              }
            }}
          />
          <button data-testid="upload-button">Upload</button>
        </div>
      );
    };
    
    // Render the component
    render(<FileUploader />);
    
    // Create a mock file
    const mockFile = createMockFile('interview.txt', 'text/plain', 1024);
    
    // Simulate file selection
    const fileInput = screen.getByTestId('file-input');
    await userEvent.upload(fileInput, mockFile);
    
    // Verify the API client method was called with the correct parameters
    expect(mockApiClient.uploadData).toHaveBeenCalledWith(mockFile, true);
  });
}); 