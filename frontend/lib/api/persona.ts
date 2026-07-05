/**
 * Persona generation methods for the API client
 */

import { apiCore } from './core';
import { PersonaGenerationOptions } from './types';
import { generateMockPersonas } from './mocks';

/**
 * Generate personas from free text
 *
 * @param text The text to generate personas from
 * @param options Options for persona generation
 * @returns A promise that resolves to the generated personas
 */
export async function generatePersonaFromText(
  text: string,
  options: PersonaGenerationOptions = {}
): Promise<any> {
  try {
    console.log('Generating personas from text with options:', options);

    // Prepare request data
    const requestData = {
      text,
      llm_provider: options.llmProvider || 'enhanced_gemini',
      llm_model: options.llmModel || undefined,
      return_all_personas: options.returnAllPersonas || false
    };

    // Make the API call
    const response = await apiCore.getClient().post('/api/personas/generate', requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 180000 // 3 minutes timeout for potentially long persona generation
    });

    console.log('Persona generation response:', response.data);

    // Check if the response has the expected structure
    if (!response.data || !response.data.personas) {
      console.error('Invalid persona response format:', response.data);
      throw new Error('Invalid response format from persona generation API');
    }

    return response.data;
  } catch (error: Error | unknown) {
    console.error('Error generating personas:', error);

    // In development mode, return mock data
    if (process.env.NODE_ENV === 'development') {
      console.log('Returning mock personas in development mode');
      return { personas: generateMockPersonas() };
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate personas: ${errorMessage}`);
  }
}
