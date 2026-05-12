/**
 * PRD API methods for the API client
 */

import { apiCore } from './core';
import { initializeAuth, getAuthToken } from './auth';
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
  // Legacy top-level fields (kept for backward compatibility and fallback rendering)
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
    priority: 'High' | 'Medium' | 'Low' | string;
    related_user_stories?: string[];
  }>;
  success_metrics: Array<{
    metric: string;
    target: string;
    measurement_method: string;
  }>;

  // New domain-agnostic master blueprint containers (optional)
  brd?: {
    objectives: Array<{ title: string; description: string }>;
    scope: { included: string[]; excluded: string[] };
    stakeholder_scenarios: Array<{
      scenario: string;
      acceptance_criteria: string[];
      justification: {
        linked_theme: string;
        impact_score: 'High' | 'Medium' | 'Low' | string;
        frequency: number;
        evidence_quotes: string[];
      };
    }>;
    core_specifications: Array<{
      id: string;
      specification: string;
      priority: 'High' | 'Medium' | 'Low' | string;
      weighting: {
        impact_score: 'High' | 'Medium' | 'Low' | string;
        frequency: number;
        priority_basis: string;
      };
      related_scenarios?: string[];
    }>;
    success_metrics: Array<{ metric: string; target: string; measurement_method: string }>;
  };

  implementation_blueprint?: {
    solution_overview: string;
    solution_structure: Array<{ component: string; role: string; interactions: string[] }>;
    core_components_and_methodology: Array<{ name: string; details: string }>;
    key_implementation_tasks: Array<{ task: string; dependencies?: string[] }>;
    quality_assurance_and_validation: Array<{ test_type: string; success_criteria: string }>;
    stakeholder_success_plan: {
      relationship_requirements?: Array<{ need: string; actions: string[] }>;
      adoption_support?: string[];
    };
    tiered_solution_models: Array<{
      tier: string;
      target_stakeholder: string;
      scope: string;
      complexity: string;
      investment: string;
    }>;
  };
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
    console.log(`[generatePRD] Starting PRD generation for result ID: ${resultId}, type: ${prdType}, force: ${forceRegenerate}`);

    // Initialize authentication before making API calls
    await initializeAuth();

    const url = forceRegenerate
      ? `${API_ENDPOINTS.GENERATE_PRD(resultId, prdType)}&force_regenerate=true`
      : API_ENDPOINTS.GENERATE_PRD(resultId, prdType);

    console.log(`[generatePRD] Trying Next.js API route: ${url}`);

    // Try Next.js API route first
    try {
      const response = await apiCore.getClient().get(
        url,
        {
          timeout: 120000 // 120 seconds timeout for potentially large PRD generation
        }
      );

      console.log(`[generatePRD] Next.js API route successful:`, response.data);
      return response.data;
    } catch (apiError) {
      console.warn('[generatePRD] Next.js API route failed, trying direct backend call:', apiError);
    }

    // Fallback to direct backend API call
    console.log('[generatePRD] Making direct backend call for PRD generation');

    // Get real Clerk token for direct backend call
    const authToken = await getAuthToken();
    if (!authToken) {
      throw new Error('Authentication required for PRD generation');
    }

    const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const directUrl = forceRegenerate
      ? `${backendUrl}/api/prd/${resultId}?prd_type=${prdType}&force_regenerate=true`
      : `${backendUrl}/api/prd/${resultId}?prd_type=${prdType}`;

    console.log(`[generatePRD] Direct backend URL: ${directUrl}`);

    const directResponse = await fetch(directUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`, // Real Clerk token
        'Content-Type': 'application/json',
      },
    });

    console.log(`[generatePRD] Direct backend response status: ${directResponse.status}`);

    if (directResponse.ok) {
      const data = await directResponse.json();
      console.log('[generatePRD] Direct backend call successful for PRD generation:', data);
      return data;
    } else {
      const errorText = await directResponse.text();
      console.error(`[generatePRD] Direct backend call failed: ${directResponse.status} ${directResponse.statusText}`, errorText);
      throw new Error(`Failed to generate PRD: ${directResponse.status} ${directResponse.statusText}`);
    }
  } catch (error) {
    console.error('Error generating PRD:', error);
    throw error;
  }
}
