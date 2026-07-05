import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../apiClient';
import axios from 'axios';
// Removed unused type imports: Theme, SentimentData, SentimentStatements

// Mock axios to control network requests
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn().mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        request: vi.fn(),
        defaults: {
          headers: {
            common: {}
          }
        }
      }),
      defaults: {
        headers: {
          common: {}
        }
      },
      request: vi.fn()
    }
  };
});

describe('API Client - Response Format Handling', () => {
  let mockAxiosClient: any; // Declare at the describe level

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup default mock axios client
    mockAxiosClient = {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      defaults: {
        headers: {
          common: {}
        }
      }
    };

    (axios.create as jest.Mock).mockReturnValue(mockAxiosClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Theme Structure Handling', () => {
    it('handles standard theme format', async () => {
      // Setup standard theme format with proper Theme type
      const standardThemeResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            themes: [
              {
                id: 1,
                name: "Customer Service",
                frequency: 5,
                keywords: ["service", "helpful"],
                statements: ["Great customer service experience"]
              },
              {
                id: 2,
                name: "Product Quality",
                frequency: 3,
                keywords: ["quality", "durable"],
                statements: ["Product feels durable"]
              }
            ]
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(standardThemeResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.themes).toHaveLength(2);
      expect(result.themes[0].name).toBe("Customer Service");
      expect(result.themes[0].frequency).toBe(5);
      expect(result.themes[0].statements).toContain("Great customer service experience");
    });

    it('handles alternative theme format with different properties', async () => {
      // Setup alternative theme format (from older API version)
      const alternativeThemeResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            themes: [
              {
                id: 1,
                theme: "Customer Service", // Non-standard property
                frequency: 5,
                keywords: ["support"],
                examples: ["Great customer service experience"] // Using examples instead of statements
              },
              {
                id: 2,
                theme: "Product Quality", // Non-standard property
                frequency: 3,
                keywords: ["durable"],
                examples: ["Product feels durable"] // Using examples instead of statements
              }
            ]
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(alternativeThemeResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.themes).toHaveLength(2);
      // Should normalize alternative format to standard format
      expect(result.themes[0].name).toBeDefined();
      expect(result.themes[0].frequency).toBeDefined();
      expect(result.themes[0].statements).toBeDefined(); // Statements should be defined
    });

    it('handles missing theme properties gracefully', async () => {
      // Setup response with missing theme properties
      const incompleteThemeResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            themes: [
              {
                id: 1,
                name: "Customer Service"
                // Missing frequency and keywords
              },
              {
                id: 2
                // Missing name and other properties
              }
            ]
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(incompleteThemeResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.themes).toHaveLength(2);
      expect(result.themes[0].name).toBe("Customer Service");
      expect(result.themes[0].frequency).toBeDefined(); // Should default to a value
      expect(result.themes[0].keywords).toBeDefined(); // Should default to empty array

      // Even empty theme should be handled
      expect(result.themes[1]).toBeDefined();
      expect(result.themes[1].name).toBeDefined(); // Should default to placeholder
    });
  });

  describe('Sentiment Data Format Handling', () => {
    it('handles standard sentiment format', async () => {
      // Setup standard sentiment format with proper SentimentData type
      const standardSentimentResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            sentiment: [
              { timestamp: "2023-04-20T12:01:00Z", score: 0.5, text: "First statement" },
              { timestamp: "2023-04-20T12:02:00Z", score: 0.7, text: "Second statement" },
              { timestamp: "2023-04-20T12:03:00Z", score: -0.2, text: "Third statement" },
              { timestamp: "2023-04-20T12:04:00Z", score: 0.3, text: "Fourth statement" }
            ],
            sentimentStatements: {
              positive: ["I love this product", "The service was great"],
              neutral: ["It works as expected"],
              negative: ["The service was terrible"]
            },
            sentimentOverview: {
              positive: 0.5,
              neutral: 0.3,
              negative: 0.2
            }
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(standardSentimentResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.sentiment).toHaveLength(4);
      expect(result.sentiment[0].score).toBe(0.5);
      expect(result.sentimentStatements).toBeDefined();
      expect(result.sentimentStatements?.positive).toContain("I love this product");
      expect(result.sentimentStatements?.negative).toContain("The service was terrible");
      expect(result.sentimentOverview).toBeDefined();
      expect(result.sentimentOverview.positive).toBeGreaterThan(0);
    });

    it('handles alternative sentiment format', async () => {
      // Setup alternative sentiment format (from older API version)
      const alternativeSentimentResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            sentimentAnalysis: {
              overallScore: 0.3,
              sentiments: [
                { time: "2023-04-20T12:01:00Z", value: 0.5, statement: "First statement" },
                { time: "2023-04-20T12:02:00Z", value: 0.7, statement: "Second statement" },
                { time: "2023-04-20T12:03:00Z", value: -0.2, statement: "Third statement" },
                { time: "2023-04-20T12:04:00Z", value: 0.3, statement: "Fourth statement" }
              ],
              statements: {
                positive_statements: ["I love this product", "The service was great"],
                neutral_statements: ["It works as expected"],
                negative_statements: ["The service was terrible"]
              }
            }
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(alternativeSentimentResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Should normalize alternative format to standard format
      expect(result.sentiment).toBeDefined();
      expect(result.sentimentStatements).toBeDefined();
      expect(result.sentimentOverview).toBeDefined();
    });

    it('handles missing sentiment data gracefully', async () => {
      // Setup response with missing sentiment data
      const missingSentimentResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            // No sentiment data at all
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(missingSentimentResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.sentiment).toBeDefined(); // Should default to empty array
      expect(result.sentimentStatements).toBeDefined(); // Should default to empty object
      expect(result.sentimentOverview).toBeDefined(); // Should default to even distribution
      expect(result.sentimentOverview.positive).toBeDefined();
      expect(result.sentimentOverview.neutral).toBeDefined();
      expect(result.sentimentOverview.negative).toBeDefined();
    });
  });

  describe('Pattern Structure Handling', () => {
    it('handles standard pattern format', async () => {
      // Setup standard pattern format
      // (using 'evidence' for supporting statements)
      const standardPatternResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            patterns: [
              {
                id: 1,
                name: "Recurring Issue",
                frequency: 3,
                category: "Problem",
                description: "Customer mentioned the same problem multiple times",
                // Removed 'examples' as it's not in Pattern type
              }
            ]
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(standardPatternResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.patterns).toHaveLength(1);
      expect(result.patterns[0].name).toBe("Recurring Issue");
      expect(result.patterns[0].frequency).toBe(3);
      // Removed assertion for 'examples'
    });

    it('handles alternative pattern format', async () => {
      // Setup alternative pattern format
      const alternativePatternResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            repeatingPatterns: [
              {
                id: 1,
                patternName: "Recurring Issue",
                occurrences: 3,
                type: "Problem",
                patternDescription: "Customer mentioned the same problem multiple times",
                instances: ["First mention", "Second mention", "Third mention"]
              }
            ]
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(alternativePatternResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Should normalize alternative format to standard format
      expect(result.patterns).toBeDefined();
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Nested Data Structure Parsing', () => {
    it('handles deeply nested response structures', async () => {
      // Setup deeply nested response structure
      const deeplyNestedResponse = {
        data: {
          results: {
            id: "123",
            status: "completed",
            createdAt: "2023-04-20T12:00:00Z",
            fileName: "interview.txt",
            analysis: {
              thematic: {
                primaryThemes: [
                  {
                    id: 1,
                    themeName: "User Experience",
                    frequency: 5,
                    keywords: ["UX", "navigation"],
                    themeQuotes: ["The UX is intuitive", "Easy to navigate"]
                  }
                ],
                secondaryThemes: [
                  {
                    id: 2,
                    themeName: "Performance",
                    frequency: 3,
                    keywords: ["speed", "lag"],
                    themeQuotes: ["It's really fast", "No lag at all"]
                  }
                ]
              },
              emotional: {
                sentimentTrack: [
                  { timestamp: "2023-04-20T12:01:00Z", value: 0.2, statement: "First" },
                  { timestamp: "2023-04-20T12:02:00Z", value: 0.5, statement: "Second" },
                  { timestamp: "2023-04-20T12:03:00Z", value: 0.7, statement: "Third" }
                ],
                keyStatements: {
                  positive: ["I'm very happy with it"],
                  neutral: [],
                  negative: []
                }
              },
              patterns: {
                identifiedPatterns: [
                  {
                    id: 1,
                    patternType: "Repetition",
                    patternName: "Feature Request",
                    frequency: 2,
                    category: "Request",
                    description: "User repeatedly asked for features",
                    patternInstances: ["I wish it had...", "Would be nice to have..."]
                  }
                ]
              }
            }
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(deeplyNestedResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Even with deeply nested structure, the normalized result should have standard properties
      expect(result.id).toBe("123");
      expect(result.themes).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.patterns).toBeDefined();
    });
  });

  describe('Backwards Compatibility', () => {
    it('handles legacy API response format', async () => {
      // Setup very old API format
      const legacyResponse = {
        data: {
          analysis_id: "123",
          analysis_status: "completed",
          timestamp: "2023-04-20T12:00:00Z",
          file_name: "interview.txt",
          identified_themes: ["Customer Service", "Product Quality"],
          sentiment_scores: [
            { timestamp: "2023-04-20T12:01:00Z", value: 0.2, text: "First" },
            { timestamp: "2023-04-20T12:02:00Z", value: 0.3, text: "Second" },
            { timestamp: "2023-04-20T12:03:00Z", value: -0.1, text: "Third" }
          ],
          overall_sentiment: 0.13
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(legacyResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Should map old properties to new format
      expect(result.id).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.fileName).toBeDefined();
      expect(result.themes).toBeDefined();
      expect(result.sentiment).toBeDefined();
    });

    it('handles the very first API version format', async () => {
      // Setup extremely old API format (version 0.1)
      const veryOldResponse = {
        data: {
          id: "123",
          completed: true,
          date: "2023-04-20T12:00:00Z",
          source: "interview.txt",
          themes: "Customer Service, Product Quality, Ease of Use",
          sentiment: "positive"
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(veryOldResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Should convert string themes to array of theme objects
      expect(result.themes).toBeInstanceOf(Array);
      // Should derive sentiment scores from string sentiment
      expect(result.sentiment).toBeDefined();
      expect(result.sentimentOverview).toBeDefined();
    });
  });

  describe('Graceful Degradation', () => {
    it('handles missing required fields', async () => {
      // Setup response with minimal data
      const minimalResponse = {
        data: {
          results: {
            id: "123"
            // Missing almost everything
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(minimalResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      expect(result.id).toBe("123");
      expect(result.status).toBeDefined(); // Should default to something
      expect(result.createdAt).toBeDefined(); // Should default to a date
      expect(result.fileName).toBeDefined(); // Should default to a placeholder
      expect(result.themes).toBeDefined(); // Should default to empty array
      expect(result.patterns).toBeDefined(); // Should default to empty array
      expect(result.sentiment).toBeDefined(); // Should default to empty array
    });

    it('handles malformed fields with invalid types', async () => {
      // Setup response with incorrect data types
      const malformedResponse = {
        data: {
          results: {
            id: 123, // Number instead of string
            status: ["completed"], // Array instead of string
            createdAt: true, // Boolean instead of string
            fileName: 45.6, // Number instead of string
            themes: "Some themes", // String instead of array
            patterns: null, // Null instead of array
            sentiment: { score: 0.5 } // Object instead of array
          }
        }
      };

      mockAxiosClient.get.mockResolvedValueOnce(malformedResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // Should handle type conversion or use defaults
      expect(typeof result.id).toBe("string");
      expect(typeof result.status).toBe("string");
      expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}/); // Should look like a date
      expect(typeof result.fileName).toBe("string");
      expect(Array.isArray(result.themes)).toBe(true);
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(Array.isArray(result.sentiment)).toBe(true);
    });

    it('handles completely empty response', async () => {
      // Setup entirely empty response
      const emptyResponse = {
        data: {}
      };

      mockAxiosClient.get.mockResolvedValueOnce(emptyResponse);

      const result = await apiClient.getAnalysisById("123");

      expect(result).toBeDefined();
      // All fields should have defaults
      expect(result.id).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.fileName).toBeDefined();
      expect(result.themes).toBeDefined();
      expect(result.patterns).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.sentimentOverview).toBeDefined();
    });
  });
});
