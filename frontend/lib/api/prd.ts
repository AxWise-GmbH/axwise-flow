/**
 * PRD API methods for the API client
 */

import { apiCore } from './core';
import { API_ENDPOINTS } from '../apiEndpoints';

/**
 * PRD data structure returned from the API
 */
export interface PRDData {
  prd_type: 'operational' | 'technical' | 'both';
  operational_prd?: OperationalPRD;
  technical_prd?: TechnicalPRD;
  metadata?: {
    generated_from: {
      themes_count: number;
      patterns_count: number;
      insights_count: number;
      personas_count: number;
    };
    prd_type: string;
    industry?: string;
  };
}

/**
 * Operational PRD structure
 */
export interface OperationalPRD {
  objectives: Array<{
    title: string;
    description: string;
  }>;
  scope: {
    included: string[];
    excluded: string[];
  };
  user_stories: Array<{
    story: string;
    acceptance_criteria: string[];
    what: string;
    why: string;
    how: string;
  }>;
  requirements: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    related_user_stories?: string[];
  }>;
  success_metrics: Array<{
    metric: string;
    target: string;
    measurement_method: string;
  }>;
}

/**
 * Technical PRD structure
 */
export interface TechnicalPRD {
  objectives: Array<{
    title: string;
    description: string;
  }>;
  scope: {
    included: string[];
    excluded: string[];
  };
  architecture: {
    overview: string;
    components: Array<{
      name: string;
      purpose: string;
      interactions: string[];
    }>;
    data_flow: string;
  };
  implementation_requirements: Array<{
    id: string;
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    dependencies?: string[];
  }>;
  testing_validation: Array<{
    test_type: string;
    description: string;
    success_criteria: string;
  }>;
  success_metrics: Array<{
    metric: string;
    target: string;
    measurement_method: string;
  }>;
}

/**
 * PRD API response structure
 */
export interface PRDResponse {
  success: boolean;
  result_id: number;
  prd_type: string;
  prd_data: PRDData;
}

/**
 * Generate a PRD from analysis results
 *
 * @param resultId The ID of the analysis result to generate a PRD from
 * @param prdType The type of PRD to generate ('operational', 'technical', or 'both')
 * @param forceRegenerate Whether to force regeneration of the PRD
 * @returns A promise that resolves to the PRD response
 */
export async function generatePRD(
  resultId: string | number,
  prdType: 'operational' | 'technical' | 'both' = 'both',
  forceRegenerate: boolean = false
): Promise<PRDResponse> {
  try {
    const url = forceRegenerate
      ? `${API_ENDPOINTS.GENERATE_PRD(resultId, prdType)}&force_regenerate=true`
      : API_ENDPOINTS.GENERATE_PRD(resultId, prdType);

    const response = await apiCore.getClient().get(
      url,
      {
        timeout: 120000 // 120 seconds timeout for potentially large PRD generation
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error generating PRD:', error);
    throw error;
  }
}
