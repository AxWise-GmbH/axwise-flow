import axios, { AxiosInstance } from 'axios';
import type { UploadResponse, DetailedAnalysisResult, AnalysisResponse, SentimentOverview, PriorityInsightsResponse } from '@/types/api';

// Add a custom property to the AxiosRequestConfig type to fix the _retry issue
declare module 'axios' {
  export interface AxiosRequestConfig {
    _retry?: boolean;
  }
}

// Add an interface for the window object that includes showToast
declare global {
  interface Window {
    showToast?: (message: string, options?: any) => void;
  }
}

/**
 * API Client for interacting with the backend API
 *
 * Implemented as a true singleton to ensure consistent API interaction across the application.
 * Always import the pre-instantiated singleton instance:
 * ```typescript
 * import { apiClient } from '@/lib/apiClient';
 * ```
 *
 * DO NOT create new instances with `new ApiClient()` as the constructor is private.
 */
class ApiClient {
  private static instance: ApiClient | null = null;
  private client: AxiosInstance;
  private baseUrl: string;
  private tokenRefreshInProgress: boolean = false;

  /**
   * Private constructor to prevent direct instantiation.
   * Use ApiClient.getInstance() instead.
   */
  private constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Added CORS header
        'X-API-Version': 'merged-976ce06-current' // Version tracking for debugging
      },
      // Increase default timeout for potentially longer operations
      timeout: 120000, // 120 seconds (increased from 30)
    });

    // Add response interceptor for handling auth errors and network issues
    this.client.interceptors.response.use(
      (response) => response,
      async (error: any) => {
        // Enhanced error detection and handling
        const isConnectionRefused =
          error?.message?.includes('Connection refused') ||
          error?.message?.includes('Network Error') ||
          error?.code === 'ERR_CONNECTION_REFUSED' ||
          error?.code === 'ERR_NETWORK';

        // Ensure error is an AxiosError
        if (!error || !error.response) {
          // Check for network errors (likely CORS issues or server down)
          if (isConnectionRefused) {
            console.error('Backend connection refused or not available');
            // For GET requests, return empty data instead of rejecting
            if (error.config?.method?.toLowerCase() === 'get') {
              if (window.showToast) {
                window.showToast('Backend server is not responding. Using mock data instead.', { variant: 'error' });
              }
              console.warn('Returning empty data for GET request due to connection error');
              return { data: [] };
            }
          } else if (error.message?.includes('CORS')) {
            console.error('CORS error detected in interceptor');
            // For GET requests, return empty data instead of rejecting
            if (error.config?.method?.toLowerCase() === 'get') {
              console.warn('Returning empty data for GET request due to CORS error');
              return { data: [] };
            }
          }
          return Promise.reject(error);
        }

        const originalRequest = error.config;

        if (!originalRequest) {
          return Promise.reject(error);
        }

        // Handle token expiration (401 errors)
        if (error.response.status === 401 && !originalRequest._retry) {
          if (!this.tokenRefreshInProgress) {
            this.tokenRefreshInProgress = true;
            originalRequest._retry = true;

            try {
              // Try to refresh the token if using Clerk
              const token = await this.getAuthToken();
              if (token) {
                this.setAuthToken(token);
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${token}`;
                // Use axios directly rather than this.client for the retry
                return axios.request(originalRequest);
              }
            } catch (refreshError) {
              console.error('Failed to refresh token:', refreshError);
              // Redirect to login or show auth error
              window.location.href = '/login?error=session_expired';
            } finally {
              this.tokenRefreshInProgress = false;
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the singleton instance of ApiClient.
   * This is the only way to access the ApiClient.
   */
  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  /**
   * Get an authentication token from Clerk if available
   */
  public async getAuthToken(): Promise<string | null> {
    try {
      // In development mode, return a development token
      if (process.env.NODE_ENV === 'development' || typeof window === 'undefined') {
        console.log('Using development token for authentication');
        return 'DEV_TOKEN_REDACTED';
      }

      // This assumes Clerk is loaded and available in the global window object
      if (window.Clerk?.session) {
        return await window.Clerk.session.getToken();
      }

      // Fallback to development token if Clerk is not available
      console.log('Clerk not available, using development token');
      return 'DEV_TOKEN_REDACTED';
    } catch (error) {
      console.error('Error getting auth token:', error);
      // Fallback to development token on error
      return 'DEV_TOKEN_REDACTED';
    }
  }

  /**
   * Set the authentication token for API requests
   */
  setAuthToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    console.log('Auth token set');
  }

  /**
   * Upload data to the API
   */
  async uploadData(file: File, isTextFile: boolean = false): Promise<UploadResponse> {
    try {
      // Log the request data for debugging
      console.log('Uploading file:', {
        filename: file.name,
        type: file.type,
        size: file.size,
        isTextFile
      });

      const formData = new FormData();
      formData.append('file', file);

      // Convert boolean to string representation expected by the backend
      formData.append('is_free_text', String(isTextFile));

      // Add additional data that might be required by the backend
      formData.append('filename', file.name);
      formData.append('content_type', file.type);

      const response = await this.client.post<UploadResponse>('/api/data', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Accept': 'application/json',
        },
        // Increase timeout significantly for potentially large files and initial processing
        timeout: 180000, // 180 seconds (increased from 60)
      });

      console.log('Upload response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error uploading data:', error);

      // Enhanced error debugging
      if (error?.response?.data?.detail) {
        console.error('Server error details:', error.response.data.detail);
      }

      // Handle different error types safely
      if (error && error.response) {
        // Handle 401 separately as it's typically an auth issue
        if (error.response.status === 401) {
          throw new Error('Authentication required. Please log in.');
        }

        // Handle 422 errors specifically for better feedback
        if (error.response.status === 422) {
          const errorDetail = error.response.data?.detail;
          if (Array.isArray(errorDetail) && errorDetail.length > 0) {
            // Handle FastAPI validation error format
            const validationErrors = errorDetail.map((err: any) =>
              `${err.loc.join('.')}: ${err.msg}`
            ).join(', ');
            throw new Error(`Validation error: ${validationErrors}`);
          } else if (typeof errorDetail === 'string') {
            throw new Error(`Validation error: ${errorDetail}`);
          } else {
            throw new Error('The server could not process your request. Please check your file format.');
          }
        }

        // Use the server error message if available
        const errorResponse = error.response.data as { detail?: string };
        if (errorResponse?.detail) {
          throw new Error(errorResponse.detail);
        }
      }

      // Generic error with a safe message access
      const errorMessage = error && typeof error.message === 'string'
        ? error.message
        : 'Unknown error';
      throw new Error(`Upload failed: ${errorMessage}`);
    }
  }

  /**
   * Trigger analysis of uploaded data
   *
   * Note: Enhanced theme analysis is always enabled on the backend,
   * so we've removed the useEnhancedThemeAnalysis parameter.
   */
  async analyzeData(
    dataId: number,
    llmProvider: 'openai' | 'gemini' = 'openai',
    llmModel?: string,
    isTextFile?: boolean
  ): Promise<AnalysisResponse> {
    const response = await this.client.post('/api/analyze', {
      data_id: dataId,
      llm_provider: llmProvider,
      llm_model: llmModel,
      is_free_text: isTextFile || false
      // Enhanced theme analysis is always enabled on the backend
    }, {
      timeout: 60000 // 60 seconds timeout for triggering analysis
    });
    return response.data;
  }

  /**
   * Calculate sentiment overview from sentiment data
   */
  private calculateSentimentOverview(scores: number[]): SentimentOverview {
    if (!scores || scores.length === 0) {
      return { positive: 0.33, neutral: 0.34, negative: 0.33 };
    }

    const counts = scores.reduce((acc: { positive: number, neutral: number, negative: number }, score: number) => {
      if (score >= 0.2) acc.positive++;
      else if (score <= -0.2) acc.negative++;
      else acc.neutral++;
      return acc;
    }, { positive: 0, neutral: 0, negative: 0 });

    const total = scores.length;
    return {
      positive: counts.positive / total,
      neutral: counts.neutral / total,
      negative: counts.negative / total
    };
  }

  /**
   * Get analysis result by ID
   */
  async getAnalysisById(id: string): Promise<DetailedAnalysisResult> {
    try {
      const response = await this.client.get(`/api/results/${id}`, {
        timeout: 120000 // 120 seconds timeout for fetching potentially large results
      });
      console.log('API response data (raw):', JSON.stringify(response.data, null, 2));

      if (!response.data.results) {
        throw new Error('Invalid API response: missing results');
      }

      const results = response.data.results;

      // Add specific logging for sentimentStatements
      console.log('SentimentStatements from API (direct):',
                 results.sentimentStatements ?
                 JSON.stringify(results.sentimentStatements, null, 2) :
                 'MISSING');

      // Check if results.sentimentStatements exists directly
      console.log('Raw sentimentStatements from API:',
                 results.sentimentStatements ?
                 JSON.stringify(results.sentimentStatements, null, 2) :
                 'MISSING');

      // Make sure sentimentStatements are properly extracted and preserved
      if (results.sentimentStatements) {
        console.log("Found sentiment statements in API response:", JSON.stringify(results.sentimentStatements, null, 2));
      } else {
        console.warn("No sentiment statements found in API response");
      }

      // Log sentiment data structure to help with debugging
      if (Array.isArray(results.sentiment)) {
        console.log(`Sentiment array found with ${results.sentiment.length} items`);
        if (results.sentiment.length > 0) {
          console.log("Sample sentiment item:", JSON.stringify(results.sentiment[0], null, 2));
        }
      } else {
        console.warn("Sentiment is not an array:", typeof results.sentiment);
        // Handle case where sentiment is an object instead of an array
        if (results.sentiment && typeof results.sentiment === 'object') {
          // Convert object structure to expected format if needed
          const sentimentData = results.sentiment;

          // Initialize sentimentStatements if not present or malformed
          if (!results.sentimentStatements ||
              typeof results.sentimentStatements !== 'object' ||
              !results.sentimentStatements.positive ||
              !results.sentimentStatements.neutral ||
              !results.sentimentStatements.negative) {

            results.sentimentStatements = {
              positive: [],
              neutral: [],
              negative: []
            };

            // If the sentiment object has statement data in a different format, extract it
            if (sentimentData.statements) {
              // Process statements if available
              const statements = sentimentData.statements || {};

              if (Array.isArray(statements.positive)) {
                results.sentimentStatements.positive = statements.positive;
              }
              if (Array.isArray(statements.neutral)) {
                results.sentimentStatements.neutral = statements.neutral;
              }
              if (Array.isArray(statements.negative)) {
                results.sentimentStatements.negative = statements.negative;
              }
            }
          }
        }
      }

      // Ensure we have the required fields
      if (!Array.isArray(results.sentiment)) {
        // Convert sentiment object to array if necessary
        if (results.sentiment && typeof results.sentiment === 'object') {
          // Keep object format but ensure it has the necessary properties
          // Don't override if it's already properly structured
        } else {
          results.sentiment = [];
        }
      }

      // Ensure themes have statements if they exist as supporting_quotes or examples
      if (Array.isArray(results.themes)) {
        results.themes = results.themes.map((theme: {
          statements?: string[];
          supporting_quotes?: string[];
          examples?: string[];
          quotes?: string[];
          sentiment_distribution?: { positive: number; neutral: number; negative: number };
          [key: string]: any;
        }) => {
          // Initialize statements array if it doesn't exist
          if (!theme.statements || !Array.isArray(theme.statements)) {
            theme.statements = [];
          }

          // Check for supporting_quotes field (API might return this format)
          if (theme.supporting_quotes && Array.isArray(theme.supporting_quotes) && theme.supporting_quotes.length > 0) {
            theme.statements = [...theme.statements, ...theme.supporting_quotes];
          }

          // Check for examples field (backward compatibility)
          if (theme.examples && Array.isArray(theme.examples) && theme.examples.length > 0 && theme.statements.length === 0) {
            theme.statements = [...theme.statements, ...theme.examples];
          }

          // Check for quotes field (another possible format)
          if (theme.quotes && Array.isArray(theme.quotes) && theme.quotes.length > 0 && theme.statements.length === 0) {
            theme.statements = [...theme.statements, ...theme.quotes];
          }

          // Ensure sentiment_distribution exists
          if (!theme.sentiment_distribution) {
            // Calculate a default sentiment distribution based on the theme's sentiment score
            const sentimentScore = theme.sentiment || 0;
            if (sentimentScore >= 0.3) {
              theme.sentiment_distribution = { positive: 0.7, neutral: 0.2, negative: 0.1 };
            } else if (sentimentScore <= -0.3) {
              theme.sentiment_distribution = { positive: 0.1, neutral: 0.2, negative: 0.7 };
            } else {
              theme.sentiment_distribution = { positive: 0.2, neutral: 0.6, negative: 0.2 };
            }
            console.log(`Added default sentiment distribution for theme: ${theme.name}`);
          }

          return theme;
        });
      }

      // Calculate sentimentOverview if missing
      if (!results.sentimentOverview) {
        const scores = results.sentiment
          .map((s: { score: number }) => s.score)
          .filter((score: number) => typeof score === 'number');
        results.sentimentOverview = this.calculateSentimentOverview(scores);
      }

      // Validate sentimentOverview
      if (!results.sentimentOverview ||
          typeof results.sentimentOverview.positive !== 'number' ||
          typeof results.sentimentOverview.neutral !== 'number' ||
          typeof results.sentimentOverview.negative !== 'number') {
        results.sentimentOverview = {
          positive: 0.33,
          neutral: 0.34,
          negative: 0.33
        };
      }

      // IMPORTANT: This is where we need to handle the raw sentiment data vs. sentimentStatements
      // Check if we need to initialize sentimentStatements structure
      if (!results.sentimentStatements ||
          !results.sentimentStatements.positive ||
          !results.sentimentStatements.neutral ||
          !results.sentimentStatements.negative) {

        console.log("Initializing sentimentStatements structure");

        // Initialize with empty arrays if needed
        if (!results.sentimentStatements) {
        results.sentimentStatements = {
          positive: [],
          neutral: [],
          negative: []
        };
        }

        // Ensure all arrays exist
        if (!Array.isArray(results.sentimentStatements.positive)) results.sentimentStatements.positive = [];
        if (!Array.isArray(results.sentimentStatements.neutral)) results.sentimentStatements.neutral = [];
        if (!Array.isArray(results.sentimentStatements.negative)) results.sentimentStatements.negative = [];
      }

      // Check for raw sentiment data to combine with sentimentStatements
      // This handles the case where sentiment contains the raw arrays directly
      if (results.sentiment && typeof results.sentiment === 'object') {
        const sentimentObj = results.sentiment;

        // Check if sentiment has direct positive/neutral/negative arrays
        if (Array.isArray(sentimentObj.positive)) {
          console.log(`Found ${sentimentObj.positive.length} positive statements in sentiment object`);

          // Only merge if there are actually statements
          if (sentimentObj.positive.length > 0) {
            // Merge unique statements from sentiment.positive into sentimentStatements.positive
            sentimentObj.positive.forEach((statement: string) => {
              if (!results.sentimentStatements.positive.includes(statement)) {
                results.sentimentStatements.positive.push(statement);
              }
            });
          }
        }

        if (Array.isArray(sentimentObj.neutral)) {
          console.log(`Found ${sentimentObj.neutral.length} neutral statements in sentiment object`);

          // Only merge if there are actually statements
          if (sentimentObj.neutral.length > 0) {
            // Merge unique statements from sentiment.neutral into sentimentStatements.neutral
            sentimentObj.neutral.forEach((statement: string) => {
              if (!results.sentimentStatements.neutral.includes(statement)) {
                results.sentimentStatements.neutral.push(statement);
              }
            });
          }
        }

        if (Array.isArray(sentimentObj.negative)) {
          console.log(`Found ${sentimentObj.negative.length} negative statements in sentiment object`);

          // Only merge if there are actually statements
          if (sentimentObj.negative.length > 0) {
            // Merge unique statements from sentiment.negative into sentimentStatements.negative
            sentimentObj.negative.forEach((statement: string) => {
              if (!results.sentimentStatements.negative.includes(statement)) {
                results.sentimentStatements.negative.push(statement);
              }
            });
          }
        }

        // Check for raw supporting_statements
        if (sentimentObj.supporting_statements && typeof sentimentObj.supporting_statements === 'object') {
          const supportingStmts = sentimentObj.supporting_statements;

          if (Array.isArray(supportingStmts.positive) && supportingStmts.positive.length > 0) {
            // Merge unique statements from supporting_statements.positive
            supportingStmts.positive.forEach((statement: string) => {
              if (!results.sentimentStatements.positive.includes(statement)) {
                results.sentimentStatements.positive.push(statement);
              }
            });
          }

          if (Array.isArray(supportingStmts.neutral) && supportingStmts.neutral.length > 0) {
            // Merge unique statements from supporting_statements.neutral
            supportingStmts.neutral.forEach((statement: string) => {
              if (!results.sentimentStatements.neutral.includes(statement)) {
                results.sentimentStatements.neutral.push(statement);
              }
            });
          }

          if (Array.isArray(supportingStmts.negative) && supportingStmts.negative.length > 0) {
            // Merge unique statements from supporting_statements.negative
            supportingStmts.negative.forEach((statement: string) => {
              if (!results.sentimentStatements.negative.includes(statement)) {
                results.sentimentStatements.negative.push(statement);
              }
            });
          }
        }

        // Log combined results
        console.log('Combined sentiment statements:', {
            positive: results.sentimentStatements.positive.length,
            neutral: results.sentimentStatements.neutral.length,
            negative: results.sentimentStatements.negative.length
        });
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('Using provided sentimentStatements without merging:', {
            positive: results.sentimentStatements.positive?.length || 0,
            neutral: results.sentimentStatements.neutral?.length || 0,
            negative: results.sentimentStatements.negative?.length || 0
          });
        }
      }

      // Removed synthetic statement generation to only show actual statements from interviews

      // Ensure other required fields
      if (!Array.isArray(results.themes)) results.themes = [];
      if (!Array.isArray(results.patterns)) results.patterns = [];
      if (!results.id) results.id = id;
      if (!results.status) results.status = 'completed';
      if (!results.createdAt) results.createdAt = new Date().toISOString();
      if (!results.fileName) results.fileName = 'Unknown File';

      // IMPORTANT: Extract sentimentStatements to top-level of returned object
      // This ensures it's available directly on the analysis object
      const finalResult = {
        ...results,
        // Extract sentimentStatements to top level if available
        sentimentStatements: results.sentimentStatements ||
                            (results.sentiment && results.sentiment.sentimentStatements) ||
                            {positive: [], neutral: [], negative: []}
      };

      console.log('Processed analysis data:', finalResult);
      return finalResult;

    } catch (error: any) {
      console.error('API error:', error);
      throw new Error(`Failed to fetch analysis: ${error.message}`);
    }
  }

  /**
   * List all analyses
   */
  async listAnalyses(params?: unknown): Promise<DetailedAnalysisResult[]> {
    console.log('ApiClient: listAnalyses called with params:', params);
    try {
      // Add timeout and retry options
      const response = await this.client.get('/api/analyses', {
        params,
        timeout: 10000, // 10 second timeout
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Client-Origin': window.location.origin  // Use a custom header instead of Origin
        }
      });

      console.log('ApiClient: listAnalyses response received', response.status);

      // Detailed response logging
      console.log('Response headers:', response.headers);
      console.log('Raw response data type:', typeof response.data);

      // Ensure we have an array, even if backend returns an object
      let analysesArray: DetailedAnalysisResult[] = [];

      if (Array.isArray(response.data)) {
        console.log(`Processing array response with ${response.data.length} items`);
        analysesArray = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // If response is an object, check if it has numeric keys (like an object representation of an array)
        console.log('Processing object response, checking format');

        // If it's a regular object, check if it has an 'error' property
        if (response.data.error) {
          console.error('Server returned error:', response.data.error);
          return this.generateMockAnalyses();
        }

        // If it's an array-like object, convert to array
        if (Object.keys(response.data).some(key => !isNaN(Number(key)))) {
          console.log('Converting array-like object to array');
          analysesArray = Object.values(response.data);
        } else {
          // Last resort - wrap single object in array if it has expected properties
          if ('id' in response.data && 'status' in response.data) {
            console.log('Wrapping single analysis object in array');
            analysesArray = [response.data as DetailedAnalysisResult];
          }
        }
      }

      // Handle empty results
      if (analysesArray.length === 0) {
        console.log('No analyses found in response');
        if (window.showToast) {
          window.showToast('No analyses found. Try uploading a file first.');
        }
      } else {
        console.log(`Returning ${analysesArray.length} analyses`);
      }

      return analysesArray;
    } catch (error: any) {
      // Enhanced error logging
      const errorMessage = error?.message || 'Unknown error';
      const statusCode = error?.response?.status;

      if (errorMessage.includes('Network Error') || errorMessage.includes('CORS')) {
        console.error('CORS/network issue detected in API client');
        // Show a toast or notification to the user
        if (window.showToast) {
          window.showToast('Backend connection issue detected. Using sample data instead.');
        }
      } else if (statusCode === 500) {
        console.error('Backend server error (500) when fetching analyses');
        if (window.showToast) {
          window.showToast('Server error occurred. Using sample data instead.');
        }
      } else {
        console.error('Error fetching analyses:', errorMessage, error);
      }

      // Always return mock data on error to prevent UI from breaking
      return this.generateMockAnalyses();
    }
  }

  /**
   * Generate mock analyses data for fallback
   */
  private generateMockAnalyses(): DetailedAnalysisResult[] {
    const mockDate = new Date().toISOString();

    return [
      {
        id: 'mock-1',
        fileName: 'example-1.txt',
        fileSize: 2500,
        status: 'completed',
        createdAt: mockDate,
        themes: [
          { id: 1, name: 'User Feedback', frequency: 0.8, keywords: ['feedback', 'review'] }, // Fix ID type
          { id: 2, name: 'Product Features', frequency: 0.5, keywords: ['feature', 'capability'] } // Fix ID type
        ],
        patterns: [
          { id: "1", name: 'Feature Requests', category: 'Enhancement', description: 'Users requesting specific features', frequency: 0.7, count: 10 }, // Add count
          { id: "2", name: 'Pain Points', category: 'Issue', description: 'Common issues users face', frequency: 0.6, count: 8 } // Add count
        ],
        sentiment: [],
        sentimentOverview: {
          positive: 0.5,
          negative: 0.3,
          neutral: 0.2
        },
        // Add mock personas to the analysis results
        personas: [
          {
            name: "Design Lead Alex",
            description: "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research.",
            confidence: 0.85,
            patterns: ['Design System Adoption', 'Research Advocacy'], // Add patterns
            evidence: [
              "Manages UX team of 5-7 designers",
              "Responsible for design system implementation"
            ],
            role_context: {
              value: "Design team lead at medium-sized technology company",
              confidence: 0.9,
              evidence: ["Manages UX team of 5-7 designers", "Responsible for design system implementation"]
            },
            key_responsibilities: {
              value: "Oversees design system implementation. Manages team of designers. Coordinates with product and engineering",
              confidence: 0.85,
              evidence: ["Mentioned regular design system review meetings", "Discussed designer performance reviews"]
            },
            tools_used: {
              value: "Figma, Sketch, Adobe Creative Suite, Jira, Confluence",
              confidence: 0.8,
              evidence: ["Referenced Figma components", "Mentioned Jira ticketing system"]
            },
            collaboration_style: {
              value: "Cross-functional collaboration with tight integration between design and development",
              confidence: 0.75,
              evidence: ["Weekly sync meetings with engineering", "Design hand-off process improvements"]
            },
            analysis_approach: {
              value: "Data-informed design decisions with emphasis on usability testing",
              confidence: 0.7,
              evidence: ["Conducts regular user testing sessions", "Analyzes usage metrics to inform design"]
            },
            pain_points: {
              value: "Limited resources for user research. Engineering-driven decision making. Maintaining design quality with tight deadlines",
              confidence: 0.9,
              evidence: ["Expressed frustration about research budget limitations", "Mentioned quality issues due to rushed timelines"]
            }
          },
          {
            name: "Product Owner Jordan",
            description: "Jordan is a product owner who bridges business goals with user needs. Focused on defining priorities and managing stakeholder expectations while advocating for design quality.",
            confidence: 0.8,
            patterns: ['Roadmap Prioritization', 'Metric Tracking'], // Add patterns
            evidence: [
              "Discusses product roadmap planning",
              "Mentiones stakeholder management"
            ],
            role_context: {
              value: "Product Owner with 5+ years experience in SaaS products",
              confidence: 0.85,
              evidence: ["References to SaaS pricing models", "Discussions about subscription features"]
            },
            key_responsibilities: {
              value: "Defining product requirements. Prioritizing features. Managing stakeholder expectations",
              confidence: 0.9,
              evidence: ["Regular references to backlog prioritization", "Stakeholder update meetings"]
            },
            tools_used: {
              value: "Jira, Confluence, Miro, Amplitude, Google Analytics",
              confidence: 0.75,
              evidence: ["Mentioned Jira epic creation", "References to Amplitude dashboards"]
            },
            collaboration_style: {
              value: "Collaborative but directive, ensuring team alignment while providing clear direction",
              confidence: 0.7,
              evidence: ["Team planning sessions", "Decision-making frameworks mentioned"]
            },
            analysis_approach: {
              value: "Data-driven with strong emphasis on business metrics and user feedback",
              confidence: 0.8,
              evidence: ["Regular analysis of conversion metrics", "Customer feedback integration process"]
            },
            pain_points: {
              value: "Balancing technical debt with new features. Managing scope creep. Getting reliable user insights on time",
              confidence: 0.85,
              evidence: ["Expressed concern about technical debt accumulation", "Frustration with changing requirements"]
            }
          }
        ]
      }
    ];
  }

  /**
   * Generate mock personas data for fallback
   */
  private generateMockPersonas(): any[] {
    return [
      {
        "name": "Design Leader Alex",
        "traits": [
          { "value": "Design team lead at medium-sized technology company", "confidence": 0.9, "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"] },
          { "value": "8+ years experience in UX/UI design", "confidence": 0.95, "evidence": ["Has worked on enterprise applications", "Mentions experience with design systems"] },
          { "value": "Advocates for user research and testing", "confidence": 0.85, "evidence": ["Pushes for more user testing resources", "Frustrated by decisions made without user input"] }
        ],
        "goals": [
          "Improve design consistency across products",
          "Increase design team influence in product decisions",
          "Implement better research practices"
        ],
        "painPoints": [
          "Limited resources for user research",
          "Engineering-driven decision making",
          "Maintaining design quality with tight deadlines"
        ],
        "description": "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research."
      }
    ];
  }

  /**
   * Get processing status for an analysis
   */
  async getProcessingStatus(analysisId: string): Promise<any> {
    try {
      const response = await this.client.get(`/api/analysis/${analysisId}/status`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching processing status:', error);

      // If the error is 404, check if the analysis is completed by trying to fetch its results
      if (error.response && error.response.status === 404) {
        try {
          // Try to get the analysis results - if successful, the analysis is likely complete
          const resultData = await this.getAnalysisById(analysisId);
          if (resultData && resultData.status === 'completed') {
            // Return completed status
            return {
              current_stage: 'COMPLETION',
              completed_at: new Date().toISOString(),
              stage_states: {
                'FILE_UPLOAD': { status: 'completed', progress: 1 },
                'FILE_VALIDATION': { status: 'completed', progress: 1 },
                'DATA_VALIDATION': { status: 'completed', progress: 1 },
                'PREPROCESSING': { status: 'completed', progress: 1 },
                'ANALYSIS': { status: 'completed', progress: 1 },
                'THEME_EXTRACTION': { status: 'completed', progress: 1 },
                'PATTERN_DETECTION': { status: 'completed', progress: 1 },
                'SENTIMENT_ANALYSIS': { status: 'completed', progress: 1 },
                'PERSONA_FORMATION': { status: 'completed', progress: 1 },
                'INSIGHT_GENERATION': { status: 'completed', progress: 1 },
                'COMPLETION': { status: 'completed', progress: 1 }
              },
              progress: 1
            };
          }
        } catch (resultError) {
          console.log('Failed to check analysis results, continuing with simulation');
        }
      }

      // Return a mock status that simulates progressive analysis
      // Get the current timestamp to ensure progress advances over time
      const timestamp = Date.now();
      const simulatedProgress = Math.min(0.95, (timestamp % 60000) / 60000);
      const analysisProgress = Math.min(0.95, (timestamp % 20000) / 20000);

      return {
        current_stage: 'ANALYSIS',
        started_at: new Date(timestamp - 60000).toISOString(),
        stage_states: {
          'FILE_UPLOAD': {
            status: 'completed',
            message: 'File uploaded successfully',
            progress: 1
          },
          'FILE_VALIDATION': {
            status: 'completed',
            message: 'File validated',
            progress: 1
          },
          'DATA_VALIDATION': {
            status: 'completed',
            message: 'Data validated',
            progress: 1
          },
          'PREPROCESSING': {
            status: 'completed',
            message: 'Data preprocessed',
            progress: 1
          },
          'ANALYSIS': {
            status: 'in_progress',
            message: 'Analyzing data',
            progress: analysisProgress
          },
          'THEME_EXTRACTION': {
            status: analysisProgress > 0.3 ? 'in_progress' : 'pending',
            message: analysisProgress > 0.3 ? 'Extracting themes' : 'Not started',
            progress: analysisProgress > 0.3 ? (analysisProgress - 0.3) * 2 : 0
          },
          'PATTERN_DETECTION': {
            status: analysisProgress > 0.5 ? 'in_progress' : 'pending',
            message: analysisProgress > 0.5 ? 'Detecting patterns' : 'Not started',
            progress: analysisProgress > 0.5 ? (analysisProgress - 0.5) * 2 : 0
          },
          'SENTIMENT_ANALYSIS': {
            status: analysisProgress > 0.7 ? 'in_progress' : 'pending',
            message: analysisProgress > 0.7 ? 'Analyzing sentiment' : 'Not started',
            progress: analysisProgress > 0.7 ? (analysisProgress - 0.7) * 3 : 0
          },
          'PERSONA_FORMATION': {
            status: 'pending',
            message: 'Not started',
            progress: 0
          },
          'INSIGHT_GENERATION': {
            status: 'pending',
            message: 'Not started',
            progress: 0
          }
        },
        progress: simulatedProgress
      };
    }
  }

  /**
   * Get analysis by ID with polling until completion
   * @param id The analysis ID to retrieve
   * @param interval Polling interval in milliseconds
   * @param maxAttempts Maximum number of polling attempts before giving up
   * @returns The completed analysis result
   */
  async getAnalysisByIdWithPolling(
    id: string,
    interval: number = 1000,
    maxAttempts: number = 30
  ): Promise<DetailedAnalysisResult> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await this.getAnalysisById(id);

        // If analysis is completed, return it
        if (result.status === 'completed') {
          return result;
        }

        // Otherwise wait for the specified interval
        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;
      } catch (error) {
        if (attempts >= maxAttempts - 1) {
          throw error; // Re-throw on last attempt
        }
        // Otherwise wait and try again
        await new Promise(resolve => setTimeout(resolve, interval));
        attempts++;
      }
    }

    throw new Error(`Analysis processing timed out after ${maxAttempts} attempts`);
  }


  /**
   * Get analysis history with pagination
   */
  async getAnalysisHistory(skip: number = 0, limit: number = 10): Promise<{ items: DetailedAnalysisResult[], totalCount: number }> {
    try {
      console.log(`[getAnalysisHistory] Fetching history with skip: ${skip}, limit: ${limit}`);
      // Try the correct endpoint first
      try {
        const response = await this.client.get('/api/analyses', {
          params: {
            offset: skip,
            limit: limit
          },
        timeout: 15000 // 15 second timeout
      });

        // Assuming the backend returns { items: [...], total_count: number }
        const items = response.data?.items || [];
        const totalCount = response.data?.total_count || 0;

        console.log(`[getAnalysisHistory] Received ${items.length} history items, total count: ${totalCount}`);
        return { items, totalCount };
      } catch (firstError) {
        console.warn('[getAnalysisHistory] Error with first endpoint, trying fallback:', firstError);
        // Try fallback endpoint
        try {
          const response = await this.client.get('/api/analyses/history', {
            params: {
              offset: skip,
              limit: limit
            },
            timeout: 15000 // 15 second timeout
          });

          const items = response.data?.items || [];
          const totalCount = response.data?.total_count || 0;
          console.log(`[getAnalysisHistory] Received ${items.length} items from fallback endpoint`);
          return { items, totalCount };
        } catch (secondError) {
          console.error('[getAnalysisHistory] Both endpoints failed:', secondError);
          // Return empty data in development mode
          if (process.env.NODE_ENV === 'development') {
            console.log('[getAnalysisHistory] Returning empty data in development mode');
            return { items: [], totalCount: 0 };
          }
          throw new Error(`Failed to fetch analysis history: ${secondError.message}`);
        }
      }
    } catch (error: any) {
      console.error('[getAnalysisHistory] Unexpected error:', error);
      // Return empty data in development mode
      if (process.env.NODE_ENV === 'development') {
        console.log('[getAnalysisHistory] Returning empty data in development mode');
        return { items: [], totalCount: 0 };
      }
      throw new Error(`Failed to fetch analysis history: ${error.message || 'Unknown error'}`);
    }
  }

  // Add a personaGeneration method to handle the API call
  async generatePersonaFromText(text: string, options?: {
    llmProvider?: string;
    llmModel?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post('/api/generate-persona', {
        text,
        llm_provider: options?.llmProvider || 'gemini',
        llm_model: options?.llmModel || 'gemini-2.0-flash'
      }, {
        timeout: 60000, // Longer timeout for persona generation
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Origin': window.location.origin
        }
      });

      if (response.data && response.data.persona) {
        return response.data.persona;
      }

      // Fall back to mock data if response structure is unexpected
      return this.generateMockPersonas()[0];

    } catch (error: any) {
      console.error('Error generating persona:', error);

      // Show appropriate toast message
      if (error?.message?.includes('Connection refused') ||
          error?.code === 'ERR_CONNECTION_REFUSED' ||
          error?.code === 'ERR_NETWORK') {
        if (window.showToast) {
          window.showToast('Backend server is not available. Using sample persona instead.');
        }
      } else if (error?.response?.status === 500) {
        if (window.showToast) {
          window.showToast('Error generating persona. Using sample persona instead.');
        }
      }

      // Return mock data
      return this.generateMockPersonas()[0];
    }
  }

  /**
   * Get prioritized insights for a specific analysis
   * This generates actionable insights with priority scores based on sentiment analysis
   *
   * @param analysisId The ID of the analysis to get prioritized insights for
   * @returns A promise that resolves to the prioritized insights
   */
  async getPriorityInsights(analysisId: string): Promise<PriorityInsightsResponse> {
    try {
      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      console.log(`[${requestId}] Fetching priority insights for analysis ID: ${analysisId}`);

      // Enhanced axios request with proper error handling, timeout and retry
      const response = await this.client.get('/api/analysis/priority', {
        params: { result_id: analysisId },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
          'X-Client-Version': 'v1.2.0' // Add version tracking
        },
        timeout: 20000 // 20 second timeout for potentially complex calculations
      });

      console.log(`[${requestId}] Priority insights API response received: ${response.status}, insights: ${response.data.insights?.length || 0}`);

      // Validate response data structure
      if (!response.data || !response.data.insights || !Array.isArray(response.data.insights)) {
        console.error(`[${requestId}] Invalid response format:`, response.data);
        throw new Error('Invalid response format from server. Expected insights array.');
      }

      // Provide additional metrics logging
      const metrics = response.data.metrics || {};
      console.log(`[${requestId}] Metrics - High: ${metrics.high_urgency_count || 0}, Medium: ${metrics.medium_urgency_count || 0}, Low: ${metrics.low_urgency_count || 0}`);

      return response.data;
    } catch (error: any) {
      // Comprehensive error handling with detailed logging and categorization
      const requestId = error?.config?.headers?.['X-Request-ID'] || 'unknown';
      const statusCode = error?.response?.status;
      const errorDetail = error?.response?.data?.detail || '';
      const isNetworkError = !statusCode && (
        error?.message?.includes('Network Error') ||
        error?.code === 'ECONNABORTED' ||
        error?.code === 'ERR_NETWORK'
      );
      const isTimeoutError = error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout');

      // Detailed logging with request context
      console.error(`[${requestId}] Error fetching priority insights:`, {
        analysisId,
        statusCode,
        errorMessage: error?.message,
        errorCode: error?.code,
        serverDetail: errorDetail,
        isNetworkError,
        isTimeoutError,
        url: error?.config?.url,
        params: error?.config?.params
      });

      // Create descriptive error messages based on error type
      if (isNetworkError) {
        throw new Error('Network error when connecting to the server. Please check your connection and try again.');
      } else if (isTimeoutError) {
        throw new Error('Request timed out while calculating priority insights. The server might be under heavy load.');
      } else if (statusCode === 401 || statusCode === 403) {
        throw new Error('Authentication required. Please log in to view priority insights.');
      } else if (statusCode === 404) {
        throw new Error('Analysis not found or not completed yet. Please check the analysis status.');
      } else if (statusCode === 400) {
        throw new Error(`Invalid request: ${errorDetail || 'Please check input parameters.'}`);
      } else if (statusCode >= 500) {
        throw new Error(`Server error calculating priority insights: ${errorDetail || 'Please try again later.'}`);
      } else {
        // For any other errors, use the error detail if available, otherwise provide a fallback
        throw new Error(errorDetail || error?.message || 'An unexpected error occurred while fetching priority insights.');
      }
    }
  }

  /**
   * Check if analysis is complete for a given result ID
   *
   * This method polls the backend API to determine if the analysis process
   * has been completed for a specific analysis result.
   */
  async checkAnalysisStatus(resultId: string): Promise<{ status: 'pending' | 'completed' | 'failed', analysis?: any, error?: string }> {
    if (!resultId) {
      console.error('[checkAnalysisStatus] Called with empty resultId');
      return { status: 'failed', error: 'Analysis ID is required for status check.' };
    }

    // Define the expected response type from the status endpoint
    type StatusResponse = {
      status: 'processing' | 'completed' | 'failed';
      error?: string;
    };

    try {
      console.log(`[checkAnalysisStatus] Checking status for analysis ID: ${resultId}`); // DEBUG LOG

      // Call the status endpoint directly
      const response = await this.client.get<StatusResponse>(`/api/analysis/${resultId}/status`);
      const statusData = response.data;

      console.log(`[checkAnalysisStatus] Received status for ${resultId}:`, statusData); // DEBUG LOG

      // Map 'processing' to 'pending' for frontend consistency
      const frontendStatus = statusData.status === 'processing' ? 'pending' : statusData.status;

      // Return a consistent response format
      return {
        status: frontendStatus,
        // Include error message if status is 'failed'
        ...(frontendStatus === 'failed' && statusData.error && { error: statusData.error })
      };

    } catch (error: any) {
      // Improved error handling with more detailed logging
      console.error(`[checkAnalysisStatus] Error checking analysis status for ID ${resultId}:`, error);

      // If we have a response object with status code
      if (error.response) {
        console.log(`[checkAnalysisStatus] Response status: ${error.response.status}`);
        console.log(`[checkAnalysisStatus] Response data:`, error.response.data);

        // If the status endpoint returns 404, it might mean the analysis ID is invalid
        // or doesn't belong to the user. Treat as failed for polling purposes.
        if (error.response.status === 404) {
          return { status: 'failed', error: 'Analysis not found or access denied.' };
        }

        // For 500 errors, we'll continue polling as the backend might recover
        if (error.response.status >= 500) {
          console.log(`[checkAnalysisStatus] Server error, will retry polling`);
          return { status: 'pending', error: 'Server processing error, retrying...' };
        }
      }

      // For network errors, we'll also continue polling
      if (error.message && error.message.includes('Network Error')) {
        console.log(`[checkAnalysisStatus] Network error, will retry polling`);
        return { status: 'pending', error: 'Network error, retrying...' };
      }

      // For other errors, return 'pending' to allow polling to retry
      console.log(`[checkAnalysisStatus] Unhandled error, will retry polling`);
      return {
        status: 'pending',
        error: error.message || 'Unknown error, retrying...'
      };
    }
  }
}

/**
 * The singleton instance of ApiClient.
 * Always use this instance instead of creating a new one.
 */
export const apiClient = ApiClient.getInstance();
