import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Create a self-contained component for testing with no external dependencies
const MinimalDashboard = () => {
  const [uploadedId, setUploadedId] = React.useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);

  // Simulate the upload process
  const handleUpload = (id: number) => {
    setUploadedId(id);
  };

  // Simulate the analysis process
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Set mock result
    setResult({
      themes: [
        { id: 1, name: 'User Experience', frequency: 0.35 },
        { id: 2, name: 'Performance Issues', frequency: 0.25 }
      ],
      patterns: [
        { id: 1, description: 'Navigation issues', sentiment: -0.3 },
        { id: 2, description: 'Positive feedback', sentiment: 0.8 }
      ],
      sentiment: {
        overview: { positive: 0.45, neutral: 0.3, negative: 0.25 }
      }
    });
    
    setIsAnalyzing(false);
  };

  return (
    <div>
      <h1>Dashboard</h1>
      
      {/* Upload Area */}
      {!uploadedId && (
        <div data-testid="upload-area">
          <h2>Step 1: Upload Data</h2>
          <button 
            data-testid="upload-button"
            onClick={() => handleUpload(123)}
          >
            Upload File
          </button>
        </div>
      )}
      
      {/* Analyze Area */}
      {uploadedId && !isAnalyzing && !result && (
        <div data-testid="analyze-area">
          <h2>Step 2: Analyze Data</h2>
          <p>Upload ID: {uploadedId}</p>
          <button 
            data-testid="analyze-button"
            onClick={handleAnalyze}
          >
            Analyze Data
          </button>
        </div>
      )}
      
      {/* Loading State */}
      {isAnalyzing && (
        <div data-testid="loading-spinner">
          <p>Analyzing data...</p>
        </div>
      )}
      
      {/* Results Area */}
      {result && (
        <div data-testid="visualization">
          <h2>Analysis Results</h2>
          <div data-testid="themes-count">{result.themes.length} Themes</div>
          <div data-testid="patterns-count">{result.patterns.length} Patterns</div>
          <div data-testid="sentiment-score">Sentiment: {result.sentiment.overview.positive}</div>
        </div>
      )}
    </div>
  );
};

describe('Minimal Dashboard Tests', () => {
  it('renders the initial upload state correctly', () => {
    render(<MinimalDashboard />);
    
    // Check for upload area
    expect(screen.getByTestId('upload-area')).toBeInTheDocument();
    expect(screen.getByText('Step 1: Upload Data')).toBeInTheDocument();
  });

  it('completes the full analysis workflow', async () => {
    const user = userEvent.setup();
    render(<MinimalDashboard />);
    
    // Step 1: Upload a file
    await user.click(screen.getByTestId('upload-button'));
    
    // Verify analyze button appears
    expect(screen.getByTestId('analyze-area')).toBeInTheDocument();
    expect(screen.getByText('Upload ID: 123')).toBeInTheDocument();
    
    // Step 2: Initiate analysis
    await user.click(screen.getByTestId('analyze-button'));
    
    // Step 3: Should show loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    
    // Step 4: Eventually should show results (after the timeout in handleAnalyze)
    const visualization = await screen.findByTestId('visualization', {}, { timeout: 2000 });
    expect(visualization).toBeInTheDocument();
    
    // Verify the content
    expect(screen.getByTestId('themes-count')).toHaveTextContent('2 Themes');
    expect(screen.getByTestId('patterns-count')).toHaveTextContent('2 Patterns');
    expect(screen.getByTestId('sentiment-score')).toHaveTextContent('Sentiment: 0.45');
  });
}); 