/**
 * Detailed results retrieval methods for the API client
 */

import { DetailedAnalysisResult, SentimentOverview } from './types';

// Persona quality filtering interfaces
interface PersonaTrait {
  value: any;
  confidence: number;
  evidence: string[];
}

interface Persona {
  name: string;
  archetype: string;
  description: string;
  [key: string]: any;
}

/**
 * Check if content is generic placeholder text
 */
function isGenericContent(value: any): boolean {
  if (typeof value !== 'string') return false;

  const genericPatterns = [
    /^domain-specific skills?$/i,
    /^professional (role|responsibilities|challenges)$/i,
    /^technology and tools used$/i,
    /^tools and methods used$/i,
    /^collaboration approach$/i,
    /^analysis approach$/i,
    /^professional work environment$/i,
    /^quotes extracted from other fields$/i
  ];

  return genericPatterns.some(pattern => pattern.test(value.trim()));
}

/**
 * Filter low-quality persona traits
 */
function filterPersonaTrait(trait: PersonaTrait): boolean {
  // Skip traits with low confidence
  if (trait.confidence < 0.7) {
    return false;
  }

  // Skip traits with no evidence
  if (!trait.evidence || trait.evidence.length === 0) {
    return false;
  }

  // Skip traits with generic content
  if (isGenericContent(trait.value)) {
    return false;
  }

  return true;
}

/**
 * Clean persona data by removing low-quality traits
 */
function cleanPersonaTraits(persona: Persona): Persona {
  const cleanedPersona: Persona = {
    name: persona.name,
    archetype: persona.archetype,
    description: persona.description
  };

  // Core fields that should always be included if they exist
  const coreFields = ['demographics', 'goals_and_motivations', 'challenges_and_frustrations', 'key_quotes'];

  // Filter all traits
  Object.keys(persona).forEach(key => {
    if (['name', 'archetype', 'description'].includes(key)) {
      return; // Already handled
    }

    const trait = persona[key];

    // Handle trait objects
    if (trait && typeof trait === 'object' && 'confidence' in trait && 'evidence' in trait) {
      // Always include core fields even if they have quality issues (but log them)
      if (coreFields.includes(key)) {
        cleanedPersona[key] = trait;
        // Improve logging for demographics StructuredDemographics value
        const loggedValue = typeof trait.value === 'string'
          ? trait.value
          : Array.isArray(trait.value)
            ? trait.value.join(', ')
            : trait.value && typeof trait.value === 'object'
              ? JSON.stringify(trait.value)
              : String(trait.value);
        if (!filterPersonaTrait(trait)) {
          console.warn(`[PERSONA_QUALITY] Core field '${key}' has quality issues but preserved:`, {
            confidence: trait.confidence,
            evidenceCount: trait.evidence?.length || 0,
            isGeneric: isGenericContent(trait.value),
            valuePreview: loggedValue,
          });
        }
      } else {
        // For non-core fields, apply strict filtering
        if (filterPersonaTrait(trait)) {
          cleanedPersona[key] = trait;
        } else {
          console.log(`[PERSONA_QUALITY] Filtered out low-quality trait '${key}':`, {
            confidence: trait.confidence,
            evidenceCount: trait.evidence?.length || 0,
            isGeneric: isGenericContent(trait.value)
          });
        }
      }
    } else {
      // Non-trait fields (metadata, etc.)
      cleanedPersona[key] = trait;
    }
  });

  return cleanedPersona;
}

/**
 * Convert string demographics to structured format
 */
function convertStringToStructuredDemographics(demographicsString: string): any {
  if (!demographicsString || typeof demographicsString !== 'string') {
    return demographicsString;
  }

  // Parse bullet-point format demographics
  const structuredDemo: any = {};
  const lines = demographicsString.split('•').map(line => line.trim()).filter(line => line.length > 0);

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!value) continue;

    // Map common demographic fields
    if (key.includes('experience') && key.includes('level')) {
      structuredDemo.experience_level = value;
    } else if (key.includes('industry')) {
      structuredDemo.industry = value;
    } else if (key.includes('location')) {
      structuredDemo.location = value;
    } else if (key.includes('age') && key.includes('range')) {
      structuredDemo.age_range = value;
    } else if (key.includes('role') || key.includes('position')) {
      // Handle roles as array
      structuredDemo.roles = value.split(',').map(r => r.trim()).filter(r => r.length > 0);
    }
  }

  // Extract professional context from remaining text
  const contextMatch = demographicsString.match(/professional context[:\s]+(.*?)(?:\.|$)/i);
  if (contextMatch) {
    structuredDemo.professional_context = contextMatch[1].trim();
  }

  // Only return structured format if we found meaningful data
  if (Object.keys(structuredDemo).length > 0) {
    console.log(`[DEMOGRAPHICS_CONVERSION] Converted string to structured format:`, structuredDemo);
    return structuredDemo;
  }

  return demographicsString; // Return original if no structure found
}

/**
 * Process structured demographics in persona data
 */
function processStructuredDemographics(persona: Persona): Persona {
  if (!persona.demographics || typeof persona.demographics !== 'object') {
    return persona;
  }

  const demographics = persona.demographics as PersonaTrait;

  // If value is already structured demographics (object of attributed subfields), leave as-is
  if (demographics && typeof demographics.value === 'object' && demographics.value !== null) {
    return persona;
  }

  // Otherwise, if it's a string, attempt to convert to structured format
  if (typeof demographics.value === 'string') {
    const structuredValue = convertStringToStructuredDemographics(demographics.value);

    if (typeof structuredValue === 'object' && structuredValue !== demographics.value) {
      return {
        ...persona,
        demographics: {
          ...demographics,
          value: structuredValue
        }
      };
    }
  }

  return persona;
}

/**
 * Filter persona array for quality
 */
function filterPersonaQuality(personas: Persona[]): Persona[] {
  if (!Array.isArray(personas)) {
    return [];
  }

  // First filter out fallback personas
  const nonFallbackPersonas = personas.filter(persona => {
    // Check if persona is marked as fallback in metadata
    const metadata = persona.metadata || persona.persona_metadata;
    const isFallback = metadata?.is_fallback === true;

    if (isFallback) {
      console.log(`[PERSONA_FILTER] Excluding fallback persona: ${persona.name}`);
      return false;
    }

    return true;
  });

  console.log(`[PERSONA_FILTER] Filtered out ${personas.length - nonFallbackPersonas.length} fallback personas`);

  const filteredPersonas = nonFallbackPersonas.map(persona => {
    // First process structured demographics
    const withStructuredDemo = processStructuredDemographics(persona);

    // Then apply quality filtering
    const cleaned = cleanPersonaTraits(withStructuredDemo);

    // Count quality traits
    const traitKeys = Object.keys(cleaned).filter(key =>
      !['name', 'archetype', 'description', 'metadata', 'confidence', 'evidence', 'patterns', 'stakeholder_mapping'].includes(key)
    );

    const qualityTraits = traitKeys.filter(key => {
      const trait = cleaned[key];
      return trait && typeof trait === 'object' && 'confidence' in trait && filterPersonaTrait(trait);
    });

    console.log(`[PERSONA_QUALITY] ${cleaned.name}: ${qualityTraits.length}/${traitKeys.length} quality traits`);

    return cleaned;
  });

  console.log(`[PERSONA_QUALITY] Processed ${filteredPersonas.length} personas with quality filtering and structured demographics`);
  return filteredPersonas;
}

/**
 * Calculate sentiment overview from sentiment data
 */
function calculateSentimentOverview(scores: number[]): SentimentOverview {
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
 *
 * @param id The ID of the analysis to retrieve
 * @returns A promise that resolves to the detailed analysis result
 */
export async function getAnalysisById(id: string): Promise<DetailedAnalysisResult> {
  try {
    console.log('getAnalysisById: Fetching analysis with ID:', id);

    // Check if we're running on the server or client
    const isServer = typeof window === 'undefined';

    let data: any;

    if (isServer) {
      // Server-side: Call backend directly with development token
      console.log('getAnalysisById: Running on server, calling backend directly');
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const response = await fetch(`${backendUrl}/api/results/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED'}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`getAnalysisById: Backend API call failed: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Failed to fetch analysis: ${response.status} ${errorText}`);
      }

      data = await response.json();
    } else {
      // Client-side: Prefer Next.js API route, but add timeout and direct-backend fallback to avoid stalling
      console.log('getAnalysisById: Running on client, using API route with timeout and fallback');

      const apiRouteUrl = `/api/results/${id}`;
      const controller = new AbortController();
      const timeoutMs = 8000; // 8s timeout to avoid hanging UI
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(apiRouteUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Please sign in to view this analysis');
          }
          const errorText = await response.text();
          console.error(`getAnalysisById: API route call failed: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Failed to fetch analysis: ${response.status} ${errorText}`);
        }

        data = await response.json();
      } catch (routeErr) {
        clearTimeout(timeoutId);
        console.warn('getAnalysisById: API route timed out or failed, falling back to direct backend call', routeErr);
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        try {
          // In dev, backend accepts any non-empty Bearer when Clerk validation is disabled
          const devToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
          const resp2 = await fetch(`${backendUrl}/api/results/${id}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${devToken}`,
              'Content-Type': 'application/json',
            },
          });
          if (!resp2.ok) {
            const t = await resp2.text();
            throw new Error(`Direct backend call failed: ${resp2.status} ${t}`);
          }
          data = await resp2.json();
        } catch (fallbackErr) {
          console.error('getAnalysisById: Direct backend fallback failed', fallbackErr);
          throw fallbackErr;
        }
      }
    }

    console.log('getAnalysisById: API call successful for ID:', id);

    // Accept both legacy {results: {...}} and flat payloads ({themes, personas, ...})
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid API response: missing body');
    }
    const results = (data as any).results ?? data;

    // Debug: Check personas in the results
    console.log('getAnalysisById: Raw API response structure:', Object.keys(data));
    console.log('getAnalysisById: Results structure:', Object.keys(results));
    console.log('getAnalysisById: Personas in results:', results.personas?.length || 0);
    if (results.personas?.length > 0) {
      console.log('getAnalysisById: Persona names in results:', results.personas.map((p: any) => p.name));
    }

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

        // examples field has been removed

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
      results.sentimentOverview = calculateSentimentOverview(scores);
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
                          {positive: [], neutral: [], negative: []},
      // SSoT Phase 0: propagate new additive fields
      personas_ssot: Array.isArray(results.personas_ssot) ? results.personas_ssot : [],
      source: results.source || {},
      validation_summary: results.validation_summary || null,
      validation_status: results.validation_status || null,
      confidence_components: results.confidence_components || null,
      // Apply persona quality filtering (legacy personas only)
      personas: results.personas ? filterPersonaQuality(results.personas) : []
    };

    console.log('Processed analysis data:', finalResult);
    console.log('Personas in final result:', finalResult.personas?.length || 0);
    if (finalResult.personas?.length > 0) {
      console.log('Persona names:', finalResult.personas.map((p: any) => p.name));
    }
    return finalResult;

  } catch (error: any) {
    console.error('API error:', error);
    throw new Error(`Failed to fetch analysis: ${error.message}`);
  }
}
