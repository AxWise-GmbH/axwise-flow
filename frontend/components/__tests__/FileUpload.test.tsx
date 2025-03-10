import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileUpload } from '../FileUpload';

// Mock the API client to avoid circular dependencies
vi.mock('@/lib/apiClient', () => ({
  apiClient: {
    setAuthToken: vi.fn(),
    uploadData: vi.fn()
  }
}));

describe('FileUpload Component - Basic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the upload area', () => {
    render(<FileUpload onUploadComplete={() => {}} />);
    expect(screen.getByText(/Drag and drop a JSON or TXT file/i)).toBeInTheDocument();
  });

  it('shows a select file button', () => {
    render(<FileUpload onUploadComplete={() => {}} />);
    expect(screen.getByRole('button', { name: /Select File/i })).toBeInTheDocument();
  });

  it('has a file input element', () => {
    render(<FileUpload onUploadComplete={() => {}} />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });
});