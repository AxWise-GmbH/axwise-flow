import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '@/lib/apiClient';

// Mock fetch globally
global.fetch = vi.fn();

// Mock the apiClient's dependencies
vi.mock('@/lib/config', () => ({
  config: {
    apiUrl: 'http://test-api-url.com',
  },
}));

describe('API Client - Analysis Operations', () => {
  // Default mock response for analysis
  const defaultAnalysisResponse = {
    ok: true,
    json: async () => ({
      result_id: 456,
      status: 'started',
      message: 'Analysis started successfully'
    }),
    status: 200
  };

  beforeEach(() => {
    // Reset all mocks between tests
    vi.resetAllMocks();
    
    // Set up default fetch mock implementation for tests
    global.fetch = vi.fn().mockResolvedValue(defaultAnalysisResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeData - Basic Functionality', () => {
    it('initiates analysis successfully with OpenAI provider', async () => {
      // Call the method with OpenAI provider
      const result = await apiClient.analyzeData(123, 'openai', 'gpt-4');
      
      // Verify the result matches the expected structure
      expect(result).toEqual(expect.objectContaining({
        result_id: 456,
        message: 'Analysis started successfully',
        status: 'started'
      }));
      
      // Verify the API was called with correct URL and parameters
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analyze'),
        expect.objectContaining({ 
          method: 'POST',
          body: expect.any(String)
        })
      );
      
      // Verify the request body contains correct parameters
      const fetchMock = vi.mocked(fetch);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string || '{}');
      expect(requestBody).toEqual(expect.objectContaining({
        data_id: 123,
        llm_provider: 'openai',
        llm_model: 'gpt-4'
      }));
    });

    it('initiates analysis successfully with Gemini provider', async () => {
      // Call the method with Gemini provider
      const result = await apiClient.analyzeData(123, 'gemini', 'gemini-pro');
      
      // Verify the result structure
      expect(result).toEqual(expect.objectContaining({
        result_id: 456,
        message: 'Analysis started successfully'
      }));
      
      // Verify the API call 
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // Verify the request body contains Gemini parameters
      const fetchMock = vi.mocked(fetch);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string || '{}');
      expect(requestBody).toEqual(expect.objectContaining({
        data_id: 123,
        llm_provider: 'gemini',
        llm_model: 'gemini-pro'
      }));
    });

    it('uses default model when none specified', async () => {
      // Call the method without specifying a model
      await apiClient.analyzeData(123, 'openai');
      
      // Verify the request body
      const fetchMock = vi.mocked(fetch);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string || '{}');
      
      // Verify it contains only provider with no model (should use default on server)
      expect(requestBody).toEqual(expect.objectContaining({
        data_id: 123,
        llm_provider: 'openai'
      }));
      expect(requestBody.llm_model).toBeUndefined();
    });

    it('works with text file flag', async () => {
      // Call the method with text file flag
      await apiClient.analyzeData(123, 'openai', 'gpt-4', true);
      
      // Verify the request body contains isTextFile flag
      const fetchMock = vi.mocked(fetch);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string || '{}');
      expect(requestBody).toEqual(expect.objectContaining({
        data_id: 123,
        llm_provider: 'openai',
        llm_model: 'gpt-4',
        is_text_file: true
      }));
    });
  });

  describe('analyzeData - Error Handling', () => {
    it('handles network errors', async () => {
      // Simulate a network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      // The call should throw an error
      await expect(apiClient.analyzeData(123)).rejects.toThrow('Network error');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles API error responses', async () => {
      // Simulate an API error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ 
          error: 'Invalid data ID',
          status: 'error'
        }),
        statusText: 'Bad Request'
      });
      
      // The call should throw an error
      await expect(apiClient.analyzeData(123)).rejects.toThrow('Invalid data ID');
      
      // Verify fetch was called
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles invalid dataId parameter', async () => {
      // Call the method with invalid dataId
      await expect(apiClient.analyzeData(null as any)).rejects.toThrow(/data ID/i);
      
      // Verify fetch was not called
      expect(fetch).not.toHaveBeenCalled();
    });

    it('handles invalid LLM provider', async () => {
      // Call the method with invalid provider
      await expect(apiClient.analyzeData(123, 'invalid-provider' as any)).rejects.toThrow(/provider/i);
      
      // Verify fetch was not called
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('getProcessingStatus - Tracking Analysis Progress', () => {
    it('retrieves processing status successfully', async () => {
      // Mock the status response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: '789',
          status: 'processing',
          progress: 0.5,
          message: 'Analysis in progress',
          estimated_completion_time: '2023-10-15T15:30:00Z'
        }),
        status: 200
      });
      
      // Call the method
      const result = await apiClient.getProcessingStatus('789');
      
      // Verify the result structure
      expect(result).toEqual(expect.objectContaining({
        status: 'processing',
        progress: 0.5,
        message: 'Analysis in progress'
      }));
      
      // Verify the API was called with correct URL
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/status/789'),
        expect.any(Object)
      );
    });

    it('handles completed analysis status', async () => {
      // Mock the completed status response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: '789',
          status: 'completed',
          message: 'Analysis complete',
          completion_time: '2023-10-15T15:30:00Z'
        }),
        status: 200
      });
      
      // Call the method
      const result = await apiClient.getProcessingStatus('789');
      
      // Verify the result structure
      expect(result).toEqual(expect.objectContaining({
        status: 'completed',
        message: 'Analysis complete'
      }));
    });

    it('handles failed analysis status', async () => {
      // Mock the failed status response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: '789',
          status: 'failed',
          error: 'Analysis failed due to invalid data format',
          message: 'Processing error'
        }),
        status: 200
      });
      
      // Call the method
      const result = await apiClient.getProcessingStatus('789');
      
      // Verify the result structure
      expect(result).toEqual(expect.objectContaining({
        status: 'failed',
        error: 'Analysis failed due to invalid data format'
      }));
    });

    it('handles invalid analysis ID', async () => {
      // Call the method with invalid ID
      await expect(apiClient.getProcessingStatus('')).rejects.toThrow(/analysis ID/i);
      
      // Verify fetch was not called
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('listAnalyses - Listing User Analyses', () => {
    it('lists analyses with default parameters', async () => {
      // Mock the list response with array of analysis results
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: '1', status: 'completed', createdAt: '2023-10-15T14:30:00Z' },
          { id: '2', status: 'processing', createdAt: '2023-10-15T15:30:00Z' }
        ],
        status: 200
      });
      
      // Call the method
      const result = await apiClient.listAnalyses();
      
      // Verify the result structure matches array of analysis results
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      
      // Verify the API was called with correct URL
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/analyses'),
        expect.any(Object)
      );
    });

    it('lists analyses with filter parameters', async () => {
      // Call the method with parameters
      await apiClient.listAnalyses({ 
        status: 'completed',
        sortBy: 'createdAt',
        sortDirection: 'desc',
        limit: 10,
        offset: 0
      });
      
      // Verify the API was called with correct query parameters
      expect(fetch).toHaveBeenCalledTimes(1);
      const fetchMock = vi.mocked(fetch);
      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('status=completed');
      expect(url).toContain('sortBy=createdAt');
      expect(url).toContain('sortDirection=desc');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
    });
  });
}); 