import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '@/lib/apiClient';

// Mock fetch globally
global.fetch = vi.fn();

// Mock form-data
vi.mock('form-data', () => {
  return {
    default: class MockFormData {
      append = vi.fn();
      delete = vi.fn();
      get = vi.fn();
      getAll = vi.fn();
      has = vi.fn();
      set = vi.fn();
      forEach = vi.fn();
      entries = vi.fn(() => [][Symbol.iterator]());
      keys = vi.fn(() => [][Symbol.iterator]());
      values = vi.fn(() => [][Symbol.iterator]());
      [Symbol.iterator] = vi.fn(() => [][Symbol.iterator]());
    }
  };
});

// Mock the apiClient's dependencies
vi.mock('@/lib/config', () => ({
  config: {
    apiUrl: 'http://test-api-url.com',
  },
}));

describe('API Client - Upload Operations', () => {
  // Default mock response
  const defaultMockResponse = {
    ok: true,
    json: async () => ({
      data_id: 123,
      message: 'File uploaded successfully',
      filename: 'test.json',
      upload_date: '2023-10-15T14:30:00Z',
      status: 'success'
    }),
    status: 200
  };

  beforeEach(() => {
    // Reset all mocks between tests
    vi.resetAllMocks();
    
    // Set up default fetch mock implementation for tests
    global.fetch = vi.fn().mockResolvedValue(defaultMockResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock files of different types
  function createMockFile(name = 'test.json', type = 'application/json') {
    return new File(['test content'], name, { type });
  }

  describe('uploadData - Basic Functionality', () => {
    it('uploads JSON data successfully', async () => {
      // Mock the File
      const file = createMockFile('data.json', 'application/json');
      
      // Call the method
      const result = await apiClient.uploadData(file, false);
      
      // Verify the result matches the expected structure
      expect(result).toEqual(expect.objectContaining({
        data_id: 123,
        message: 'File uploaded successfully',
      }));
      
      // Verify the API was called with correct URL
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/data'),
        expect.objectContaining({ 
          method: 'POST',
          body: expect.any(FormData)
        })
      );
    });

    it('uploads text data successfully', async () => {
      // Mock the File
      const file = createMockFile('data.txt', 'text/plain');
      
      // Call the method
      const result = await apiClient.uploadData(file, true);
      
      // Verify the result
      expect(result).toEqual(expect.objectContaining({
        data_id: 123,
        message: 'File uploaded successfully',
      }));
      
      // Verify the API was called with correct URL and isTextFile flag
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // Check that FormData includes the isTextFile parameter set to true
      const mockAppend = vi.mocked(new FormData().append);
      expect(mockAppend).toHaveBeenCalled();
      
      // Look for the isTextFile param in the mock calls
      const appendCalls = mockAppend.mock.calls;
      const isTextFileCall = appendCalls.find(call => call[0] === 'isTextFile');
      expect(isTextFileCall).toBeDefined();
      expect(isTextFileCall?.[1]).toBe('true');
    });

    it('uploads CSV data successfully', async () => {
      // Mock the File
      const file = createMockFile('data.csv', 'text/csv');
      
      // Call the method
      const result = await apiClient.uploadData(file);
      
      // Verify the result
      expect(result).toEqual(expect.objectContaining({
        data_id: 123,
        message: 'File uploaded successfully',
      }));
      
      // Verify the API was called with correct URL
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // Check that FormData includes the file
      const mockAppend = vi.mocked(new FormData().append);
      expect(mockAppend).toHaveBeenCalledWith('file', file);
    });
  });

  describe('uploadData - Error Handling', () => {
    it('handles network errors', async () => {
      // Simulate a network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      // Mock the File
      const file = createMockFile();
      
      // The call should throw an error
      await expect(apiClient.uploadData(file)).rejects.toThrow('Network error');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles API error responses', async () => {
      // Simulate an API error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Invalid file format',
          status: 'error'
        }),
        statusText: 'Bad Request'
      });
      
      // Mock the File
      const file = createMockFile();
      
      // The call should throw an error
      await expect(apiClient.uploadData(file)).rejects.toThrow('Invalid file format');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles server errors (500 series)', async () => {
      // Simulate a server error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ 
          error: 'Internal server error',
          status: 'error'
        }),
        statusText: 'Internal Server Error'
      });
      
      // Mock the File
      const file = createMockFile();
      
      // The call should throw an error
      await expect(apiClient.uploadData(file)).rejects.toThrow('Internal server error');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles malformed response JSON', async () => {
      // Simulate a malformed JSON response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON'); }
      });
      
      // Mock the File
      const file = createMockFile();
      
      // The call should throw an error
      await expect(apiClient.uploadData(file)).rejects.toThrow('Error parsing response');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadData - Validation and Parameters', () => {
    it('validates file is provided', async () => {
      // Call the method without a file
      await expect(apiClient.uploadData(null as any)).rejects.toThrow('File is required');
      
      // Verify fetch was not called
      expect(fetch).not.toHaveBeenCalled();
    });

    it('validates file size is within limits', async () => {
      // Create a file that simulates being too large (mock the size property)
      const file = createMockFile();
      Object.defineProperty(file, 'size', { value: 1024 * 1024 * 100 }); // 100MB
      
      // Assuming the API client has a size limit check
      await expect(apiClient.uploadData(file)).rejects.toThrow(/file size/i);
      
      // Verify fetch was not called because validation failed
      expect(fetch).not.toHaveBeenCalled();
    });

    it('sends authorization header when token is set', async () => {
      // Set auth token
      apiClient.setAuthToken('test-token');
      
      // Mock the File
      const file = createMockFile();
      
      // Call the method
      await apiClient.uploadData(file);
      
      // Verify the API was called with authorization header
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token'
          })
        })
      );
      
      // Clear the token
      apiClient.setAuthToken('');
    });

    it('includes filename in the request', async () => {
      // Mock the File with specific name
      const fileName = 'important-data.json';
      const file = createMockFile(fileName, 'application/json');
      
      // Call the method
      await apiClient.uploadData(file);
      
      // Verify the filename is included in FormData
      const mockAppend = vi.mocked(new FormData().append);
      expect(mockAppend).toHaveBeenCalledWith('file', file);
      
      // Check the response includes the correct filename
      expect(defaultMockResponse.json()).resolves.toMatchObject({
        filename: expect.any(String)
      });
    });
  });
}); 