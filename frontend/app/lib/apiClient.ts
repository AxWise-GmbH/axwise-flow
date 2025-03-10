/**
 * API client for interacting with the backend services.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// API response types
export interface UploadResponse {
    data_id: number;
    message: string;
}

export interface AnalysisResponse {
    result_id: number;
    message: string;
}

export interface AnalysisResults {
    status: 'processing' | 'completed' | 'error';
    result_id?: number;
    analysis_date?: string;
    results?: {
        themes?: string[];
        sentiment?: string;
        patterns?: string[];
    };
    llm_provider?: string;
    llm_model?: string;
    error?: string;
}

export interface HealthCheckResponse {
    status: string;
    timestamp: string;
}

// API request types
export interface AnalysisRequest {
    data_id: number;
    llm_provider: 'openai' | 'gemini';
    llm_model?: string;
}

class APIError extends Error {
    constructor(
        message: string,
        public status: number,
        public code?: string
    ) {
        super(message);
        this.name = 'APIError';
    }
}

export class APIClient {
    private client: AxiosInstance;
    private authToken: string | null = null;

    constructor(baseURL: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') {
        this.client = axios.create({
            baseURL,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                if (error.response) {
                    const status = error.response.status;
                    const message = error.response.data?.detail || error.message;
                    throw new APIError(message, status);
                }
                throw new APIError('Network error', 500);
            }
        );
    }

    /**
     * Set the authentication token for API requests
     */
    setAuthToken(token: string | null) {
        this.authToken = token;
        if (token) {
            this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete this.client.defaults.headers.common['Authorization'];
        }
    }

    /**
     * Check if the API is healthy
     */
    async checkHealth(): Promise<HealthCheckResponse> {
        const response = await this.client.get<HealthCheckResponse>('/health');
        return response.data;
    }

    /**
     * Upload interview data for analysis
     */
    async uploadData(file: File): Promise<UploadResponse> {
        if (!this.authToken) {
            throw new APIError('Authentication required', 401);
        }

        const formData = new FormData();
        formData.append('file', file);

        const response = await this.client.post<UploadResponse>(
            '/api/data',
            formData,
            {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            }
        );
        return response.data;
    }

    /**
     * Trigger analysis of uploaded data
     */
    async analyzeData(request: AnalysisRequest): Promise<AnalysisResponse> {
        if (!this.authToken) {
            throw new APIError('Authentication required', 401);
        }

        const response = await this.client.post<AnalysisResponse>(
            '/api/analyze',
            request
        );
        return response.data;
    }

    /**
     * Get analysis results
     */
    async getResults(resultId: number): Promise<AnalysisResults> {
        if (!this.authToken) {
            throw new APIError('Authentication required', 401);
        }

        const response = await this.client.get<AnalysisResults>(
            `/api/results/${resultId}`
        );
        return response.data;
    }

    /**
     * Poll for analysis results until they're ready
     */
    async pollResults(
        resultId: number,
        interval: number = 2000,
        timeout: number = 300000
    ): Promise<AnalysisResults> {
        const startTime = Date.now();

        while (true) {
            const results = await this.getResults(resultId);

            if (results.status === 'completed' || results.status === 'error') {
                return results;
            }

            if (Date.now() - startTime > timeout) {
                throw new APIError('Analysis timeout', 408);
            }

            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
}

// Create and export a singleton instance
export const apiClient = new APIClient();

// Export the class for testing
export default APIClient;