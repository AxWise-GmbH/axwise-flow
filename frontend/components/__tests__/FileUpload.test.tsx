import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileUpload } from '../FileUpload'
import { createMockFile } from '@/lib/utils/__tests__/test-helpers'

// Mock the API client
jest.mock('@/lib/apiClient', () => ({
  apiClient: {
    uploadData: jest.fn().mockResolvedValue({ data_id: 123 }),
  },
}))

describe('FileUpload Component', () => {
  const mockOnUploadComplete = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders upload area correctly', () => {
    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    expect(screen.getByText(/Drag and drop a JSON file/i)).toBeInTheDocument()
    expect(screen.getByText(/Select File/i)).toBeInTheDocument()
  })

  it('handles file upload successfully', async () => {
    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    const file = createMockFile(
      JSON.stringify({ test: 'data' }),
      'application/json'
    )
    const dropzone = screen.getByText(/Drag and drop a JSON file/i)

    // Simulate file drop
    await userEvent.upload(dropzone, file)

    // Wait for upload to complete
    await waitFor(() => {
      expect(screen.getByText(/File uploaded successfully/i)).toBeInTheDocument()
    })

    expect(mockOnUploadComplete).toHaveBeenCalledWith(123)
  })

  it('shows error for non-JSON files', async () => {
    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    const file = createMockFile('test data', 'text/plain')
    const dropzone = screen.getByText(/Drag and drop a JSON file/i)

    // Simulate file drop
    await userEvent.upload(dropzone, file)

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/Please upload a JSON file/i)).toBeInTheDocument()
    })

    expect(mockOnUploadComplete).not.toHaveBeenCalled()
  })

  it('shows progress during upload', async () => {
    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    const file = createMockFile(
      JSON.stringify({ test: 'data' }),
      'application/json'
    )
    const dropzone = screen.getByText(/Drag and drop a JSON file/i)

    // Simulate file drop
    await userEvent.upload(dropzone, file)

    // Check for progress indicator
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  it('handles upload failure', async () => {
    // Mock API failure
    const mockError = new Error('Upload failed')
    jest.spyOn(require('@/lib/apiClient').apiClient, 'uploadData')
      .mockRejectedValueOnce(mockError)

    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    const file = createMockFile(
      JSON.stringify({ test: 'data' }),
      'application/json'
    )
    const dropzone = screen.getByText(/Drag and drop a JSON file/i)

    // Simulate file drop
    await userEvent.upload(dropzone, file)

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/Upload failed/i)).toBeInTheDocument()
    })

    expect(mockOnUploadComplete).not.toHaveBeenCalled()
  })

  it('disables upload during processing', async () => {
    render(<FileUpload onUploadComplete={mockOnUploadComplete} />)
    
    const file = createMockFile(
      JSON.stringify({ test: 'data' }),
      'application/json'
    )
    const dropzone = screen.getByText(/Drag and drop a JSON file/i)

    // Simulate file drop
    await userEvent.upload(dropzone, file)

    // Check that dropzone is disabled
    expect(dropzone).toHaveAttribute('aria-disabled', 'true')

    // Wait for upload to complete
    await waitFor(() => {
      expect(screen.getByText(/File uploaded successfully/i)).toBeInTheDocument()
    })
  })
})