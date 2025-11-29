/**
 * PRECALL Intelligence Service
 * 
 * API service for generating call intelligence from prospect data.
 * Follows the same patterns as axpersona/pipelineService.ts
 */

import {
  ProspectData,
  GenerateIntelligenceRequest,
  GenerateIntelligenceResponse,
} from './types';

const API_BASE = '/api/precall';

/**
 * Build authorization headers for API requests
 * Following the same pattern as axpersona
 */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // In OSS mode, use the dev token if available
  if (typeof window !== 'undefined') {
    const devToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN;
    if (devToken) {
      headers['Authorization'] = `Bearer ${devToken}`;
    }
  }

  return headers;
}

/**
 * Extract error detail from response
 */
async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.detail || data.error || data.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
}

/**
 * Generate call intelligence from prospect data
 * 
 * @param prospectData - Company and stakeholder information
 * @returns Promise<GenerateIntelligenceResponse> - Intelligence or error
 */
export async function generateIntelligence(
  prospectData: ProspectData
): Promise<GenerateIntelligenceResponse> {
  const request: GenerateIntelligenceRequest = {
    prospect_data: prospectData,
  };

  try {
    const response = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorDetail = await extractErrorDetail(response);
      return {
        success: false,
        intelligence: null,
        error: errorDetail,
        processing_time_ms: null,
      };
    }

    const data: GenerateIntelligenceResponse = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      intelligence: null,
      error: `Network error: ${errorMessage}`,
      processing_time_ms: null,
    };
  }
}

/**
 * Validate prospect data before submission
 * Now accepts any valid JSON - the AI will interpret the structure
 * Returns validation errors or empty array if valid
 */
export function validateProspectData(data: unknown): string[] {
  const errors: string[] = [];

  // Accept any object - the AI will interpret it
  if (typeof data !== 'object' || data === null) {
    errors.push('Please provide a valid JSON object');
  }

  // Check it's not empty
  if (data && typeof data === 'object' && Object.keys(data).length === 0) {
    errors.push('JSON object cannot be empty');
  }

  return errors;
}

/**
 * Create example prospect data for demo/testing
 */
export function createExampleProspectData(): ProspectData {
  return {
    company_name: 'TechCorp Industries',
    industry: 'Manufacturing',
    company_size: '500-1000 employees',
    stakeholders: [
      {
        name: 'Sarah Chen',
        role: 'VP of Operations',
        influence: 'high',
        concerns: ['Efficiency gains', 'Implementation timeline', 'ROI'],
      },
      {
        name: 'Mike Johnson',
        role: 'IT Director',
        influence: 'medium',
        concerns: ['Integration complexity', 'Security compliance', 'Training needs'],
      },
    ],
    pain_points: [
      'Current system causing 20% productivity loss',
      'Manual processes leading to errors',
      'Difficulty scaling with growth',
    ],
    previous_interactions: [
      'Initial discovery call 2 weeks ago',
      'Attended product webinar',
      'Downloaded ROI calculator',
    ],
    deal_context: 'Second meeting - demo requested, budget approved for Q1',
    additional_notes: 'Competitor also in consideration. Fast decision expected.',
  };
}

