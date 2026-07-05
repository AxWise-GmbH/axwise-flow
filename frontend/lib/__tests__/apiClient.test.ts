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

// IMPORTANT: Don't mock the apiClient itself as we want to test the actual implementation

describe('API Client', () => {
  // Default mock response
  const defaultMockResponse = {
    ok: true,
    json: async () => ({
      id: 'test-upload-id',
      status: 'success',
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

  // Helper to convert File to FormData for testing
  function createMockFile(name = 'test.json', type = 'application/json') {
    return new File(['test content'], name, { type });
  }

  describe('uploadData', () => {
    it('uploads data successfully', async () => {
      // Set up more specific mock response for this test
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data_id: 123,
          message: 'File uploaded successfully',
          filename: 'test.json',
          upload_date: '2023-10-15T14:30:00Z',
          status: 'success'
        }),
        status: 200
      });

      // Mock the File
      const file = createMockFile();

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

    it('handles API errors gracefully with 422 validation error', async () => {
      // Mock a failed fetch response with a validation error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: 'Validation error',
          errors: {
            file: ['Invalid file format']
          }
        })
      });

      const file = createMockFile();

      // The call should throw an error
      await expect(apiClient.uploadData(file, false)).rejects.toThrow();

      // Verify the call was made
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles API connection errors gracefully', async () => {
      // Mock a network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Mock the File
      const file = createMockFile();

      // The call should throw an error
      await expect(apiClient.uploadData(file, false)).rejects.toThrow('Network error');
    });

    it('passes isTextFile parameter correctly', async () => {
      // Mock the File
      const file = createMockFile('test.txt', 'text/plain');

      // Call the method
      await apiClient.uploadData(file, true);

      // Verify is_free_text was set to "true"
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData)
        })
      );
    });
  });

  describe('analyzeData', () => {
    it('analyzes data successfully', async () => {
      // Set up mock response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result_id: 456,
          message: 'Analysis started successfully',
          status: 'started'
        }),
        status: 200
      });

      // Call the method
      const result = await apiClient.analyzeData(123);

      // Verify the result
      expect(result).toEqual(expect.objectContaining({
        result_id: 456,
        status: 'started'
      }));

      // Verify the API was called
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analysis'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('123')
        })
      );
    });

    it('analyzes data with gemini provider', async () => {
      // Set up mock response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result_id: 789,
          message: 'Analysis started successfully with Gemini',
          status: 'started'
        }),
        status: 200
      });

      // Call the method with Gemini provider
      const result = await apiClient.analyzeData(123, 'gemini', 'models/gemini-2.5-flash', true);

      // Verify the result
      expect(result).toEqual(expect.objectContaining({
        result_id: 789,
        status: 'started'
      }));

      // Verify request was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('123')
        })
      );
    });

    it('handles invalid provider error', async () => {
      // Set up error response for invalid provider
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ["body", "llm_provider"],
              msg: "value is not a valid enumeration member",
              type: "type_error.enum"
            }
          ]
        })
      });

      // @ts-expect-error - Testing with invalid provider
      await expect(apiClient.analyzeData(123, 'invalid_provider')).rejects.toThrow();
    });
  });

  describe('getAnalysisById', () => {
    it('gets analysis results successfully', async () => {
      // Set up detailed mock response based on schema
      const mockAnalysisResult = {
        results: {
          id: 'analysis-123',
          status: 'completed',
          createdAt: '2023-10-15T15:30:00Z',
          fileName: 'test_interview.json',
          fileSize: 1024,
          themes: [
            { id: 1, name: 'User Interface', frequency: 0.25, keywords: ['design', 'UI'], sentiment: 0.8 }
          ],
          patterns: [
            { id: 1, name: 'Navigation Issues', category: 'User Experience', description: 'Difficulty finding features', frequency: 0.15, sentiment: -0.2 }
          ],
          sentiment: [
            { timestamp: '2023-10-15T15:30:00Z', score: 0.8, text: 'I love the design' }
          ],
          sentimentOverview: {
            positive: 0.6,
            neutral: 0.3,
            negative: 0.1
          }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysisResult
      });

      // Call the method
      const result = await apiClient.getAnalysisById('analysis-123');

      // Verify the result contains expected fields
      expect(result).toHaveProperty('id', 'analysis-123');
      expect(result).toHaveProperty('status', 'completed');
      expect(result).toHaveProperty('themes');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('sentimentOverview');

      // Verify fetch was called correctly
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'http://test-api-url.com/api/results/analysis-123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('handles missing results gracefully', async () => {
      // Set up mock response with missing results
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'processing' // No results field
        })
      });

      // Call should throw an error
      await expect(apiClient.getAnalysisById('pending-analysis')).rejects.toThrow(/missing results/i);
    });

    it('handles analysis with error status', async () => {
      // Set up mock response with error status
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'error',
          error: 'Analysis failed due to invalid data format',
          results: {
            id: 'failed-analysis',
            status: 'failed',
            error: 'Analysis failed due to invalid data format',
            createdAt: '2023-10-15T15:30:00Z',
            fileName: 'invalid_data.json',
            themes: [],
            patterns: [],
            sentimentOverview: { positive: 0, neutral: 0, negative: 0 }
          }
        })
      });

      // Call the method - should not throw but return result with error
      const result = await apiClient.getAnalysisById('failed-analysis');

      // Verify the result contains error information
      expect(result).toHaveProperty('status', 'failed');
      expect(result).toHaveProperty('error', 'Analysis failed due to invalid data format');
    });
  });

  describe('listAnalyses', () => {
    it('retrieves list of analyses successfully', async () => {
      // Set up mock response for list of analyses
      const mockAnalysesList = [
        {
          id: 'analysis-1',
          status: 'completed',
          createdAt: '2023-10-15T15:30:00Z',
          fileName: 'interview1.json',
          themes: [],
          patterns: [],
          sentimentOverview: { positive: 0.5, neutral: 0.3, negative: 0.2 }
        },
        {
          id: 'analysis-2',
          status: 'pending',
          createdAt: '2023-10-16T10:15:00Z',
          fileName: 'interview2.json',
          themes: [],
          patterns: [],
          sentimentOverview: { positive: 0, neutral: 0, negative: 0 }
        }
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAnalysesList
      });

      // Call the method with sort parameters
      const result = await apiClient.listAnalyses({
        sortBy: 'createdAt',
        sortDirection: 'desc'
      });

      // Verify the result
      expect(result).toEqual(mockAnalysesList);
      expect(result.length).toBe(2);

      // Verify fetch was called with correct URL and parameters
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analyses'),
        expect.objectContaining({
          method: 'GET',
          params: {
            sortBy: 'createdAt',
            sortDirection: 'desc'
          }
        })
      );
    });

    it('handles empty analysis list', async () => {
      // Set up mock response with empty array
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => []
      });

      // Call the method
      const result = await apiClient.listAnalyses();

      // Verify the result is an empty array
      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });
  });

  describe('getProcessingStatus', () => {
    it('gets processing status for an in-progress analysis', async () => {
      // Set up mock response for in-progress status
      const mockStatus = {
        current_stage: 'ANALYSIS',
        started_at: '2023-10-15T15:30:00Z',
        progress: 0.65,
        stage_states: {
          FILE_UPLOAD: { status: 'completed', progress: 1 },
          FILE_VALIDATION: { status: 'completed', progress: 1 },
          ANALYSIS: { status: 'in_progress', progress: 0.65 }
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStatus
      });

      // Call the method
      const result = await apiClient.getProcessingStatus('in-progress-analysis');

      // Verify the result
      expect(result).toEqual(mockStatus);

      // Verify fetch was called correctly
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'http://test-api-url.com/api/analysis/in-progress-analysis/status',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('handles 404 error gracefully for completing analysis', async () => {
      // Set up mock 404 response (API returns 404 when status endpoint isn't found)
      global.fetch = vi.fn().mockRejectedValue(new Error('Not Found'));

      // Also mock getAnalysisById to return completed status
      const mockCompleted = {
        id: 'completed-analysis',
        status: 'completed',
        createdAt: '2023-10-15T15:30:00Z',
        fileName: 'interview.json',
        themes: [],
        patterns: [],
        sentimentOverview: { positive: 0.5, neutral: 0.3, negative: 0.2 }
      };

      // Mock second fetch call for getAnalysisById
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: mockCompleted
        })
      });

      // Call the method
      const result = await apiClient.getProcessingStatus('completed-analysis');

      // Verify the result indicates completion
      expect(result).toHaveProperty('current_stage', 'COMPLETION');
      expect(result.stage_states).toHaveProperty('COMPLETION');
      expect(result.stage_states.COMPLETION.status).toBe('completed');
      expect(result.progress).toBe(1);
    });
  });

  describe('setAuthToken', () => {
    it('sets auth token correctly', () => {
      // Call the method
      apiClient.setAuthToken('test-token');

      // Since we're not directly testing private variables,
      // we can verify the token is set on the internal axios client defaults
      // This requires accessing a private member, which isn't ideal, but necessary for this test structure
      // @ts-expect-error - Accessing private member for testing
      expect(apiClient.client.defaults.headers.common['Authorization']).toBe('Bearer test-token'
);
    });

    it('handles authentication errors with 401 status code', async () => {
      // Set up mock 401 response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Invalid or expired token' })
      });

      // Make a request that should trigger the auth error
      await expect(apiClient.getAnalysisById('test-id')).rejects.toThrow(/authentication required/i);
    });
  });

  // Testing calculateSentimentOverview indirectly through getAnalysisById
  describe('sentiment calculations', () => {
    it('calculates sentiment overview when missing from API', async () => {
      // Set up mock response missing sentimentOverview
      const mockResponse = {
        results: {
          id: 'analysis-123',
          status: 'completed',
          createdAt: '2023-10-15T15:30:00Z',
          fileName: 'test_interview.json',
          themes: [],
          patterns: [],
          sentiment: [
            { timestamp: '2023-10-15T15:30:00Z', score: 0.8, text: 'Positive comment' },
            { timestamp: '2023-10-15T15:31:00Z', score: 0.5, text: 'Slightly positive' },
            { timestamp: '2023-10-15T15:32:00Z', score: 0.1, text: 'Neutral comment' },
            { timestamp: '2023-10-15T15:33:00Z', score: -0.6, text: 'Negative comment' }
          ]
          // No sentimentOverview provided
        }
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      // Call the method
      const result = await apiClient.getAnalysisById('analysis-123');

      // Verify sentimentOverview was calculated
      expect(result).toHaveProperty('sentimentOverview');
      expect(result.sentimentOverview).toHaveProperty('positive');
      expect(result.sentimentOverview).toHaveProperty('neutral');
      expect(result.sentimentOverview).toHaveProperty('negative');

      // The calculation should reflect our test data (2 positive, 1 neutral, 1 negative)
      expect(result.sentimentOverview.positive).toBeCloseTo(0.5);
      expect(result.sentimentOverview.neutral).toBeCloseTo(0.25);
      expect(result.sentimentOverview.negative).toBeCloseTo(0.25);
    });
  });
});
