/**
 * PRECALL - Pre-Call Intelligence Dashboard
 * 
 * Library exports for the PRECALL feature.
 * Import from '@/lib/precall' for all types, services, and hooks.
 */

// Types
export * from './types';

// Services
export { 
  generateIntelligence,
  validateProspectData,
  createExampleProspectData,
} from './intelligenceService';

export {
  sendCoachingMessage,
  getStarterSuggestions,
} from './coachService';

// Hooks
export {
  useGenerateIntelligence,
  useCoachingChat,
  createChatHistoryHelpers,
  PRECALL_QUERY_KEYS,
} from './hooks';

