import { describe, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { apiClient } from '../apiClient';
import {
  mockThemes,
  mockPatterns,
  mockSentimentData,
  mockSentimentOverview,
  mockSentimentStatements,
  mockPersonas
} from '../../test/mocks/api';

// Global mocks
global.fetch = vi.fn();
const fetchMock = fetch as jest.Mock;

// Mock dependencies
vi.mock('../config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.com',
    defaultHeaders: { 'Content-Type': 'application/json' }
  }
}));

describe('API Client - Results Retrieval Operations', () => {
  // Default mock response
  const defaultMockResponse = {
    id: 'analysis-123',
    status: 'completed',
    createdAt: '2023-04-15T12:00:00Z',
    fileName: 'customer_feedback.json',
    themes: mockThemes,
    patterns: mockPatterns,
    sentiment: mockSentimentData,
    sentimentOverview: mockSentimentOverview
  };

  beforeEach(() => {
    // Reset mocks before each test
    fetchMock.mockReset();

    // Default successful response setup
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => defaultMockResponse
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAnalysisById', () => {
    test('should get analysis results successfully', async () => {
      // Arrange
      const analysisId = 'analysis-123';

      // Act
      const result = await apiClient.getAnalysisById(analysisId);

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/analyses/analysis-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(defaultMockResponse);
      expect(result.themes).toEqual(mockThemes);
      expect(result.patterns).toEqual(mockPatterns);
      expect(result.sentiment).toEqual(mockSentimentData);
      expect(result.sentimentOverview).toEqual(mockSentimentOverview);
    });

    test('should handle extended data structures including personas', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      const extendedResponse = {
        ...defaultMockResponse,
        personas: mockPersonas,
        sentimentStatements: mockSentimentStatements
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => extendedResponse
      });

      // Act
      const result = await apiClient.getAnalysisById(analysisId);

      // Assert
      expect(result.personas).toEqual(mockPersonas);
      expect(result.sentimentStatements).toEqual(mockSentimentStatements);
    });

    test('should parse theme data correctly', async () => {
      // Act
      const result = await apiClient.getAnalysisById('analysis-123');

      // Assert
      expect(result.themes).toHaveLength(mockThemes.length);
      // Check a sample theme
      const sampleTheme = result.themes[0];
      expect(sampleTheme).toHaveProperty('name');
      expect(sampleTheme).toHaveProperty('frequency');
      expect(sampleTheme).toHaveProperty('sentiment');
      expect(sampleTheme).toHaveProperty('keywords');
      expect(sampleTheme).toHaveProperty('examples');
    });

    test('should parse pattern data correctly', async () => {
      // Act
      const result = await apiClient.getAnalysisById('analysis-123');

      // Assert
      expect(result.patterns).toHaveLength(mockPatterns.length);
      // Check a sample pattern
      const samplePattern = result.patterns[0];
      expect(samplePattern).toHaveProperty('description');
      expect(samplePattern).toHaveProperty('frequency');
      expect(samplePattern).toHaveProperty('sentiment');
      expect(samplePattern).toHaveProperty('evidence');
    });

    test('should parse sentiment data correctly', async () => {
      // Act
      const result = await apiClient.getAnalysisById('analysis-123');

      // Assert
      expect(result.sentiment).toHaveLength(mockSentimentData.length);
      // Check a sample sentiment data point
      const samplePoint = result.sentiment[0];
      expect(samplePoint).toHaveProperty('timestamp');
      expect(samplePoint).toHaveProperty('score');
    });

    test('should handle 404 error when analysis not found', async () => {
      // Arrange
      const analysisId = 'non-existent-id';
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Analysis not found' })
      });

      // Act & Assert
      await expect(apiClient.getAnalysisById(analysisId)).rejects.toThrow('Analysis not found');
    });

    test('should handle network error', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      // Act & Assert
      await expect(apiClient.getAnalysisById(analysisId)).rejects.toThrow('Network error');
    });

    test('should handle malformed response data', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'analysis-123',
          status: 'completed',
          // Missing expected fields
        })
      });

      // Act
      const result = await apiClient.getAnalysisById(analysisId);

      // Assert
      expect(result.id).toBe('analysis-123');
      expect(result.themes).toBeUndefined();
      expect(result.patterns).toBeUndefined();
      expect(result.sentiment).toBeUndefined();
    });

    test('should validate analysis ID parameter', async () => {
      // Act & Assert
      // @ts-expect-error - Testing with invalid parameter
      await expect(apiClient.getAnalysisById()).rejects.toThrow();
      await expect(apiClient.getAnalysisById('')).rejects.toThrow();
    });
  });

  describe('getAnalysisByIdWithPolling', () => {
    test('should poll until analysis is completed', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      const processingResponse = {
        id: 'analysis-123',
        status: 'processing',
        createdAt: '2023-04-15T12:00:00Z',
        fileName: 'customer_feedback.json'
      };

      // First call returns processing status
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => processingResponse
      });

      // Second call returns completed analysis
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => defaultMockResponse
      });

      // Act
      const result = await apiClient.getAnalysisByIdWithPolling(analysisId, 100);

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual(defaultMockResponse);
    });

    test('should respect polling interval', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      const processingResponse = {
        id: 'analysis-123',
        status: 'processing',
        createdAt: '2023-04-15T12:00:00Z',
        fileName: 'customer_feedback.json'
      };

      vi.useFakeTimers();

      // First call returns processing status
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => processingResponse
      });

      // Second call returns completed analysis
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => defaultMockResponse
      });

      // Act
      const resultPromise = apiClient.getAnalysisByIdWithPolling(analysisId, 1000);

      // Wait for the first call to complete
      await vi.advanceTimersByTimeAsync(10);

      // Wait for the polling interval
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      // Assert
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result).toEqual(defaultMockResponse);

      vi.useRealTimers();
    });

    test('should stop polling after max attempts', async () => {
      // Arrange
      const analysisId = 'analysis-123';
      const processingResponse = {
        id: 'analysis-123',
        status: 'processing',
        createdAt: '2023-04-15T12:00:00Z',
        fileName: 'customer_feedback.json'
      };

      // All calls return processing status
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => processingResponse
      });

      // Act & Assert
      await expect(
        apiClient.getAnalysisByIdWithPolling(analysisId, 100, 3)
      ).rejects.toThrow('Analysis processing timed out after 3 attempts');

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
