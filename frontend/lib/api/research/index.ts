/**
 * Research API Module
 * 
 * This module provides a modular interface to the research API client.
 * For now, it re-exports from the main research.ts file while providing
 * a clean import path for consumers.
 * 
 * Future refactoring will split research.ts into:
 * - types.ts: Type definitions (already created)
 * - storage.ts: LocalResearchStorage class
 * - chat.ts: Chat-related API functions
 * - sessions.ts: Session management API functions
 * - utils.ts: Helper functions
 */

// Re-export types from the types module
export type {
  Message,
  ResearchContext,
  ChatRequest,
  ChatResponse,
  ThinkingStep,
  GeneratedQuestions,
  ResearchSession,
} from './types';

// Re-export from the main research.ts file for backward compatibility
export {
  LocalResearchStorage,
  sendResearchChatMessage,
  generateResearchQuestions,
  cleanupEmptySessions,
  syncLocalSessionToDatabase,
  getResearchSessions,
  getResearchSession,
  createResearchSession,
  deleteResearchSession,
  testGeminiConnection,
} from '../research';

