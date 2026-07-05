/**
 * Persona Image Cache Service
 * 
 * Caches AI-generated persona images in localStorage to avoid regenerating
 * on tab switches. Images are invalidated when a new analysis is run.
 */

import { generatePersonaImage } from './coachService';

const CACHE_KEY_PREFIX = 'precall_persona_image_';
const ANALYSIS_ID_KEY = 'precall_current_analysis_id';

export interface CachedPersonaImage {
  imageUri: string;
  personaKey: string;
  analysisId: string;
  timestamp: number;
}

/**
 * Generate a unique key for a persona based on their name and role
 */
export function getPersonaKey(name: string, role: string): string {
  return `${name.toLowerCase().replace(/\s+/g, '_')}_${role.toLowerCase().replace(/\s+/g, '_')}`;
}

/**
 * Get the current analysis ID from localStorage
 */
export function getCurrentAnalysisId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ANALYSIS_ID_KEY);
}

/**
 * Set a new analysis ID - this invalidates all cached images
 */
export function setCurrentAnalysisId(analysisId: string): void {
  if (typeof window === 'undefined') return;
  const currentId = getCurrentAnalysisId();
  if (currentId !== analysisId) {
    // Clear all cached persona images when analysis changes
    clearAllCachedImages();
    localStorage.setItem(ANALYSIS_ID_KEY, analysisId);
  }
}

/**
 * Generate a unique analysis ID based on prospect data
 * This ensures images are regenerated for new analyses
 */
export function generateAnalysisId(prospectDataJson: string): string {
  // Use a simple hash of the JSON + timestamp when generated
  const timestamp = Date.now();
  let hash = 0;
  const str = prospectDataJson + timestamp;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `analysis_${Math.abs(hash)}_${timestamp}`;
}

/**
 * Clear all cached persona images
 */
export function clearAllCachedImages(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Get a cached image for a persona
 */
export function getCachedImage(personaKey: string): string | null {
  if (typeof window === 'undefined') return null;
  const currentAnalysisId = getCurrentAnalysisId();
  if (!currentAnalysisId) return null;

  const cacheKey = CACHE_KEY_PREFIX + personaKey;
  const cached = localStorage.getItem(cacheKey);
  if (!cached) return null;

  try {
    const data: CachedPersonaImage = JSON.parse(cached);
    // Only return if it matches current analysis
    if (data.analysisId === currentAnalysisId) {
      return data.imageUri;
    }
  } catch {
    // Invalid cache entry
  }
  return null;
}

/**
 * Cache an image for a persona
 */
export function setCachedImage(personaKey: string, imageUri: string): void {
  if (typeof window === 'undefined') return;
  const currentAnalysisId = getCurrentAnalysisId();
  if (!currentAnalysisId) return;

  const cacheKey = CACHE_KEY_PREFIX + personaKey;
  const data: CachedPersonaImage = {
    imageUri,
    personaKey,
    analysisId: currentAnalysisId,
    timestamp: Date.now(),
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
}

/**
 * Get or generate a persona image with caching
 */
export async function getOrGeneratePersonaImage(
  name: string,
  role: string,
  communicationStyle?: string,
  companyContext?: string,
  timePeriod?: string,
  historicalContext?: string
): Promise<{ imageUri: string | null; error: string | null; fromCache: boolean }> {
  const personaKey = getPersonaKey(name, role);

  // Check cache first
  const cached = getCachedImage(personaKey);
  if (cached) {
    return { imageUri: cached, error: null, fromCache: true };
  }

  // Generate new image
  try {
    const result = await generatePersonaImage(
      name,
      role,
      communicationStyle,
      companyContext,
      timePeriod,
      historicalContext
    );
    if (result.success && result.image_data_uri) {
      setCachedImage(personaKey, result.image_data_uri);
      return { imageUri: result.image_data_uri, error: null, fromCache: false };
    }
    return { imageUri: null, error: result.error || 'Failed to generate', fromCache: false };
  } catch (err) {
    return { imageUri: null, error: 'Network error', fromCache: false };
  }
}

