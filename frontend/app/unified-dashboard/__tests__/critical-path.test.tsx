import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../page';

// Mock all dependencies
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    uploadData: vi.fn(),
    getAnalysisById: vi.fn(),
    setAuthToken: vi.fn()
  }
}));

vi.mock('@/components/FileUpload', () => ({
  FileUpload: ({ onUploadComplete }: { onUploadComplete: any }) => (
    <div data-testid="file-upload">File Upload Component</div>
  )
}));

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
  default: () => <div data-testid="visualization">Visualization Component</div>
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

describe('Unified Dashboard - Smoke Test', () => {
  it('renders the dashboard with upload step', () => {
    render(<Dashboard />);
    
    // Check for the upload section title
    expect(screen.getByText('Step 1: Upload Data')).toBeInTheDocument();
    
    // Check for file input using a more reliable method
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    
    // Check for the upload button
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });
}); 