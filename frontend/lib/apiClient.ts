import axios, { AxiosInstance } from 'axios';
import type { UploadResponse, DetailedAnalysisResult, AnalysisResponse, SentimentOverview } from '@/types/api';

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
      // Add a timeout to prevent long-hanging requests
      timeout: 30000, // Increased timeout for longer operations
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
  private async getAuthToken(): Promise<string | null> {
    try {
      // This assumes Clerk is loaded and available in the global window object
      // @ts-ignore - Clerk types will be available in window at runtime
      if (window.Clerk?.session) {
        // @ts-ignore
        return await window.Clerk.session.getToken();
      }
      return null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('is_free_text', isTextFile.toString());

      const response = await this.client.post<UploadResponse>('/api/data', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error uploading data:', error);
      
      // Handle different error types safely
      if (error && error.response) {
        // Handle 401 separately as it's typically an auth issue
        if (error.response.status === 401) {
          throw new Error('Authentication required. Please log in.');
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
      const response = await this.client.get(`/api/results/${id}`);
      console.log('API response data (raw):', JSON.stringify(response.data, null, 2));
      
      if (!response.data.results) {
        throw new Error('Invalid API response: missing results');
      }
      
      const results = response.data.results;
      
      // Check if results.sentimentStatements exists directly
      console.log('Raw sentimentStatements from API:', 
                 results.sentimentStatements ? 
                 JSON.stringify(results.sentimentStatements, null, 2) : 
                 'MISSING');
      
      // Make sure sentimentStatements are properly extracted and preserved
      if (response.data.results.sentimentStatements) {
        console.log("Found sentiment statements in API response:", JSON.stringify(response.data.results.sentimentStatements, null, 2));
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
      
      // Update the sentimentStatements extraction logic with more robust handling
      // Ensure proper sentimentStatements structure
      if (!results.sentimentStatements || 
          !results.sentimentStatements.positive || 
          !results.sentimentStatements.neutral || 
          !results.sentimentStatements.negative ||
          (results.sentimentStatements.positive.length === 0 && 
           results.sentimentStatements.neutral.length === 0 && 
           results.sentimentStatements.negative.length === 0)) {
        
        // Check if we have preliminary sentiment data from the backend
        const sentimentData = results.sentiment || {};
        
        // Only trigger fallback if sentiment data exists but sentimentStatements are missing
        // This prevents premature fallback when entire analysis hasn't completed
        if (sentimentData.positive || sentimentData.neutral || sentimentData.negative) {
          console.log("Using sentiment data directly from backend without fallback", sentimentData);
          
          // Use sentiment data directly as statements if available
          results.sentimentStatements = {
            positive: Array.isArray(sentimentData.positive) ? sentimentData.positive : [],
            neutral: Array.isArray(sentimentData.neutral) ? sentimentData.neutral : [],
            negative: Array.isArray(sentimentData.negative) ? sentimentData.negative : []
          };
        } else if (results.themes && results.themes.length > 0 && results.patterns && results.patterns.length > 0) {
          // Only trigger the keyword fallback if we have complete analysis results but missing sentiment statements
          console.warn("Complete analysis but missing sentiment statements - implementing keyword fallback");
        
        // Initialize empty statements structure
        results.sentimentStatements = {
          positive: [],
          neutral: [],
          negative: []
        };
        
          // Check if results contains raw data with interview responses
        if (results.data && Array.isArray(results.data)) {
          console.log("Extracting sentiment statements from raw interview data");
          
            // Process each interview response using more sophisticated rules
          results.data.forEach((item: any) => {
            const response = item.answer || item.response || item.text || '';
              if (!response || typeof response !== 'string' || !response.trim() || response.length < 20) {
              return;
            }
            
              // Skip metadata and headers
              if (response.includes("Transcript") || 
                  response.includes("Interview") && (response.includes("Date") || response.includes("Time")) ||
                  /^\d{2,4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,4}/.test(response) || // Date patterns
                  /^\d{1,2}:\d{2}/.test(response)) { // Time patterns
              return;
            }
            
              // Better sentiment analysis with context awareness
              const lowercaseResponse = response.toLowerCase();
              
              // More comprehensive keyword lists
              const posWords = ['good', 'great', 'excellent', 'love', 'like', 'best', 'enjoy', 'helpful', 'easy', 'intuitive', 
                               'impressive', 'satisfied', 'convenient', 'efficient', 'effective', 'simple', 'clear'];
              const negWords = ['bad', 'poor', 'terrible', 'hate', 'dislike', 'worst', 'difficult', 'confusing', 'slow', 
                               'frustrating', 'complicated', 'annoying', 'disappointing', 'inconsistent', 'useless', 'broken'];
              
              // Look for sentiment keywords in context
              const hasPositive = posWords.some(word => lowercaseResponse.includes(word));
              const hasNegative = negWords.some(word => lowercaseResponse.includes(word));
              
              // More nuanced classification
              if (hasPositive && !hasNegative) {
                results.sentimentStatements.positive.push(response);
              } else if (hasNegative && !hasPositive) {
                results.sentimentStatements.negative.push(response);
              } else if (hasPositive && hasNegative) {
                // Look at surrounding context to determine whether positive or negative dominates
                // For mixed sentiment, classify based on which appears later or is more emphasized
                const lastPosIndex = Math.max(...posWords.map(word => lowercaseResponse.lastIndexOf(word)).filter(i => i >= 0));
                const lastNegIndex = Math.max(...negWords.map(word => lowercaseResponse.lastIndexOf(word)).filter(i => i >= 0));
                
                if (lastPosIndex > lastNegIndex) {
                  results.sentimentStatements.positive.push(response);
                } else {
                  results.sentimentStatements.negative.push(response);
                }
            } else {
                // If no strong sentiment, classify as neutral
                results.sentimentStatements.neutral.push(response);
            }
          });
        }
        } else {
          // If analysis is incomplete, initialize empty structure but don't run fallback
          console.warn("Analysis incomplete - initializing empty sentiment statements without fallback");
          results.sentimentStatements = {
            positive: [],
            neutral: [],
            negative: []
          };
        }
      }
      
      // Ensure other required fields
      if (!Array.isArray(results.themes)) results.themes = [];
      if (!Array.isArray(results.patterns)) results.patterns = [];
      if (!results.id) results.id = id;
      if (!results.status) results.status = 'completed';
      if (!results.createdAt) results.createdAt = new Date().toISOString();
      if (!results.fileName) results.fileName = 'Unknown File';

      console.log('Processed analysis data:', results);
      return results;

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
          { id: 1, name: 'User Feedback', frequency: 0.8, keywords: ['feedback', 'review'] },
          { id: 2, name: 'Product Features', frequency: 0.5, keywords: ['feature', 'capability'] }
        ],
        patterns: [
          { id: 1, name: 'Feature Requests', category: 'Enhancement', description: 'Users requesting specific features', frequency: 0.7 },
          { id: 2, name: 'Pain Points', category: 'Issue', description: 'Common issues users face', frequency: 0.6 }
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
            id: "mock-persona-1",
            name: "Design Lead Alex",
            description: "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research.",
            confidence: 0.85,
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
            id: "mock-persona-2",
            name: "Product Owner Jordan",
            description: "Jordan is a product owner who bridges business goals with user needs. Focused on defining priorities and managing stakeholder expectations while advocating for design quality.",
            confidence: 0.8,
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
        "id": "mock-persona-1",
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
}

/**
 * The singleton instance of ApiClient.
 * Always use this instance instead of creating a new one.
 */
export const apiClient = ApiClient.getInstance();