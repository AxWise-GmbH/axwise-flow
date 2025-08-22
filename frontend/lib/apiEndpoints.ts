/**
 * API endpoint definitions for the AxWise Application
 */
export const API_ENDPOINTS = {
  // Data Management
  UPLOAD_DATA: '/api/data',
  GET_DATA: (dataId: number) => `/api/data/${dataId}`,

  // Analysis
  TRIGGER_ANALYSIS: '/api/analyze',
  GET_RESULTS: (resultId: number) => `/api/results/${resultId}`,
  GET_SIMPLIFIED_PERSONAS: (resultId: number) => `/api/results/${resultId}/personas/simplified`,
  LIST_ANALYSES: '/api/analyses',

  // Export
  EXPORT_PDF: (resultId: number) => `/api/export/${resultId}/pdf`,
  EXPORT_MARKDOWN: (resultId: number) => `/api/export/${resultId}/markdown`,

  // PRD
  GENERATE_PRD: (resultId: number | string, prdType: string = 'both') =>
    `/api/prd/${resultId}?prd_type=${prdType}`,

  // System
  HEALTH_CHECK: '/health'
} as const;

/**
 * Validate that an endpoint exists and is correctly formatted
 */
export function validateEndpoint(endpoint: string): string {
  if (!endpoint.startsWith('/')) {
    throw new Error(`Invalid endpoint: ${endpoint}. Must start with /`);
  }
  return endpoint;
}
