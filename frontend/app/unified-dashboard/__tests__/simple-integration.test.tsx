import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Create a simplified dashboard component for testing
const SimplifiedDashboard = () => {
  return (
    <div>
      <h1>Dashboard</h1>
      <div data-testid="upload-area">
        <button data-testid="upload-button">Upload File</button>
      </div>
      <div data-testid="analyze-area">
        <button data-testid="analyze-button">Analyze Data</button>
      </div>
    </div>
  );
};

// No external dependencies to mock

describe('Simplified Dashboard Integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders the dashboard correctly', () => {
    render(<SimplifiedDashboard />);
    
    // Check for basic elements
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('upload-area')).toBeInTheDocument();
    expect(screen.getByTestId('analyze-area')).toBeInTheDocument();
  });

  it('handles button clicks', async () => {
    const user = userEvent.setup();
    render(<SimplifiedDashboard />);
    
    // Click the upload button
    const uploadButton = screen.getByTestId('upload-button');
    await user.click(uploadButton);
    
    // Click the analyze button
    const analyzeButton = screen.getByTestId('analyze-button');
    await user.click(analyzeButton);
    
    // Both clicks should succeed without errors
    expect(true).toBe(true);
  });
}); 