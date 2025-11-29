/**
 * PRECALL Coaching Service
 * 
 * API service for real-time coaching chat during pre-call preparation.
 * Follows the same patterns as axpersona/pipelineService.ts
 */

import {
  ProspectData,
  CallIntelligence,
  ChatMessage,
  CoachingRequest,
  CoachingResponse,
  PersonaImageRequest,
  PersonaImageResponse,
  LocalNewsRequest,
  LocalNewsResponse,
} from './types';

const API_BASE = '/api/precall';

/**
 * Build authorization headers for API requests
 */
function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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
 * Send a coaching question and get a response
 *
 * @param question - User's coaching question
 * @param prospectData - Original prospect data for context
 * @param intelligence - Previously generated intelligence (optional)
 * @param chatHistory - Previous messages in the chat
 * @param viewContext - Context about what the user is currently viewing
 * @returns Promise<CoachingResponse> - Coaching response or error
 */
export async function sendCoachingMessage(
  question: string,
  prospectData: ProspectData,
  intelligence: CallIntelligence | null,
  chatHistory: ChatMessage[],
  viewContext?: string
): Promise<CoachingResponse> {
  const request: CoachingRequest = {
    question,
    prospect_data: prospectData,
    intelligence,
    chat_history: chatHistory,
    view_context: viewContext,
  };

  try {
    const response = await fetch(`${API_BASE}/coach`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorDetail = await extractErrorDetail(response);
      return {
        success: false,
        response: '',
        suggestions: [],
        error: errorDetail,
      };
    }

    const data: CoachingResponse = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      response: '',
      suggestions: [],
      error: `Network error: ${errorMessage}`,
    };
  }
}

/**
 * Get starter suggestions for the coaching chat
 * These are shown when the chat is first opened
 */
export function getStarterSuggestions(
  prospectData: ProspectData | null,
  intelligence: CallIntelligence | null
): string[] {
  if (!prospectData) {
    return [
      'How do I prepare for a sales call?',
      'What questions should I ask in discovery?',
      'How do I handle price objections?',
    ];
  }

  // Generate contextual suggestions based on available data
  const suggestions: string[] = [];

  if (intelligence?.keyInsights?.length) {
    suggestions.push(`Tell me more about "${intelligence.keyInsights[0].title}"`);
  }

  // Check for stakeholders in prospect data (flexible JSON structure)
  const stakeholders = (prospectData as Record<string, unknown>).stakeholders;
  if (Array.isArray(stakeholders) && stakeholders.length > 0) {
    const mainStakeholder = stakeholders[0] as { name?: string };
    if (mainStakeholder.name) {
      suggestions.push(`How should I approach ${mainStakeholder.name}?`);
    }
  }

  if (intelligence?.objections?.length) {
    suggestions.push(`How do I handle the "${intelligence.objections[0].objection}" objection?`);
  }

  // Fallback suggestions if we don't have enough context
  if (suggestions.length < 3) {
    const fallbacks = [
      'What\'s my key value proposition for this call?',
      'What discovery questions should I prioritize?',
      'What\'s the best way to close this call?',
    ];
    while (suggestions.length < 3 && fallbacks.length > 0) {
      suggestions.push(fallbacks.shift()!);
    }
  }

  return suggestions.slice(0, 3);
}

/**
 * Generate an avatar image for a stakeholder persona using Gemini
 *
 * @param personaName - Name of the persona
 * @param personaRole - Role/title of the persona
 * @param communicationStyle - Optional communication style hint
 * @param companyContext - Optional company/industry context
 * @returns Promise<PersonaImageResponse> - Response with image data URI or error
 */
export async function generatePersonaImage(
  personaName: string,
  personaRole: string,
  communicationStyle?: string,
  companyContext?: string
): Promise<PersonaImageResponse> {
  const request: PersonaImageRequest = {
    persona_name: personaName,
    persona_role: personaRole,
    communication_style: communicationStyle,
    company_context: companyContext,
  };

  try {
    const response = await fetch(`${API_BASE}/generate-persona-image`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorDetail = await extractErrorDetail(response);
      return {
        success: false,
        image_data_uri: null,
        error: errorDetail,
      };
    }

    const data: PersonaImageResponse = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      image_data_uri: null,
      error: `Network error: ${errorMessage}`,
    };
  }
}

/**
 * Search for local news using Gemini's Google Search grounding.
 *
 * This uses Gemini 2.5's native integration with Google Search to fetch
 * real-time news and current events for a specific location.
 *
 * @param location - Location to search news for (city, region, country)
 * @param daysBack - How many days of news to search (default: 7)
 * @param maxItems - Maximum news items to return (default: 5)
 * @returns Promise<LocalNewsResponse> - Response with news items and metadata
 */
export async function searchLocalNews(
  location: string,
  daysBack: number = 7,
  maxItems: number = 5
): Promise<LocalNewsResponse> {
  const request: LocalNewsRequest = {
    location,
    days_back: daysBack,
    max_items: maxItems,
  };

  try {
    const response = await fetch(`${API_BASE}/search-local-news`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorDetail = await extractErrorDetail(response);
      return {
        success: false,
        location,
        news_items: [],
        search_queries: [],
        sources: [],
        error: errorDetail,
      };
    }

    const data: LocalNewsResponse = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      location,
      news_items: [],
      search_queries: [],
      sources: [],
      error: `Network error: ${errorMessage}`,
    };
  }
}

